# %% [markdown]
# # NewsData 하루 단위 수집 — 11/4~11/8 (2026-11-09 실행)
#
# - **지난 날(48시간이 지난 날)은 archive.** 요청당 5크레딧. 하루를 1시간 칸 24개로 나눠, 하루 목표(7,000건)를 칸의 기사 비율대로 받는다
# - **48시간 안의 날(11/8)은 latest.** 요청당 1크레딧. 그날 00:00~24:00 을 다 받는다. timeframe 은 실행 시각에 맞춰 계산한다
# - 결과는 10/21~11/3 이 든 기존 DB(`newsdata_collect/newsdata.sqlite`)에 그대로 쌓인다. 받기 전에 DB 를 백업한다
# - 받은 뒤 그날 데이터셋을 만든다: 중복 제거 → 원본 7,000건 고르기(1시간 칸 몫) → 불량 본문 거르기 → 숨긴 기사 빼기. 7,000건은 원본 기준 상한이라 거른 뒤 건수는 날마다 다르다
# - 숨긴 기사: 운영에서 라벨로 숨긴 기사의 URL 목록(노트북 옆 `hidden_urls/*.txt`)으로 10/21~11/8 전체에서 뺀다
# - 날마다 팀방에 올릴 한 줄(요청 수 · 크레딧 · 받은 건수 · 그날 기사 · 중복 제거 후 · 원본 · 거른 뒤)을 찍는다
#
# 키는 노트북 · 파일에 적지 않는다. 환경변수 `NEWSDATA_API_KEY` 가 없으면 입력창이 뜬다.
# 지난 실행(11/4: 10/29~11/2 archive · 11/3 latest · 10/21~28 합치기)과 자세한 기준은 저장소 `ai/experiments/issue_backfill/README.md`.

# %%
import sys
from datetime import date, timedelta
from pathlib import Path

print("Python", sys.version.split()[0])  # 3.10 이상이어야 한다

OUT_DIR = Path("newsdata_collect")
DB_PATH = OUT_DIR / "newsdata.sqlite"
BACKUP = Path("../_archive_20261109/newsdata_collect_before_1104_1108.sqlite")
HIDDEN_DIR = Path("hidden_urls")  # 운영 숨김 URL 목록(.txt, 한 줄에 URL 하나)

# 수집 조건. 10/21~28 수집과 같아야 날짜끼리 비교된다
QUERY = {
    "country": "kr",
    "language": "ko",
    "removeduplicate": 1,
    "excludecategory": "sports,entertainment,lifestyle,food,tourism",
}
PAGE_SIZE = 50
TARGET = 7000  # 하루 목표. 기사가 이보다 적은 날(주말)은 받을 수 있는 만큼 받는다

ARCHIVE_DAYS = [date(2026, 11, 4) + timedelta(days=k) for k in range(4)]  # 11/4~11/7
ARCHIVE_MAX_CREDITS = (
    3000  # archive 실행 상한(크레딧). 추정 약 2,670(평일 약 760 · 토 약 390)
)
LATEST_DAY = date(2026, 11, 8)
LATEST_MAX_CREDITS = (
    300  # latest 하루 실행 상한(크레딧). 지난 일요일 5,694건 = 약 115쪽
)

OLD_DAYS = [date(2026, 10, 21) + timedelta(days=k) for k in range(14)]  # 10/21~11/3
ALL_DAYS = OLD_DAYS + ARCHIVE_DAYS + [LATEST_DAY]  # 10/21~11/8
OLD_TOTAL = (
    83134,
    72402,
)  # 10/21~11/3 원본 · 최종(11/4 에 만든 값). 숨기기 전 다시 만들어도 같아야 한다

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
    "10/21~11/3 지금 days 표: 날 {} · 원본 {:,} · 최종 {:,}".format(
        *day_total(OLD_DAYS)
    )
)

# %% [markdown]
# ## 1. 기존 날 다시 만들어 맞춰 보기
# 받기 전에 10/21~11/3 을 지금 코드로 다시 만들어, 11/4 에 만든 값(원본 83,134 · 최종 72,402)과 같은지 본다.
# 다르면 여기서 멈추고 원인을 본다. 숨김 목록을 이미 넣은 뒤 다시 돌릴 때는 비교하지 않는다.
# 받은 뒤에는 11/4 0시 칸 · 11/8 latest 가 11/3 · 11/7 밤 기사를 몇 건 더 가져올 수 있어 그날 값이 조금 바뀔 수 있다.

# %%
conn.executescript(ds.SCHEMA)
hidden_rows = conn.execute("SELECT COUNT(*) FROM hidden_urls").fetchone()[0]
for day in OLD_DAYS:
    ds.build_day(conn, day, target=TARGET)
_, raw, final = day_total(OLD_DAYS)
print(f"10/21~11/3 다시 만든 값: 원본 {raw:,} · 최종 {final:,}")
if hidden_rows:
    print(f"숨김 목록 {hidden_rows:,}건이 이미 들어 있어 11/4 값과 비교하지 않는다")
elif (raw, final) != OLD_TOTAL:
    raise RuntimeError(f"11/4 값 {OLD_TOTAL} 과 다르다. 받기 전에 원인을 본다")
else:
    print("11/4 값과 같다")

# %% [markdown]
# ## 2. 지난 날 — archive (11/4~11/7)
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
# ## 3. 11/8 — latest
# 11/9 24:00 이 지나면 11/8 00:00 이 48시간보다 앞이라 latest 로는 못 받고 archive(5배)로 받아야 한다.

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
new_keys = tuple(d.isoformat() for d in ARCHIVE_DAYS + [LATEST_DAY])
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
# `hidden_urls/*.txt` 를 읽어 넣고(파일 이름이 출처), 10/21~11/8 을 다시 만든다. 같은 목록을 다시 넣어도 늘지 않는다.
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
# 날마다 원본 · 최종 건수와 뺀 사유. README 표에 옮긴다.

# %%
for row in conn.execute(
    "SELECT day, unique_articles, raw, final, dropped FROM days "
    "WHERE day BETWEEN ? AND ? ORDER BY day",
    (ALL_DAYS[0].isoformat(), ALL_DAYS[-1].isoformat()),
):
    print(row)
for label, days in [
    ("10/21~11/3", OLD_DAYS),
    ("11/4~11/8", ALL_DAYS[len(OLD_DAYS) :]),
    ("10/21~11/8", ALL_DAYS),
]:
    print("{}: 날 {} · 원본 {:,} · 최종 {:,}".format(label, *day_total(days)))
