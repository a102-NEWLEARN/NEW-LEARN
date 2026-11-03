# 뉴스 수집 배치 · NewsData 키 봉인 — 스크립트 · CronJob(멈춘 채) · 들어오는 길 정책 · 경보 (Jira S15P31A102-154 · 155)

## 무엇을 / 왜

11-16 부터 NewsData 최신 기사를 하루 약 100건 받아 분석에 거는 흐름(F01 뉴스 데이터 적재·조회)을 위해, 수집 배치를 **멈춘 채** 사이트에 먼저 올려 둔다. 숫자 · 시각은 팀 확정 전이라 켜기는 Jira 156 에서 따로 한다.

배치는 Python 표준 라이브러리 스크립트 하나다(2026-11-03 사용자). NewsData → B2 기사 적재(`POST /internal/v1/articles`) → 돌려받은 id 로 B1 분석 걸기(`POST /internal/v1/articles/{articleId}/release`) 순서로 HTTP 만 부른다. 공개 Python 이미지에 ConfigMap 으로 얹어 이미지를 굽지 않는다. 같은 MR 에 NewsData 키 봉인(155)도 넣는다.

상위 계획은 `docs/plans/2026-11-02-data-1115-1116-infra-prep.md` C · D 절이다. 이 계획은 그 절을 구현 단위로 내린 것이고, 달라진 것은 아래 「계획에서 바뀐 것」에 있다.

## 정한 것 (이 계획에서, 2026-11-03)

| 무엇 | 정한 것 | 까닭 |
|---|---|---|
| 자리 | 네임스페이스는 app, 매니페스트는 새 폴더 `infra/k8s/services/ingest/` 와 **새 Argo CD 앱 `ingest`**(sync-wave 5). 스크립트 `news_ingest.py` 도 그 폴더, 시험은 `infra/ci/test_news_ingest.py` | app 네임스페이스에 backend Service 와 배치 키가 있다(상위 계획). 앱을 따로 두는 까닭은 아래 「계획에서 바뀐 것」 1. kustomize 는 폴더 밖 파일을 못 읽어 스크립트를 같은 폴더에 둔다. 시험은 `infra_TEST`(`unittest discover -s ci`)가 그대로 돈다 |
| 이미지 | `python:3.14.8-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170` | CI 태그 MR 잡(`.gitlab-ci.yml` 324줄)과 같은 이미지. 2026-11-03 Docker Hub 레지스트리 API 로 다이제스트가 그대로 있고 linux/amd64 설정의 `PYTHON_VERSION=3.14.8`(2026-10-06 빌드)을 확인했다. 같은 태그는 10-21 에 다시 구워져 지금 `fbecd461…` 을 가리킨다 — 올릴 때는 두 곳을 같이 올린다(CronJob 주석에 적음) |
| NewsData 요청 | `GET https://newsdata.io/api/1/latest?apikey=…&country=kr&language=ko`, 다음 쪽은 `&page=<nextPage>`. `size` 는 주지 않는다(11-03 같은 요청에 50건). 질의는 코드 상수다 | 11-03 에 통한 요청 그대로. 156 에서 고르는 조건(분야 · 언론사)이 정해지면 질의를 코드에서 고친다 — 지금 env 로 열어 두지 않는다 |
| 키 보내는 법 | `apikey` 쿼리. 로그로 나가는 모든 글에서 키 값과 `apikey=…` 를 `***` 로 바꾼다. 맨 바깥에서 예상 못 한 예외의 traceback 도 가린 뒤 찍는다 | 11-03 이 이 방법으로 통했다. 머리글로 보내는 법은 문서 화면이 스크립트로 그려져 확인하지 못했다. `http.client.InvalidURL` 같은 예외는 메시지에 주소를 그대로 넣는다 |
| 거르기 | B2 를 부르기 전에 본문(`content`) null · 공백만 · `category` 에 `entertainment` · `sports` · `pubDateTZ` 가 UTC 아님 · `pubDate` 모양이 `YYYY-MM-DD HH:MM:SS` 아님 · 같은 실행 안에서 같은 `link` | 11-03 인프라 담당 결정(`docs/api-internal.md` 2절). 시각 모양 · 중복은 B2 에 보낼 값을 만들 수 없거나 헛 요청이라 더한다 |
| 칸 맞추기 | `docs/api-internal.md` 2절 표 그대로. `reporter` 는 `creator[]` 의 빈 값을 빼고 `, ` 로 이어 200자에서 자르고, 남는 게 없으면 뺀다. `publishedAt` 은 `2026-11-02T23:15:46Z`. `sourceCategories` · `sourceTags` 는 배열일 때만, 빈 항목은 뺀다(`sourceTags` 는 `ai_tag`) | `creator` · `ai_tag` 는 11-03 50건 모두 배열이었다. B2 는 200자를 넘거나 빈 항목이 있으면 400 이다 |
| 순서 · 상한 | 받은 순서(최신부터)로 모으다 상한에서 멈추고, 보낼 때는 발행 시각이 이른 것부터. 상한은 env — `INGEST_MAX_ARTICLES`(B2 로 보낼 기사, 지금 50) · `INGEST_MAX_REQUESTS`(NewsData 요청, 지금 3). 코드 안 천장(기사 200 · 요청 10)을 넘거나 1보다 작으면 시작하지 않는다 | 하루 약 100건 · 시각은 팀 확정 전이라 숫자를 고정하지 않는다. 지금 값은 00 · 12시 두 번 기준 임시값이고 156 에서 정한다. 요청 3이면 한 번 실행에 크레딧 3 안팎 |
| 받기만 모드 | `INGEST_MODE=fetch-only` 면 NewsData 요청 **하나**만 보내고, 받은 수 · 거른 까닭별 수 · 처음 3건의 B2 요청 모양(본문은 글자 수만)을 찍는다. B2 · B1 은 부르지 않고 배치 키도 필요 없다. `INGEST_MODE` 가 없거나 `fetch-only` · `full` 이 아니면 시작하지 않는다 | 154 완료 기준 「크레딧 1 안팎」. 멈춘 동안 CronJob 에 이 값을 두어 손으로 돌릴 때 받기만 한다 |
| B1 실패 다시 걸기 | B2 는 됐는데 B1 이 연결 실패 · 5xx 로 끝난 기사는 그 실행 끝에 한 번 더 건다. 그래도 실패하면 기사 번호를 로그에 남긴다 | 153 이 154 로 넘긴 것. 최신 기사만 받아 다음 실행에 같은 기사가 대개 다시 오지 않는다 |
| 종료 코드 | **0** — 끝까지 돌았다(기사 몇 건의 B2 400 · 500 · B1 실패는 세어 둠). **1** — NewsData 요청 실패, backend 연결이 세 번 이어서 실패(남은 기사를 안 보내고 멈춤), 또는 걸러 남은 기사가 있는데 하나도 B1 까지 못 감(B1 202 와 409 가 「감」). **2** — 다시 해도 같은 것: 설정 오류(모드 · 키 없음 · 상한), NewsData · backend 의 401 · 403(남은 기사도 모두 같아 바로 멈춘다). Job 의 `podFailurePolicy` 가 종료 2 면 다시 시도하지 않고 실패로 끝낸다 | B2 500 은 그 기사에서 늘 날 수 있다(인코딩 안 된 긴 링크 — `docs/api-internal.md` 2절). 기사 하나 때문에 매번 실패하면 경보가 늘 울린다. 다시 해도 같은 실패에 다시 시도를 돌리면 NewsData 크레딧만 쓴다. 클러스터는 1.36.5(`infra/k8s/kubeadm/init.yaml`)라 `podFailurePolicy` 를 쓸 수 있다 |
| 시간 | HTTP 요청마다 20초. Job 은 `activeDeadlineSeconds: 900` | 기사 50 × (B2 + B1) + 다시 걸기가 상한 안에 끝나야 결과 줄이 남는다. 평소 B2 · B1 은 수십 ms 다 |
| 로그 | 줄마다 JSON 한 덩어리(`{"msg": "…", …}`). 끝에 `{"msg": "수집 결과", …}` 한 줄(요청 수 · 받은 수 · 거른 까닭별 수 · B2 · B1 결과별 수). 실패한 기사는 따로 한 줄씩(링크 · 기사 번호 · 상태). 출력은 버퍼 없이(`python -u`) | 상위 계획 「실행 한 번의 받은 수 · 넣은 수 · B1 결과는 배치 Job 로그 한 줄」. 줄 전체가 JSON 이라야 Loki `json` 파서가 읽는다. 시간 상한에 잘려도 앞서 찍은 줄이 남는다 |
| CronJob | `news-ingest`. `suspend: true` · `schedule: "0 0,12 * * *"` · `timeZone: Asia/Seoul` · `concurrencyPolicy: Forbid` · `startingDeadlineSeconds: 3600` · 기록 성공 3 · 실패 3 · `backoffLimit: 1` · `restartPolicy: Never`. 이름표 `app: news-ingest`. Pod 는 비루트(65534) · 읽기 전용 파일 시스템 · `allowPrivilegeEscalation: false` · `capabilities.drop: [ALL]` · `seccompProfile: RuntimeDefault` · 쿠버네티스 토큰 안 붙임. 자원 요청 CPU 20m · 메모리 32Mi, 상한 메모리 128Mi | 상위 계획 C 절과 백업 CronJob 모양. 일시적인 실패(연결 · 5xx)만 한 번 다시 — 다시 돌면 NewsData 를 또 부르지만, 같은 기사는 B2 200 · B1 409 로 건너뛰어 안전하다. Pod 보안은 backend · CI exporter 모양 |
| 스크립트 얹기 | `configMapGenerator` 로 ConfigMap `news-ingest`(이름 고정 — `disableNameSuffixHash`) | 해시 이름이면 스크립트를 고친 MR 이 옛 ConfigMap 을 지워, 그때 돌던 잡의 다시 시도 Pod 가 붙일 파일이 없어 시간 상한까지 멈춘다. 고정 이름이면 다음 Pod 가 새 파일을 붙인다 |
| 키 | env 둘 다 `secretKeyRef` · `optional: true` — `NEWSDATA_API_KEY`(새 Secret `newsdata-api`) · `INTERNAL_BATCH_KEY`(`internal-api` 의 그 키 하나만) | 같은 Secret 의 워커 키가 배치 Pod 로 가지 않게. Secret 이 없어도 Pod 가 설정 오류로 멈추지 않고 스크립트가 까닭을 찍고 종료 2 |
| 경보 | `NewlearnIngestMissing`(warning, `for: 10m`) — 멈추지 않았고(`kube_cronjob_spec_suspend == 0`) ① 마지막 **예약** 실행이 2시간 넘게 지났는데 그 뒤 성공이 없거나(`last_schedule unless (last_successful >= last_schedule)` — 성공 기록이 아예 없어도 울림) ② 예약 실행이 13시간 넘게 없을 때. 두 시각의 비교는 기본 매칭(`on` 없이), `and` · `unless` 만 `on (namespace, cronjob)` | 「마지막 성공」만 보면 안 된다 — 손으로 돌린 잡도 성공 시각을 바꾼다. 2026-11-03 Prometheus 에서 주간 S3 백업의 마지막 성공(11-02 14:09)이 마지막 예약(11-02 05:00)보다 늦었다. 예약 시각은 손으로 돌려도 안 바뀐다. 2시간은 시작 마감 1시간 + 실행 상한 15분보다 길게. 비교에 `on` 을 쓰면 kube-state-metrics Pod 가 바뀌는 동안 같은 줄이 둘이 되어 평가 오류가 난다(리뷰 조수가 promtool 로 확인). 13시간은 하루 두 번 기준이라 156 에서 시각을 바꾸면 같이 고친다(CronJob `schedule` 줄 주석) |
| 봉인 · MR | 봉인 하위 명령 `newsdata` 를 먼저 쓰고, 사용자가 EC2 에서 봉인한 파일을 같은 MR 에 넣는다 | MR 한 번에 CronJob · Secret 이 같이 반영된다. 봉인을 머지 뒤로 미루면 MR 이 한 벌(작업 → infra → dev, 분야 맞추기) 더 든다 |

## 계획에서 바뀐 것 (reviewer 조수 계획 리뷰 2026-11-03, 「고쳐야 함」 4 · 선택 반영)

1. **Argo CD 앱을 따로 둔다(`ingest`)** — 처음 안은 app 앱 폴더였다. 배포 알림 `on-deployed` 는 앱 이미지 요약 수가 Deployment 수와 같을 때만 울린다(`infra/k8s/bootstrap/argocd-values.prod.yaml` 73줄). 2026-11-03 클러스터를 읽어 보니 data 앱 요약에 백업 잡의 `amazon/aws-cli:2.37.11` 이 들어 있다 — 끝난 잡 Pod 의 이미지도 요약에 들어간다. app 앱에 넣으면 첫 손 실행부터 이미지 3 · Deployment 2 가 되어 backend · frontend 배포 알림이 소리 없이 끊긴다. 따로 두면 급히 멈출 때 자동 동기화를 루트 → `ingest` 만 끄면 되어 backend · frontend 배포도 멈추지 않는다(상위 계획은 app 앱을 꺼야 했다). CronJob 은 Argo CD 3.5.5 에서 상태 검사가 없다(data 앱의 CronJob 둘 상태 칸이 빔) — 멈춘 CronJob 이 앱 상태를 바꾸지 않는다
2. **경보 식** — 「그 뒤 성공 없음」을 두 시각의 `<` 비교로 쓰면 성공 기록이 아예 없을 때(손 실행 없이 켜고 첫 예약이 실패) 비교할 줄이 없어 안 울린다. `unless (성공 >= 예약)` 꼴로 바꿨다. 1시간 → 2시간(시작 마감 · 실행 상한), 비교의 `on` 을 뺐다. 시험에 「성공 기록 없이 첫 예약 실패」를 더하고, 「멈춘 동안」 시험은 옛 예약 · 성공 기록이 있는 모양(켠 뒤 급히 멈춘 경우)으로 — 기록이 없으면 suspend 조건을 빼도 시험이 그대로 통과한다
3. **NewsData 요청을 적었다** — 주소 · `country` · `language` · `page`, 질의는 코드 상수
4. **빠진 파일** — `SSOT.md` 6절 모니터링 「우리 경보 여섯」 · 클러스터 구성 네임스페이스 줄(「배치는 아직 없다」) · 같은 절 들어오는 길 정책 줄 끝(「수집 배치를 만들면 더한다」) · AI 워커 줄(「수집 배치가 없어 B1 은 사람이 건다」), `docs/specs/F01-article-release-api.md` 3 · 26줄(「수집 배치는 보류」), `.claude/stack.md` §3 `infra_TEST` 주석(「태그 MR 스크립트」), `seal-secrets.sh` 머리의 쓰는 법 안내
5. 선택 반영 — 409 는 「감」, 401 · 403 은 종료 2 + `podFailurePolicy`, 요청마다 20초, `python -u`, 줄 전체 JSON, Pod 보안 · 자원 명시, traceback 가리기, ConfigMap 고정 이름, 이미지 두 곳 서로 가리킴, 불러올 때 env 를 읽지 않음(시험이 가짜 env 를 미리 안 깔게), `NEWSDATA_URL` 같은 주소 바꾸기 env 는 두지 않음(키가 그 주소로 간다 — 로컬 확인은 스크립트의 보내기 함수를 바꿔 끼워 한다)
6. 반영하지 않은 것 — 머리글 `X-ACCESS-KEY`(지원 여부 미확인, 시험에 크레딧이 든다), 질의 `excludecategory`(미확인), `kube_cronjob_next_schedule_time`(이 클러스터에 있고 시간대도 반영하지만, 예약 기록이 없으면 CronJob 을 만든 때부터 셈한다고 알고 있다 — 미확인. 그렇다면 켜자마자 울린다), `.gitignore` 의 `__pycache__`(게이트는 `-B` 로 돈다), `.gitlab-ci.yml` 169줄 주석(이번에 그 파일을 안 바꾼다)

## MR 전 리뷰에서 바뀐 것 (reviewer 조수 2026-11-03, 「고쳐야 함」 2 · 선택 반영)

- **로그 본문을 가린 뒤 자른다** — 자른 뒤 가리면, 자르는 자리(300자)에 키가 걸칠 때 키 앞부분이 남았다(재현됨). 스크립트 `Run.short()` 와 봉인 명령의 오류 출력 둘 다. 시험은 채움 280 ~ 299자 뒤에 키를 둔 오류 본문
- **`docs/api.md` 282줄** — Jira 34 줄의 「수집 배치는 보류」(F01 스펙과 같은 낡은 문구)
- 선택 반영 — backend 연결이 세 번 이어서 실패하면 멈추고 결과 줄을 남김(정책 실수로 패킷이 버려지면 50 × 20초가 Job 시간 상한 900초를 넘는다), NewsData 401 · 403 은 종료 2(다시 해도 같다 — 구독이 끝난 뒤도), 3xx 를 따라가지 않음(urllib 은 따라가며 배치 키를 새 주소로 옮긴다 — 로컬 서버 둘로 302 를 받고 넘길 곳에 요청 0건 확인), 기사 모양이 아닌 항목은 `bad_item` 으로 셈(전에는 실행 전체가 「예상 못 한 오류」), 시험 더함(JSON 아닌 응답 · 숫자 아닌 `articleId` · 모양이 바뀐 키의 `apikey=` 가리기), CronJob 의 다시 시도 주석을 실제(종료 1 전부)대로, `ingest.md` 의 로그 줄 표 · 경보 대응에 빠진 줄, 같은 사실 두 곳 정리(앱을 따로 둔 까닭은 SSOT 로, B1 다시 걸기는 `api-internal.md` 로), `.env.example` 23줄, `SSOT.md` 「앱 10개」 · 1절 역할 칸
- 반영하지 않은 것 — `.gitlab-ci.yml` 쪽에서 CronJob 이미지를 거꾸로 가리키는 주석(이번에 그 파일을 안 바꾼다), `argocd-values.prod.yaml` 66줄 「앱 10개」 주석(Argo CD 설정 파일이라 안 바꿀 것), 시크릿 검사 훅에 NewsData 키 모양(키 형식 미확인 · 하네스 범위 밖)
- 고친 넷(가린 뒤 자르기 · 연결 실패 멈춤 · NewsData 401/403 · `bad_item`)을 하나씩 되돌려 해당 시험이 단언에서 실패하는 것 확인

상위 계획과 달라진 것: 매니페스트 자리(app 폴더 → `ingest` 폴더 · 앱), 경보 모양(「마지막 성공이 오래됨」 → 예약 시각과 견줌), 급히 멈추는 순서(루트 → app → 루트 → `ingest`), 반영 전 확인(서버 `kubectl diff` → 로컬 `kubectl kustomize` 와 반영 뒤 읽기 — 서버에 저장소가 없다), `backoffLimit: 1` · `podFailurePolicy`.

## 바꿀 파일

새 파일

- `infra/k8s/apps/templates/ingest.yaml` — Argo CD 앱 `ingest`(path `infra/k8s/services/ingest`, 대상 네임스페이스 app, sync-wave 5, 자동 동기화 · prune · selfHeal, 배포 알림 구독 없음)
- `infra/k8s/services/ingest/kustomization.yaml` — resources(CronJob · 봉인 Secret), `configMapGenerator`
- `infra/k8s/services/ingest/news_ingest.py` — 수집 스크립트(위 「정한 것」)
- `infra/k8s/services/ingest/news-ingest.yaml` — CronJob(위)
- `infra/k8s/services/ingest/sealed-newsdata-api.yaml` — 사용자가 EC2 에서 봉인한 Secret `newsdata-api`(app)
- `infra/ci/test_news_ingest.py` — 스크립트 시험(unittest, 칸 모양만 따서 지어낸 견본)
- `infra/server/ingest.md` — 운영 메모: 손으로 받기만 돌리기 · 로그 읽기 · 켜기(156) · 급히 멈추기 · 경보가 오면 · B1 실패 기사 다시 걸기 · 키 바꾸기
- 이 계획 파일

고치는 파일

- `infra/k8s/services/app/netpol.yaml` — `backend-ingress` 에 `app: news-ingest` 이름표, 머리 주석
- `infra/k8s/services/app/backend.yaml` 59줄 — 주석 「배치 키는 B1 만」 → 「B2 · B1」
- `infra/k8s/services/data/netpol.yaml` 8줄 — 「수집 배치를 만들면 더한다」 → 수집 배치는 DB · Redis 에 직접 안 붙는다
- `infra/k8s/alerts/rules.yaml` — `NewlearnIngestMissing`, 머리 주석 「경보 여섯」 → 일곱
- `infra/ci/alert_rules_test.yaml` — 그 경보 시험 여섯(아래 검증 2)
- `infra/server/seal-secrets.sh` — 하위 명령 `newsdata`(봉인 전에 그 키로 최신 기사 요청 하나 — 200 · `"status":"success"` 가 아니면 봉인 안 함), 사용법 줄 · `usage()` 범위(5 ~ 15 → 5 ~ 16), 머리 안내에 `newsdata 는 ingest.md`, `internal-api` 주석 「배치 키는 B1」 → 「B2 · B1」
- `infra/server/README.md` — `seal-secrets.sh` 줄에 `newsdata`, 키 안내 한 줄(`ingest.md` 를 가리킴)
- `infra/server/alerts.md` — 「경보 여섯」 두 곳 → 일곱
- `.env.example` — `NEWSDATA_API_KEY=`(로컬에서 받기만 돌려 볼 때만), 22줄 주석 「B1 만」 → 「B2 · B1」
- `docs/api-internal.md` 2절 B2 끝 문단 — 「B1 이 실패한 기사를 실행 안에서 다시 걸지는 Jira 154 가 정한다」 → 정한 것
- `docs/specs/F01-article-release-api.md` 3 · 26줄 — 「수집 배치는 보류」 → Jira 154 · `infra/server/ingest.md` 를 가리킴
- `SSOT.md`
  - 1절 표 수집 배치 줄 — 「구현 언어 미정」 → Python 표준 라이브러리 스크립트 · CronJob `news-ingest`(켜기는 156), 표 아래 까닭 한 줄
  - 6절 클러스터 구성 — 네임스페이스 줄(「배치는 아직 없다」 → app 의 CronJob, Argo CD 앱 `ingest`), 배포 설정 줄(앱 하나씩의 예외), 들어오는 길 정책 줄(backend 가 받는 곳에 수집 배치, 줄 끝 「만들면 더한다」 지움), AI 워커 줄(「수집 배치가 없어」 → 멈춘 채 있어), 모니터링 「경보 여섯」 → 일곱
  - 8절 — 구현 언어 줄을 지우고 「수집 켜기 — 하루 건수 · 시각 · 고르는 조건(Jira 156)」 줄
  - 10절 — 받기만 실행에서 잰 것
- `.claude/stack.md` §2 53줄 — 「구현 언어가 정해지면 영역으로 넣을지 정한다」 → infra 영역(스크립트 · 시험 자리), §3 `infra_TEST` 주석에 수집 스크립트 시험(선언 뒤 설명이라 게이트가 안 돈다 — §4 표)

## 작업 순서

- [x] 1. 시험 먼저 — `infra/ci/test_news_ingest.py`(거르기 · 칸 맞추기 · 키 가리기 · 상한 · 받기만 · 전체 흐름 · 종료 코드), 빈 스크립트로 단언 실패 확인. 경보 시험 여섯을 먼저 쓰고 규칙 없이 promtool 이 실패하는지 — 빈 스크립트로 37개 모두 실패(단언 40 · 칸 없음 오류 4), 경보는 울려야 할 셋이 `got:[]`
- [x] 2. 스크립트 · 경보 규칙 구현 → `infra_TEST` 통과. 고친 곳(거르기 · 키 가리기 · 요청 상한 · B1 다시 걸기 · 409 를 「감」으로 · 경보 suspend 조건 · `unless` 꼴)을 하나씩 되돌려 해당 시험이 단언에서 실패하는지 — 일곱 모두 해당 시험이 FAIL(오류 아님), 복구 뒤 통과
- [x] 3. CronJob · kustomization · Argo CD 앱 · 정책 · 봉인 하위 명령 · 주석 · 문서 → `infra_LINT`, `kubectl kustomize` 로 그린 두 폴더(ingest · app) — ConfigMap 이름 고정 · 볼륨 · suspend · 받기만 · `podFailurePolicy` 확인, app 은 정책 이름표 두 줄만 다름, 루트 차트가 `ingest` 앱을 그림. 구현 중 `infra/server/ai-worker.md` 56줄(「수집 배치가 없는 동안」)도 같은 낡은 사실이라 고쳤다
- [x] 4. (선택) 로컬 compose backend 에 전체 모드 — NewsData 대신 지어낸 견본을 돌려주는 보내기 함수를 끼워 B2 201 · 200 · B1 202 · 409 를 실제 backend 코드로 본다. Docker Desktop · backend 띄우기가 오래 걸리면 건너뛰고 MR 에 적는다 — 일회용 compose 프로젝트(dev 의 backend 코드)에 두 번: 1번째 B2 새로 2 · 400 1(제목 301자) · B1 202 2, 2번째 B2 200 2 · B1 409 2, 둘 다 종료 0. 끝난 뒤 그 프로젝트와 볼륨을 지웠다
- [ ] 5. 사람 몫 — 바뀐 서버 스크립트를 EC2 로 보내고 `seal-secrets.sh newsdata` → 봉인 파일을 worktree 로 가져옴(파일 카드)
- [ ] 6. MR reviewer → MR(작업 → infra) → 파이프라인 success → 머지 직전 비교 SHA · 열린 MR 확인 → infra → dev → 분야 브랜치 넷 맞추기
- [ ] 7. Argo CD 반영 확인(읽기) → 사람 몫: 받기만 잡 하나 만들기(파일 카드) → 로그 확인
- [ ] 8. `/feature-done` — Jira 154 · 155 댓글 · 완료, `SSOT.md` 10절 잰 것

## 안 바꿀 것

- 수집 켜기 — `suspend: false` · `INGEST_MODE=full` · 숫자 · 시각 확정은 Jira 156. 이번에는 멈춘 채 받기만으로 둔다
- 운영 DB 에 진짜 기사를 넣는 시험(B2 → B1) — GMS 크레딧이 들고 11-15 적재 때 비울 데이터다. 하려면 사용자 · AI 팀에 먼저 묻고 1 ~ 3건만. 기본 확인은 받기만 손 실행
- backend 코드 · B2 · B1 계약 · 인증 설정 — 153 에서 끝났다. 바뀌는 것은 주석 · 문서의 「배치 키는 B1 만」 셋뿐(infra 매니페스트 · 봉인 스크립트 · `.env.example`)
- `internal-api` Secret · 봉인 파일 — 다시 봉인하지 않는다. 배치 Pod 는 그 Secret 의 키 하나만 읽는다
- app 앱의 다른 것 · Argo CD 설정(알림 조건 · 상태 검사) · 루트 앱 — 앱 템플릿 하나만 더한다
- 나가는 길 정책 — 지금처럼 막지 않는다(`SSOT.md` 6절). 배치 Pod 는 NewsData(밖)와 backend 만 부른다
- `ingest_run` 표 — 쓰지 않는다(상위 계획)
- 데이터셋 적재(SSOT 1절 표의 「데이터셋 적재(검증용)」) — 이 스크립트는 NewsData 만 읽는다
- 대표 카테고리 대응 행(`docs/data-model.md` 5절 7번) — BE · 팀 몫. 11-16 기사는 카테고리 탭에 안 나오고 최신 기사(A7)에는 나온다
- `.gitlab-ci.yml` — 새 이미지 · 새 CI 영역 없음. CI 의 Python 이미지 판 · 주석도 그대로
- 백업 CronJob · 다른 경보 기준, 옛 계획 문서

## 리스크

- **키가 로그에 남음** — 요청 주소 · 오류 글 · traceback 에 `apikey` 가 실린다. 로그로 나가는 모든 글을 한 함수로 가리고, 오류 · 견본 출력 · 예상 못 한 예외 경로까지 시험으로 본다. 봉인 명령은 키를 curl 설정의 표준 입력으로 넘겨 `ps` 에 안 보이게 한다(`stdict` 와 같은 방식)
- **크레딧** — 봉인 확인 1 · 받기만 1. 받기만은 실행마다 요청 하나라 다시 시도가 붙어도 최대 2. 켠 뒤는 요청 상한 3 × 하루 두 번 × 다시 시도 최대 2배라 하루 12 안팎(월 2만 대비 작다)
- **멈춘 채인데 실수로 돎** — `suspend: true` 와 `INGEST_MODE=fetch-only` 두 겹이다. 손으로 돌려도 B2 · B1 을 부르지 않는다
- **경보 잘못 울림** — 오래 멈췄다 다시 켜면 마지막 예약 시각이 13시간 넘게 지나 있어 첫 예약 실행 전까지 울릴 수 있다. 이 CronJob 은 한 번 켜고 끝까지 돌 예정이라(156) 규칙 주석 · `ingest.md` 에 적고 넘긴다. 켰는데 예약이 한 번도 안 생기면(예약 기록이 없으면) 안 울린다 — 규칙 주석에 한계로 적는다. 156 에서 시각을 바꾸고 13시간을 안 고치면 매일 울리거나 늦게 울린다 — CronJob `schedule` 줄 주석에 같이 고치라고 적는다
- **Argo CD 앱이 하나 늘어남** — 루트 앱이 템플릿을 읽어 `ingest` 앱을 만든다. 처음 동기화에서 봉인 Secret 이 풀리기 전에 CronJob 이 먼저 생겨도 멈춘 채라 상관없다. 「앱 11개」로 적힌 곳이 있으면 12개로(구현 때 다시 찾는다)
- **CI 의 Python 판** — infra CI 잡은 Alpine 의 `python3`(판은 잡이 받는 대로), 관리자 PC 는 3.11, 이미지는 3.14 다. 셋 모두에서 도는 문법만 쓴다
- **NewsData 응답 모양이 바뀜** — 칸이 없거나 타입이 다르면 그 기사는 B2 400 으로 세어지고, 응답 전체가 깨지면 종료 1(경보). 받기만 실행에서 실제 응답의 견본(`sourceTags` 모양 포함)을 본다
- **봉인 중 사람 실수** — 다른 키 · 빈 키는 봉인 전 확인 요청에서 걸러진다

## 어떻게 검증하나

1. **스크립트 시험**(`infra/ci/test_news_ingest.py`, `infra_TEST`) — 구현 전 단언 실패 → 구현 뒤 통과
   - 거르기: 본문 null · 공백만, 연예 · 스포츠(다른 분류와 같이 붙어도), `pubDateTZ` 가 UTC 아님, 시각 모양, 같은 `link`, 통과하는 기사
   - 칸 맞추기: B2 칸 아홉, `reporter` 잇기 · 200자 자르기 · 빈 배열이면 없음, `sourceTags` 는 `ai_tag`(키워드 아님) · 배열 아니면 없음, 시각 `Z`
   - 키 가리기: 받기만 실행 · NewsData 오류(본문에 키가 섞여 와도) · 연결 실패 예외 · 예상 못 한 예외의 traceback 어디에도 키가 안 남음, 요청 주소는 `apikey=***` 로 찍힘
   - 상한: 받기만은 `nextPage` 가 있어도 요청 하나, 전체 모드는 요청 상한에서 멈춤, B2 호출 수 ≤ 기사 상한, 천장을 넘거나 0 인 env · 잘못된 `INGEST_MODE` · 키 없음은 종료 2
   - 전체 흐름: B2 201 · 200 → B1, B2 400 이면 B1 안 부름, B1 409 는 「이미」로 셈, B1 5xx 는 끝에 한 번 더, B2 · B1 401 · 403 이면 바로 종료 2, 하나도 못 가면 종료 1, 모두 409 면 종료 0, 발행 순서로 보냄, 결과 줄이 JSON 이고 수가 맞음
   - 고친 곳을 하나씩 되돌려 그 시험이 단언에서 실패하는지(작업 순서 2)
2. **경보 시험**(`infra/ci/alert_rules_test.yaml`, `bash ci/alert_rules.sh test`)
   - 멈춘 동안(옛 예약 · 성공 기록 있음, 예약 뒤 성공 없음)은 안 울림 — suspend 조건을 빼면 이 시험이 실패하는지
   - 성공 기록 없이 켜고 첫 예약이 실패하면 울림(2시간 + 10분) — `unless` 꼴을 `<` 비교로 바꾸면 실패하는지
   - 손 실행 성공 기록만 있고 첫 예약 전이면 안 울림
   - 손 실행 성공 뒤 켜고 첫 예약이 실패하면 울림
   - 예약 실행이 성공하면 안 울림
   - 성공 뒤 예약이 13시간 넘게 없으면 울림
3. **게이트** — `.claude/stack.md` §3 `infra_FORMAT_CHECK` · `infra_LINT`(promtool check 포함) · `infra_TEST`
4. **그린 매니페스트** — `kubectl kustomize infra/k8s/services/ingest`: ConfigMap `news-ingest`(스크립트 한 파일) · CronJob 볼륨이 그 이름 · `suspend: true` · `INGEST_MODE=fetch-only` · `podFailurePolicy`. `kubectl kustomize infra/k8s/services/app`: `backend-ingress` 에 `app: news-ingest`, 그 밖의 차이 없음
5. **봉인(155)** — 봉인 전 확인 요청이 200 · `"status":"success"`(크레딧 1 안팎), 반영 뒤 `kubectl -n app get secret newsdata-api` 가 있음(값은 안 봄)
6. **사이트 반영(154)** — Argo CD 앱 전부 Synced · Healthy(`ingest` 포함), app 앱 이미지 요약이 그대로 backend · frontend 둘, `kubectl -n app get cronjob news-ingest` 의 `SUSPEND True`, `kubectl -n app get cnp backend-ingress` `VALID`, Prometheus 에서 `news-ingest` 의 suspend 1 · 예약 · 성공 시각 지표 없음(경보 시험의 가정), 규칙 `NewlearnIngestMissing` `health: ok` · 울리는 경보 없음
7. **받기만 손 실행** — 사용자가 잡 하나를 만들고 Claude 가 로그를 읽는다: NewsData 요청 1 · 받은 수 · 거른 까닭별 수 · 견본 3건의 칸, 로그에 키 없음(`apikey=***`), 잡 성공. 받은 수 · 거른 수를 `SSOT.md` 10절에. 손 실행 뒤에도 app 앱 이미지 요약이 둘인지
8. **분야 브랜치** — dev 와 infra · backend · frontend · ai 의 내용 차이 0

## 되돌리는 법

- **154 전체** — 이 MR 을 되돌리는 MR. 루트 앱이 `ingest` 앱을 지우고 그 앱이 CronJob · ConfigMap · 봉인 Secret 을 지운다(손으로 만든 잡도 CronJob 소유라 같이 지워진다). app 앱은 정책 이름표만 돌아간다. 멈춘 채 받기만이라 사이트 데이터는 바뀐 것이 없다
- **받기만 손 실행** — 잡을 지우면 끝(`kubectl -n app delete job <이름>`). 🔴 쓴 NewsData 크레딧(1 안팎)은 돌아오지 않는다
- **155 키** — 봉인 파일을 지우는 MR. NewsData 쪽 키를 바꾸려면 팀장 계정에서. 🔴 봉인 확인에 쓴 크레딧(1 안팎)은 돌아오지 않는다
- **급히 멈춤**(켠 뒤, 156) — `suspend: true` MR. MR 을 기다릴 수 없으면 Argo CD 자동 동기화를 루트 앱 → `ingest` 앱 순서로 끈 뒤 `kubectl -n app patch cronjob news-ingest -p '{"spec":{"suspend":true}}'`, 다시 켤 때는 MR 머지 뒤 `ingest` 앱 → 루트 앱. backend · frontend 배포는 그동안에도 돈다. `infra/server/ingest.md` 에 옮긴다
