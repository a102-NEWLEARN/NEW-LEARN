# %% [markdown]
# # NewsData 하루 단위 수집 — 11/9~11/11 (2026-11-12 실행)
#
# - **지난 날(48시간이 지난 날 11/9 · 11/10)은 archive.** 요청당 5크레딧. 하루를 1시간 칸 24개로 나눠, 하루 목표(7,000건)를 칸의 기사 비율대로 받는다
# - **48시간 안의 날(11/11)은 latest.** 요청당 1크레딧. 그날 00:00~24:00 을 다 받는다. timeframe 은 실행 시각에 맞춰 계산한다
# - 결과는 10/21~11/8 이 든 기존 DB(`newsdata_collect/newsdata.sqlite`)에 그대로 쌓인다. 받기 전에 DB 를 백업한다
# - 받은 뒤 그날 데이터셋을 만든다: 중복 제거 → 원본 7,000건 고르기(1시간 칸 몫) → 불량 본문 거르기 → 숨긴 기사 빼기. 7,000건은 원본 기준 상한이라 거른 뒤 건수는 날마다 다르다
# - 숨긴 기사: 운영에서 라벨로 숨긴 기사의 URL 목록(노트북 옆 `hidden_urls/*.txt`)으로 10/21~11/11 전체에서 뺀다
# - 받은 날(11/9~11/11) 선정 기사의 BGE-m3-ko 벡터를 GPU 로 만들고(7절), 내려받을 DB 사본을 만든다(8절)
# - 날마다 팀방에 올릴 한 줄(요청 수 · 크레딧 · 받은 건수 · 그날 기사 · 중복 제거 후 · 원본 · 거른 뒤)을 찍는다
#
# 키는 노트북 · 파일에 적지 않는다. 환경변수 `NEWSDATA_API_KEY` 가 없으면 입력창이 뜬다.
# 지난 실행(11/4 · 11/9)과 자세한 기준은 저장소 `ai/experiments/issue_backfill/README.md`.

# %%
import sys
from datetime import date, timedelta
from pathlib import Path

print("Python", sys.version.split()[0])  # 3.10 이상이어야 한다

OUT_DIR = Path("newsdata_collect")
DB_PATH = OUT_DIR / "newsdata.sqlite"
BACKUP = Path("../_archive_20261112/newsdata_collect_before_1109_1111.sqlite")
HIDDEN_DIR = Path("hidden_urls")  # 운영 숨김 URL 목록(.txt, 한 줄에 URL 하나)
VECTORS = OUT_DIR / "vectors_1109_1111.sqlite"  # 7절 벡터(내려받는다)
EXPORT = OUT_DIR / "newsdata_2026-10-21_2026-11-11.sqlite"  # 8절 사본(내려받는다)

# 수집 조건. 10/21~28 수집과 같아야 날짜끼리 비교된다
QUERY = {
    "country": "kr",
    "language": "ko",
    "removeduplicate": 1,
    "excludecategory": "sports,entertainment,lifestyle,food,tourism",
}
PAGE_SIZE = 50
TARGET = 7000  # 하루 목표. 기사가 이보다 적은 날(주말)은 받을 수 있는 만큼 받는다

ARCHIVE_DAYS = [date(2026, 11, 9), date(2026, 11, 10)]  # 11/9(월) · 11/10(화)
ARCHIVE_MAX_CREDITS = 1700  # archive 실행 상한(크레딧). 추정 약 1,530(평일 약 765)
LATEST_DAY = date(2026, 11, 11)  # 11/11(수)
LATEST_MAX_CREDITS = (
    400  # latest 하루 실행 상한(크레딧). 지난 평일 11/3 13,960건 = 280쪽
)

OLD_DAYS = [date(2026, 10, 21) + timedelta(days=k) for k in range(19)]  # 10/21~11/8
NEW_DAYS = ARCHIVE_DAYS + [LATEST_DAY]  # 11/9~11/11
ALL_DAYS = OLD_DAYS + NEW_DAYS  # 10/21~11/11
OLD_TOTAL = (
    112380,
    94587,
)  # 10/21~11/8 원본 · 최종(11/9 에 숨긴 기사 1105 · 1109 목록까지 뺀 값). 다시 만들어도 같아야 한다

# %%
import getpass
import os

NEWSDATA_API_KEY = os.environ.get("NEWSDATA_API_KEY") or getpass.getpass(
    "NewsData API 키: "
)
print("키 입력 완료 (값은 출력하지 않음)")

# %%
import sqlite3

import newsdata_daily as daily
import newsdata_dataset as ds
import newsdata_fetch as nd

OUT_DIR.mkdir(exist_ok=True)
conn = nd.open_store(DB_PATH)


def show_day(day):
    """그날 데이터셋을 다시 만들고 기록 한 줄과 빈 시간대를 찍는다."""
    built = ds.build_day(conn, day, target=TARGET)
    print(ds.record_line(conn, day))
    if built["dropped"]:
        print("  뺀 사유:", built["dropped"])
    if built["empty_hours"]:
        print("  기사가 하나도 없는 시간:", built["empty_hours"])


def day_total(days):
    keys = tuple(d.isoformat() for d in days)
    marks = ",".join("?" * len(keys))
    return conn.execute(
        f"SELECT COUNT(*), COALESCE(SUM(raw),0), COALESCE(SUM(final),0) FROM days WHERE day IN ({marks})",
        keys,
    ).fetchone()


# %% [markdown]
# ## 0. 받기 전 백업
# 한 번만 만든다(이미 있으면 그대로 둔다). 되돌릴 때는 이 파일로 DB 를 바꿔 놓는다.

# %%
BACKUP.parent.mkdir(exist_ok=True)
if BACKUP.exists():
    print("백업이 이미 있다:", BACKUP)
else:
    with sqlite3.connect(BACKUP) as dst:
        conn.backup(dst)
    print(f"백업: {BACKUP} ({BACKUP.stat().st_size:,}바이트)")
print(
    "10/21~11/8 지금 days 표: 날 {} · 원본 {:,} · 최종 {:,}".format(
        *day_total(OLD_DAYS)
    )
)

# %% [markdown]
# ## 1. 기존 날 다시 만들어 맞춰 보기
# 받기 전에 10/21~11/8 을 지금 코드 · 지금 숨김 목록(1105 · 1109)으로 다시 만들어, 11/9 에 만든 값(원본 112,380 · 최종 94,587)과
# 같은지 본다. 다르면 여기서 멈추고 원인을 본다. 받은 뒤 다시 돌리면 11/9 0시 칸이 11/8 밤 기사를 몇 건 가져와 값이 바뀔 수 있다(6절에서 본다).

# %%
conn.executescript(ds.SCHEMA)
print(
    "숨김 목록:",
    dict(conn.execute("SELECT source, COUNT(*) FROM hidden_urls GROUP BY source")),
)
for day in OLD_DAYS:
    ds.build_day(conn, day, target=TARGET)
_, raw, final = day_total(OLD_DAYS)
print(f"10/21~11/8 다시 만든 값: 원본 {raw:,} · 최종 {final:,}")
if (raw, final) != OLD_TOTAL:
    raise RuntimeError(f"11/9 값 {OLD_TOTAL} 과 다르다. 받기 전에 원인을 본다")
print("11/9 값과 같다")

# %% [markdown]
# ## 2. 지난 날 — archive (11/9 · 11/10)
# 15분에 1,800크레딧을 넘지 않게 알아서 기다린다. 상한에 닿아 멈추면 다시 실행해 이어 받는다(받은 칸은 다시 안 받는다).

# %%
meter = daily.Meter(conn, NEWSDATA_API_KEY, ARCHIVE_MAX_CREDITS)
try:
    for day in ARCHIVE_DAYS:
        daily.fetch_archive_day(
            conn, meter, QUERY, day, target=TARGET, page_size=PAGE_SIZE
        )
        show_day(day)
finally:
    print(f"이번 실행 크레딧 {meter.used:,} (archive 요청 {meter.used // 5:,}번)")

# %% [markdown]
# ## 3. 11/11 — latest
# 11/12 24:00 이 지나면 11/11 00:00 이 48시간보다 앞이라 latest 로는 못 받고 archive(5배)로 받아야 한다.

# %%
from datetime import datetime

meter = daily.Meter(conn, NEWSDATA_API_KEY, LATEST_MAX_CREDITS)
try:
    result = daily.fetch_latest_day(
        conn, meter, QUERY, LATEST_DAY, datetime.now(nd.KST), page_size=PAGE_SIZE
    )
    if not (result["reached_start"] and result["reached_end"]):
        print("  그날 00:00 이나 24:00 까지 닿지 못했다:", result)
    show_day(LATEST_DAY)
finally:
    print(f"이번 실행 크레딧 {meter.used:,}")

# %% [markdown]
# ## 4. 받은 것 확인
# 실패한 요청(크레딧 0 으로 적음)과 몫보다 덜 받은 칸을 본다.

# %%
new_keys = tuple(d.isoformat() for d in NEW_DAYS)
marks = ",".join("?" * len(new_keys))
for row in conn.execute(
    "SELECT day, endpoint, COUNT(*), SUM(credits), SUM(status<>200), SUM(received) "
    f"FROM requests WHERE day IN ({marks}) GROUP BY day, endpoint ORDER BY day",
    new_keys,
):
    print(row)
for row in conn.execute(
    "SELECT at, endpoint, day, label, status, message FROM requests "
    f"WHERE status<>200 AND day IN ({marks})",
    new_keys,
):
    print("실패:", row)
for row in conn.execute(
    "SELECT day, hour, total, quota, got FROM archive_hours "
    f"WHERE got < quota AND day IN ({marks})",
    new_keys,
):
    print("몫보다 덜 받은 칸:", row)

# %% [markdown]
# ## 5. 숨긴 기사 빼기
# `hidden_urls/*.txt` 를 읽어 넣고(파일 이름이 출처), 10/21~11/11 을 다시 만든다. 같은 목록을 다시 넣어도 늘지 않는다.
# 목록마다 맞은 기사가 지금 어떤 상태인지 센다. hidden 은 이번에 뺀 것, 불량 사유는 원래 거른 것, extra 는 원본에 안 뽑혀 원래 없던 것이다.

# %%
for path in sorted(HIDDEN_DIR.glob("*.txt")):
    urls = path.read_text(encoding="utf-8").splitlines()
    print(path.name, ds.add_hidden_urls(conn, urls, path.name))
for day in ALL_DAYS:
    ds.build_day(conn, day, target=TARGET)

STATUS_SQL = """
SELECT h.source, h.link, a.published, a.source_name,
       COALESCE(s.status, CASE WHEN a.article_id IS NULL THEN 'DB에 없음' ELSE '날짜 밖' END)
FROM hidden_urls h
LEFT JOIN articles a ON a.link = h.link
LEFT JOIN selection s ON s.day = substr(a.published, 1, 10) AND s.article_id = a.article_id
ORDER BY h.source, a.published
"""
from collections import Counter, defaultdict

by_source = defaultdict(list)
for row in conn.execute(STATUS_SQL):
    by_source[row[0]].append(row[1:])
for source, rows in by_source.items():
    print(f"\n{source}: URL {len(rows):,}개", dict(Counter(r[3] for r in rows)))
    if len(rows) <= 30:
        for link, published, outlet, status in rows:
            print(f"  {status:<10} {published or '-':<19} {outlet or '-':<8} {link}")

# %% [markdown]
# ## 6. 결과
# 날마다 원본 · 최종 건수와 뺀 사유. README 표에 옮긴다. 10/21~11/8 이 11/9 값과 다르면 알린다.

# %%
for row in conn.execute(
    "SELECT day, unique_articles, raw, final, dropped FROM days "
    "WHERE day BETWEEN ? AND ? ORDER BY day",
    (ALL_DAYS[0].isoformat(), ALL_DAYS[-1].isoformat()),
):
    print(row)
for label, days in [
    ("10/21~11/8", OLD_DAYS),
    ("11/9~11/11", NEW_DAYS),
    ("10/21~11/11", ALL_DAYS),
]:
    print("{}: 날 {} · 원본 {:,} · 최종 {:,}".format(label, *day_total(days)))
if day_total(OLD_DAYS)[1:] != OLD_TOTAL:
    print("주의: 10/21~11/8 값이 11/9 값과 다르다 — 바뀐 날을 위 표에서 본다")

# %% [markdown]
# ## 7. 받은 날 벡터 (GPU)
# 11/9~11/11 선정 기사의 BGE-m3-ko 벡터를 `vectors_1109_1111.sqlite` 에 만든다. 입력 글(제목 + 본문 앞 800자)과 해시는
# 묶기(`issue_grouping.embed_articles`)와 같다. 이미 만든 것은 다시 만들지 않는다(11/4~11/8 25,334건이 약 3분).

# %%
import issue_grouping as ig

KEYS = ("article_id", "title", "description", "content")
rows = conn.execute(
    f"SELECT {', '.join('a.' + k for k in KEYS)} FROM articles a "
    "JOIN selection s ON s.day = substr(a.published, 1, 10) AND s.article_id = a.article_id "
    "WHERE s.status = 'selected' AND s.day BETWEEN ? AND ? ORDER BY a.published, a.article_id",
    (NEW_DAYS[0].isoformat(), NEW_DAYS[-1].isoformat()),
).fetchall()
articles = [dict(zip(KEYS, r, strict=True)) for r in rows]
vectors = ig.embed_articles(VECTORS, articles, ig.bge_encoder("cuda"))
print(f"벡터 {vectors.shape} → {VECTORS} ({VECTORS.stat().st_size:,}바이트)")

# %% [markdown]
# ## 8. 내려받을 사본
# DB 전체를 `VACUUM INTO` 로 새 파일에 쓴다(저장소 `data/newsdata_2026-10-21_2026-11-11.sqlite` 가 될 파일). 이미 있으면 지우고 다시 쓴다.
# 끝나면 이 파일과 7절 벡터 파일을 내려받는다.

# %%
import hashlib


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


conn.commit()
EXPORT.unlink(missing_ok=True)
conn.execute("VACUUM INTO ?", (str(EXPORT),))
for path in (EXPORT, VECTORS):
    print(f"{path} {path.stat().st_size:,}바이트 sha256 {sha256(path)}")
