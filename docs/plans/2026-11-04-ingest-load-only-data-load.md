# 기사는 운영에 먼저 — 수집 배치 「넣기만」 · 매일 10시 · archive · 15분 모드, AI 결과 덤프 가이드라인 (Jira S15P31A102-156 · 152)

## 무엇을 / 왜

11-03 AI 팀장 제안과 11-04 사용자 정리로 데이터를 넣는 순서가 바뀌었다. **기사는 수집 배치가 운영 DB 에 먼저 넣고, AI 결과(마인드맵 · 사건 · 이슈)는 나중에 덤프로 들어온다.** 그래서 두 가지를 만든다.

1. **기사 넣는 길** — 멈춰 둔 수집 배치(CronJob `news-ingest`)를 AI 팀장 방식으로 돌게 고친다. 매일 10:00 KST 에 NewsData latest `timeframe=36` 으로 받아 발행 시각(KST)이 전날인 기사만 넣는다. B2 기사 적재만 하고 B1 분석 걸기는 하지 않는 「넣기만」 모드를 둔다 — B1 을 걸면 운영 AI 워커가 같은 기사의 마인드맵을 따로 만들어 GMS 를 쓰고, 나중에 올 덤프와 겹친다. 11/3 분은 오늘 손 실행 한 번으로, 10/29 ~ 11/2 분은 같은 스크립트의 archive 로 받는다. 11-16 뒤 15분 모드도 설정만 바꿔 돌 수 있게 한다
2. **덤프 가이드라인** — `infra/server/data-load.md`. AI 결과를 만드는 쪽이 그대로 따를 수 있는 덤프 약속과, 인프라가 받아 넣는 절차 · 검증 · 되돌리기

## 사용자가 정한 것 (2026-11-04 아침)

| 질문 | 답 |
|---|---|
| 11/3 첫 수집 | 오늘 길을 만들고 오후에 손 실행. 대상일 11/3 · `timeframe=48` 로 11-04 안에 돌려 latest 로 받는다(archive 안 씀). 매일 10시 예약은 11-05 부터 |
| 배치 운영 | 인프라가 운영. 분야 · 언론사 조건과 하루 건수는 팀원(AI 팀장)에게 받아 반영. 받기 전에는 지금 질의(`country=kr&language=ko`) |
| 10/29 ~ 11/2 archive | 운영 길 — 배치의 archive 모드로 손 실행 |
| 덤프 적재 티켓 | Jira 152 를 다시 연다. 적재는 사용자(인프라)가 한다. AI 결과를 서버 안에서 만들지 밖에서 만들지는 모르니 가이드라인은 둘 다 되게 |

## 팀장 공지에서 온 사실 (11-03 저녁 공지, 사용자가 11-04 붙여 줌 — 팀장이 공식 문서로 확인했다고 적은 값)

- NewsData 이번 달 20,000 중 7,536 사용 · **12,464 남음**, **11/28 초기화**(넘어가지 않음)
- 10/29 ~ 11/15 기사로 데이터셋을 만들고(10/21 ~ 28 은 이미 있음), 11/16 ~ 11/18(본선이면 11/24)은 실시간 수집
- **하루 7,000건**을 분야(`category`) · 언론사(`domainurl`) 조건으로 고른다 — 조건은 아직 안 정함. Basic 은 요청 하나에 분야 · 언론사 각 5개까지
- 비용은 요청 단위(latest 1 · archive 5), 요청당 최대 50건. 정렬은 기본 최신순, `pubdateasc` 로 오래된 순
- 크레딧 계획(최소 기준): archive 10/29 ~ 11/2 약 3,500 · 11/3 latest 약 140 · 매일 latest 12일 약 1,680 · 실시간 약 600 ~ 1,800, 합계 약 7,120 · 예비 약 5,300
- 원칙: 매일 받고 48시간은 복구 여유로만, 앞 수집과 조금 겹쳐 받고 `article_id` · URL 로 중복 제거, 실패하면 latest 범위 밖 구간만 archive 로. archive 3,500 은 15분 1,800 한도라 두 구간(30분 이상)으로 나눠 받는다
- 매일 기록할 것: 요청 수 · 차감 크레딧 · 받은 건수 · 새 고유 기사 수 · 본문 정상 건수 · 빠진 구간
- 팀장이 묻는 셋: ① 매일 실행 · 실패 대응 담당 ② 수집 조건 ③ 분석 투입 상한과 수집 때 B1 이 자동으로 불리는지 — 이 계획의 답은 ① CronJob 자동 · 실패는 경보(Mattermost)를 받은 인프라, ② 받으면 `INGEST_QUERY` 로 반영, ③ 지금은 「넣기만」이라 B1 이 안 불린다. 상한은 덤프 뒤 B1 을 켤 때(156) 정한다

## 정한 것 (이 계획에서)

### 수집 배치 설정 (env — 모두 `news-ingest.yaml` 에, 잘못되면 시작하지 않고 종료 2)

| env | 값 | 뜻 |
|---|---|---|
| `INGEST_MODE` | `fetch-only` · **`load-only`(새)** · `full` | `load-only` 는 B2 만 부르고 B1 은 부르지 않는다. 배치 키 · backend 주소가 필요하다. 끝 코드는 보낼 기사가 있었는데 B2 로 하나도 못 넣었으면(201 · 200 이 0) 1 |
| `INGEST_SOURCE` (새) | `latest`(비우면 이것) · `archive` | 부를 NewsData 주소. archive 는 요청마다 5크레딧(NewsData 「API credit usage」 문서, 2026-11-04 확인) |
| `INGEST_TIMEFRAME` (새) | `1` ~ `48`(시간) 또는 `1m` ~ `2880m`(분). 비우면 안 보냄. archive 와 함께 쓰면 종료 2 | NewsData `timeframe`. 범위는 NewsData 블로그 · 연결 문서 기준(공식 문서 화면은 스크립트로 그려져 못 읽음 — 리스크) |
| `INGEST_DAYS` (새) | 비움(거르지 않음) · `yesterday` · `2026-11-03` · `2026-10-29..2026-11-02` | 발행 시각(`pubDate` UTC → KST)의 날짜로 거른다. `yesterday` 는 실행 시각(KST) 기준 전날. 범위를 벗어난 기사는 새 까닭 `out_of_range` 로 센다 |
| `INGEST_ARCHIVE_FROM` · `INGEST_ARCHIVE_TO` (새) | archive 만, 둘 다 있어야 함. `YYYY-MM-DD` 또는 `YYYY-MM-DD HH:MM:SS`, 처음 ≤ 끝 | NewsData `from_date` · `to_date` 에 그대로 실린다. KST 하루는 UTC 두 날짜에 걸쳐(KST 10/29 0시 = UTC 10/28 15시) 날짜만 주면 앞뒤를 더 받고 `INGEST_DAYS` 로 거른다. 시각까지 받는지는 문서로 확인 못 해 받기만 한 번(5크레딧)으로 본다 — 받으면 더 받는 몫이 없어진다. 날짜를 나눠 두 번 돌 때 같은 UTC 날짜를 두 번 받지 않게 이 칸으로 자른다 |
| `INGEST_QUERY` (새) | 비우면 `country=kr&language=ko` | NewsData 고르는 조건(분야 · 언론사). 받는 키만 허용: `country` · `language` · `category` · `excludecategory` · `domain` · `excludedomain` · `domainurl` · `excludedomainurl` · `prioritydomain` · `q` · `qInTitle` · `qInMeta` · `removeduplicate` · `sort`. `apikey` · `page` · `timeframe` · `from_date` · `to_date` · `timezone` 와 모르는 키 · 빈 값은 종료 2. 지금 코드 상수 `NEWSDATA_QUERY` 를 없앤다 |
| `INGEST_REQUEST_INTERVAL` (새) | `0` ~ `60` 초, 비우면 0 | NewsData 요청 사이 쉬는 시간. 유료 요금제 한도가 15분에 1,800크레딧이라(팀장 공지 · NewsData 문서 검색 결과) archive 는 3초(15분에 많아야 300번 × 5 = 1,500) |
| `INGEST_MAX_ARTICLES` | 천장 200 → **20,000** | B2 로 보낼 기사 상한 |
| `INGEST_MAX_REQUESTS` | 천장 10 → **500** | NewsData 요청 상한 = 크레딧 상한(latest) |

스크립트 안에서 바뀌는 것

- 중복은 같은 실행 안에서 `link` 와 NewsData `article_id` 둘 다로 거른다(`duplicate`). 실행 사이 중복은 지금처럼 B2 가 URL 로 막는다(200)
- 받은 기사는 거른 자리에서 바로 B2 요청 모양으로 바꿔 두고 원본은 버린다 — 하루 1만 건 안팎을 들고 있어도 메모리가 덜 든다
- NewsData 요청이 중간에 실패하면 지금은 받은 것을 모두 버린다. 받은 데까지는 넣고 종료 1 로 바꾼다 — 크레딧 수백을 쓴 뒤 한 번 실패로 하루치를 잃지 않게. 첫 요청 실패는 지금처럼 바로 종료 1
- **다음 쪽이 남았는데 요청 · 기사 상한에서 멈추면(`stoppedBy` 가 `max_requests` · `max_articles`) 받은 데까지 넣고 종료 2** — `yesterday` 라 다음 날 실행은 그날을 다시 받지 않아, 성공으로 끝내면 빠진 구간이 묻힌다. 종료 2 는 다시 돌지 않고(같은 상한에 또 닿아 크레딧만 씀) Job 이 실패해 경보 ①이 울린다. 받기만(요청 1)은 빼고. 기사 몇 건의 B2 400 · 500 은 지금처럼 종료 0(한 기사 때문에 매일 경보가 울리지 않게 — 11-03 계획)
- 거르는 순서는 `bad_item` → `no_body` → `category` → `timezone` → `bad_date` → `out_of_range` → `duplicate` → `over_limit`. 범위 밖(오늘 0 ~ 10시) 기사가 상한을 먹지 않게 `out_of_range` 가 `over_limit` 보다 먼저다(시험으로 고정)
- `수집 결과` 줄에 `source` · `days`(실제 날짜 범위) · `pubDates`(받은 기사 `pubDate` 최소 · 최대) · `credits`(요청 수 × 1 또는 5) · `stoppedBy`(`end` · `max_requests` · `max_articles` · `newsdata_error` — 다음 쪽이 남았는데 멈췄으면 빠진 구간이 있다)를 더한다. 팀장이 매일 적을 항목(요청 · 크레딧 · 받은 수 · 새 기사 = `b2.created` · 본문 정상 = 받은 수 − `no_body` · 빠진 구간)이 이 한 줄에서 나온다. 수집 시각은 `article.created_at`(B2 가 넣은 때)이다
- 시험이 「지금」과 「쉬기」를 넣을 수 있게 `main(environ, send, out, now=None, sleep=None)` — 불러올 때 env 를 읽지 않는 지금 규칙 그대로

### CronJob `news-ingest` (매일)

- `suspend: false` · `schedule: "0 10 * * *"`(`Asia/Seoul`) · `INGEST_MODE=load-only` · `INGEST_SOURCE=latest` · `INGEST_TIMEFRAME=36` · `INGEST_DAYS=yesterday` · `INGEST_QUERY=country=kr&language=ko`(조건을 받으면 MR 로 바꿈)
- 상한 — `INGEST_MAX_REQUESTS=250` · `INGEST_MAX_ARTICLES=12000`. 어림: 하루 7,000건(팀장)이면 36시간 창은 약 1만 500건 · 요청 약 210. 10시에 받으면 그날 0 ~ 10시 기사가 먼저 와서 버려진다(최신부터 오고 latest 에 끝 시각 조건이 없다) — 팀장 계획의 하루 140 보다 하루 70 안팎 더 들어 12일이면 약 840, 예비 5,300 안이다. 상한에 닿으면 `stoppedBy: max_requests` 로 보이고, 첫 실행을 보고 다시 정한다. `sort=pubdateasc` 로 받으며 범위를 지나면 멈추는 것은 정렬이 발행 시각 그대로인지 첫 실행에서 본 뒤의 일로 둔다
- `activeDeadlineSeconds` 900 → 3600(손 실행 archive 한 구간 — 요청 약 420 × (쉬기 3초 + 응답) — 까지 들어가게), 경보 ① 2시간 → 3시간(시작 마감 1시간 + 실행 상한 1시간보다 길게), 메모리 상한 128Mi → 512Mi · 요청 32Mi → 64Mi
- `startingDeadlineSeconds: 3600` 그대로라 **10:00 ~ 11:00 에 머지되면 그 자리에서 한 번 돈다** — 머지는 11시 뒤에. 그때 돌아도 대상은 11/3 이라 손 실행과 같은 일이다(같은 URL 은 B2 200)
- 손 실행 둘 — 11/3: `INGEST_DAYS=2026-11-03` · `INGEST_TIMEFRAME` = 지금 시각 − 11/3 0시 + 1시간(최대 48, 14시면 39). archive: `INGEST_SOURCE=archive` · `INGEST_DAYS=2026-10-29..2026-11-02` · 쉬기 3초 · 두 구간 `INGEST_ARCHIVE_FROM/TO` = `2026-10-28..2026-10-30` 과 `2026-10-31..2026-11-02`(UTC 날짜, 겹치지 않음). 날짜만이면 UTC 6일치라 약 4,200크레딧(팀장 어림 3,500 + UTC 10/28 몫), 시각을 받으면 약 3,500. archive 는 조건을 받은 뒤 사용자가 돌린다
- 손 실행은 템플릿 CronJob 을 늘리지 않고 이 CronJob 에서 env · 다시 시도만 바꿔 띄운다 — `kubectl -n app create job --from=cronjob/news-ingest <이름> --dry-run=client -o yaml | kubectl set env --local -f - <바꿀 env> -o yaml | kubectl patch --local -f - --type merge -p '{"spec":{"backoffLimit":0}}' -o yaml | kubectl create -f -`. 손 실행은 매일 설정(상한 250 · timeframe 36 · 다시 시도 1)을 물려받으니 **상한 · timeframe 을 꼭 같이 준다**: 11/3 은 `INGEST_MAX_REQUESTS=300`, archive 는 `INGEST_MAX_REQUESTS=500` · `INGEST_MAX_ARTICLES=20000` · `INGEST_TIMEFRAME-`(지움 — 남으면 archive 와 함께라 종료 2). 다시 시도 0 — archive 가 중간에 실패해 처음부터 다시 돌면 한 구간 최대 약 2,100크레딧을 더 쓴다. `INGEST_QUERY` 값은 `&` 때문에 따옴표로 감싼다. 마지막은 `apply` 가 아니라 `create`(같은 이름이면 실패하고 끝). 2026-11-04 로컬(kubectl 1.36.1)에서 kustomize 결과 Job 으로 `set env --local`(값 바꿈 · 덧붙임 · `NAME-` 지움)과 `patch --local`(`backoffLimit: 0`)을 이어 붙여 확인했다. 명령은 `ingest.md` 에 적고 사용자가 EC2 에서 돌린다
- 15분 모드(11-16 뒤, Jira 156 MR): `schedule: "*/15 * * * *"` · `INGEST_TIMEFRAME=30m` · `INGEST_DAYS` 비움 · `INGEST_MODE=full` · 시간 상한 14분 안쪽 · 경보 ② 기준. 이번에는 설정 · 시험 · 바꾸는 법(`ingest.md`)까지만

### 경보 `NewlearnIngestMissing`

- ② 「예약이 13시간 넘게 없음」 → 25시간(하루 한 번). ① 「마지막 예약 뒤 2시간이 지나도 성공 없음」 → 3시간(실행 상한을 1시간으로 늘려서). 경보 시험의 13시간 둘을 25시간으로, 2시간 셋을 3시간으로
- 첫 예약(11-05 10:00) 전에는 예약 시각 줄이 없어 울리지 않는다 — 지금 시험 「손 실행 성공 뒤 첫 예약 전」이 지킨다

### 덤프 가이드라인 — 기사는 URL 로 맞추고, 사건 · 이슈 · 작업 번호는 덤프 그대로

조사로 확인한 것(파일 · 줄은 explorer 조수 보고, 마이그레이션 V10)

- B2 는 `published_at` 을 받은 시각 그대로 저장하고(`ArticleIngestService.java:91`, 칸은 `timestamptz`), `category_code` 는 `category_mapping` 으로 고르고(115-145, 행이 없으면 비움), `released_at` 은 비운다. 처음 보는 언론사는 `press.code` = `source_id` 로 만든다(99-107)
- EXTRACT 결과가 `article` 에서 바꾸는 칸은 `released_at` 하나(`AnalysisJobService.java:89-93`). 요약 · 시점은 `article_mindmap`
- `analysis_job.candidates`(jsonb)에 사건 · 이슈 번호가 들어간다(`V2:117`, `IssueDispatcher.java:65-67`) — 번호를 바꾸면 JSON 안도 바꿔야 한다
- 1분 스케줄러는 덤프 행에 네 가지로 반응한다 — 못 넣은 `QUEUED` 다시 넣기, `retry_at` 지난 `FAILED` 다시 걸기, 판정 걸 기사 고르기(`AnalysisJobRepository.java:88-101`), ISSUE 고르기. ai 워커는 지금 EXTRACT 만 읽어(`ai/app/worker.py:26-28`) 판정 · ISSUE 작업이 큐에 들어가면 영영 `QUEUED` 로 남아 판정 줄 전체를 막는다(79-84)
- 10/21 ~ 28 기반 기사(약 1,000건, `SSOT.md` 2절)는 운영에 없다. 수집 배치도 받지 않는다(latest 는 48시간까지, 다시 archive 로 받으면 크레딧이 크다)

그래서 이렇게 정한다

| 무엇 | 정한 것 | 까닭 |
|---|---|---|
| 기사 맞추는 열쇠 | **URL**(`article.url` 고유 키). 덤프의 기사 번호는 아무래도 좋다. 운영에 같은 URL 이 있으면 그 운영 번호로 바꿔 넣고, 없으면(10/21 ~ 28 기반) 기사 행째 새로 넣는다 | 만드는 쪽이 운영 번호를 받아 자기 DB 를 다시 매기지 않아도 된다. 운영에 없는 기반 기사도 같은 규칙으로 들어간다 |
| 사건 · 이슈 · 작업 번호 | 덤프 번호 그대로. 적재 전에 운영의 분석 표(`article_mindmap` · `article_embedding` · `analysis_job` · `event` · `article_event` · `issue` · `issue_category`)가 비어 있어야 한다 — 시험 기사 1 ~ 3 과 딸린 행은 적재 트랜잭션 처음에 지운다(11-02 계획 A 의 AI 팀장 확인). 넣은 뒤 세 시퀀스를 최댓값 이상으로 | `candidates` JSON 안 번호를 안 바꿔도 된다. 「넣기만」이라 B1 이 없으면 운영에 분석 행이 생기지 않는다 |
| 운영 기사 목록 | 인프라가 EC2 에서 JSONL 로 내보내 준다 — 한 줄에 B2 요청 모양 + 운영 번호(`psql -At` 로 `json_build_object`, `COPY` 는 역슬래시를 두 번 써서 안 씀). 만드는 쪽은 자기 로컬 backend 의 B2 로 넣으면 운영과 같은 행이 된다 | NewsData 를 두 번 받지 않고, 시각 · 언론사 규칙이 B2 코드 한 곳에서 같다 |
| 넣는 법 | 덤프를 SQL 로 풀 때 **표 데이터만** 고른다 — `pg_restore -l` 목록에서 `TABLE DATA` 줄만 남겨 `-L` 로(덤프 쪽 시퀀스 값을 박는 `setval` 줄이 따라오면 운영 `article_id_seq` 가 내려가 다음 B2 가 기본 키에서 500). `COPY public.` → `COPY load.` 로 바꿔 임시 스키마(`LIKE` 로 만든 표 — 외래 키 없음)에 담고, 검사 → 언론사 · 언론사 대응(`ON CONFLICT DO NOTHING`) → 기사 → 이슈 → 사건 → 나머지 → 이슈 분야 다시 계산 → 시퀀스까지 **한 psql 트랜잭션**(`psql -1 -v ON_ERROR_STOP=1`). 풀린 SQL 앞머리가 `search_path` 를 비우니 뒤 SQL 은 스키마 이름을 모두 붙인다. 사건의 자기 참조 외래 키는 한 `INSERT … SELECT` 안이라 문장 끝에 검사돼 `--disable-triggers`(슈퍼유저)가 필요 없다 | 11-02 계획 A 의 「비우고 덤프 그대로」는 기사가 운영에 먼저 있으면 쓸 수 없다(URL · 번호 충돌) |
| 이슈 분야(`issue_category`) | 덤프 값을 넣지 않고 적재 끝에 backend 와 같은 식(`IssueCategoryRepository.java:17-27` — 이슈 기사들의 `category_code` 중 가장 많은 것)으로 다시 계산 | 기사 분야를 운영 값 · 덤프 값 중 고르는 규칙과 어긋나지 않게 |
| 운영 기사에서 바꾸는 칸 | 맞춘 기사의 `released_at` 과, 덤프 값이 있으면 `category_code`. 제목 · 본문 · 발행 시각은 안 바꾼다 — 대신 발행 시각이 다르면 적재를 멈춘다(UTC 규칙을 어긴 덤프를 잡는다) | `category_mapping` 이 아직 없어(`SSOT.md` 8절) 운영 B2 기사의 카테고리가 비어 있을 수 있다 |
| 되돌리기 1순위 | 적재 트랜잭션이 `load_undo` 스키마에 「새로 넣은 기사 번호」 · 「맞춘 기사의 옛 `released_at` · `category_code`」를 남긴다. 되돌릴 때 분석 표 일곱을 비우고 그 표대로 기사를 되돌린다. 확인이 끝나면 `load_undo` 를 지운다 | 백업 되살리기는 그 뒤 들어온 수집 기사 · 가입을 잃는다 |
| 적재 SQL 자체 | 이번에는 절차 · 검사 쿼리까지. 옮기는 SQL 은 견본 덤프로 R1(관리자 PC 일회용 DB)에서 만들어 시험한다 — Jira 152 | 견본 없이 쓴 SQL 은 증거가 없다 |
| 서버 안에서 만들 때 | (가) 운영 워커로 만들면 덤프가 없다 — 「넣기만」을 풀고 B1. (나) 같은 PostgreSQL 의 다른 DB(예: `newlearn_build`)에서 만들면 덤프 약속은 같고 파일이 서버 밖으로 안 나간다 | 어느 쪽인지 모른다(사용자) |
| 적재 전 손 B1 금지 | 덤프가 들어갈 때까지 운영에서 B1 을 손으로도 걸지 않는다 — 걸면 분석 표가 비지 않아 적재 트랜잭션이 통째로 되돌아간다. `infra/server/ai-worker.md` 「기사에 분석 걸기」와 `data-load.md` 에 적는다 | 지금 `ai-worker.md:56` 은 「배치가 멈춘 동안 B1 은 사람이 건다」 |
| B1 을 켜는 때 | 덤프가 들어가고 확인이 끝난 뒤(Jira 156). 덤프에 없던 운영 기사(공개 전 · 작업 없음)는 그때 B1 을 걸지 고른다 — GMS 가 들고 AI 팀에 미리 알리는 약속(`infra/server/ai-worker.md`) | 덤프와 겹치지 않게 |

## 바꿀 파일

MR 1 — 수집 배치 (Jira 156, 오늘 머지가 목표)

- `infra/k8s/services/ingest/news_ingest.py` — 위 「수집 배치 설정」 · 「스크립트 안에서 바뀌는 것」. 머리 설명 · 모드 줄
- `infra/ci/test_news_ingest.py` — 실패하는 시험 먼저(아래 검증 1)
- `infra/k8s/services/ingest/news-ingest.yaml` — 켜기 · 매일 10시 · env · 상한 · 시간 · 메모리, 머리 주석
- `infra/k8s/alerts/rules.yaml` · `infra/ci/alert_rules_test.yaml` — ② 25시간과 주석
- `infra/server/ingest.md` — 모드 셋 · 설정 표 · 매일 운영 · 손 실행(11/3 · archive) 명령 · 15분 모드로 바꾸기 · B1 켜기 · 크레딧 어림 · 그림
- `docs/api-internal.md` 2절 — 「하루 두 번(00 · 12시)」, 「배치는 201 · 200 모두 그 id 로 B1」 → 넣기만 모드 예외
- `SSOT.md` — 1절 표 · 2절 3번 · 5절 NewsData 줄(「하루 두 번 00 · 12시」), 6절 AI 워커 · 수집 배치 줄, 8절 「뉴스 수집 켜기」 줄(매일 넣기만은 켬, B1 · 15분 · 조건은 남음). 9절에 뒤집은 것 한 줄(00 · 12시 두 번 + 바로 B1 → 매일 10시 넣기만, 덤프 뒤 B1)
- `docs/plans/2026-11-04-ingest-load-only-data-load.md` — 이 계획(이름 바꿈)
- 「하루 두 번(00 · 12시)」이 남은 팀 문서 — `docs/api-internal.md` 23줄 그림, `docs/api.md` 26줄 그림, `docs/data-model.md` 266줄, `docs/glossary.md` 69줄(grep 으로 찾음)
- 「배치가 B1 을 부른다」 · 「B1 은 사람이 건다」가 남은 곳 — `infra/server/ai-worker.md` 56줄(넣기만 동안 손 B1 금지로), `docs/api.md` 283줄, `docs/specs/F01-article-ingest-api.md` 5줄(넣기만 예외 한 줄), `SSOT.md` 2절 44 · 49줄(「켜기 전에 기반 먼저」 · 「기반이 확정되면 수집 배치로」 → 기사는 먼저 넣기만, 분석은 덤프 뒤)
- `docs/mvp-overview.md` 36 · 173 · 290줄도 같은 문장이지만 PM 확인 문서라 이번에 안 고친다 — 사용자에게 따로 알린다

MR 2 — 덤프 가이드라인 (Jira 152, MR 1 다음)

- `infra/server/data-load.md`(새) — 흐름 그림, 누가 무엇을, 운영 기사 목록 받기, 덤프 약속(표 · 형식 · 판 · 행 상태 · 임베딩 · 언론사 · 시각 · URL · 넘기는 법 · 견본), 서버 안에서 만들 때, 받는 쪽 검사 쿼리, 적재 절차(배치 멈춤 · 백업 · 한 트랜잭션 · 큐 정리 · 확인), 되돌리기, B1 켜기
- `infra/server/README.md` — 이미 500줄(문서 상한)이라 줄을 늘리지 않고 272줄(수집 배치 안내) 끝에 「AI 결과 덤프 적재는 `infra/server/data-load.md`」를 붙인다. `data-load.md` · `ingest.md` 도 500줄 안쪽
- `docs/plans/2026-11-02-data-1115-1116-infra-prep.md` A 절 머리 — 「2026-11-04 기사는 운영에 먼저로 바뀜, 약속은 `infra/server/data-load.md`」 한 줄
- `SSOT.md` 8절 — 덤프 적재 줄(있으면 고치고, 없으면 152 를 가리키는 줄)

## 작업 순서

- [x] 승인 뒤 작업 폴더 `C:/tmp/wt-156`(origin/infra 에서 `feat/infra/S15P31A102-156-ingest-load-only`), 계획 파일 이름 바꿔 커밋 — `git log -1`(5893bde)
- [x] 시험 먼저: 넣기만 · timeframe · 날짜 거르기 · archive · 쉬기 · `article_id` 중복 · 질의 검사 · 천장 · 중간 실패 — 지금 코드에서 빨간 것 확인(시험 83 중 실패 41 · 오류 27)
- [x] 스크립트 고치기 → 시험 초록, 고친 것을 하나씩 되돌려 해당 시험이 단언에서 빨개지는지 — 13가지 모두 빨강(처음엔 「상한을 범위 밖보다 먼저」가 초록이라 시험 기사 순서를 고침), 7d027bd
- [x] CronJob · 경보(시험 25시간 먼저 빨강 → 규칙) · `kubectl kustomize` · `set env --local` 시험 — 옛 규칙에서 실패 넷, 손 실행 두 벌 env 를 스크립트 설정 검사에 넣어 통과, 7276d02
- [x] 문서(`ingest.md` · `api-internal.md` · `SSOT.md`) → infra 게이트 → reviewer 조수 MR 리뷰 → MR → infra → dev — !608(infra `e651eec4`, 08:46) → !609(dev `f7d8f673`, 08:50). **사용자 결정(08:45): 11시 뒤가 아니라 10시 전에 반영해 오늘 10:00 예약이 11/3 을 넣게 함** — 손 실행 넣기만 대신 받기만 한 번만. backend · ai 맞추기는 MR 2 뒤에 한 번
- [ ] 사이트 확인(Argo CD `ingest` Synced, CronJob `suspend=false` · 다음 예약 11-05 10:00) → 사용자 손 실행: 11/3 받기만 1번 → 11/3 넣기만 → 로그 `수집 결과`
- [ ] MR 2 가이드라인 → reviewer 조수 → MR → infra → dev → 맞추기, Jira 152 다시 열고 설명 고침
- [ ] Jira 156 댓글(넣기만 켬 · 남은 것), `/feature-done`, zoo_docs 기록

## 안 바꿀 것

- backend · ai 코드, 마이그레이션 — B2 · B1 · 스케줄러는 그대로
- B1 켜기 · 15분 모드 켜기 · `full` 모드 동작 — 156 남은 몫(덤프 뒤, 11-16 뒤)
- archive 실제 실행 시각 · 고르는 조건 값 — 조건을 받은 뒤 사용자가 정한다(크레딧)
- 적재 SQL 파일 · R1 · 실제 적재 — Jira 152
- 운영 시험 기사 1 ~ 3 을 이번에 지우기 — 적재 트랜잭션에서
- 배포 알림 · Argo CD 앱 정의 · 들어오는 길 정책 · 봉인 키
- `docs/mvp-overview.md` · PRD

## 리스크

- **크레딧** — 남은 12,464(11/28 초기화). 이 계획대로면 매일 약 210(상한 250) · 11/3 손 실행 약 200 · archive 약 4,200(날짜만일 때)로 팀장 계획(7,120)보다 약 1,500 더 들 수 있고 예비 5,300 안이다. 조건 없이(kr · ko) 하루가 7,000건을 크게 넘으면 상한 250 에서 멈추고 `stoppedBy` 로 보인다. 막는 것: 요청 상한이 하루 크레딧 상한, archive 는 조건을 받은 뒤 사용자가 구간마다 손으로. 조건은 11-05 10시 전에 받기를 권한다. 매일 사용량 비교는 팀장이 맡는다(공지)
- **운영 DB · 백업이 커짐** — 조건 없이 하루 약 1만 건이면 본문 기준 하루 수십 MB, 11월 말까지 1GB 안팎(어림). DB PVC 20Gi, 매일 백업은 관리 서버 7일 보관. 첫 실행 뒤 DB 크기 · 백업 파일 크기를 잰다
- **NewsData 동작 미확인** — `timeframe` 범위 · archive `from_date` 가 UTC 날짜인지 · 끝날 포함인지 · 10시에 그날 기사가 몇 쪽인지. 막는 것: 손 실행 전에 받기만(요청 1)으로 `pubDates` · `totalResults` 를 보고, archive 도 받기만(5크레딧) 먼저
- **10시 실행이 길어짐** — 요청 210 + B2 7천 건 안팎. 실행 상한(3600초)은 Job 전체에 걸려 넘기면 다시 돌지 않고 실패로 끝난다(앞서 찍은 줄은 `-u` 라 남음). 크레딧이 두 배가 되는 길은 종료 1 과 메모리 초과(다시 시도 1). 첫 실행 시간을 재서 상한을 다시 본다
- **10:00 ~ 11:00 머지** — 그 자리에서 한 번 돈다. 11시 뒤에 머지한다
- **넣기만 기사가 화면에 안 나옴** — 의도다(`released_at` 빔). 팀원이 「기사가 안 보인다」고 볼 수 있어 Jira 156 댓글과 `ingest.md` 에 적는다
- **덤프 약속을 어김** — `QUEUED` 행 · 판정 걸 기사 · 다른 임베딩 모델 · 9시간 어긋난 발행 시각. 막는 것: 받는 쪽 검사 쿼리를 적재 트랜잭션 안에서 돌려 하나라도 걸리면 통째로 되돌림
- **적재 중 수집이 같은 URL 을 넣음** — 적재 동안 CronJob 을 멈추고 10시를 피한다(절차에 적음)
- **`kubectl set env --local` 이 안 맞음** — 로컬에서 kustomize 결과 Job 으로 시험. 안 되면 손 실행용 템플릿 CronJob 으로 바꾸고 다시 승인받는다

## 어떻게 검증하나

1. **스크립트 시험**(`infra_TEST`) — 넣기만: B2 만 부르고 B1 0번, 결과 줄에 `b1` 없음, 하나도 못 넣으면 종료 1, 배치 키 없으면 종료 2. timeframe: `36` · `30m` 이 주소에 실림, `0` · `49` · `2881m` · `36h` · archive 와 함께면 종료 2. 날짜: 「지금」 2026-11-04 10:00 KST 에서 `yesterday` = 11-03, `pubDate` `2026-11-02 15:00:00`(KST 11-03 00:00) 들어감 · `14:59:59` 빠짐(`out_of_range`), 0시 30분 실행도 11-03, 범위 · 거꾸로 범위 · 틀린 날짜. archive: 주소 `/archive` · `from_date` · `to_date` 가 설정 그대로 · timeframe 없음, 처음 · 끝이 없거나 거꾸로거나 모양이 틀리면 종료 2, latest 에 archive 칸을 주면 종료 2, 쉬기가 요청 사이에만. 결과 줄의 `credits` = 요청 × 5, `stoppedBy` 넷. 같은 `article_id` 다른 링크는 `duplicate`. 질의: 비우면 kr · ko, 조건이 실림, 막은 키 · 모르는 키 · 빈 값은 종료 2. 천장 20,000 · 500 은 받고 하나 넘으면 종료 2. 둘째 요청 실패면 첫 쪽 기사는 B2 로 가고 종료 1. 다음 쪽이 남았는데 요청 · 기사 상한이면 받은 것은 B2 로 가고 종료 2(받기만은 0). 범위 밖 기사가 기사 상한을 먹지 않음(`out_of_range` 가 먼저). 고친 것을 하나씩 되돌려 단언에서 빨개짐
2. **경보 시험**(`alert_rules.sh test`) — 25시간 둘 · 3시간 셋을 먼저 바꿔 지금 규칙에서 빨강 → 규칙 고쳐 초록. `alert_rules.sh check`
3. **매니페스트** — `kubectl kustomize infra/k8s/services/ingest` 에 env · 상한 · `suspend: false` · schedule. 그 CronJob 의 jobTemplate 으로 만든 Job YAML 에 `ingest.md` 의 손 실행 명령(11/3 · archive 두 벌)을 그대로 이어 붙여(`create` 앞까지) env · 상한 · `INGEST_TIMEFRAME` 지움 · `backoffLimit: 0` 이 들어가는지
4. **반영 뒤 사이트**(Claude 읽기) — Argo CD 앱 열둘 Synced · Healthy, `kubectl -n app get cronjob news-ingest` 에 SUSPEND False · 다음 예약 11-05 10:00, 사이트 health 200
5. **손 실행**(사용자, 파일 카드) — 11/3 받기만 1번: `pubDates` 가 48시간 창, `out_of_range` 가 그날 밖 기사 수. 11/3 넣기만: `수집 결과` 의 `b2.created` + `existing` = `kept`, `stoppedBy: end`, `pubDates` 최소 ≤ 11/3 0시 KST(= `2026-11-02 15:00:00`), 종료 0, 걸린 시간. 운영 DB 에서 11/3 기사 수(공개 0 그대로) — 읽기는 사용자 터미널 또는 허용되면 Claude
6. **11-05 10:00 첫 예약**(다음 세션) — Job 성공, 경보 0, 걸린 시간 · 크레딧
7. **가이드라인** — reviewer 조수가 덤프 약속을 코드(V2 ~ V10 · 스케줄러 · B2)와 대조. 팀원에게 건네기 전에 한 번 더

## 되돌리는 법

- MR 1 — `news-ingest.yaml` 의 `suspend: true` MR(이전 동작). 급하면 `ingest.md` 「급히 멈추기」(루트 → `ingest` 자동 동기화 끄고 patch). 스크립트는 MR 되돌리기
- 🔴 이미 넣은 기사는 남는다(공개 전이라 화면에는 없음). 지우려면 백업 뒤 SQL. 이미 쓴 NewsData 크레딧은 돌아오지 않는다
- MR 2 — 문서라 MR 되돌리기. Jira 152 는 다시 닫으면 된다

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-04, 「고쳐야 함」 4 · 선택 반영)

| 무엇 | 전 | 지금 | 근거 |
|---|---|---|---|
| 덤프 풀기 | `pg_restore --data-only -f -` 전체 | `TABLE DATA` 만 `-L` 로, 스키마 이름을 모두 붙임 | 풀린 SQL 의 `setval` 이 운영 `article_id_seq` 를 내림 → B2 500. 앞머리가 `search_path` 를 비움 |
| 손 실행 | env 만 바꿈 | 상한 · `INGEST_TIMEFRAME-` 을 꼭 같이, `backoffLimit: 0`(`patch --local`), `create -f -`, `INGEST_QUERY` 따옴표 | 매일 상한 250 · timeframe 36 · 다시 시도 1 을 물려받음 — archive 한 구간 약 420요청이 잘리고, 실패하면 약 2,100크레딧을 다시 씀 |
| 상한에 닿음 | 종료 0(결과 줄에만) | 다음 쪽이 남았으면 받은 데까지 넣고 종료 2 → 경보 ① | `yesterday` 라 다음 날이 다시 안 받아 빠진 구간이 묻힘 — 팀장에게 한 답 ①(실패는 경보)과 어긋났음 |
| 바꿀 파일 | — | `ai-worker.md:56`(적재 전 손 B1 금지), `SSOT.md` 2절 44 · 49줄, `docs/api.md:283`, F01 스펙 5줄 | 넣기만에서 틀린 문장 · 적재 전제(분석 표 비어 있음)를 지키는 약속이 없었음 |
| 선택 반영 | — | 이슈 분야는 적재 끝에 다시 계산, 언론사 단계를 「옮기기」에 적음, 거르는 순서 시험(`out_of_range` 먼저), 검증 5 에 `stoppedBy` · `pubDates`, 실행 상한 넘김은 다시 시도 안 함으로 바로잡음 | |

리뷰가 「괜찮음」으로 본 것: 사건 자기 참조 외래 키(문장 끝 검사, `load` 표에 외래 키 없음), `candidates` 에 기사 번호 없음(`CandidateEventFinder.java:27`, `IssueCandidateFinder.java:36-49`), 시퀀스 셋, 스케줄러 검사 대상, 경보 ① 3시간 · ② 25시간 · 11시 뒤 머지, 메모리 512Mi. 리뷰가 확인하지 못한 것: NewsData 동작(웹 대조 안 함 — 받기만으로 봄), `pg_restore` 실제 출력(R1 에서), `article_mindmap.content` 안 기사 번호(가이드라인 쓸 때 `MindmapContent` 를 연다)

## MR 전 리뷰에서 바뀐 것 (reviewer 조수 2026-11-04, 「고쳐야 함」 1 · 선택 반영)

| 무엇 | 전 | 지금 | 근거 |
|---|---|---|---|
| archive 손 실행 | UTC 3일 두 구간, 실행 상한은 매일 값(1시간)을 물려받음 | UTC 이틀씩 세 구간(`10-28 ~ 10-29` · `10-30 ~ 10-31` · `11-01 ~ 11-02`), 명령의 `patch` 에 `activeDeadlineSeconds: 7200`, 물려받는 목록에 기사 상한 · 실행 상한 | 받기가 다 끝난 뒤 B2 를 해 범위 안 1만 7천 ~ 1만 8천 건 B2 시간이 더해짐 — 1시간을 넘기면 결과 줄 없이 죽고 다시 돌지 않아 약 2,100크레딧이 사라짐. 세 구간이면 한 구간 요청 약 280 · 기사 약 1만 2천으로 상한에 여유 |
| 둘째 쪽 뒤 NewsData 401 · 403 | 받은 쪽도 버리고 종료 2 | 받은 데까지 넣고 종료 2(`stoppedBy: newsdata_auth`) | 「받은 데까지는 넣는다」 원칙과 어긋났음(가짜 응답으로 재현) |
| `INGEST_ARCHIVE_TO` 날짜만 | 0시로 견줘 같은 날 낮부터 그날까지를 거절 | 그날 끝까지로 견줌 | 가짜 설정으로 재현 |
| `ingest.md` | — | 팀장 기록의 「전날 기사 수」는 `kept`(`fetched` 는 36시간 창 전체), 10시를 피하는 까닭을 확인 안 한 만큼만, `pubDates.min` 이 범위 첫날 0시보다 이르면 빠진 것 없음, 첫 구간 받기만에서 `to_date` 가 그날 끝까지 오는지, 설정 표에 `BACKEND_URL` | |

고친 둘(401 · 403 · 날짜만 끝)을 되돌리면 새 시험이 단언에서 실패한다(변이 15가지 모두 빨강). 손 실행 archive 명령은 kustomize 결과 Job 에 이어 붙여 `activeDeadlineSeconds: 7200` · `backoffLimit: 0` 을 확인했다.

## 가이드라인 리뷰에서 바뀐 것 (reviewer 조수 2026-11-04, 「고쳐야 함」 4 · 선택 반영 — `infra/server/data-load.md`)

| 무엇 | 전 | 지금 | 근거 |
|---|---|---|---|
| 되돌리기 | 분석 표 비우기 · 새 기사 지우기 · 옛 값 | B1 을 켠 뒤라면 적재 시각 뒤 공개된 기사의 `released_at` 도 비우고 큐 메시지 정리. 되돌릴 수 없는 것에 시험 기사 1 ~ 3, 남는 것에 언론사 행 | B1 뒤 공개된 기사는 목록에 남고 마인드맵 404, B1 다시 걸면 409 |
| pg_dump | `docker compose exec -T … > 파일` | 컨테이너 안 `-f /tmp/…` 뒤 `docker compose cp`, `.env` 의 `$POSTGRES_USER` · `$POSTGRES_DB` | Windows PowerShell 의 `>` 가 바이너리를 망가뜨릴 수 있음 |
| 판 검사 | `COPY` 가 실패하면 판이 다름 | 목록표 Flyway 판 = 운영 판, `COPY` 칸 목록 = `information_schema.columns` | 칸이 적은 낡은 덤프는 `COPY` 가 통과하고 빠진 칸이 조용히 빔 |
| 공개 기사 | 규칙 없음 | `released_at` 이 찬 기사는 마인드맵 · EXTRACT `SUCCEEDED` 가 꼭 있음(규칙 · 검사) | 없으면 A9 404 |
| 선택 반영 | — | 로컬 B2 · B1 주소와 키, 만드는 쪽 스스로 검사, `press_mapping` 대응 확인, 맞춘 기사 제목 · 본문 같음, match_event · issue 그룹도 넘기기, 서버 안이면 Redis 도 따로, `load_undo` 는 스키마, 시험 기사 지우기 전 북마크 행 수, 사건에 묶인 기사도 공개, 스케줄러 조건은 코드로, `psql -X` | |

## 반영 뒤 바뀐 것 (2026-11-04 오전)

- 09:14 받기만 한 번에 조건 없이(kr · ko) 34시간 창 `totalResults` 25,961 — 하루 약 1만 8천 건(팀장 어림 7,000). 그대로면 요청 상한 250 에서 전날이 잘려 10:00 전에 다시 멈춤(!614 → !615, 사용자 결정)
- 11/3 과 10/29 ~ 11/2(archive)는 팀원이 따로 받아 저장소에 두기로 함(사용자 전달) — 인프라는 11/3 손 실행 · archive 를 하지 않는다. 운영 DB 의 기사는 11/4 분부터, 그 전 기사는 덤프와 함께 새로 들어온다(`data-load.md` 2절)
- 고르는 조건을 받아 `INGEST_QUERY` 와 `suspend: false` 를 한 MR 로 — 11-04 11시 뒤 · 11-05 10시 전에 머지해 11-05 10:00 첫 실행(11/4 분)
- 팀장 답(10:02)과 사용자 결정: 운영 기사 목록 JSONL 은 **매일** 넘긴다, 데이터셋은 **11/14 기사까지 · 11/15 오전 전달**, 매일 `수집 결과` 줄과 종료 코드를 공유(팀장이 크레딧 대조). 그래서 내보내기 SQL 을 `infra/server/export-articles.sql` 로 두고 서버에서 돌려 scp 로 받게 함(PowerShell 의 `<` · `>` 를 피함) — 일회용 DB 에서 경계 · 공개 기사 제외 · JSON 이스케이프 확인. 매일 공유 명령은 `ingest.md` 「매일 실행」(운영에서 받기만 Job 이름으로 시험)
- 같은 날 10:12 팀장 · 사용자: **최종 덤프는 11/13(금)**(11/15 일요일을 피해 당김) — 덤프 기사는 늦어도 11/12 분까지, 마감 뒤 기사(대략 11/13 ~ 11/15)는 적재 · 확인 뒤 운영 B1 로 분석(사용자 결정). 견본은 11/9 전후, 늦어도 11/10(사용자 — 11/6 은 너무 이름)
