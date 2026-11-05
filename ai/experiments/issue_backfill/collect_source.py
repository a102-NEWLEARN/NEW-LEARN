# %% [markdown]
# # NewsData 하루 단위 수집 (2026-11-04 팀 수집 계획)
#
# - **지난 날(48시간이 지난 날)은 archive.** 요청당 5크레딧. 하루를 1시간 칸 24개로 나눠, 하루 목표(7,000건)를 칸의 기사 비율대로 받는다
# - **48시간 안의 날(11/3)은 latest.** 요청당 1크레딧. 그날 00:00~24:00 을 다 받는다. timeframe 은 실행 시각에 맞춰 계산한다
# - 이 노트북은 11/3 까지 받는다. 11/4 부터는 백엔드와 정해 받는다(2026-11-04)
# - 받은 뒤 그날 데이터셋을 만든다: 중복 제거 → 원본 7,000건 고르기(1시간 칸 몫) → 불량 본문 거르기. 7,000건은 원본 기준 상한이라 거른 뒤 건수는 날마다 다르다
# - 날마다 팀방에 올릴 한 줄(요청 수 · 크레딧 · 받은 건수 · 그날 기사 · 중복 제거 후 · 원본 · 거른 뒤)을 찍는다
#
# 키는 노트북 · 파일에 적지 않는다. 환경변수 `NEWSDATA_API_KEY` 가 없으면 입력창이 뜬다.
# 자세한 기준은 저장소 `ai/experiments/issue_backfill/README.md`.

# %%
import sys
from datetime import date, timedelta
from pathlib import Path

print("Python", sys.version.split()[0])  # 3.10 이상이어야 한다

OUT_DIR = Path("newsdata_collect")
DB_PATH = OUT_DIR / "newsdata.sqlite"

# 수집 조건. 10/21~28 수집과 같아야 날짜끼리 비교된다
QUERY = {
    "country": "kr",
    "language": "ko",
    "removeduplicate": 1,
    "excludecategory": "sports,entertainment,lifestyle,food,tourism",
}
PAGE_SIZE = 50
TARGET = 7000  # 하루 목표. 기사가 이보다 적은 날(주말)은 받을 수 있는 만큼 받는다

ARCHIVE_DAYS = [date(2026, 10, 29) + timedelta(days=k) for k in range(5)]  # 10/29~11/2
ARCHIVE_MAX_CREDITS = 3600  # archive 실행 상한(크레딧). 팀 계획 약 3,500
LATEST_MAX_CREDITS = (
    800  # latest 하루 실행 상한(크레딧). 평일 전날 1만1천~1만5천 건 = 230~310쪽
)

# %%
import getpass
import os

NEWSDATA_API_KEY = os.environ.get("NEWSDATA_API_KEY") or getpass.getpass(
    "NewsData API 키: "
)
print("키 입력 완료 (값은 출력하지 않음)")

# %%
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


# %% [markdown]
# ## 1. 지난 날 — archive (10/29~11/2)
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
# ## 2. 11/3 — latest
# 11/4 24:00 이 지나면 11/3 00:00 이 48시간보다 앞이라 latest 로는 못 받고 archive(5배)로 받아야 한다.

# %%
from datetime import datetime

day = date(2026, 11, 3)
meter = daily.Meter(conn, NEWSDATA_API_KEY, LATEST_MAX_CREDITS)
try:
    result = daily.fetch_latest_day(
        conn, meter, QUERY, day, datetime.now(nd.KST), page_size=PAGE_SIZE
    )
    if not (result["reached_start"] and result["reached_end"]):
        print("  그날 00:00 이나 24:00 까지 닿지 못했다:", result)
    show_day(day)
finally:
    print(f"이번 실행 크레딧 {meter.used:,}")

# %% [markdown]
# ## 3. 첫날 확인
# 실패한 요청(크레딧 0 으로 적음)이 있으면, 대시보드에서 빠진 크레딧과 위 '크레딧' 합을 맞춰 보면 실패 요청도 빠지는지 안다.

# %%
for row in conn.execute(
    "SELECT day, endpoint, COUNT(*), SUM(credits), SUM(status<>200), SUM(received) "
    "FROM requests GROUP BY day, endpoint ORDER BY day"
):
    print(row)
for row in conn.execute(
    "SELECT at, endpoint, day, label, status, message FROM requests WHERE status<>200"
):
    print("실패:", row)
for row in conn.execute(
    "SELECT day, hour, total, quota, got FROM archive_hours WHERE got < quota"
):
    print("몫보다 덜 받은 칸:", row)

# %% [markdown]
# ## 4. 10/21~28 기사 합치기
# 10/28 에 받은 `issue_backfill_out/newsdata.sqlite` 의 기사를 이 DB 로 옮기고, 같은 기준(1시간 칸 원본 7,000건 · 불량 본문)으로 날마다 정리한다.
# 예전 DB 는 읽기만 한다. 합치기 전 이 DB 는 `../_archive_20261104/` 에 백업한다. 다시 돌려도 같은 기사는 다시 안 들어간다.
# 10/21 은 18:50 부터, 10/28 은 14:42 까지만 있다.

# %%
import sqlite3

OLD_DB = Path("issue_backfill_out/newsdata.sqlite")
BACKUP = Path("../_archive_20261104/newsdata_collect_before_merge.sqlite")
BACKUP.parent.mkdir(exist_ok=True)
if not BACKUP.exists():
    with sqlite3.connect(BACKUP) as dst:
        conn.backup(dst)
cols = "article_id, link, title, description, content, published, source_id, source_name, category, fetched_at"
with sqlite3.connect(f"file:{OLD_DB.resolve().as_posix()}?mode=ro", uri=True) as old:
    rows = old.execute(f"SELECT {cols} FROM articles").fetchall()
before = conn.total_changes
conn.executemany(
    f"INSERT OR IGNORE INTO articles({cols}) VALUES(?,?,?,?,?,?,?,?,?,?)", rows
)
conn.commit()
print(f"예전 기사 {len(rows):,}건 중 새로 들어감 {conn.total_changes - before:,}건")
for k in range(8):
    day = date(2026, 10, 21) + timedelta(days=k)
    built = ds.build_day(conn, day, target=TARGET)
    print(
        f"{day:%m/%d} 기사 {built['unique']:,} · 원본 {built['raw']:,} · 거른 뒤 {built['final']:,}"
    )
total = conn.execute(
    "SELECT SUM(unique_articles), SUM(raw), SUM(final) FROM days"
).fetchone()
print("10/21~11/3 합계: 기사 {:,} · 원본 {:,} · 거른 뒤 {:,}".format(*total))
