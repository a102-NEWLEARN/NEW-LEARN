# NewsData 원본 분류 → 5개 분야 대응 · 분야 탭은 붙은 분야 모두 (2026-11-04)

Jira S15P31A102-170. 2026-11-04 사용자 승인.

## 무엇을 / 왜

운영 `category_mapping` 에 NEWSDATA 행이 0개라, 운영 기사(먼저 넣은 10/21 ~ 11/3 포함 79,337건)와 매일 들어올 기사의 대표 분야(`category_code`)가 모두 빈다 — 분야 탭(A7 `?category=`) · 기사의 분야 이름 · 이슈 분야(`issue_category`) · A1 분야별 기사 수에 안 나온다(`docs/data-model.md` 5절 미정 7번, `SSOT.md` 8절, BE 몫). 대응 행을 넣고 지금 기사의 대표 분야를 다시 계산하며(MR 1), 분야가 둘인 기사(8,074건)는 분야 탭에서 두 탭 모두에 나오게 한다(MR 2).

사용자 결정(2026-11-04 대화):
- 분야가 둘이면 **분야 탭에는 둘 다**, 기사에 보이는 분야 이름 · 이슈 분야는 **대표 하나**(`docs/mvp-overview.md` 2-2 「기사에는 대표 카테고리를 부여한다」를 지킴)
- 대표는 **구체적인 것 먼저** — 국제 → IT·과학 → 정치 → 경제 → 사회
- `domestic`(국내) → 사회

## 정한 것

**대응 행 18개**(NewsData 분류 전부 — 표에 없는 값이 하나라도 있으면 그 기사의 대표가 통째로 비는 규칙이라 거르는 다섯도 행을 둔다)

| 원본 값 | 분야 | priority |
|---|---|---|
| `world` | 국제 `world` | 1 |
| `technology` · `science` | IT·과학 `it_science` | 2 |
| `politics` | 정치 `politics` | 3 |
| `business` | 경제 `economy` | 4 |
| `crime` · `environment` · `health` · `education` · `domestic` | 사회 `society` | 5 |
| `top` · `breaking` · `other` · `sports` · `entertainment` · `lifestyle` · `food` · `tourism` | 비움(주제가 아님 — 건너뜀) | 99 |

- 대표 고르는 코드는 그대로(`ingest/ArticleIngestService.java` 의 `category()` — 칸이 찬 행 중 priority 가 가장 작은 것, 같으면 `category.sort_order`). 분야마다 priority 가 달라 동점이 생기지 않는다
- 운영 실측(2026-11-04 17시, 기사 79,337건 — 시험 기사 3 포함, 읽기 SQL 로 흉내): 대표 — 정치 19,393 · 경제 25,817 · 사회 16,872 · 국제 3,989 · IT·과학 12,094 · 빔 1,172(`top` 등만). 분야 탭(붙은 분야 모두) — 정치 19,693 · 경제 28,973 · 사회 21,490 · 국제 3,989 · IT·과학 12,094. 분야 둘인 기사 8,074 · 셋 이상 0. 다시 계산과 같은 SELECT 가 1.04초(78,165건 채움)
- `docs/data-model.md` 에는 표를 베끼지 않고 V11 을 가리킨다(만들어진 표는 마이그레이션이 이긴다 — stack.md 7절)

### MR 1 — 대응 행 · 다시 계산 (V11)

`backend/src/main/resources/db/migration/V11__category_mapping_newsdata.sql`(새 파일 — 적용된 V1 ~ V10 은 고치지 않는다)
1. 위 18행을 넣는다(`on conflict do nothing`)
2. 지금 기사의 대표 분야를 다시 계산 — `source = 'NEWSDATA'` 이고 `category_code` 가 빈 기사만(덤프 · 시험이 넣은 값은 덮지 않음), 원본 값이 모두 표에 있고 계산값이 비지 않을 때만 쓴다. Java `category()` 와 같은 규칙을 SQL 로
3. 색인은 만들지 않는다 — `article` 에는 기본 키 · url 말고 색인이 없어 `OR` 질의가 어차피 표 전체를 읽는다(A7 전체도 지금 그렇다). 반영 뒤 응답 시간을 잰다
4. `issue_category` 는 다시 계산하지 않는다 — 이슈가 생길 때 API 가 채운다(`IssueCategoryRepository.fillMostCommon`). 운영 이슈 수는 반영 전에 확인

### MR 2 — 분야 탭은 붙은 분야 모두

- **A7 최신 기사 `?category=`**: 「공개 기사이고, 대표 분야가 그 분야이거나 원본 분류 중 하나가 그 분야에 대응되는 기사」. 서비스가 `category_mapping` 에서 그 분야의 NEWSDATA 원본 값 목록을 읽고, 리포지토리는 **HQL** `a.releasedAt is not null and (a.category.code = :cat or array_intersects(a.sourceCategories, :values))` 에 지금처럼 `@EntityGraph(press, category)` · Pageable 속성 정렬 · 자동 세는 질의를 쓴다(스펙 F01-F11 AC-6 「항목마다 추가 SQL 없음」 유지). 목록이 비면 배열 조건 없이 대표 분야만. `:values` 를 `List` · `String[]` 중 무엇으로 넘길지는 시험으로 정한다
- **A1 분야별 기사 수(`articleCount`)도 같은 규칙** — 탭 숫자와 탭 목록 수가 같게(`category/CategoryQueryRepository.articleCounts`). 화면은 아직 이 값을 안 보인다
- 응답 모양은 그대로(`category` 는 대표 하나) — FE 수정 없음. 한 기사가 두 탭에 나오고, 분야 탭에서도 기사 줄에 대표 분야 이름이 보인다(`LatestArticles` 의 `showCategory`) — 경제 탭에 「IT·과학」이 적힌 기사가 섞인다(결정대로, FE 에 알림)
- A2 이슈 목록 분야 · A13 · 북마크는 그대로 — 이슈 분야는 대표로 계산

## 바꿀 파일

MR 1
- `backend/src/main/resources/db/migration/V11__category_mapping_newsdata.sql` (새)
- `backend/src/test/java/kr/io/newlearn/CategoryMappingMigrationTest.java` (새) — `target("10")` 까지 올린 DB 에 기사를 넣고 `target("11")` 로 올려 본다(`EventReactsToSchemaTest` 틀): 행 18개, 조합별 대표(`top,business,technology` → IT·과학, `crime,politics,top` → 정치, `world` 낀 조합 → 국제, `domestic` → 사회, `top` 만 → 빔, 모르는 값이 끼면 빔, `{}` → 빔, 같은 값 두 번), 이미 찬 `category_code` 는 그대로, `SSAFY_*` 출처는 손대지 않음
- `backend/src/test/java/kr/io/newlearn/EventReactsToSchemaTest.java` — 두 번째 `migrate()` 에 `.target("10")`(지금은 V11 까지 돌아 `migrationsExecuted` 2 로 깨짐)
- `backend/src/test/java/kr/io/newlearn/ArticleIngestIntegrationTest.java` — V11 행으로 B2 대표 분야(위 조합 몇 개)
- `backend/src/test/java/kr/io/newlearn/CoreMappingTest.java` — `business` · `top` 을 직접 넣는 시험을 시험 전용 값으로(V11 행과 겹쳐 「넣기」 대신 「고치기」가 됨)
- 문서: `docs/data-model.md`(category_mapping 행은 V11 · 미정 7번 풀림), `docs/specs/F01-article-ingest-api.md` 33줄, `infra/server/data-load.md`(5줄 「V2 ~ V10」 · 63줄 「지금 V10」 · 72줄 `category_mapping` 「BE 몫 — 만든 대응이 있으면 BE 에 따로」), `SSOT.md` 8절 그 미정 행 지움

MR 2
- `backend/src/main/java/kr/io/newlearn/article/ArticleRepository.java` — `findByReleasedAtIsNotNullAndCategory_Code` 대신 HQL 질의
- `backend/src/main/java/kr/io/newlearn/article/ArticleService.java` · `category/CategoryMappingRepository.java` — 분야의 원본 값 목록 읽기(`source = NEWSDATA`)
- `backend/src/main/java/kr/io/newlearn/category/CategoryQueryRepository.java` — A1 기사 수
- `backend/src/main/java/kr/io/newlearn/article/ArticleController.java` — Swagger `category` 설명(「대표 카테고리 코드」 → 새 규칙)
- 시험: `article/ArticleServiceTest.java`(생성자 · 없는 분야면 매핑을 안 읽음), `ArticleRepositoryTest.java`(옛 메서드 대신), `ArticleApiIntegrationTest.java`(분야 둘인 기사가 두 탭에 · 대표만 있는 기사 · 대표는 비고 원본만 대응되는 기사도 나옴 · **공개 전 기사는 원본이 대응돼도 안 나옴** · 다른 탭에는 안 나옴 · `?category=` 경로도 질의 수 고정), `CategoryIssueApiIntegrationTest` 등 A1 시험 — 공유 시험 자료(`ArticleApiFixtures`)에 기사를 더하지 않고 새 시험 안에서 `update article set source_categories = …`
- 문서: `docs/api-screen.md` A7 `category` 인자 · A1 `articleCount`, `docs/specs/F01-F11-article-api.md` A7, `docs/specs/F02-category-issue-api.md` AC-1(기사 수 규칙), `docs/api.md` 5절 Jira 표, `SSOT.md` 9절 「분야 탭은 붙은 분야 모두」 한 줄

공통: 이 계획 → `docs/plans/2026-11-04-newsdata-category-mapping.md`

## 작업 순서

- [x] 계획 커밋 · Jira 새 티켓(S15P31A102-170, BE, 스토리 포인트 3, 공동 담당 강하린 · 김주우 · `pair`)
- [ ] MR 1: 마이그레이션 시험 먼저(빨강) → V11 → 되돌리면 실패, `EventReactsToSchemaTest` · `CoreMappingTest` · B2 시험 → 문서 → reviewer 조수 → 백엔드 게이트 → MR → backend → dev → 배포 태그 MR(`deploy/app`) 머지는 사람 → 운영 확인(아래) → 분야 브랜치 맞추기
- [ ] MR 2: 분야 탭 · A1 시험 먼저 → 리포지토리 · 서비스 → 되돌리면 실패 → 문서 → reviewer → 게이트 → MR → backend → dev → 배포 → 운영 확인
- [ ] SSOT 10절 · Jira · 알림 — FE(분야 탭이 차고 한 기사가 두 탭, 기사 줄은 대표 이름), AI 덤프 담당(운영 판 V11 — 견본 덤프 11/9 ~ 11/10 전에, 로컬 dev backend 를 V11 로)
- 머지 · 배포는 매일 10:00 ~ 10:30 을 피한다 — 새 Pod 가 V11 을 도는 동안 옛 Pod(대응 행 0개)가 B2 로 넣은 기사는 대표가 비고, V11 다시 계산의 스냅숏에도 안 잡혀 빈 채로 남는다(UPDATE 는 행 잠금이라 B2 의 INSERT 를 막지는 않는다)

구현은 파일마다 무엇을 왜 바꾸는지 설명하며 간다(사용자 BE 학습 방식).

## 안 바꿀 것

- 대표 고르는 Java 규칙(`ArticleIngestService.category()`) — priority 값으로만 순서를 정한다
- API 응답 모양(A1 · A7 · A8), FE 코드, A2 · A13 · 북마크 질의
- `issue_category` 계산 방식(대표 분야 기준), MVP 개요 2-2
- 수집 배치 · 인프라 매니페스트, 적용된 마이그레이션 V1 ~ V10
- 인증 · 권한 코드

## 리스크

- **마이그레이션 실패 → 새 backend 가 안 뜸** — Flyway 가 시작 때 V11 을 돈다. 순차 배포(`maxUnavailable: 0`)라 옛 Pod 가 남는다. 다시 계산 SELECT 는 운영에서 1.04초 — 시작 프로브 한도(5초 × 36 = 180초) 안
- **다시 계산 SQL 이 Java 규칙과 다름** — 마이그레이션 시험이 조합마다 B2 결과와 같은지 본다. 반영 뒤 분포를 실측과 견준다
- **분야 탭 · A1 질의 시간** — 색인 없이 표 전체(8만 건)를 읽는다. 반영 뒤 A7 분야 탭 · A1 응답 시간을 잰다
- **HQL 배열 함수 바인딩** — `array_intersects` 에 넘길 인자 타입은 시험으로 정한다. 안 되면 계획을 멈추고 다시 승인받는다
- **덤프 판** — 만드는 쪽 로컬 DB 가 V11 이어야 「목록표 판 = 운영 판」 검사를 지난다(`data-load.md` 5절, 칸은 늘지 않아 `COPY` 칸 대조와는 무관). 대표 분야는 덤프가 채우면 덮는다(V11 이면 같은 값)
- **한 기사가 두 탭에** — 응답 모양은 같아 깨지지는 않는다. FE 가짜 API(`mocks/handlers.ts`)는 대표 기준으로 거른다 — FE 에 알림
- **모르는 새 분류 값** — NewsData 가 새 값을 보내면 그 기사의 대표는 빈다(지금과 같음, 로그). 탭에는 대응되는 다른 값으로 나올 수 있다(시험으로 확인)

## 어떻게 검증하나

- 백엔드 게이트: `./gradlew spotlessCheck` · `./gradlew compileJava compileTestJava`(Error Prone · NullAway) · `./gradlew test`(Testcontainers) 통과. 새 시험은 고친 곳을 되돌리면 실패
- MR 1 운영 반영 뒤(읽기 SQL): `flyway_schema_history` 최신 11, `category_mapping` NEWSDATA 행이 `값:분야:priority` 목록으로 V11 과 같음(`freshSchemaHasAllNewsDataCategories` 와 같은 대조), `id <= 79337` 기사의 대표 분포 = 위 실측(빔 1,172 안팎), **「대표가 비었는데 원본 값이 모두 표에 있고 분야가 찬 값이 하나라도 있는 NewsData 기사」 0**(경합 · SQL 과 Java 어긋남을 바로 잡음), 반영 뒤 들어온 기사(11-05 10시 수집)에 대표가 차는지
- MR 2 운영 반영 뒤(`curl`): A7 `?category=<분야>&size=1` 의 `totalElements` = 공개 기사 기준으로 반영 직전에 다시 잰 탭 수, 분야가 둘인 기사 하나가 두 탭에 다 나옴, A8 `category` 는 대표 하나, A1 `articleCount` = 탭 수, 분야 탭 · A1 응답 시간

## 되돌리는 법

- MR 2: revert(분야 탭이 대표 분야만 보던 때로). 데이터는 그대로
- MR 1: 적용된 V11 은 고치지 않고 **새 마이그레이션 V12** 로 — 대응 행 18개 지우기, V11 이 채운 대표 분야 비우기(덤프 적재 전이면 `source = 'NEWSDATA'` 기사의 `category_code` 를 비워도 원래 상태). 옛 이미지로 되돌려도 Flyway 기본값이 미래 판을 무시해 뜬다
- 🔴 되돌릴 수 없는 것: 없음. 다만 V11 은 Flyway 기록에 남는다(되돌림도 새 판으로)

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-04, 「고쳐야 함」 9 · 선택 반영)

- 분야 탭을 네이티브 질의 → HQL `array_intersects`(EntityGraph · 정렬 · 세는 질의 유지 — 네이티브는 AC-6 위반 · 정렬 500 · 배열 인자 문법 오류)
- `EventReactsToSchemaTest` 에 `target("10")`, 새 마이그레이션 시험도 `target("11")`
- 바꿀 파일에 `ArticleServiceTest` · `ArticleRepositoryTest` · `ArticleController` Swagger, 문서에 스펙 F01-F11 · F01 ingest 33줄 · F02 AC-1 · `data-load.md` 5 · 72줄 · `docs/api.md` 5절, SSOT 8절은 「지운다」
- A7 시험에 공개 전 기사 · 대표는 비고 원본만 대응되는 기사, `?category=` 질의 수 고정
- A1 `articleCount` 도 탭 규칙으로(탭 숫자 = 탭 목록 수)
- GIN 색인 뺌(OR 질의는 어차피 표 전체), 대책은 반영 뒤 응답 시간 재기
- 검증 숫자는 `id <= 79337` · 공개 기사 기준으로, 반영 직전에 다시 잼
- 덤프 쪽에 V11 알림, 리스크 문구(칸 대조와 무관), MR 을 둘로(V11 이 먼저 나가도 「분야가 빔」이 풀림)
- V11 은 계산값이 비지 않을 때만 쓰기, 마이그레이션 시험 경우 더함, 공유 시험 자료에 기사를 더하지 않음, 원본 값 목록은 `source = NEWSDATA` · 비면 배열 조건 뺌, FE 알림에 기사 줄 대표 이름
- 다시 계산 시간을 운영 읽기 SELECT 로 잼(1.04초)

## MR 1 리뷰에서 바뀐 것 (reviewer 조수 2026-11-04, 「고쳐야 함」 1 · 선택 반영)

- `InterestIssueSchemaTest` 의 판 목록에 11 — 새 DB 의 Flyway 이력을 `containsExactly` 로 본다(V10 때도 같은 줄을 고침). 계획 「바꿀 파일」에 없던 시험 파일 하나
- `docs/data-model.md` 미정 7번은 5절 규칙대로 지우고 데이터셋 행 이야기는 17번으로, 2절 · `data-load.md` 는 반영 전 시제로
- 스펙 F01 AC-8 에 새 시험 이름, 운영 확인을 행 수 → `값:분야:priority` 목록 대조 · 「대표가 빈데 채울 수 있는 기사 0」으로
- 10시를 피하는 까닭을 바로잡음 — 잠금이 아니라 옛 Pod 와의 경합
- `docs/mvp-overview.md` 38줄 「원본 분류를 5개에 맞추는 방법은 실제 데이터를 확인한 뒤」는 PM 확인 문서라 이 MR 에서 고치지 않고 PM 에 알린다
