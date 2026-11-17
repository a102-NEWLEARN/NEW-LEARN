"""experiments/issue_backfill — NewsData 수집 · 사건/이슈 묶기 · 이슈 요약. 네트워크 · 모델 없이 돈다."""

import csv
import io
import json
import urllib.error
from datetime import datetime

import numpy as np
import pytest

from experiments.issue_backfill import build_notebook
from experiments.issue_backfill import issue_grouping as ig
from experiments.issue_backfill import issue_summary as summ
from experiments.issue_backfill import newsdata_fetch as nd

# ---------------------------------------------------------------- 수집


def raw(n, day="2026-10-27", hour=3, **extra):
    return {
        "article_id": f"a{n}",
        "link": f"https://news.invalid/{n}",
        "title": f"제목 {n}",
        "description": f"설명 {n}",
        "content": "ONLY AVAILABLE IN PAID PLANS",
        "pubDate": f"{day} {hour:02d}:10:00",
        "pubDateTZ": "UTC",
        "source_id": "s",
        "source_name": "가람일보",
        "category": ["politics"],
        **extra,
    }


def test_normalize_converts_to_kst_and_drops_paid_placeholder():
    row = nd.normalize(raw(1, hour=20), "now")
    assert row[0] == "a1"
    assert row[4] == ""  # 요금제 안내 문구는 본문으로 쓰지 않는다
    assert row[5] == "2026-10-28 05:10:00"  # UTC 20:10 = KST 다음 날 05:10
    assert nd.normalize(raw(2, duplicate=True), "now") is None
    assert nd.normalize(raw(3, title=" "), "now") is None


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def http_error(code, payload, retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError(
        "https://newsdata.io",
        code,
        "x",
        headers,
        io.BytesIO(json.dumps(payload).encode()),
    )


def test_request_page_sends_key_only_in_header_and_waits_on_rate_limit():
    seen, waits = [], []
    replies = [
        http_error(
            429,
            {
                "status": "error",
                "results": {"code": "RateLimitExceeded", "message": "slow"},
            },
            "7",
        ),
        {"status": "success", "results": [], "nextPage": None},
    ]

    def opener(request, timeout):
        seen.append(request)
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return FakeResponse(json.dumps(reply).encode())

    payload = nd.request_page(
        "latest",
        {"country": "kr"},
        "secret",
        opener=opener,
        sleep=waits.append,
        log=lambda *_: None,
    )
    assert payload["status"] == "success"
    assert waits == [7]
    assert all(
        r.get_header("X-access-key") == "secret" and "secret" not in r.full_url
        for r in seen
    )


def test_request_page_stops_when_credits_are_gone_or_key_is_wrong():
    def opener_for(error):
        def opener(request, timeout):
            raise error

        return opener

    daily = http_error(
        429,
        {
            "status": "error",
            "results": {"code": "RateLimitExceeded", "message": "Daily limit reached"},
        },
    )
    with pytest.raises(nd.CreditsExhausted):
        nd.request_page(
            "latest", {}, "k", opener=opener_for(daily), sleep=lambda _: None
        )
    wrong = http_error(
        401,
        {
            "status": "error",
            "results": {"code": "Unauthorized", "message": "not valid"},
        },
    )
    with pytest.raises(nd.NewsDataError) as caught:
        nd.request_page(
            "latest", {}, "k", opener=opener_for(wrong), sleep=lambda _: None
        )
    assert caught.value.status == 401


class FakeArchive:
    """날마다 기사 3쪽(쪽당 2건). 요청 기록을 남긴다."""

    def __init__(self):
        self.calls = []

    def __call__(self, endpoint, params, api_key, log=None):
        self.calls.append((endpoint, dict(params)))
        if endpoint == "latest":
            return {"status": "success", "results": [], "nextPage": None}
        day, page = params["from_date"], int(params.get("page") or 0)
        results = [raw(f"{day}-{page}-{k}", day=day) for k in range(2)]
        return {
            "status": "success",
            "results": results,
            "nextPage": str(page + 1) if page < 2 else None,
        }


def test_archive_resumes_where_the_budget_stopped(tmp_path):
    now = datetime(2026, 10, 28, 12, 0, tzinfo=nd.KST)
    fake = FakeArchive()
    first = nd.collect(
        tmp_path / "s.sqlite",
        "k",
        {"country": "kr"},
        days=2,
        mode="archive",
        max_credits=20,
        now=now,
        fetch=fake,
        log=lambda *_: None,
    )
    assert (
        first["credits"] == 20
    )  # archive 는 요청당 5크레딧. 최근 날 3쪽 + 다음 날 1쪽에서 멈춤
    assert [p["from_date"] for _, p in fake.calls] == ["2026-10-28"] * 3 + [
        "2026-10-27"
    ]
    fake.calls.clear()
    second = nd.collect(
        tmp_path / "s.sqlite",
        "k",
        {"country": "kr"},
        days=2,
        mode="archive",
        max_credits=500,
        now=now,
        fetch=fake,
        log=lambda *_: None,
    )
    archive_calls = [p for e, p in fake.calls if e == "archive"]
    assert archive_calls[0] == {
        "country": "kr",
        "from_date": "2026-10-27",
        "to_date": "2026-10-27",
        "page": "1",
    }
    assert {p["from_date"] for p in archive_calls} == {
        "2026-10-27",
        "2026-10-26",
    }  # 끝난 28일은 다시 안 받는다
    assert second["stored"] == 18  # 3일 × 3쪽 × 2건


def test_auto_falls_back_to_latest_when_archive_is_not_in_plan(tmp_path):
    pages = [
        {"status": "success", "results": [raw(1), raw(2)], "nextPage": "p2"},
        {"status": "success", "results": [raw(1), raw(2)], "nextPage": "p3"},
    ]

    def fetch(endpoint, params, api_key, log=None):
        if endpoint == "archive":
            raise nd.NewsDataError(403, "AccessDenied", "upgrade your plan")
        return pages.pop(0)

    report = nd.collect(
        tmp_path / "s.sqlite",
        "k",
        {},
        days=3,
        mode="auto",
        max_credits=10,
        now=datetime(2026, 10, 28, tzinfo=nd.KST),
        fetch=fetch,
        log=lambda *_: None,
    )
    assert report["mode"] == "latest"
    assert report["credits"] == 2  # 둘째 쪽은 새 기사가 없어 멈춘다
    assert report["inserted"] == 2


# ---------------------------------------------------------------- 사건 · 이슈


def unit(rng, center, noise):
    v = center + rng.normal(0, noise, center.shape)
    return v / np.linalg.norm(v)


def test_component_split_gives_the_same_events_as_one_full_average_linkage():
    rng = np.random.default_rng(3)
    centers = rng.normal(size=(12, 32))
    vectors = np.array(
        [unit(rng, centers[rng.integers(12)], 0.06) for _ in range(240)],
        dtype=np.float32,
    )
    seconds = np.sort(rng.integers(0, 10 * ig.DAY, 240))
    labels, info = ig.cluster_events(vectors, seconds, distance=0.2, window_hours=72)
    full = ig.gated_average_labels(vectors, seconds, 0.2, 72 * 3600)
    assert info["components"] < 240
    assert (
        len(set(zip(labels, full, strict=True))) == len(set(labels)) == len(set(full))
    )
    assert labels[0] == 0 and list(np.unique(labels)) == list(range(len(set(labels))))


def test_same_text_days_apart_is_not_one_event():
    v = np.ones((3, 4), dtype=np.float32) / 2
    seconds = np.array([0, 3600, 5 * ig.DAY])
    labels, _ = ig.cluster_events(v, seconds, distance=0.2, window_hours=72)
    assert list(labels) == [0, 0, 1]


def events_for(spec, dim=16, seed=5):
    """spec: [(주제, 날짜)] → summarize_events 와 같은 모양의 사건 목록과 벡터 합."""
    rng = np.random.default_rng(seed)
    topics = {name: rng.normal(size=dim) for name in {t for t, _ in spec}}
    events, sums = [], []
    for k, (topic, day) in enumerate(spec):
        vecs = np.array([unit(rng, topics[topic], 0.05) for _ in range(2)])
        events.append(
            {
                "event": k,
                "start": day * ig.DAY,
                "end": day * ig.DAY + 3600,
                "articles": 2,
            }
        )
        sums.append(vecs.sum(0))
    return events, np.array(sums)


def test_issue_continues_while_events_keep_coming_and_closes_after_the_gap():
    spec = [("a", 0), ("b", 1), ("a", 2), ("a", 5), ("a", 9), ("b", 3), ("a", 30)]
    events, sums = events_for(spec)
    issue_of = ig.link_issues(events, sums, distance=0.4, gap_days=7)
    assert issue_of[0] == issue_of[2] == issue_of[3] == issue_of[4]
    assert issue_of[1] == issue_of[5] != issue_of[0]
    assert issue_of[6] not in (
        issue_of[0],
        issue_of[1],
    )  # 21일 비었다가 다시 나온 a 는 새 이슈

    issues = ig.build_issues(events, issue_of, min_events=3)
    assert [(i["issue_id"], i["event_count"]) for i in issues] == [("I0001", 4)]
    assert [e["event"] for e in issues[0]["events"]] == [0, 2, 3, 4]


def test_embeddings_are_reused_until_the_text_changes(tmp_path):
    db = tmp_path / "s.sqlite"
    with nd.open_store(db) as conn:
        nd.store_page(conn, [raw(1), raw(2, hour=4)], "now")
    calls = []

    def encode(texts):
        calls.append(len(texts))
        return np.ones((len(texts), 4), dtype=np.float32)

    articles = ig.load_articles(db, "2026-10-27 00:00:00")
    assert ig.embed_articles(db, articles, encode, log=lambda *_: None).shape == (2, 4)
    ig.embed_articles(db, articles, encode, log=lambda *_: None)
    articles[1]["description"] = "고친 설명"
    ig.embed_articles(db, articles, encode, log=lambda *_: None)
    assert calls == [2, 1]


# ---------------------------------------------------------------- 요약 · CSV


def sample_issue(n_events=3):
    events = [
        {
            "event": k,
            "start": k * ig.DAY,
            "end": k * ig.DAY + 60,
            "articles": k + 1,
            "outlets": 1,
            "title": f"사건 {k}",
            "lead": "앞부분 " * 80,
            "link": f"https://news.invalid/e{k}",
            "members": np.array([k]),
        }
        for k in range(n_events)
    ]
    return {
        "issue_id": "I0001",
        "events": events,
        "event_count": n_events,
        "article_count": sum(e["articles"] for e in events),
        "start": 0,
        "end": events[-1]["end"],
    }


def test_payload_keeps_biggest_events_in_date_order():
    payload = summ.issue_payload(sample_issue(5), ig.fmt, max_events=3, lead_chars=10)
    assert [e["title"] for e in payload["events"]] == ["사건 2", "사건 3", "사건 4"]
    assert payload["omitted_events"] == 2
    assert len(payload["events"][0]["lead"]) == 10


def test_payload_names_private_people_and_repeated_issue_words():
    issue = sample_issue(4)
    titles = [
        "흉기난동범 홍길동 송치",
        '이준석 "대통령 제미나이로 바꾸자"',
        '유승민 "국무회의에 제미나이 자리"',
        '장동혁 "제미나이 붙들고 있을 땐가" 홍길동',
    ]
    for event, title in zip(issue["events"], titles, strict=True):
        event["title"] = title
    issue["events"][0]["lead"] = "인천에서 흉기를 휘두른 홍길동(59)이 송치됐다."
    issue["events"][1]["lead"] = "결선에서 룰라 다시우바(81) 현 대통령이 이겼다."
    payload = summ.issue_payload(issue, ig.fmt)
    # 기사에 "이름(나이)"로 나온 사람은 공인이 아니다. 쓰면 안 되는 이름으로 넘긴다.
    # 앞뒤에 직함이 있으면(다시우바 … 대통령) 공인이라 넘기지 않는다
    assert payload["do_not_name"] == ["홍길동"]
    # 사건 제목 셋 이상에 나온 낱말. 쓰면 안 되는 이름은 빠진다
    assert payload["key_terms"] == ["제미나이"]


def test_answer_using_a_private_name_is_rejected():
    payload = {"do_not_name": ["홍길동"]}
    answer = {
        "title": "인천 흉기난동 수사",
        "is_issue": True,
        "reason": "한 사건의 수사",
    }
    ok = "22일 인천에서 50대 피의자가 흉기를 휘둘렀다. 경찰은 그를 송치했다."
    assert summ.validate({**answer, "summary": ok}, payload)["summary"] == ok
    with pytest.raises(TypeError, match="이름"):
        summ.validate(
            {
                **answer,
                "summary": "22일 홍길동이 흉기를 휘둘렀다. 경찰은 그를 송치했다.",
            },
            payload,
        )
    with pytest.raises(TypeError, match="이름"):
        summ.validate(
            {**answer, "title": "홍길동 흉기난동 수사", "summary": ok}, payload
        )


def test_summary_must_end_in_news_style():
    answer = {"title": "구룡마을 화재", "is_issue": True, "reason": "한 화재의 전개"}
    plain = "27일 구룡마을에서 불이 났다. 소방당국은 대응 2단계를 발령했다."
    assert summ.validate({**answer, "summary": plain})["summary"] == plain
    for polite in (
        "27일 구룡마을에서 불이 났습니다. 소방당국은 대응 2단계를 발령했다.",
        "27일 구룡마을에서 불이 났다. 주민들이 대피했어요.",
    ):
        with pytest.raises(TypeError, match="했다"):
            summ.validate({**answer, "summary": polite})


def test_summaries_are_cached_and_bad_answers_are_recorded(tmp_path):
    good = {
        "title": "의대 증원 갈등",
        "summary": "정부가 증원을 발표했고 의사단체가 반발했다. 이후 협상이 이어졌다.",
        "is_issue": True,
        "reason": "같은 정책을 둘러싼 흐름",
    }
    calls = []

    def request_fn(payload, api_key, model):
        calls.append(payload["period"])
        return (good if payload["event_count"] == 3 else {"title": "x"}), {
            "prompt_tokens": 10
        }

    payloads = {
        "I0001": summ.issue_payload(sample_issue(3), ig.fmt),
        "I0002": summ.issue_payload(sample_issue(4), ig.fmt),
    }
    cache = tmp_path / "cache.json"
    first = summ.summarize_issues(
        payloads, cache, request_fn=request_fn, workers=2, log=lambda *_: None
    )
    assert first["I0001"]["title"] == "의대 증원 갈등"
    assert "error" in first["I0002"]
    assert len(calls) == 1 + 3  # 틀린 답은 세 번까지 다시 묻는다
    calls.clear()
    summ.summarize_issues(
        payloads, cache, request_fn=request_fn, workers=2, log=lambda *_: None
    )
    assert len(calls) == 3  # 캐시된 I0001 은 다시 부르지 않는다


def test_issue_csv_has_the_requested_columns_first(tmp_path):
    issue = sample_issue(3)
    articles = [
        {
            "article_id": f"a{k}",
            "published": "2026-10-27 09:00:00",
            "source_name": "가람일보",
            "title": f"기사 {k}",
            "link": f"https://news.invalid/{k}",
        }
        for k in range(3)
    ]
    summaries = {
        "I0001": {
            "title": "이슈 이름",
            "summary": "요약",
            "is_issue": False,
            "reason": "별개 사건",
        }
    }
    paths = ig.write_csvs(tmp_path, [issue], summaries, articles)
    text = paths["issues"].read_text(encoding="utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:5] == ["이슈제목", "요약", "사건", "사건수", "기사수"]
    assert rows[1][:2] == ["이슈 이름", "요약"] and rows[1][3:5] == ["3", "6"]
    assert rows[1][2].splitlines() == [
        "1970-01-01 사건 0 (1건)",
        "1970-01-02 사건 1 (2건)",
        "1970-01-03 사건 2 (3건)",
    ]
    assert rows[1][7] == "주제 모음"


def test_notebook_bundles_the_modules_and_compiles(tmp_path):
    out = build_notebook.build(tmp_path / "nb.ipynb")
    notebook = json.loads(out.read_text(encoding="utf-8"))
    sources = ["".join(c["source"]) for c in notebook["cells"]]
    assert "newsdata_fetch.py" in sources[1] and "issue_summary.py" in sources[1]
    assert not any("pub_" in s for s in sources)  # 키는 노트북에 들어가지 않는다
