# %% [markdown]
# # NewsData 3개월 기사 → 사건 → 이슈 → 이슈 요약 CSV
#
# 1. NewsData.io 에서 한국어 기사를 받아 `OUT_DIR/newsdata.sqlite` 에 쌓는다 (과거 기사는 유료 archive, 최근 기사는 latest)
# 2. BGE-m3-ko 로 벡터를 만든다 (GPU). 만든 벡터는 같은 파일에 저장해 다시 만들지 않는다
# 3. 72시간 안의 기사끼리 평균 연결 거리 0.20 이하로 사건을 묶는다
# 4. 사건을 시각순으로 보며 최근 7일 안에 이어진 이슈에 평균 거리 0.40 이하면 붙인다. 사건 3개 이상이면 이슈로 남긴다
# 5. 이슈마다 GMS(gpt-6-luna)로 제목 · 요약을 짓고, 사건 수가 많은 순으로 CSV 를 쓴다
#
# 키는 노트북 · 파일에 적지 않는다. 환경변수(`NEWSDATA_API_KEY`, `GMS_API_KEY`)가 없으면 입력창이 뜬다.
# 자세한 기준은 저장소 `ai/experiments/issue_backfill/README.md`.

# %%
import sys
from pathlib import Path

print("Python", sys.version.split()[0])  # 3.10 이상이어야 한다

OUT_DIR = Path("issue_backfill_out")
DB_PATH = OUT_DIR / "newsdata.sqlite"
DAYS = 90  # 지금부터 며칠 전까지

# 수집 조건. MVP 밖(스포츠 · 연예)과 생활 분류는 받지 않는다(docs/data-model.md category_mapping)
QUERY = {
    "country": "kr",
    "language": "ko",
    "removeduplicate": 1,
    "excludecategory": "sports,entertainment,lifestyle,food,tourism",
}
FETCH_MODE = (
    "auto"  # auto: archive 가 막히면 latest 만. archive · latest 로 고정할 수도 있다
)
MAX_CREDITS = 2000  # 이번 실행에서 쓸 NewsData 크레딧 상한(요청 1번 = 1크레딧). Basic 은 한 달 20,000
PAGE_SIZE = 50  # 요청 한 번에 받을 기사 수. 무료 요금제면 None

EVENT_DISTANCE = (
    0.20  # 팀 파이프라인 기본값. 검증상 0.25 가 재현율이 높았다(cluster_validation)
)
EVENT_WINDOW_HOURS = 72
ISSUE_DISTANCE = 0.40
ISSUE_GAP_DAYS = 7
MIN_EVENTS = 3

GMS_MODEL = "gpt-6-luna"
SUMMARY_WORKERS = 4
DEVICE = "cuda"

# %%
import getpass
import os

NEWSDATA_API_KEY = os.environ.get("NEWSDATA_API_KEY") or getpass.getpass(
    "NewsData API 키: "
)
GMS_API_KEY = (
    os.environ.get("GMS_API_KEY")
    or os.environ.get("GMS_KEY")
    or getpass.getpass("GMS 키: ")
)
print("키 입력 완료 (값은 출력하지 않음)")

# %% [markdown]
# ## 1. 기사 받기
# 크레딧을 다 쓰면 그 자리에서 멈춘다. 다시 실행하면 받은 날은 건너뛰고 멈춘 날부터 잇는다.

# %%
from datetime import datetime

import newsdata_fetch as nd

NOW = datetime.now(nd.KST)
report = nd.collect(
    DB_PATH,
    NEWSDATA_API_KEY,
    QUERY,
    days=DAYS,
    mode=FETCH_MODE,
    max_credits=MAX_CREDITS,
    page_size=PAGE_SIZE,
    now=NOW,
)
print(
    f"방식 {report['mode']} · 이번에 쓴 크레딧 {report['credits']:,} · 새 기사 {report['inserted']:,}건"
)
print(
    f"창 {report['window_start']} ~ 지금: 저장된 기사 {report['stored']:,}건, 날짜 {len(report['by_day'])}일"
)
for day, count in report["by_day"]:
    print(day, count)

# %% [markdown]
# ## 2. 벡터 만들기

# %%
import issue_grouping as ig

articles = ig.load_articles(DB_PATH, report["window_start"])
seconds = ig.seconds_of([a["published"] for a in articles])
with_body = sum(1 for a in articles if a["content"])
print(
    f"기사 {len(articles):,}건 (본문 있음 {with_body:,} · 설명만 {len(articles) - with_body:,})"
)
vectors = ig.embed_articles(DB_PATH, articles, ig.bge_encoder(DEVICE))
print(vectors.shape)

# %% [markdown]
# ## 3. 사건 · 이슈 묶기

# %%
labels, info = ig.cluster_events(
    vectors, seconds, distance=EVENT_DISTANCE, window_hours=EVENT_WINDOW_HOURS
)
events, sums = ig.summarize_events(articles, vectors, seconds, labels)
single = sum(1 for e in events if e["articles"] == 1)
print(f"사건 {len(events):,}개 (기사 1건짜리 {single:,}) · 진단 {info}")

issue_of = ig.link_issues(
    events, sums, distance=ISSUE_DISTANCE, gap_days=ISSUE_GAP_DAYS
)
issues = ig.build_issues(events, issue_of, min_events=MIN_EVENTS)
in_issue = sum(i["article_count"] for i in issues)
print(
    f"이슈 후보 {int(issue_of.max()) + 1 if len(issue_of) else 0:,}개 중 사건 {MIN_EVENTS}개 이상 {len(issues):,}개"
)
print(f"이슈에 든 기사 {in_issue:,}건 ({in_issue / max(1, len(articles)):.1%})")
for issue in issues[:15]:
    print(
        issue["issue_id"],
        issue["event_count"],
        issue["article_count"],
        issue["events"][0]["title"],
    )

# %% [markdown]
# ## 4. 이슈 요약 (GMS)
# 이슈 하나가 요청 하나다. 결과는 캐시에 쌓여 다시 실행하면 새 이슈만 부른다.

# %%
import issue_summary as summ

payloads = {i["issue_id"]: summ.issue_payload(i, ig.fmt) for i in issues}
summaries = summ.summarize_issues(
    payloads,
    OUT_DIR / "summary_cache.json",
    api_key=GMS_API_KEY,
    model=GMS_MODEL,
    workers=SUMMARY_WORKERS,
)
failed = [k for k, v in summaries.items() if "error" in v]
topics = [k for k, v in summaries.items() if v.get("is_issue") is False]
print(
    f"요약 {len(summaries) - len(failed):,}개 · 실패 {len(failed)}개 · 주제 모음 판정 {len(topics)}개"
)

# %% [markdown]
# ## 5. CSV
# `issues.csv` 가 이슈 한 줄 표다. 사건 · 기사 단위 표도 같이 쓴다.

# %%
paths = ig.write_csvs(OUT_DIR, issues, summaries, articles)
for path in paths.values():
    print(path.resolve())
for issue in issues[:20]:
    s = summaries.get(issue["issue_id"], {})
    verdict = "" if "is_issue" not in s else ("이슈" if s["is_issue"] else "주제 모음")
    print(
        f"{issue['issue_id']} 사건 {issue['event_count']} · 기사 {issue['article_count']} · {verdict} · {s.get('title', '')}"
    )
