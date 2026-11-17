# backend 의 DB 접속에서만 JIT 를 끈다 (2026-11-17, Jira S15P31A102-230)

> 승인됨(2026-11-17). plan mode 의 `docs/plans/zazzy-questing-zebra.md` 에서 옮겼다.
>
> **기본은 오늘(11-17) 배포까지 한다** — 데이터 · 응답 · DB 서버 설정을 안 바꾸고, 값 하나(`DB_OPTIONS`)를 비우면 완전히 되돌아온다. 발표 뒤로 미루려면 승인할 때 「머지까지만」.

## Context — 왜

사용자 요청(2026-11-17): 개선안 1(Jira 227) · 3(Jira 228) 다음으로 「JIT 먼저 재 보기」 → 결과를 보고 「계획 세워 줘」.

운영 PostgreSQL 은 JIT 가 기본값(켬, `jit_above_cost` 10만)이다. 추정 비용이 10만을 넘는 쿼리는 실행할 때마다 LLVM 으로 식을 컴파일한다. 화면 쿼리는 한 번에 수 ms 짜리라 컴파일 값이 돌려받는 값보다 크다.

**운영 측정**(2026-11-17 18:18 · 18:39, 읽기만):
- 앱이 보낸 SQL 31가지(SELECT 28)를 `pg_stat_activity` 로 모았다. 27가지는 `EXPLAIN (GENERIC_PLAN)` 비용을 읽었고, 1,024바이트에서 잘린 A2 목록은 원문을 PREPARE 해서 쟀다. 문턱을 넘는 것은 A1 분야별 이슈 수(20.5만) · A13 검색 이슈 칸(21.2만) · 사건 칸(14.9만), 그리고 드문 경로인 A2 끝 넘은 쪽 전체 수(21.2만)다. A2 목록(3,663 · 12,538) · A3 · A4 · 기사 · 분석 쪽 쿼리는 안 넘는다
- 앱처럼 PREPARE 하고 같은 값으로 8번(custom plan 5번 → 일반 계획) 실행 — JIT 는 실행마다 다시 컴파일한다:

| 질의 | JIT 켬(지금) | 그중 JIT | JIT 끔 |
|---|---|---|---|
| A1 분야별 이슈 수 | 28.6 ms | 13 ~ 22 | 13.3 |
| A13 검색 이슈 칸 | 14.2 | 12 ~ 17 | 0.9 |
| A13 검색 사건 칸 | 10.9 | 6 ~ 7 | 4.7 |
| A2 끝 넘은 쪽 전체 수 | 23.7 | 11 ~ 12 | 12.5 |
| A2 목록(최신순 · 정치) | 56.7 · 19.6 | 0 | 56.4 · 20.5 |

- 요청 비율(`infra/server/perf/load.py` MIX — A1 12.8% · A13 9.0%)로 어림하면 평균 요청 하나에 약 3.7 ms. 11-13 포화 부하 시험(227 · 228 전)의 요청 하나 DB CPU 25.9 ms 의 약 14% 다 — 그 뒤 요청당 DB CPU 는 더 작아져 비중은 이보다 클 수 있다(어림)

## 무엇을

PostgreSQL JDBC 드라이버의 `options` 속성으로 **backend 가 여는 연결에만** 세션 설정 `jit=off` 를 넘긴다(Spring Boot 4.1.1 → HikariCP 7.0.2 `DriverDataSource` → PgJDBC 42.7.13 startup `options`, `@ServiceConnection` 시험에서도 같은 길 — 리뷰 조수가 jar 로 확인).

- `application.yaml` — `spring.datasource.hikari.data-source-properties.options: ${DB_OPTIONS:}`. 비면 빈 `options` 가 가서 서버 기본값 그대로
- 사이트 값은 `backend.yaml` 의 `DB_OPTIONS: "-c jit=off"` — 팀 방식대로 **값으로 되돌린다**(비우면 끝)
- **MR 을 둘로 나눈다** — ① 코드 · 시험(사이트 값 없음) → 배포 → 새 이미지에서 운영 바탕값 ② `backend.yaml` 한 줄 → 같은 이미지에서 JIT 만 다른 전후. 재시작은 어느 쪽이든 두 번이고, 운영에서 빈 `options` 가 연결을 깨지 않는 것을 먼저 본다

## 바꿀 파일

| MR | 파일 | 무엇을 |
|---|---|---|
| ① | `backend/src/main/resources/application.yaml` | 위 한 줄과 주석(왜 · 운영 측정 · 비우면 서버 기본값 · 운영 · CI 에서는 Flyway 도 같은 연결이라 마이그레이션도 JIT 가 꺼짐 — DDL 은 JIT 대상이 아님) |
| ① | `backend/src/test/java/kr/io/newlearn/DbSessionOptionsTest.java` (새) | `@TestPropertySource(properties = "DB_OPTIONS=-c jit=off")` · `@DirtiesContext` 로 앱 연결에서 `pg_settings` 의 `jit` 이 `off`(출처 `client`). 설정 줄이 없으면 `on` 이라 **빨갛다**(실패하는 시험 먼저). `@DirtiesContext` 는 끝나면 연결 4개를 돌려준다 |
| ① | `backend/src/test/java/kr/io/newlearn/DbSessionDefaultOptionsTest.java` (새) | 기본(빈 값)일 때 `jit` 의 출처가 `client` 가 아님 — 빈 `options` 가 연결을 깨지 않고 아무것도 안 바꾼다(시험 DB 이미지의 서버 기본값에 묶이지 않게 값 대신 출처를 본다). 다른 `@DataJpaTest` 와 같은 조합이라 시험용 앱이 늘지 않는다 |
| ① | `docs/testing.md` (28 · 34줄) | Backend 시험 수를 dev 에서 다시 세어 고침(Jira 228 의 하나 + 이번 둘), 센 날짜 |
| ② | `infra/k8s/services/app/backend.yaml` | env `DB_OPTIONS: "-c jit=off"`, 주석(측정 · 되돌리기는 값을 `""` 로) |
| ② | `exec/1-build-deploy.md` (185줄 backend 평문 값) | `DB_OPTIONS="-c jit=off"` |
| 뒤 | 문서 MR: `SSOT.md` 10절 한 줄 · `docs/testing.md` 2절 「성능 전후 비교」 한 줄 | 운영 전후 |

## 작업 순서

- [ ] **C1** (시험 · 커밋 · MR ① 까지 끝 — 2026-11-17 19:15, 리뷰 조수 통과) 새 시험 둘 — `DbSessionOptionsTest` 가 설정 줄 없이 단언에서 빨간지 → `application.yaml` → `backend_LINT` · `backend_TEST`(verifier 조수) → 되돌림 확인(설정 줄을 빼면 빨개짐) → MR ① → reviewer 조수 → 파이프라인 → 머지(직전 dev SHA · 열린 MR) → 배포 태그 MR(**바뀌는 줄이 backend 태그 하나인지** — 제목 「backend …」만인지 · `newTag` 줄 수로 확인, 228 때 실수) → 새 Pod Ready · 사이트 200
- [ ] **바탕값(새 이미지, JIT 켬)** — 관리 서버에서 `infra/server/perf/bench.py`(몸풀기 20 + 100번, User-Agent `newlearn-bench/1`, A7 기사 목록이 JIT 를 안 타는 대조군) · 그 앞뒤로 `postgres-0` 의 `/sys/fs/cgroup/cpu.stat` `usage_usec` 를 읽고, 같은 길이의 쉬는 창 값을 뺀 DB CPU ms / 요청. 15분 수집 회차를 피하고 CI 잡이 없을 때
- [ ] **MR ②** `backend.yaml` 한 줄 · exec → 머지 → Argo CD 가 backend 를 다시 띄움 → 새 Pod 의 `DB_OPTIONS` 값 확인 → 같은 방법으로 다시 재기
- [ ] 문서 MR → Jira 완료 → 분야 브랜치 넷 맞추기

## 안 바꿀 것

- DB 서버 설정(`postgres.yaml` · `ALTER DATABASE` · `ALTER ROLE`) — 재시작이 필요하거나 Git 밖이고, psql 스크립트도 같은 `newlearn` 역할이라 같이 꺼진다
- psql · 운영 스크립트(덤프 · 적재 · 평가)의 연결 — 무거운 분석 쿼리에서 JIT 가 이득일 수 있는 쪽은 그대로
- 쿼리 · 응답 · 인덱스 · Hikari 연결 수 · AI 워커(`ai/` — DB 에 직접 붙지 않음)
- `jit_above_cost` 올리기는 고르지 않는다 — 추정 비용이 데이터와 함께 커져 문턱이 흔들린다

## 리스크

- **빈 `options` 가 연결을 깨면** 모든 환경이 영향을 받는다 — 드라이버는 null 만 거르고 빈 문자열은 그대로 보낸다. `DbSessionDefaultOptionsTest` 와 전체 시험(로컬 · CI 둘 다 기본값)이 지키고, MR ① 배포로 운영에서도 먼저 본다
- **사이트 값의 글자가 틀리면**(`-c jit=of` 등) 연결이 안 열려 새 backend 가 Ready 가 안 되고 옛 Pod 가 계속 받는다(maxUnavailable 0, startupProbe 5초 × 36). 값을 고치거나 비우면 된다
- **CI 공용 DB 연결** — 시험용 앱마다 Hikari 가 4개를 쥐고, 지금 약 21개 앱 · 84 ~ 88개(상한 100, 2026-10-27 「too many clients」 선례). `DbSessionOptionsTest` 에 `@DirtiesContext` 를 붙여 끝나면 돌려준다
- **JIT 가 이득인 쿼리를 잃을 수 있다** — 앱에서 가장 무거운 쿼리도 수십 ms 다. 회원 전용 화면(A25 · A17 · A22) 쿼리는 손님으로 못 불러 모으지 못했다 — A25 는 A3 와 같은 집계(`AGGREGATE`, 비용 수백)라 문턱 아래로 본다
- **효과가 응답 시간에서는 흔들림에 묻힐 수 있다** — 그래서 같은 이미지 · 같은 도구로 견주고, DB CPU 도 같이 잰다

## 어떻게 검증하나

1. **시험** — `DbSessionOptionsTest` 가 설정 전 빨강 · 뒤 초록, `DbSessionDefaultOptionsTest` 초록, `backend_TEST` 전체 초록. 되돌림: `application.yaml` 의 설정 줄을 빼면 `DbSessionOptionsTest` 가 단언에서 빨개진다
2. **MR ① 배포 확인** — 새 이미지 판 · Ready · 사이트 200(빈 `options` 로 연결이 열림)
3. **MR ② 배포 확인** — 새 Pod 의 `DB_OPTIONS` 값 · Ready · 사이트 200. 앱 연결의 세션 설정은 밖에서 직접 볼 수 없어서(다른 세션 설정을 보는 뷰 없음, `pg_stat_statements` 없음) 시험 · 환경변수 · 아래 측정으로 본다
4. **전후** — `bench.py` 의 A1 · A13 p50 · p95(대조군 A7 이 그대로인지), DB CPU ms / 요청. A13 은 JIT 몫이 거의 전부라 차이가 가장 커야 한다
5. `SSOT.md` 10절 · `docs/testing.md` 2절에 전후와 「말하지 못하는 것」(부하 시험 안 함 · 회원 화면 쿼리 못 모음)

## 되돌리는 법

| 무엇 | 어떻게 |
|---|---|
| 끄기만 되돌리기 | `backend.yaml` 의 `DB_OPTIONS` 값을 `""` 로(이름은 두고) → Argo CD 가 backend 를 다시 띄움(1 ~ 2분) |
| 코드 | MR ① 되돌리기(빈 값이면 동작이 지금과 같다) |

DB 서버 · 데이터를 안 바꾸므로 완전히 되돌아온다.

## 리뷰에서 바뀐 것 (reviewer 조수, 2026-11-17)

| 처음 계획 | 바꾼 것 |
|---|---|
| 「문턱을 넘는 것은 셋뿐, A2 목록은 안 넘는다」(A2 목록 비용은 비어 있었음) | A2 목록을 PREPARE 로 재서 문턱 아래(3,663 · 12,538)임을 확인, A2 끝 넘은 쪽 전체 수(JIT 11 ms)를 넷째로 더함 |
| Prometheus CPU 로 몇 초 창 | `postgres-0` 의 cgroup `cpu.stat` `usage_usec` 앞뒤 + 쉬는 창 빼기(Prometheus 수집 간격 30초라 몇 초 창은 못 셈) |
| 관리자 PC 에서 100번 | 관리 서버의 `bench.py`(앞 SSOT 행과 같은 도구, A7 대조군) |
| 문서는 SSOT 10절만 | `docs/testing.md` 2절도 |
| 새 시험용 앱 하나, 리스크 없음 | `@DirtiesContext` + CI 공용 DB 연결 리스크 |
| 코드 · 시험 · 사이트 값을 한 MR | MR 둘 — 빈 값을 먼저 운영에 내고, 같은 이미지에서 값만 바꿔 견줌 |
| 기본값 시험이 `jit` = `on` | 출처가 `client` 가 아님을 봄(서버 기본값에 안 묶이게) |
| 「backend 연결에만」 | 운영 · CI 에서는 Flyway 도 같은 연결이라 마이그레이션도 JIT 가 꺼짐(DDL 은 대상 아님)을 밝힘 |
| 14% 의 분모 설명 없음 | 11-13 포화 부하 시험(227 · 228 전) 값이라 밝힘 |
