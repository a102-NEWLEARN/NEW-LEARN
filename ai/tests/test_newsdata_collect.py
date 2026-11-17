"""experiments/issue_backfill — NewsData 하루 단위 수집(archive 시간 칸 · latest 전날)과 하루 데이터셋. 네트워크 없이 돈다."""

import json
from datetime import date, datetime, timedelta

import pytest

from experiments.issue_backfill import build_notebook
from experiments.issue_backfill import newsdata_daily as daily
from experiments.issue_backfill import newsdata_dataset as ds
from experiments.issue_backfill import newsdata_fetch as nd

DAY = date(2026, 11, 3)


def article(key, utc, **extra):
    return {
        "article_id": key,
        "link": f"https://news.invalid/{key}",
        "title": f"제목 {key}",
        "description": "",
        "content": f"본문 {key}",
        "pubDate": utc.strftime(nd.TIME_FORMAT),
        "pubDateTZ": "UTC",
        "source_id": "s",
        "source_name": "가람일보",
        "category": ["politics"],
        **extra,
    }


def quiet(*_):
    return None


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def meter_for(conn, fetch, budget=10_000, **kw):
    clock = FakeClock()
    return daily.Meter(
        conn, "k", budget, fetch=fetch, clock=clock, sleep=clock.sleep, log=quiet, **kw
    )


# ---------------------------------------------------------------- archive: 1시간 칸 비례


class FakeHourArchive:
    """칸(한국 시각 1시간)마다 기사 수가 정해진 archive. 칸 안에서 최신순, totalResults 를 준다."""

    def __init__(self, per_hour, shift_hours=0):
        self.per_hour, self.shift = per_hour, shift_hours
        self.calls = []

    def __call__(self, endpoint, params, api_key, **_):
        self.calls.append(dict(params))
        lo = datetime.strptime(params["from_date"], nd.TIME_FORMAT)
        hour = (lo + timedelta(hours=9)).hour
        n, size = self.per_hour.get(hour, 0), params["size"]
        page = int(params.get("page") or 0)
        top = lo + timedelta(minutes=59, hours=self.shift)
        results = [
            article(f"h{hour}-{k}", top - timedelta(seconds=k))
            for k in range(page * size, min(n, (page + 1) * size))
        ]
        more = (page + 1) * size < n
        return {
            "status": "success",
            "totalResults": n,
            "results": results,
            "nextPage": str(page + 1) if more else None,
        }


def test_hour_windows_are_korean_hours_written_in_utc():
    assert daily.hour_window_utc(date(2026, 10, 29), 0) == (
        "2026-10-28 15:00:00",
        "2026-10-28 15:59:59",
    )
    assert daily.hour_window_utc(date(2026, 10, 29), 23)[1] == "2026-10-29 14:59:59"


def test_allocate_keeps_hour_shares_and_takes_everything_when_short():
    assert daily.allocate([10, 30, 60], 50) == [5, 15, 30]
    assert daily.allocate([1, 1, 1], 2) == [1, 1, 0]  # 나머지가 같으면 앞 칸부터
    assert daily.allocate([3, 4], 100) == [3, 4]  # 주말처럼 목표보다 적으면 다 받는다
    assert sum(daily.allocate([7, 13, 29, 2], 20)) == 20


def test_archive_day_reads_hour_totals_then_fetches_each_hour_share(tmp_path):
    per_hour = {h: 4 for h in range(24)} | {9: 40}  # 하루 132건, 오전 9시에 몰림
    fake = FakeHourArchive(per_hour)
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        meter = meter_for(conn, fake)
        result = daily.fetch_archive_day(
            conn, meter, {"country": "kr"}, DAY, target=30, page_size=5, log=quiet
        )
        assert len(fake.calls) == 25  # 칸마다 첫 쪽 24번 + 9시 칸 한 쪽 더(몫 9건)
        assert [c.get("page") for c in fake.calls if c.get("page")] == ["1"]
        assert meter.used == 25 * 5  # archive 는 요청당 5크레딧
        assert result["total"] == 132 and result["quota"] == 30
        assert result["short_hours"] == []
        stored = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        assert stored == 23 * 4 + 10
        logged = conn.execute(
            "SELECT COUNT(*), SUM(credits) FROM requests WHERE day='2026-11-03'"
        ).fetchone()
        assert logged == (25, 125)


def test_archive_day_resumes_after_the_budget_without_asking_again(tmp_path):
    fake = FakeHourArchive({h: 12 for h in range(24)})
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        with pytest.raises(daily.BudgetReached):
            daily.fetch_archive_day(
                conn,
                meter_for(conn, fake, budget=50),
                {},
                DAY,
                target=1000,
                page_size=5,
                log=quiet,
            )
        assert len(fake.calls) == 10
        daily.fetch_archive_day(
            conn, meter_for(conn, fake), {}, DAY, target=1000, page_size=5, log=quiet
        )
    assert len(fake.calls) == 24 * 3  # 칸마다 12건 = 3쪽, 같은 쪽을 두 번 받지 않는다
    assert len({json.dumps(c, sort_keys=True) for c in fake.calls}) == 72


def test_archive_day_stops_when_returned_times_are_outside_the_window(tmp_path):
    fake = FakeHourArchive({h: 3 for h in range(24)}, shift_hours=9)
    with (
        nd.open_store(tmp_path / "s.sqlite") as conn,
        pytest.raises(daily.WindowMismatch),
    ):
        daily.fetch_archive_day(
            conn, meter_for(conn, fake), {}, DAY, page_size=5, log=quiet
        )
    assert len(fake.calls) == 1  # 첫 요청에서 멈춰 크레딧을 더 쓰지 않는다


# ---------------------------------------------------------------- latest: 전날 하루


def test_latest_timeframe_reaches_back_to_midnight_of_the_day():
    at = datetime(2026, 11, 4, 10, 0, tzinfo=nd.KST)
    assert (
        daily.latest_timeframe(DAY, at) == 34 * 60 + 15
    )  # 36시간 고정이 아니라 매번 계산
    late = datetime(2026, 11, 4, 23, 50, tzinfo=nd.KST)
    assert daily.latest_timeframe(DAY, late) == 2880  # 여유는 48시간 안에서만
    with pytest.raises(daily.TooLateForLatest):
        daily.latest_timeframe(DAY, datetime(2026, 11, 5, 0, 30, tzinfo=nd.KST))


class FakeLatest:
    """30분마다 기사 하나. timeframe 안의 기사만, 기본은 최신순. honor_sort=False 면 sort 를 무시한다."""

    def __init__(self, now, honor_sort=True):
        self.now, self.honor = now, honor_sort
        self.calls = []

    def __call__(self, endpoint, params, api_key, **_):
        self.calls.append(dict(params))
        minutes = int(params["timeframe"].rstrip("m"))
        start = self.now - timedelta(minutes=minutes)
        times = []
        t = self.now
        while t >= start:
            times.append(t)
            t -= timedelta(minutes=30)
        if self.honor and params.get("sort") == "pubdateasc":
            times.reverse()
        page, size = int(params.get("page") or 0), params["size"]
        chunk = times[page * size : (page + 1) * size]
        results = [
            article(t.strftime("%m%d%H%M"), t.astimezone(nd.UTC_TZ)) for t in chunk
        ]
        more = (page + 1) * size < len(times)
        return {
            "status": "success",
            "results": results,
            "nextPage": str(page + 1) if more else None,
        }


NOW = datetime(2026, 11, 4, 10, 0, tzinfo=nd.KST)


def test_latest_day_pages_newest_first_until_it_passes_midnight(tmp_path):
    fake = FakeLatest(NOW)
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        meter = meter_for(conn, fake)
        result = daily.fetch_latest_day(
            conn, meter, {}, DAY, NOW, page_size=5, order="desc", log=quiet
        )
        in_day = conn.execute(
            "SELECT COUNT(*) FROM articles WHERE published LIKE '2026-11-03%'"
        ).fetchone()[0]
    assert fake.calls[0]["timeframe"] == "2055m"
    assert result["reached_start"] and result["order"] == "desc"
    assert len(fake.calls) == 14 and meter.used == 14  # latest 는 요청당 1크레딧
    assert in_day == 48


def test_latest_day_reads_oldest_first_when_the_api_honors_it(tmp_path):
    fake = FakeLatest(NOW)
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        result = daily.fetch_latest_day(
            conn, meter_for(conn, fake), {}, DAY, NOW, page_size=5, log=quiet
        )
    assert result["order"] == "asc" and result["reached_end"]
    assert len(fake.calls) == 10  # 오늘 아침 기사를 넘겨 가지 않아도 된다


def test_latest_day_falls_back_to_newest_first_when_sort_is_ignored(tmp_path):
    fake = FakeLatest(NOW, honor_sort=False)
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        result = daily.fetch_latest_day(
            conn, meter_for(conn, fake), {}, DAY, NOW, page_size=5, log=quiet
        )
    assert result["order"] == "desc" and result["reached_start"]
    assert len(fake.calls) == 1 + 14


# ---------------------------------------------------------------- 요청 기록 · 15분 한도


def test_meter_waits_when_the_15_minute_credit_limit_would_be_passed(tmp_path):
    def fetch(endpoint, params, api_key, **_):
        return {"status": "success", "results": []}

    with nd.open_store(tmp_path / "s.sqlite") as conn:
        clock = FakeClock()
        meter = daily.Meter(
            conn,
            "k",
            100,
            fetch=fetch,
            clock=clock,
            sleep=clock.sleep,
            log=quiet,
            limit=10,
        )
        for _ in range(3):
            meter("archive", {}, day="2026-11-03", label="x")
        assert (
            clock.now >= 900
        )  # 셋째 요청은 첫 요청이 15분 창에서 빠질 때까지 기다린다
        with pytest.raises(daily.BudgetReached):
            meter.budget = 15
            meter("archive", {}, day="2026-11-03", label="x")


def test_failed_attempts_are_recorded_without_credits(tmp_path):
    def fetch(endpoint, params, api_key, on_error=None, **_):
        on_error(429, "Rate Limit Exceeded")
        return {"status": "success", "results": []}

    with nd.open_store(tmp_path / "s.sqlite") as conn:
        meter_for(conn, fetch)("latest", {}, day="2026-11-03", label="p1")
        rows = conn.execute(
            "SELECT status, credits FROM requests ORDER BY rowid"
        ).fetchall()
    assert rows == [(429, 0), (200, 1)]


# ---------------------------------------------------------------- 하루 데이터셋


def kst(hour, minute=0):
    return datetime(2026, 11, 3, hour, minute, tzinfo=nd.KST).astimezone(nd.UTC_TZ)


def test_day_dataset_picks_the_raw_cap_by_hour_then_drops_bad_bodies(tmp_path):
    """7,000건은 받은 원본 기준 상한이다(2026-11-04 팀 합의). 먼저 원본을 고르고 그 안에서 거른다."""
    shared = (
        "가람시 시장이 새 버스 노선을 발표했다. 노선은 내년부터 운행하며 요금은 그대로다. "
        * 2
    )
    raws = [
        article("a1", kst(1, 5)),
        article("a2", kst(1, 10), content=""),  # 본문 없음
        *[
            article(f"b{k}", kst(13, k), content=f"{k}번째 소식 본문입니다.")
            for k in range(1, 7)
        ],
        article("b7", kst(13, 30), title="가람시 버스 노선 발표", content=shared),
        article("b8", kst(13, 31), title="오늘의 날씨 맑음", content=shared),
        article("other", kst(1, 0) - timedelta(hours=2)),  # 전날 기사
    ]
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        nd.store_page(conn, raws, "2026-11-04 10:00:00")
        nd.store_page(
            conn, raws[:3], "2026-11-04 10:05:00"
        )  # 같은 기사는 다시 안 들어간다
        result = ds.build_day(conn, DAY, target=4)
        line = ds.record_line(conn, DAY)
        picked = conn.execute(
            "SELECT article_id FROM selection WHERE day='2026-11-03' AND status='selected' "
            "ORDER BY article_id"
        ).fetchall()
    assert result["unique"] == 10
    # 원본 4건: 1시 칸 1건(최신 a2), 13시 칸 3건(최신순 b8, b7, b6). 그 안에서 a2(본문 없음) · b8(다른 본문)을 뺀다
    assert result["raw"] == 4
    assert result["dropped"] == {"empty_body": 1, "wrong_body": 1}
    assert result["final"] == 2
    assert [p[0] for p in picked] == ["b6", "b7"]
    assert "중복 제거 후 10" in line and "원본 4" in line and "거른 뒤 2" in line


def test_archive_day_dataset_keeps_each_hour_share_set_when_fetching(tmp_path):
    """archive 는 칸마다 마지막 쪽까지 받아 몫보다 많다. 원본은 받을 때 정한 칸별 몫만큼만 쓴다."""
    fake = FakeHourArchive({1: 120, 13: 30})
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        meter = meter_for(conn, fake)
        daily.fetch_archive_day(
            conn, meter, {"country": "kr"}, DAY, target=100, page_size=50, log=quiet
        )
        received = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        result = ds.build_day(conn, DAY, target=100)
        per_hour = dict(
            conn.execute(
                "SELECT substr(a.published, 12, 2), COUNT(*) FROM selection s "
                "JOIN articles a USING(article_id) WHERE s.status='selected' GROUP BY 1"
            ).fetchall()
        )
    assert received == 130  # 1시 칸 몫 80 → 50건씩 두 쪽, 13시 칸 몫 20 → 첫 쪽 30건
    assert result["raw"] == result["final"] == 100
    assert per_hour == {"01": 80, "13": 20}


def test_day_dataset_adds_the_raw_column_to_an_existing_days_table(tmp_path):
    """서버 DB 의 days 표는 raw 열이 없던 때 만들어졌다. 그대로 열어도 다시 만들 수 있어야 한다."""
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        conn.execute(
            "CREATE TABLE days(day TEXT PRIMARY KEY, unique_articles INTEGER NOT NULL, "
            "clean INTEGER NOT NULL, final INTEGER NOT NULL, dropped TEXT NOT NULL, "
            "empty_hours TEXT NOT NULL, built_at TEXT NOT NULL)"
        )
        nd.store_page(conn, [article("a1", kst(9))], "2026-11-04 10:00:00")
        assert ds.build_day(conn, DAY)["raw"] == 1
        assert "원본 1 · 거른 뒤 1" in ds.record_line(conn, DAY)


def test_hidden_urls_are_dropped_after_picking_the_raw_cap(tmp_path):
    """운영에서 라벨로 숨긴 기사(URL 목록)는 원본을 고른 뒤 뺀다. 빈자리를 다른 기사로 채우지 않는다."""
    raws = [article(f"b{k}", kst(13, k)) for k in range(1, 6)]
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        nd.store_page(conn, raws, "2026-11-04 10:00:00")
        ds.add_hidden_urls(
            conn,
            ["https://news.invalid/b5", "https://news.invalid/b1"],
            "hidden-urls-test.txt",
        )
        result = ds.build_day(conn, DAY, target=3)
        status = dict(
            conn.execute(
                "SELECT article_id, status FROM selection WHERE day='2026-11-03'"
            ).fetchall()
        )
    # 원본 3건은 최신순 b5 · b4 · b3. 숨긴 b5 만 빠지고 b2 가 대신 들어오지 않는다. 숨긴 b1 은 원본 밖이라 extra 다
    assert result["raw"] == 3
    assert result["dropped"] == {"hidden": 1}
    assert result["final"] == 2
    assert status == {
        "b1": "extra",
        "b2": "extra",
        "b3": "selected",
        "b4": "selected",
        "b5": "hidden",
    }


def test_bad_body_reason_stays_when_the_article_is_also_hidden(tmp_path):
    raws = [article("a1", kst(9), content=""), article("a2", kst(10))]
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        nd.store_page(conn, raws, "2026-11-04 10:00:00")
        ds.add_hidden_urls(
            conn, ["https://news.invalid/a1", "https://news.invalid/a2"], "t.txt"
        )
        result = ds.build_day(conn, DAY)
    assert result["dropped"] == {"empty_body": 1, "hidden": 1}
    assert result["final"] == 0


def test_hidden_url_list_can_be_added_again_without_growing(tmp_path):
    urls = [
        "https://news.invalid/a1",
        "https://news.invalid/nowhere",
        "  ",
        "https://news.invalid/a1 ",
    ]
    with nd.open_store(tmp_path / "s.sqlite") as conn:
        nd.store_page(conn, [article("a1", kst(9))], "2026-11-04 10:00:00")
        first = ds.add_hidden_urls(conn, urls, "hidden-urls-1105.txt")
        again = ds.add_hidden_urls(conn, urls, "hidden-urls-1105.txt")
    assert first == {"added": 2, "in_articles": 1}
    assert again == {"added": 0, "in_articles": 1}


# 불량 본문 규칙의 판단 예시(README 「불량 본문 규칙」). 수집 배치로 옮길 때 같은 결과가 나오는지 맞춰 본다.
# 본문은 실제 기사가 아니라 규칙을 보이려고 지은 짧은 글이다
TERMS = (
    "채널A의 각종 서비스를 사용하여 인터넷에 올려진 정보를 얻고자 하실 때에는 "
    "다음과 같은 점에 유의하시기 바랍니다."
)
PHONE = (
    "아이폰 듀오 내년 1월까지 배송 지연[서울=뉴스핌] 애플의 첫 폴더블 스마트폰 "
    "아이폰 듀오가 품귀 현상을 빚으며 배송 일정이 밀렸다."
)
STORE = (
    "생활용품점 다이소를 운영하는 아성다이소가 6000억 원을 투자하는 대규모 "
    "물류센터의 첫 삽을 떴다. 양주허브센터 기공식을 열었다."
)


def same_body(key, title, body, source="뉴스핌", published="2026-10-21 19:00:00"):
    return {
        "article_id": key,
        "title": title,
        "body": ds.norm(body),
        "source_name": source,
        "published": published,
    }


def test_bad_body_other_outlets_with_the_same_body_are_kept():
    # 다른 언론사끼리는 통신 기사를 받아 쓴 정상 보도다
    articles = [
        same_body("a", "삼성E&A 실적", STORE, "Chosun"),
        same_body("b", "삼성E&A 목표 실적", STORE, "Chosunbiz"),
    ]
    assert ds.same_body_groups(articles) == []


def test_bad_body_boilerplate_drops_the_whole_group():
    titles = ["뉴스A 오프닝", "슈퍼태풍 참피 북상", "이진숙 기자회견"]
    group = [same_body(f"t{k}", t, TERMS, "채널a") for k, t in enumerate(titles)]
    keep, codes = ds.decide(group)
    assert keep is None and set(codes.values()) == {"no_match"}


def test_bad_body_owner_is_kept_and_other_titles_are_dropped():
    group = [
        same_body("own", "아이폰 듀오 내년 1월까지 배송 지연", PHONE),
        same_body("x1", "[속보] 北김여정 대남 확성기 방송", PHONE),
        same_body("x2", "[부고] 홍길동씨 모친상", PHONE),
    ]
    keep, codes = ds.decide(group)
    assert keep["article_id"] == "own"
    assert codes == {"x1": "wrong_body", "x2": "wrong_body"}


def test_bad_body_retitled_copy_keeps_one_and_drops_the_other():
    group = [
        same_body(
            "web",
            "아성다이소, 양주에 6000억 투입해 대규모 물류센터 짓는다",
            STORE,
            "동아일보",
            "2026-10-27 15:32:00",
        ),
        same_body(
            "print",
            "다이소, 6000억 투자 대규모 물류센터 첫 삽",
            STORE,
            "동아일보",
            "2026-10-28 00:30:00",
        ),
    ]
    keep, codes = ds.decide(group)
    assert keep is not None and set(codes.values()) == {"duplicate"}


def test_bad_body_text_appended_after_a_body_counts_as_the_same_body():
    longer = STORE + " 이 밖에 다른 기사 본문이 이어 붙었다." * 5
    articles = [
        same_body("a", "다이소 물류센터 첫 삽", STORE, "국민일보 뉴스"),
        same_body("b", "[포토] 블랙이글스 비행", longer, "국민일보 뉴스"),
    ]
    groups = ds.same_body_groups(articles)
    assert len(groups) == 1 and len(groups[0]) == 2


def test_bad_body_shared_lead_in_alone_is_not_the_same_body():
    lead = "ⓒ SBS & SBS i / RSS 피드는 개인 리더 이용 목적으로 허용 되어 있습니다. " * 4
    articles = [
        same_body("a", "구룡마을 화재", lead + "구룡마을에서 불이 났다.", "Sbs 뉴스"),
        same_body(
            "b", "아이폰 듀오 파손", lead + "아이폰 듀오 화면이 깨졌다.", "Sbs 뉴스"
        ),
    ]
    assert ds.same_body_groups(articles) == []


def test_bad_body_outlet_name_alone_does_not_match_the_byline():
    body = (
        "[아시아타임즈 기자] 전고체 배터리 승부처가 기술 개발에서 양산 경쟁으로 "
        "옮겨가고 있다. 삼성SDI는 폼팩터를 다변화한다."
    )
    group = [
        same_body("hr", "[인사] 아시아타임즈", body, "아시아타임즈"),
        same_body("bat", "삼성SDI, 전고체 배터리 폼팩터 다변화", body, "아시아타임즈"),
    ]
    keep, codes = ds.decide(group)
    assert keep["article_id"] == "bat" and codes == {"hr": "wrong_body"}


def test_collect_notebook_bundles_its_modules_and_compiles(tmp_path):
    out = build_notebook.build(tmp_path / "nb.ipynb", name="newsdata_collect")
    notebook = json.loads(out.read_text(encoding="utf-8"))
    sources = ["".join(c["source"]) for c in notebook["cells"]]
    assert "newsdata_daily.py" in sources[1] and "newsdata_dataset.py" in sources[1]
    # 받은 날의 선정 기사 벡터를 같은 노트북에서 만든다(2026-11-12) — 묶기와 같은 입력 글 · 해시
    assert "issue_grouping.py" in sources[1]
    assert "issue_summary.py" not in sources[1]
    assert not any("pub_" in s for s in sources)
