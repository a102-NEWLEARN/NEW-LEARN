# 문서 손질 — CI 대시보드 「전체 코어」 · stack.md L3 · 계획 체크칸 (Jira S15P31A102-162)

## 무엇을 / 왜

11-02 · 11-03 일을 하다 「지나가다 본 것」으로 미뤄 둔 손질을 한 MR 로 끝낸다. 대시보드 점선 하나가 틀린 숫자(4)를 그리고 있다. 하네스 선언표의 배포 뒤 확인 명령은 10-22 상태(`/api` 401)에 멈춰 있다. 끝난 세 계획은 체크칸이 비어 있다. 158 은 완료 정의 점검(`/feature-done`)과 MR 리뷰도 빠졌다.

## 바꿀 파일

- `infra/k8s/bootstrap/ci-exporter/ci-dashboard.json`
  - 「노드 CPU 사용 (코어)」 점선 식 `count(count by (cpu) (node_cpu_seconds_total))` → `count(node_cpu_seconds_total{mode="idle"})`. Prometheus 에 미리 물어봄(11-04): 옛 식 4, 새 식 6, 노드별 2와 4
  - 같은 패널 설명 「빨간 점선은 cpu 번호 수라 실제 코어 합(두 노드 6)이 아니다」 → 「빨간 점선은 지금 수집 중인 노드들의 코어 합 — 노드 하나가 수집에서 빠지면 위 선과 함께 줄어든다」(숫자는 적지 않음)
  - 그 행 제목 「서버 — 관리 서버(EC2 t3.large, 2 vCPU)」 → 「서버 — 두 노드(관리 서버 · 워커)」. 행 아래 네 패널(노드 CPU · CPU 예약 · 잡 Pod · 스로틀)이 이미 두 노드를 함께 본다
- `.claude/stack.md` 5절 L3
  - 「확인 명령」 칸의 「실제 API 는 첫 공개 API 가 … (2026-10-22 … `/api` 가 401)」 → `curl -fsS https://newlearn.io.kr/api/v1/categories`(A1 카테고리, 손님 공개)
  - 「정상 판정 기준」에 「A1 200 · `items` 가 비지 않음」을 더한다. 개수는 `docs/api-screen.md` A1 에 있으니 여기 적지 않는다
- `docs/plans/2026-11-03-article-ingest-api.md`(153) — 빈칸 넷에 체크. MR 번호와 계획과 달라진 점만 한 줄씩(!557 → !558, 맞추기 !560 · !561 · !562, !559 는 차이 0 이라 닫음, 배포 태그 !563 은 팀원이 머지)
- `docs/plans/2026-11-03-csp-enforce.md`(120) — 5 · 6번에 체크(맞추기 !606 · !607). 7번(11-15 뒤 `/issues/:id` 확인)은 빈칸 그대로
- `docs/plans/2026-11-03-node2shell-node-26-12-1.md`(158)
  - 첫 칸은 「MR 리뷰 빠짐 → 11-04 Jira 162 에서 사후 리뷰」를 붙여 체크(!565 → infra)
  - 둘째 칸 체크(!566 → !567 ~ !570, 팀 안내는 Jira 158 11-03 댓글)
  - 셋째 칸 체크(!571 · !572 닫음)
- `docs/plans/2026-11-04-doc-touchups.md` — 이 계획
- (158 사후 점검에서 더함) `docs/dev-environment.md` 화면 줄 — 판 줄을 나눠 적고(25 · 26.12.0 까지는 영향 판), 「확인한 버전」을 24.22.1 로, compose `node:26-alpine` 은 `docker compose --profile full pull` 이 필요하다고(표 아래 문단). 158 계획의 같은 안내도 바로잡음

MR 번호는 GitLab API(`merge_requests?iids[]=…` 의 소스 · 대상 브랜치 · `merged_by`)로 11-04 대조했다.

## 작업 순서

- [x] Jira 162 진행 중 → worktree `C:/tmp/wt-162`, 브랜치 `docs/infra/S15P31A102-162-doc-touchups` ← `origin/infra`, 계획 파일 커밋
- [x] 대시보드 · stack.md · 계획 셋 고치기 → JSON 파싱 · infra 게이트(stack.md 3절) → 커밋
- [x] 158 사후 점검 — reviewer 조수에게 !565 의 바뀐 세 파일(`.gitlab-ci.yml` · `frontend/Dockerfile` · `docs/dev-environment.md`)을 보이고, `/feature-done` 158. 빠진 것이 문서면 이 MR 에 더하고, 코드 · 설정이면 멈추고 묻는다 — 이미지 · 다이제스트 통과(레지스트리 재확인), `dev-environment.md` 한 줄만 고침
- [ ] reviewer 조수(이 MR) → MR(→ infra) → 파이프라인 success → 머지 직전 원격 infra · dev SHA · 열린 MR 을 같은 스크립트에서 읽고 머지 → infra → dev 같은 방식 → 분야 브랜치 맞추기(infra · backend · ai, 내용 차이부터. frontend 는 FE 몫)
- [ ] 대시보드 반영 — 이 폴더는 Argo CD 앱이 아니라 손 `apply -k` 다(`infra/server/README.md` 「모니터링」 6번)
  - Claude 가 머지된 origin/dev 에서 `git archive` 로 폴더만 뽑아 서버 `/tmp/ci-exporter-162` 로 보낸다
  - `kubectl diff -k` 로 대시보드 ConfigMap 하나만 바뀌는지 본다. 차이가 있으면 종료 코드 1 이 정상이다. 자동 권한 검사가 막으면 diff 도 사용자 몫으로 돌린다
  - 사용자가 EC2 에서 `kubectl apply -k /tmp/ci-exporter-162` 한 줄(파일 카드)
- [ ] 확인(아래) → Jira 162 댓글 · 완료, 이 계획 체크, 개인 기록

## 안 바꿀 것

- `stack.md` 의 남은 빈칸 셋 — AI 평가셋(Jira 33) 몫
- 다른 세션이 진행 중인 계획 — 156 · 152(`2026-11-04-ingest-load-only-data-load.md`), 115(`2026-11-02-ai-real-mode-switch.md`), 백엔드 정리(`2026-11-02-backend-refactor.md`)
- 대시보드의 다른 패널 식 · exporter 설정(`config.yml`) · `exporter.yaml`
- `stack.md` 3절 `infra_RUN` 한 줄 — health 만 보는 지금 그대로(L3 표에서 API 를 따로 본다)
- `SSOT.md` 의 10-22 기록 줄(그때 사실)

## 리스크

- `apply -k` 는 폴더 전체를 다시 적용한다. `config.yml` 이 같으면 ConfigMap 이름(해시)이 같아 exporter Pod 는 다시 뜨지 않고, Secret 은 kustomization 밖이다. diff 에 다른 것이 나오면 멈춘다
- `.claude/` 아래가 바뀌면 MR 파이프라인이 영역 전부를 돈다(`.claude/hooks/pre-commit` 영역 판정) — 문서만이어도 잡이 늘어 수 분 더 걸린다
- 체크칸에 하지 않은 일을 「했다」로 읽히게 적는 것 — 반쯤 된 칸은 빠진 것을 붙인다

## 어떻게 검증하나

- 대시보드: 새 식이 Prometheus 에서 6(11-04 미리 확인). 반영 뒤 서버에서 Grafana API(관리 서버 안 port-forward)로 대시보드 JSON 을 읽어 새 식 · 새 행 제목인지 보고, 화면은 사용자 Chrome 으로 점선 6 을 본다
- stack.md: 새 확인 명령을 그대로 돌려 200 · `items` 가 비지 않음
- 계획 셋: 체크칸의 MR 번호를 GitLab API 와 다시 대조
- MR 파이프라인 success, reviewer 조수 「통과」

## 되돌리는 법

- 문서는 MR 되돌리기(Revert) 하나
- 대시보드는 옛 JSON 으로 같은 `apply -k`. 대시보드 ConfigMap 만 바뀌고 데이터 · 지표에는 영향이 없다

## 계획에서 바뀐 것 (reviewer 계획 리뷰 반영, 11-04)

- 158 첫 칸에 MR 리뷰가 빠진 것을 붙이고, 사후 리뷰를 작업 순서에 넣음
- 분야 개수를 stack.md 에 적지 않음(약속 4 — api-screen 이 이미 가짐), 체크칸 근거를 MR 번호 · 달라진 점으로 줄임
- 대시보드 설명에서 숫자를 빼고, 두 노드를 함께 보는 행의 제목도 고침
- 리스크에 「`.claude/` 변경 → 영역 전부」를, 반영 절차에 `git archive` · diff 종료 코드 · 권한 검사 대비를 더함
- 158 사후 리뷰 「고쳐야 함」 1 — `dev-environment.md` 의 「컨테이너는 26.12.1」이 compose(판 고정 없는 `node:26-alpine`)와 다름 → 바꿀 파일에 더함
- MR 리뷰 「고쳐야 함」 1 — `docker compose pull` 은 `full` 프로필의 화면 이미지를 받지 않음(dry-run 확인) → `--profile full pull` 로, 안내는 표 아래로
- 리뷰가 「MR 번호가 하나씩 밀렸다」고 했지만 GitLab API 로 대조하니 원래 번호가 맞았다(머지 커밋 메시지를 한 칸 밀려 읽은 것) — 번호는 그대로
