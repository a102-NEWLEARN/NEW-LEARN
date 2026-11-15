# 분석 작업 실패 · 줄 멈춤 경보 (2026-11-15, Jira S15P31A102-215)

> 2026-11-15 승인. reviewer 조수 리뷰를 반영한 판이다(맨 아래 「리뷰에서 바뀐 것」).

## Context — 왜

2026-11-15 EXTRACT 2건이 「가지 0개」로 **끝내 실패**했다. 그 기사는 마인드맵이 영영 없는데 아무도 몰랐다 — 사람이 운영 DB 를 세 보고서야 알았다(`docs/testing.md` 6절 빈틈).

지금은 **경보를 걸 자리 자체가 없다.** backend · AI 워커에 직접 만든 지표가 0개이고, 판정 · 이슈 줄이 40분 넘게 멈추면 남기는 것도 WARN 로그뿐이다(`DispatchLine.stuck()`). 그 로그도 `FAILED` + `retry_at` 로 줄이 막히면 나지 않는다 — `stuck()` 이 `QUEUED` 만 본다.

**운영 바탕값**(2026-11-15 읽기만): 끝난 실패 전 기간 **4건, 전부 EXTRACT `LLM_OUTPUT_INVALID`**(11-14 1 · 11-15 3). 지금 대기 0, 최근 3일 판정 · 이슈가 40분 넘게 멈춘 적 0.

## 무엇을 / 왜 이 길로

**이미 돌고 있는 postgres_exporter 가 `analysis_job` 을 직접 세게 하고**, 그 수로 경보 셋을 건다.

backend 에 Micrometer 를 넣는 길은 버렸다. 의존성 · 노출 설정 · **SecurityConfig(인증 코드)** · 수집 대상 · 네트워크 정책 · 앱 배포 여섯 군데를 건드리고, `FAILED` 가 되는 코드 길마다 붙여야 해 손으로 돌리는 SQL(`BACKLOG_SKIPPED`)은 못 잡는다. exporter 는 **이미 Prometheus 가 긁고 길도 열려 있다**. 표를 직접 세니 **어느 길로 실패해도 잡힌다.**

| 경보 | 식 | 등급 | 왜 |
|---|---|---|---|
| `NewlearnAnalysisJobFailed` | 단계별 끝난 실패 수가 30분 전보다 늘었다 | warning | 그 기사는 다시 걸리지 않는다. 바탕값으로 하루 1 ~ 3번 |
| `NewlearnAnalysisLineStuck` | 판정 · 이슈 줄의 진행 중 작업이 40분 넘게 안 끝남, 5분 지속 | **critical** | 한 번에 하나씩이라 하나가 막히면 **새 기사 전부**가 사건 · 이슈에 안 붙는다. 40분은 지금 WARN 과 같은 기준 |
| `NewlearnAnalysisMetricsMissing` | 두 지표 중 하나라도 10분째 없다 | warning | 질의가 깨지거나 권한이 빠지면 위 둘이 **조용히 침묵한다** — 감시를 감시한다 |

### 질의 둘 (`queries.yaml`)

진행 중 정의의 **원본은 `AnalysisJobRepository` 의 `findMatchInFlight`(79-84) · ISSUE 쪽(105-111)** 이다. 질의 파일 주석에 그 두 메서드를 적고 「한쪽을 바꾸면 다른 쪽도」를 단다(`ReleaseCandidateQuery.java:21` 과 같은 방식).

```sql
-- ① newlearn_analysis_failed → newlearn_analysis_failed_terminal{stage}  (늘 네 줄)
select s.stage, count(j.stage) as terminal
from (values ('EXTRACT'),('EMBED'),('MATCH_EVENT'),('ISSUE')) as s(stage)
left join public.analysis_job j
  on j.stage = s.stage and j.status = 'FAILED' and j.retry_at is null
 and j.error_code is distinct from 'BACKLOG_SKIPPED'
group by s.stage;

-- ② newlearn_analysis_line → newlearn_analysis_line_oldest_inflight_seconds{stage}  (늘 두 줄)
--    QUEUED 는 queued_at 부터, FAILED+retry_at 은 retry_at(다시 걸 때)부터 잰다 — 건강한 재시도는
--    1분 스케줄러가 곧 QUEUED 로 돌리고 queued_at 을 새로 쓰므로, 40분을 넘는 것은 스케줄러가 못 돌릴 때뿐이다
select s.stage,
       coalesce(greatest(0, extract(epoch from now() - min(
         case when j.status = 'QUEUED' then j.queued_at else j.retry_at end))), 0) as oldest_inflight_seconds
from (values ('MATCH_EVENT'),('ISSUE')) as s(stage)
left join public.analysis_job j
  on j.stage = s.stage
 and ((j.status = 'QUEUED' and (j.stage = 'MATCH_EVENT' or j.candidates is not null))
      or (j.status = 'FAILED' and j.retry_at is not null))
group by s.stage;
```

- 조건은 **`left join … on` 안에** 둔다. `where` 로 옮기면 0 인 단계의 줄이 사라지고, 그 단계의 첫 실패가 새 시계열로 생겨 offset 쪽이 비어 **경보를 놓친다**
- `count(*)` 대신 `count(j.stage)` — `*` 는 빈 줄도 1 로 센다. `select *` · `order by id` 는 열 권한에 걸린다
- 비용: 운영 `EXPLAIN ANALYZE` 로 각 **14.3 · 14.6 ms**(공유 버퍼 2,102쪽, 디스크 읽기 0), 30초마다

### 경보 식

- 실패: `newlearn_analysis_failed_terminal - newlearn_analysis_failed_terminal offset 30m > 0`. **`sum` · `or vector(0)` 를 쓰지 않는다** — `NewlearnRateLimitFailOpen` 의 거짓 울림 원인이 `or vector(0)` 였다(`rules.yaml:21-22`). 한쪽이 비면 결과도 비어 거짓 울림이 없다. 놓치는 경우 둘을 규칙 주석에 한계로 적는다: exporter 가 30분 넘게 멈춘 동안의 실패(그동안 `MetricsMissing` 이 운다), 30분 안에 누가 끝난 실패를 손으로 되살려(-1) 새 실패(+1)를 가리는 경우
- 멈춤: `newlearn_analysis_line_oldest_inflight_seconds > 2400`, `for: 5m`
- 없음: `absent(newlearn_analysis_failed_terminal{stage="EXTRACT"}) or absent(newlearn_analysis_line_oldest_inflight_seconds{stage="MATCH_EVENT"})`, `for: 10m` — 이름표가 갈려 **어느 지표가 없는지 알림에 나온다**
- ServiceMonitor 가 `pod|instance` 를 버리는 것(`exporter.yaml:124-126`)이 offset 비교에 **필요하다** — Pod 가 다시 떠도 같은 시계열이라 30분 전 값과 짝이 맞는다

## 바꿀 파일

| 파일 | 무엇을 |
|---|---|
| `infra/k8s/bootstrap/pg-exporter/queries.yaml` (새) | 위 질의 둘 |
| `infra/k8s/bootstrap/pg-exporter/kustomization.yaml` | `configMapGenerator` 에 `queries.yaml`(해시 이름), 머리 주석 |
| `infra/k8s/bootstrap/pg-exporter/exporter.yaml` | `PG_EXPORTER_EXTEND_QUERY_PATH` + ConfigMap 을 **비밀번호 폴더와 다른 곳**(`/etc/postgres-exporter-queries`)에 읽기 전용으로, 머리 주석 1-6줄 |
| `infra/k8s/bootstrap/pg-exporter/make-secret.sh` | `grant select (stage, status, retry_at, queued_at, error_code, candidates) on public.analysis_job to newlearn_monitor` 를 **42줄(`grant pg_monitor`)과 43줄(`alter role … password`) 사이에** — 실패하면 비밀번호를 바꾸기 전에 멈춘다 |
| `infra/k8s/alerts/rules.yaml` | 경보 셋, 기존 모양(`notify: mattermost` · `severity` · `summary` · `description`) |
| `infra/ci/alert_rules_test.yaml` | 아래 「검증」 2번의 시험 |
| `infra/server/alerts.md` | 「분석 작업 경보가 오면」 절 — 어떤 기사 · 오류인지 보는 SQL, **워커 플래그를 끄면 40분 뒤 울린다 → 끄는 MR 과 함께 silence(Alertmanager 가 다시 뜨면 silence 는 사라진다, `monitoring-values.yaml:56`)**, 한계 둘(메시지를 잃어도 `queued_at` 은 그대로라 W1 이 올 때까지 최대 15분 남음 · 고르기가 작업을 만들기 전에 예외로 계속 실패하면 진행 중 0 이라 못 잡음) |
| `infra/server/ai-worker.md` | 「켜기 · 끄기」에 한 줄 — 플래그를 끄면 이 경보에 silence |
| `infra/server/perf/README.md` | 「exporter 올리기」에 권한 · 질의 파일, 순서(backend 마이그레이션 → `make-secret.sh`) |
| `SSOT.md` 6절 | 173 「통계 표를 지표로」 · 174 「읽기 전용 pg_monitor」 · 175 「exporter 가 꺼져도 경보는 없다」 — **이제 exporter 가 critical 경보의 근거**라 세 줄을 고친다 |
| `infra/k8s/services/data/netpol.yaml` | 5 · 26줄 주석 「통계 표만 읽는다」(주석만, 정책 객체는 그대로) |
| `docs/testing.md` | 6절의 🔴 빈틈을 경보 셋으로, 규칙 10 → 13개 · 시험 9 → 12개 |

## 작업 순서

- [x] **C1** exporter 질의 · 권한 · 주석 (+ perf README · SSOT 6절 · netpol 주석) — 로컬 Docker 시험(검증 1)
- [x] **C2** 경보 셋 · promtool 시험 (+ alerts.md · ai-worker.md) — `infra_LINT` · `infra_TEST`, 되돌림 확인
- [x] **C3** `docs/testing.md` 6절
- [x] MR → 파이프라인 초록 → **사람이 exporter 를 먼저 올린다**(아래) → 지표 · 경보 식 확인 → 머지(Argo CD `alerts` 앱이 규칙 반영)
- [x] 반영 뒤 규칙 셋 `inactive` · `SSOT.md` 10절 한 줄 (2026-11-16, MR !1039 → dev `ade489a`)
- [ ] 첫 진짜 실패가 Mattermost 로 오는지

**사람 몫**(EC2, 파일 카드로 — `infra/server/README.md` 「서버로 보내기」로 폴더를 먼저 보냄). 운영에서는 **`make-secret.sh` 를 다시 돌리지 않고 권한 한 줄만** 친다 — 비밀번호 교체도 재시작도 없다:

```bash
kubectl -n data exec -i postgres-0 -- psql -X -v ON_ERROR_STOP=1 -U newlearn -d newlearn -c "grant select (stage, status, retry_at, queued_at, error_code, candidates) on public.analysis_job to newlearn_monitor"
kubectl apply -k infra/k8s/bootstrap/pg-exporter
```

꼭 지킬 순서는 둘이다: **exporter 반영 → 규칙 머지**(거꾸로면 10분 뒤 `MetricsMissing`), 그리고 **올린 뒤 MR 이 바뀌면 폴더를 다시 보내 apply** — 올린 커밋 SHA 를 MR 본문에 남긴다. 권한과 질의의 순서는 거꾸로여도 몇 분 오류가 나다 풀린다.

## 안 바꿀 것

- **backend 코드** — Micrometer · actuator 노출 · SecurityConfig · 수집 대상 · 네트워크 정책 · 앱 배포 모두 그대로
- **EXTRACT · EMBED 의 대기 경보** — 따라잡기 때 정상적으로 수천 건이 쌓여(11-14 EMBED 3,095건) 헛울린다. 이번엔 실패와 판정 · 이슈 줄 멈춤만
- `DispatchLine` WARN 로그 — 그대로(원인 찾기용)
- Alertmanager 경로(`notify = "mattermost"`, Jira 138) · Argo 앱 · 네트워크 정책 객체 · `alert_rules.sh` — 바꿀 필요가 없음을 확인했다
- exporter 의 다른 설정(연결 상한 3, Recreate), Grafana 대시보드
- Flyway 마이그레이션 — 권한은 역할을 만드는 `make-secret.sh` 에 둔다. 마이그레이션에 넣으면 그 역할이 없는 시험 DB 에서 깨진다
- 따로 고칠 것(이번 범위 밖, 적어만 둠): `SSOT.md` 9절 377 「이슈 워커는 끈 채로」가 이미 `ai.yaml:123-128`(켬)과 어긋나 있다

## 리스크

- **AI 워커 플래그를 일부러 끄면 `LineStuck`(critical)이 약 45분 뒤(40분 + for 5m) 울리고 12시간마다 다시 온다.** 고르기는 플래그와 상관없이 작업을 큐에 넣고, 꺼진 단계는 소비자가 없어 `QUEUED` 로 남는다(`ai/app/main.py:179-200`). 11-14 에 실제로 ISSUE 를 껐다 켰다. → alerts.md · ai-worker.md 에 「끄는 MR 과 함께 silence」를 적는다
- **exporter 의 사용자 정의 질의는 v0.20.1 에서 deprecated** 다(README: 「deprecated in favor of built-in collector functions」). 기능은 아직 있고 이미지는 digest 고정, 서비스는 길어야 12월. 질의를 못 읽으면 지표가 사라져 **`MetricsMissing` 이 스스로 알린다** — 이 주장은 검증 1에서 직접 확인한다
- **질의 파일 형식을 공식 예제로 확인하지 못했다** — v0.20.1 의 `queries.yaml` 은 「수집기로 옮겼다」 한 줄만 남았다. 검증 1 이 첫 관문이다
- **질의 하나가 실패할 때 수집 전체가 실패하면 기존 「조회 성능」 대시보드까지 죽는다** — 검증 1에서 열 하나를 revoke 해 확인한다
- 감시 역할이 `candidates`(후보 사건 번호 · 유사도, `IssueCandidateFinder.java:41-54`)를 읽게 된다. 개인정보 · 기사 글은 아니다. `result` · `error_message` 는 주지 않는다
- `make-secret.sh` 는 DB 권한을 주는 스크립트라 AGENTS.md 「인증 · 권한 코드 — 사람이 최종 확인」 대상이다 → MR 본문 체크리스트에 둔다
- **EXTRACT 실패마다 울린다** — 하루 1 ~ 3번 울림 · 풀림 한 쌍. 너무 잦으면 「30분에 N건 넘을 때」로 올린다

## 어떻게 검증하나

1. **로컬 Docker — 형식 · 권한 · 실패 격리를 먼저**
   - DB 는 CI 와 같은 `pgvector/pgvector:0.8.7-pg18` 에 **backend 마이그레이션 V1 ~ V16 을 그대로** 돌려 운영과 같은 16칸 표를 만든다(손으로 여섯 칸 표를 만들면 열 권한이 곧 표 전체 권한이 돼 `select *` 같은 실수가 통과한다)
   - 역할은 `make-secret.sh` 와 같은 문장(연결 상한 3 · `pg_monitor` · 열 grant)
   - 넣을 행 → 기대값: EXTRACT 끝난 실패 2 · `error_code` 빈 끝난 실패 1(세어야 함) · `BACKLOG_SKIPPED` 1 · 다시 걸 실패 1(둘 다 빠짐) → `{stage="EXTRACT"} 3`, 나머지 단계 0. MATCH_EVENT `QUEUED` 50분 전 → ≈ 3,000초. ISSUE 후보 없는 `QUEUED` 2시간 전(빠짐) + 후보 있는 `QUEUED` 10분 전(셈) → ≈ 600초. 따로 MATCH_EVENT `FAILED`+`retry_at` 50분 전 → ≈ 3,000초, 미래 → 0. 진행 중이 하나도 없을 때 → 두 줄 모두 0
   - 같은 digest exporter 를 `PG_EXPORTER_EXTEND_QUERY_PATH` 로 띄워 `/metrics` 를 본다
   - **열 하나를 revoke** → 그 지표만 사라지고(0 이나 옛 값으로 남으면 안 됨) `pg_up` · `pg_stat_*` 는 그대로인지
   - 수집하는 동안 `pg_stat_activity` 의 `newlearn_monitor` 연결이 **2개 이하**(상한 3, `exporter.yaml:16` 의 전제)
2. **promtool**(`infra_LINT` · `infra_TEST`) — 실패: 그대로면 안 울림 · 4→5 에서 울림 · 30분 뒤 풀림 · **수집이 한 번 끊긴 뒤 30분**(거짓 울림 없음) · **값이 줄어듦**(안 울림). 멈춤: 2,000초 안 울림 · 2,500초 5분 미만 안 울림 · 5분이면 울림. 없음: 둘 다 있으면 안 울림 · **하나씩만 빠진 두 경우** 각각 울리고 이름표가 그 지표를 가리킴
3. **되돌림 확인** — 문턱 · offset · absent 대상을 하나씩 망가뜨려 새 시험이 단언에서 깨지는지
4. **운영에 올린 뒤(머지 전)** — Prometheus 에서 `newlearn_analysis_failed_terminal` EXTRACT 4 · 나머지 0(운영 DB 와 같음), `oldest_inflight_seconds` 0 근처. **경보 식 셋을 Prometheus 에 그대로 물어** 모두 빈 결과인지(`alerts.md:64`). 실제 붙는 이름표(job · service)가 시험 입력과 맞는지
5. **머지 뒤** — Rules 화면에 셋이 `inactive`. Mattermost 끝까지는 **첫 진짜 EXTRACT 실패**로 본다(바탕값상 하루 안). 운영 DB 에 가짜 실패를 만들지 않는다
6. 결과를 `SSOT.md` 10절에 한 줄

## 되돌리는 법

| 무엇 | 어떻게 |
|---|---|
| 경보 셋 | MR 되돌리기 → Argo CD `alerts` 앱이 규칙을 지운다 |
| exporter 질의 | `exporter.yaml` · `kustomization.yaml` 을 되돌리고 `kubectl apply -k`(사람). 남은 ConfigMap 은 지워도 된다 |
| 권한 | `revoke select (...) on public.analysis_job from newlearn_monitor` — 남겨 둬도 해는 없다 |

운영 데이터 · 앱은 건드리지 않아 잃는 것이 없다.

## 리뷰에서 바뀐 것 (reviewer 조수, 2026-11-15)

| 처음 계획 | 바꾼 것 |
|---|---|
| 워커를 끌 때 일을 안 적음 | critical 이 끝없이 운다는 위험 · silence 절차를 alerts.md · ai-worker.md 에 |
| grant 를 스크립트 어디에 넣을지 없음 | 비밀번호를 바꾸기 **전**(42 · 43줄 사이), 표 이름 `public.` 붙임. 운영은 스크립트를 다시 돌리지 않고 한 줄만 |
| 질의 ② 를 말로만 | SQL 을 적고 `retry_at` 기준 · 늘 두 줄 · 조건은 `on` 안 · 원본은 `AnalysisJobRepository` 로 바로잡음 |
| 로컬 시험이 손으로 만든 표 | 마이그레이션 V1 ~ V16 으로 진짜 표, 빠진 경우 넷, revoke 시험, 연결 수 |
| SSOT 6절 안 고침 | 173 ~ 175줄과 낡는 주석 넷을 바꿀 파일에 |
| `absent` 를 이름표 없이 묶음 | 지표마다 이름표를 줘 어느 쪽이 빠졌는지 보이게, 하나씩 빠진 시험 둘 |
| `coalesce(error_code,'') <>` | `is distinct from` |
| 「권한보다 질의가 먼저면 안 된다」 | 과한 경고였다 — 꼭 지킬 순서는 exporter → 규칙, 그리고 MR 이 바뀌면 다시 apply |
