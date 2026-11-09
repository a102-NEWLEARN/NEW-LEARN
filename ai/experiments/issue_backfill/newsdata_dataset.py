"""받은 기사로 하루 데이터셋을 만든다: 중복 제거 → 원본 7,000건 고르기 → 불량 본문 거르기 → 숨긴 기사 빼기. 매일 같은 기준이다.

- 중복: 같은 기사는 article_id(없으면 링크)로 하나만 남는다. 저장할 때 article_id · 링크가 이미 있으면 넣지 않는다.
  같은 사건을 다룬 다른 언론사 기사는 지우지 않는다
- 불량 본문: 본문이 빈 기사와, 같은 언론사 · 같은 본문 묶음에서 본문과 맞지 않는 기사(약관 · 다른 기사 본문)를 뺀다.
  규칙은 2026-11-02 팀 합의(10/21~28 에서 9,515건을 뺀 규칙)를 그대로 옮겼다. 고른 원본 안에서 찾는다
- 고르기: 7,000건은 받은 원본 기준 상한이다(2026-11-04 팀 합의). 거른 뒤 건수는 날마다 다르다.
  1시간 칸마다 몫을 정하고 칸 안에서는 최신순으로 고른다. archive 로 받은 날은 받을 때 정한 칸별 몫을 그대로 쓰고
  (칸마다 마지막 쪽까지 받아 몫보다 많이 받는다), 다 받은 날(latest · 10/21~28)은 칸의 기사 비율로 몫을 나눈다.
  목표보다 적으면 다 쓴다
- 숨긴 기사: 운영에서 라벨로 숨긴 기사의 URL 목록(hidden_urls 표)을 고른 원본에서 뺀다(사유 hidden).
  원본을 고른 뒤 빼서 빈자리를 다른 기사로 채우지 않는다. 불량 본문 사유가 먼저 붙은 기사는 그 사유를 둔다
- 결과는 selection 표(그날 기사마다 selected · extra · 뺀 사유)와 days 표(하루 한 줄 기록)에 남긴다
"""

import re
from collections import Counter, defaultdict

try:
    from . import newsdata_daily as daily
except ImportError:  # 노트북에서는 모듈을 옆에 풀어 바로 import 한다
    import newsdata_daily as daily

TARGET = daily.TARGET

# 같은 언론사 · 같은 본문 규칙의 값(README.md 「불량 본문 규칙」)
HEAD = 50  # 앞 50자가 같은 기사끼리만 비교한다. 이보다 짧은 본문은 비교하지 않는다
LEAD = 300  # 제목과 맞춰 볼 본문 앞부분
MATCH = 0.35  # 제목-본문 점수가 이 이상이면 본문과 맞는 제목
LOW = 0.2  # 이 미만이면 본문과 맞지 않는 제목
SAME_TITLE = 0.4  # 제목-제목 점수가 이 이상이면 같은 기사의 다른 제목
REISSUE = 0.7  # 묶음의 모든 제목이 이만큼 비슷하면 같은 기사를 제목만 고쳐 다시 낸 것
REISSUE_MIN = 0.1  # 그때도 제목-본문 점수가 이 미만이면 묶음째 뺀다

SCHEMA = """
CREATE TABLE IF NOT EXISTS selection(
    day TEXT NOT NULL, article_id TEXT NOT NULL, status TEXT NOT NULL,
    PRIMARY KEY(day, article_id));
CREATE TABLE IF NOT EXISTS days(
    day TEXT PRIMARY KEY, unique_articles INTEGER NOT NULL, clean INTEGER NOT NULL,
    final INTEGER NOT NULL, dropped TEXT NOT NULL, empty_hours TEXT NOT NULL, built_at TEXT NOT NULL,
    raw INTEGER);
CREATE TABLE IF NOT EXISTS hidden_urls(
    link TEXT PRIMARY KEY, source TEXT NOT NULL, added_at TEXT NOT NULL);
"""
_TAG = re.compile(r"[\[【<(〈《][^\]】>)〉》]{0,20}[\]】>)〉》]")
_WORD = re.compile(r"[0-9A-Za-z가-힣]+")


def norm(text):
    return re.sub(r"\s+", " ", text or "").strip()


def bigrams(text):
    """낱말마다 붙은 두 글자 조각. 한 글자 낱말은 그대로 둔다."""
    out = set()
    for w in _WORD.findall(text.lower()):
        out.update({w} if len(w) == 1 else {w[k : k + 2] for k in range(len(w) - 1)})
    return out


def title_bigrams(title, outlet=""):
    t = _TAG.sub(" ", title)
    for name in {outlet, outlet.replace(" 뉴스", "")} - {""}:
        t = t.replace(name, " ")
    return bigrams(t)


def title_match(title, body, outlet=""):
    """제목-본문 점수: 제목의 두 글자 조각 중 본문 앞 LEAD 자에 나오는 비율."""
    t = title_bigrams(title, outlet)
    return len(t & bigrams(body[:LEAD])) / len(t) if t else 0.0


def title_sim(a, b, outlet=""):
    """제목-제목 점수: 두 제목의 두 글자 조각 중 겹치는 비율(짧은 쪽 기준)."""
    x, y = title_bigrams(a, outlet), title_bigrams(b, outlet)
    return len(x & y) / min(len(x), len(y)) if x and y else 0.0


def same_body_groups(articles):
    """같은 언론사 · 같은 본문(똑같거나 한쪽이 다른 쪽 앞부분) 묶음 중 제목이 둘 이상인 것."""
    blocks = defaultdict(list)
    for a in articles:
        if len(a["body"]) >= HEAD:
            blocks[(a["source_name"], a["body"][:HEAD])].append(a)
    groups = []
    for block in blocks.values():
        if len(block) < 2:
            continue
        parent = list(range(len(block)))

        def root(k, parent=parent):
            while parent[k] != k:
                parent[k] = parent[parent[k]]
                k = parent[k]
            return k

        order = sorted(range(len(block)), key=lambda k, b=block: len(b[k]["body"]))
        for i, a in enumerate(order):
            for b in order[i + 1 :]:
                if block[b]["body"].startswith(block[a]["body"]):
                    parent[root(b)] = root(a)
        members = defaultdict(list)
        for k in range(len(block)):
            members[root(k)].append(block[k])
        groups += [
            g
            for g in members.values()
            if len(g) >= 2 and len({norm(x["title"]) for x in g}) >= 2
        ]
    return groups


def decide(group):
    """(남길 기사 또는 None, {article_id: 사유코드}). 사유: no_match · unclear · wrong_body · duplicate."""
    outlet = group[0]["source_name"]
    score = {a["article_id"]: title_match(a["title"], a["body"], outlet) for a in group}
    owner = min(
        group, key=lambda a: (-score[a["article_id"]], a["published"], a["article_id"])
    )
    others = [a for a in group if a is not owner]
    sim = {
        a["article_id"]: title_sim(owner["title"], a["title"], outlet) for a in others
    }
    best = score[owner["article_id"]]
    reissue = (
        all(sim[a["article_id"]] >= REISSUE for a in others) and best >= REISSUE_MIN
    )
    if best < MATCH and not reissue:
        return None, {a["article_id"]: "no_match" for a in group}
    codes = {}
    for a in others:
        s = score[a["article_id"]]
        if s >= MATCH or sim[a["article_id"]] >= SAME_TITLE:
            codes[a["article_id"]] = "duplicate"
        elif s < LOW:
            codes[a["article_id"]] = "wrong_body"
        else:
            return None, {x["article_id"]: "unclear" for x in group}
    return owner, codes


def bad_bodies(articles):
    """{article_id: 사유코드}. 본문 없음(empty_body)과 같은 언론사 · 같은 본문 규칙."""
    codes = {a["article_id"]: "empty_body" for a in articles if not a["body"]}
    for group in same_body_groups([a for a in articles if a["body"]]):
        codes.update(decide(group)[1])
    return codes


def add_hidden_urls(conn, urls, source):
    """운영에서 숨긴 기사 URL 목록을 넣는다. {새로 넣은 수, DB 기사와 맞은 수}.

    같은 URL 은 다시 안 들어간다. 링크는 그대로 비교한다(팀 규칙: 같은 URL = 같은 기사).
    """
    conn.executescript(SCHEMA)
    links = sorted({u.strip() for u in urls if u.strip()})
    before = conn.total_changes
    added_at = daily.now_text()
    conn.executemany(
        "INSERT OR IGNORE INTO hidden_urls VALUES(?,?,?)",
        [(link, source, added_at) for link in links],
    )
    added = conn.total_changes - before
    found = sum(
        conn.execute("SELECT 1 FROM articles WHERE link=?", (link,)).fetchone()
        is not None
        for link in links
    )
    conn.commit()
    return {"added": added, "in_articles": found}


def pick_by_hour(articles, target=TARGET, quotas=None):
    """칸 안에서는 최신순으로 몫만큼 고른다. 고른 article_id 집합.

    quotas({시: 몫})가 없으면 1시간 칸의 기사 비율대로 target 을 나눠 몫을 정한다.
    """
    by_hour = defaultdict(list)
    for a in articles:
        by_hour[int(a["published"][11:13])].append(a)
    hours = sorted(by_hour)
    if quotas is None:
        shares = daily.allocate([len(by_hour[h]) for h in hours], target)
        quotas = dict(zip(hours, shares, strict=True))
    picked = set()
    for hour in hours:
        newest = sorted(
            by_hour[hour], key=lambda a: (a["published"], a["article_id"]), reverse=True
        )
        picked.update(a["article_id"] for a in newest[: quotas.get(hour, 0)])
    return picked


def archive_quotas(conn, day):
    """archive 로 받을 때 정한 칸별 몫 {시: 몫}. 24칸이 다 정해지지 않았으면 None."""
    quotas = dict(
        conn.execute(
            "SELECT hour, quota FROM archive_hours WHERE day=? AND quota IS NOT NULL",
            (day.isoformat(),),
        ).fetchall()
    )
    return quotas if len(quotas) == 24 else None


def build_day(conn, day, target=TARGET):
    """그날 기사 → 원본 고르기 → 불량 본문 거르기 → 숨긴 기사 빼기. selection · days 표에 남기고 건수를 돌려준다."""
    conn.executescript(daily.SCHEMA + SCHEMA)
    if "raw" not in {r[1] for r in conn.execute("PRAGMA table_info(days)")}:
        # raw 열이 없던 때 만든 days 표(2026-11-04 오전 서버 실행)
        conn.execute("ALTER TABLE days ADD COLUMN raw INTEGER")
    start, end = daily.day_bounds(day)
    keys = ("article_id", "link", "source_name", "title", "content", "published")
    rows = conn.execute(
        f"SELECT {', '.join(keys)} FROM articles WHERE published >= ? AND published < ? "
        "ORDER BY published, article_id",
        (start, end),
    ).fetchall()
    articles = [dict(zip(keys, r, strict=True)) for r in rows]
    for a in articles:
        a["body"] = norm(a["content"])
    raw_ids = pick_by_hour(articles, target, archive_quotas(conn, day))
    codes = bad_bodies([a for a in articles if a["article_id"] in raw_ids])
    hidden = {r[0] for r in conn.execute("SELECT link FROM hidden_urls")}
    for a in articles:
        if a["article_id"] in raw_ids and a["link"] in hidden:
            codes.setdefault(a["article_id"], "hidden")
    picked = raw_ids - codes.keys()
    key = day.isoformat()
    conn.execute("DELETE FROM selection WHERE day=?", (key,))
    conn.executemany(
        "INSERT INTO selection VALUES(?,?,?)",
        [
            (
                key,
                a["article_id"],
                codes.get(a["article_id"])
                or ("selected" if a["article_id"] in picked else "extra"),
            )
            for a in articles
        ],
    )
    dropped = dict(Counter(codes.values()))
    empty = [h for h, n in enumerate(daily.hour_counts(conn, day)) if n == 0]
    conn.execute(
        "INSERT OR REPLACE INTO days(day, unique_articles, raw, clean, final, dropped, empty_hours, "
        "built_at) VALUES(?,?,?,?,?,?,?,?)",
        (
            key,
            len(articles),
            len(raw_ids),
            len(picked),
            len(picked),
            ",".join(f"{k}:{v}" for k, v in sorted(dropped.items())),
            ",".join(str(h) for h in empty),
            daily.now_text(),
        ),
    )
    conn.commit()
    return {
        "day": key,
        "unique": len(articles),
        "raw": len(raw_ids),
        "dropped": dropped,
        "final": len(picked),
        "empty_hours": empty,
    }


def record_line(conn, day):
    """팀방에 올릴 한 줄: 요청 수 · 차감 크레딧 · 받은 건수 · 그날 기사 수 · 중복 제거 후 · 원본(상한) · 거른 뒤 건수."""
    key = day.isoformat()
    ok, credits, received, in_day = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(credits),0), COALESCE(SUM(received),0), COALESCE(SUM(in_day),0) "
        "FROM requests WHERE day=? AND status=200",
        (key,),
    ).fetchone()
    failed = conn.execute(
        "SELECT COUNT(*) FROM requests WHERE day=? AND status<>200", (key,)
    ).fetchone()[0]
    unique, raw, final = conn.execute(
        "SELECT unique_articles, raw, final FROM days WHERE day=?", (key,)
    ).fetchone()
    tried = f"요청 {ok:,}번" + (f"(실패 {failed}번 따로)" if failed else "")
    return (
        f"{day:%m/%d} {tried} · 크레딧 {credits:,} · 받은 {received:,}건 · 그날 기사 {in_day:,} · "
        f"중복 제거 후 {unique:,} · 원본 {raw:,} · 거른 뒤 {final:,}"
    )
