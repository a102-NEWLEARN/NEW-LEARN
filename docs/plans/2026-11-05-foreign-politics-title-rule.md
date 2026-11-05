# 해외 정치 기사를 제목 규칙으로 국제 분야에 — B2 기사 적재의 대표 분야 고르기 · 이미 들어온 기사 다시 계산 (2026-11-05)

Jira S15P31A102-171(BE 공동, 170 과 연결). 2026-11-05 사용자 승인.

## 무엇을 / 왜

운영 화면의 정치 탭 맨 위가 미국 대통령의 이란 공습 기사였다. 사용자 요청: 「정치부분 한국 정치만으로 거를 수 있나? 외국 정치부분은 국제로」. 팀 문서(`docs/mvp-overview.md` 2-1절)도 해외 정치 · 외교를 국제로 둔다.

NewsData 값으로는 나눌 수 없다. `politics` 와 `world` 가 같이 붙은 기사는 먼저 넣은 79,335건 중 0건이고, 받아 본 50건의 `country` 는 모두 `south korea`, `ai_region` 은 기업 요금제 전용이다. 그래서 대표 분야가 정치로 고른 기사의 **제목 낱말**로 국제에 옮긴다. B2 기사 적재(`POST /internal/v1/articles`)에 규칙을 넣고, 이미 들어온 기사는 새 마이그레이션으로 고친다.

## 정한 것

**규칙 — 아래 셋을 모두 만족하면 정치 → 국제.** 아래 표는 승인 당시 목록이다. 낱말의 정본은 코드(`ForeignPoliticsTitleRule.java`)이고 팀 문서에는 옮기지 않는다.

| 조건 | 낱말 |
| --- | --- |
| 외국 나라 · 인물 · 기구가 있다 | 트럼프 · 바이든 · 오바마 · 백악관 · 중간선거 · 공화당 · 루비오 · 헤그세스 · 시진핑 · 리창 · 왕후닝 · 푸틴 · 젤렌스키 · 네타냐후 · 하마스 · 헤즈볼라 · 후티 · 다카이치 · 이시바 · 마크롱 · 메르츠 · 이란 · 이스라엘 · 우크라 · 러시아 · 가자지구 · 유엔 · 나토 · NATO · 미국 · 美 · 중국 · 中 · 일본 · 日 · 대만 · 프랑스 · 독일 · 영국 · 유럽 · EU · 쿼드 · 호르무즈 · 시리아 · 사우디 · 튀르키예 · 베네수엘라 |
| 국내 정치 주체가 없다 | 국민의힘 · 국힘 · 與 · 野 · 여당 · 야당 · 국회 · 의원 · 정청래 · 장동혁 · 진성준 · 지방선거 · 도지사 · 시장 · 군수 · 구청장 · 시의회 · 도의회 · 교육감 · 교육청 · 대구 · 부산 · 광주 · 전남 · 전북 · 경남 · 경북 · 충남 · 충북 · 강원 · 제주 · 서울시 · 경기도 |
| 정치가 아닌 말이 없다 | 증시 · 시황 · 코스피 · 코스닥 · 환율 · 유가 · 주가 · 비철 · 매출 · 영업이익 · 실적 · 수출 · 간담회 · 선원 · 유학 · 입학 · 데뷔 · 배우 · 가수 · 中企 · 쿼드메디슨 |

- 대표를 정치로 고른 NewsData 기사에만 건다. 경제 · 사회 · IT·과학으로 고른 기사는 그대로다
- **북한만 나오는 기사는 정치에 남긴다**(사용자 결정). 트럼프 · 시진핑 · 중국이 같이 나오면 국제로 간다
- 한국이 당사자인 외교(정상회담 · 전략 대화)는 팀 문서대로 국제다 — 규칙이 외국 이름으로 잡는다
- 짧아서 자주 틀리는 「가자」 · 「인도」 · 「UN」 은 넣지 않는다

**잰 것**(`C:/tmp/preload/articles-1021-1103.jsonl`, 판정은 제목만 읽은 것 · 표본 소수)

- 위 목록으로 정치 19,393건 중 **2,673건(13.78%)** 이 옮겨진다. Python · PostgreSQL `~` · Java `Pattern.find()` 는 직전 목록에서 건수가 같았다(2,730, 리뷰 조수)
- 옮겨지는 쪽 표본 60건(목록을 조금 고치기 전): 맞음 48 · 애매 3 · 틀림 9. 틀린 9건 중 실제 국내 정치는 1건이고, 8건은 기업 · 연예 · 스포츠 · 제약처럼 원래 정치 기사가 아니다. 리뷰 조수 표본 40건에서는 국내 정치 · 행정이 3 ~ 4건이었고, 그중 일부(진성준 · 경기교육청)는 이번에 낱말을 더했다
- 남는 쪽 표본 60건: 명백히 못 옮긴 해외 정치 1 ~ 2건
- **못 고치는 것:** 남는 쪽 60건 중 약 12 ~ 15건은 정치 기사가 아니다(부동산 · 사건 · 축제 등). NewsData 가 `politics` 를 붙인 탓이고 이 계획 범위 밖이다

## 바꿀 파일

- `backend/src/main/resources/db/migration/V12__category_foreign_politics_title.sql` — 새 파일. `source = 'NEWSDATA' and category_code = 'politics'` 이고 규칙에 맞는 기사의 대표를 `world` 로
- `backend/src/main/java/kr/io/newlearn/ingest/ForeignPoliticsTitleRule.java` — 새 파일. 정규식 상수 셋과 `matches(title)`. 정규식은 낱말을 `|` 로 잇기만 해 Java · PostgreSQL 뜻이 같게
- `backend/src/main/java/kr/io/newlearn/ingest/ArticleIngestService.java` — `insert` 에서 고른 대표가 `politics` 이고 규칙에 맞으면 `CategoryRepository.getReferenceById("world")`. `category()` 의 대응 표 규칙은 그대로
- `backend/src/test/java/kr/io/newlearn/ingest/ForeignPoliticsTitleRuleTest.java` — 새 파일. 제목 표본(옮김 · 국내 주체 · 제외어 · 북한만) + **V12 파일에 Java 정규식 셋이 그대로 들어 있는지**. 주석에 「규칙을 바꾸면 최신 판 파일을 보게 옮긴다」
- `backend/src/test/java/kr/io/newlearn/CategoryMappingMigrationTest.java` — 메서드 추가. V11 까지 올린 스키마에 기사를 넣고 V12 로 올림(도우미 `insert` 에 제목 인자). `{world,politics}` · 다른 출처 · 제목은 맞지만 경제로 고른 기사는 안 건드리는지, 되돌리는 SQL 이 원래 값으로 돌리는지
- `backend/src/test/java/kr/io/newlearn/ArticleIngestIntegrationTest.java` — B2 같은 조합
- `backend/src/test/java/kr/io/newlearn/InterestIssueSchemaTest.java` — 판 목록에 12
- 문서
  - `docs/api-internal.md` 78줄(대표 카테고리 고르는 법), `docs/data-model.md` 214줄(「다시 계산할 때 제목 규칙도 같이」) · 217줄 · `category_code` 줄
  - `docs/specs/F01-article-ingest-api.md`(F01 뉴스 데이터 적재·조회) AC-11 — AC-8 번호는 그대로, `docs/api.md` 5절 Jira 표
  - `infra/server/data-load.md` 3절 63줄 판 문장만 V12 로, 95줄에 「B2 가 고른 값(제목 규칙 포함)을 두면 운영과 같다」. 72줄 · 5줄은 그대로(V12 는 행 · 칸을 안 바꿈). 이 파일은 infra 게이트가 돌아 커밋을 나눔
  - `SSOT.md` 9절 한 줄(대표는 대응 표 + 제목 규칙), 10절(잰 것)

## 작업 순서

- [x] Jira(BE 공동 · 스토리 포인트), worktree `C:/tmp/wt-<번호>`(`origin/backend` 에서), 이 계획을 옮김 — 원격에 V12 가 없는지 다시 봄
- [x] 시험 먼저(빨강) — 세 시험이 규칙 없음으로 실패하는지
- [x] V12 · 규칙 · `ArticleIngestService` — 시험 통과, 고친 코드를 되돌려 단언에서 빨개지는지, 백엔드 전체 시험 · 게이트
- [ ] 문서 — `/verify`, reviewer 조수
- [ ] MR → backend → dev(파이프라인 success, 머지 직전 원격 SHA · 열린 MR 확인)
- [ ] 반영 전 운영 읽기 SQL(규칙은 V12 파일의 세 줄을 그대로) — 반영 전 최대 id, 그 범위에서 옮겨질 수 · 분야 분포, `issue` · `issue_category` 행 수. 이슈가 0 이 아니면 멈추고 다시 정한다
- [ ] 배포 태그 MR(`deploy/app`) — **머지는 사람.** 머지 직전 `kubectl -n app get jobs` 로 도는 Job 0 확인, Job 이 있거나 10:00 ~ 12:00 이면 미룸(CronJob 시작 마감 1시간 + 실행 상한 1시간)
- [ ] 운영 확인(아래) → 분야 브랜치 맞추기 → `/feature-done`
- [ ] 기록 MR(SSOT 10절 · 체크칸), Jira · learn · 결정 · 면접 · AI · FE 알림 초안(V12 · 분야 수) 고침

## 안 바꿀 것

- 적용된 V1 ~ V11, `category_mapping` 행, `source_categories` · `title` 값
- A1 분야별 기사 수 · A7 최신 기사 조회 코드와 API 모양(FE 코드 변경 없음), 분야 탭은 대표 하나 기준 그대로
- 정치가 아닌 기사 걸러내기, 다른 분야(경제 · 사회 등)의 해외 기사, AI 분류 · GMS 호출 · 실시간 기사의 EXTRACT 스키마
- `infra/k8s/services/ingest/news_ingest.py` · CronJob
- 제목 조각(`hellip;`) · 언론사 이름 손보기 — 별도 일로 적어만 둠
- `docs/mvp-overview.md`(PM 문서, 뜻이 같아 고칠 것도 없음)

## 리스크

- **오판** — 국내 기사가 소수 국제로 갈 수 있다. `李` · `이재명` 이 낀 기사(직전 목록에서 71건)는 국내 발언과 정상회담을 낱말로 못 가른다. 낱말에 끼인 경우도 소수 있다(「사랑이란」 등)
- **외국에도 걸리는 낱말** — `의원` · `여당` · `국회` 는 외국 기관에도 걸려 그 기사는 정치에 남는다. 국내 `여야` 는 목록에 없어 소수가 국제로 간다(리뷰 조수가 본 3건). 건수가 작아 둔다
- **새 인물 · 나라** — 목록에 없으면 정치에 남는다. 서비스 기간이 짧아 낱말을 늘리는 마이그레이션은 필요할 때만
- **규칙이 두 곳**(Java · V12) — V12 파일에 Java 정규식이 그대로 있는지 시험이 본다
- **덤프** — 운영 판이 V12 가 되므로 덤프를 만드는 로컬 backend 도 V12 여야 적재 판 검사를 통과한다. AI 알림을 아직 안 보냈으니 V12 로 고쳐 보낸다. 덤프의 `category_code` 는 운영 값을 덮는다 — 같은 규칙이면 값이 같고, AI 팀이 따로 분류하면 그 값이 이긴다
- **배포 시각** — 교체 중 옛 Pod 가 B2 를 받으면 규칙 없이 들어간 기사가 남을 수 있다. 위 순서로 피하고, 반영 뒤 「규칙에 맞는데 정치로 남은 기사」가 0 이 아니면 V12 와 같은 UPDATE 를 사람이 한 번 돌린다(판을 또 올리지 않으려고)
- **V12 시간** — 재 보기 전이라 반영 때 Flyway 실행 시간을 적는다. 실패하면 새 Pod 가 안 뜨고 옛 Pod 가 남는다(`maxUnavailable: 0`)
- **이슈 분야** — V12 는 `issue_category` 를 다시 계산하지 않는다. 운영 이슈가 있으면 어긋나니 반영 전에 행 수를 본다(11-05 07시 이슈 0)
- **분야 수가 바뀜** — 정치가 줄고 국제가 는다. FE · AI 알림 초안의 숫자를 고친다

## 어떻게 검증하나

- `ForeignPoliticsTitleRuleTest`, `CategoryMappingMigrationTest`, `ArticleIngestIntegrationTest`(F01 AC-11), 백엔드 전체 시험 · `.claude/stack.md` 게이트. 되돌림 확인은 고친 코드를 빼서 단언 실패로
- 운영 반영 뒤
  - `flyway_schema_history` 12 성공 · 실행 시간
  - `id <= <반영 전 최대 id>` 범위의 정치 · 국제 수 = 반영 전 읽기 SQL 값, 규칙에 맞는데 정치로 남은 NewsData 기사 0
  - A1 `GET /api/v1/categories` 의 `articleCount` · A7 `GET /api/v1/articles?category=world` 의 `totalElements` 가 **공개 기사** 수와 같음(11/4 뒤 넣기만 기사는 공개 전이라 안 셈)
  - 앱 12개 Synced · Healthy, 사이트 health 200, 분석 작업 수 그대로
- 화면 — 로그인된 앱 안 브라우저에서 최신 기사 정치 · 국제 탭을 보고 캡처(실명 안 나오게)
- **말하지 못하는 것:** 정확도는 소수 표본을 제목만 읽어 판정한 값이다. 사람이 전수 확인하지 않는다

## 되돌리는 법

🔴 적용된 V12 는 되돌릴 수 없다 — 파일을 지우지 않고 새 파일(V13)로 고친다. **코드를 먼저 되돌린다.** 안 그러면 새 B2 가 다시 옮긴다.

1. `ArticleIngestService` 변경을 되돌리는 코드와 V13 을 한 MR 로 → 배포 태그 MR. 판이 V13 이 되니 덤프 쪽에 판을 다시 알린다
2. V13 의 내용 — 규칙이 옮긴 기사는 정확히 가려낼 수 있다. 원본 분류에 `world` 가 없는데 대표가 국제인 NewsData 기사다

   ```sql
   update article set category_code = 'politics'
   where source = 'NEWSDATA' and category_code = 'world'
     and 'politics' = any(source_categories) and not 'world' = any(source_categories);
   ```

   이 SQL 이 원래 값으로 돌리는지는 `CategoryMappingMigrationTest` 가 본다. 덤프 적재 뒤에는 덤프가 넣은 값도 함께 바뀌니 그때는 다시 판단한다

## 계획에서 바뀐 것

- `backend/src/main/java/kr/io/newlearn/article/Article.java` 주석 한 줄 — 대표 카테고리 설명에 제목 규칙을 더함(MR 리뷰 지적, 동작 변화 없음)
