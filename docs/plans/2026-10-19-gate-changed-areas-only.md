# 커밋 검사는 바뀐 영역만 돈다 — 영역 밖 파일 때문에 전 영역을 돌지 않게

## 무엇을 / 왜

지금 커밋 게이트(`.claude/hooks/pre-commit` 6단계)는 `.gitignore` · `compose.yaml` · `.env.example` 처럼 영역 폴더 밖 파일이나 `.claude/stack.md` 가 바뀌면 네 영역을 다 돈다. 그래서 Terraform 이 없는 PC 에서 막히고(재현: rc=1, 143초), 다 깔린 PC 에서도 한 줄 커밋에 2분 넘게 걸린다.
사용자 결정(2026-10-19): **커밋 검사는 바뀐 영역만 돈다.** 대신 「영역 밖 파일이 영역 검사 결과를 바꾸는 경우」를 하나씩 찾아 그 영역만 돌게 한다. 검사를 아예 안 하는 구멍이 생기지 않게 하는 것이 이 계획의 핵심이다.

## 어느 영역이 도나 (커밋 게이트)

| 바뀐 것 | 도는 것 | 전에는 |
|---|---|---|
| 영역 폴더(`<영역>_PATH`) 안 파일 | 그 영역 | 같다 |
| `<영역>_ALSO_PATHS` 에 적은 영역 밖 파일 (새 선언) | 그 영역 | 전 영역 |
| `stack.md` §3 의 `<영역>_PATH` · `_FORMAT_CHECK` · `_LINT` · `_TEST` | 그 영역 | 전 영역 |
| `stack.md` §3 의 `AREAS` 에 새로 들어온 영역 | 그 영역 | 전 영역 |
| `stack.md` §3 의 공용 변수 · 다른 선언의 값에 나오는 이름 · 선언 순서 · 같은 이름 두 번 | 모든 영역 — 누가 읽는지 다 알 수 없다 | 전 영역 |
| `stack.md` 가 처음 생김 (HEAD 에 없음) | 모든 영역 (모든 선언이 새것) | 전 영역 |
| `stack.md` 의 §3 밖 글 · 블록 안 주석 · 선언 뒤 설명 · CRLF · 커밋 검사가 안 돌리는 선언(`_RUN` · `_BUILD` …) · 다른 훅 설정(`COMMIT_TYPES` …) | 없음 | 전 영역 |
| `.claude/hooks/` · `.claude/settings.json` | 그 파일 이름을 본문에 적은 하네스 테스트(`tests/test-*.sh`). 바뀐 것이 테스트 파일이면 그 파일 | 전 영역 |
| 그 밖의 영역 밖 파일 (`.gitignore` · `compose.yaml` · `.env.example` · 기획 html 등) | 없음 — `→ 영역 검사 없음` 과 까닭을 찍는다 | 전 영역 |
| 문서(`*.md` · `docs/`)만 | 없음 | 같다 |

- stack.md 판정은 HEAD 와 **스테이지된** stack.md 의 §3 블록을 「이름=값」 으로 비교한다 (커밋될 것 기준)
- 영역 밖에서 고른 영역(ALSO_PATHS · stack.md)은 폴더가 없으면 건너뛴다 (5단계가 이미 알린다)
- `--ci` · `--ci-fast` 는 그대로 모든 영역. `--changed-areas` 의 「모르면 전부」 규칙도 그대로 두고, `<영역>_ALSO_PATHS` 에 맞는 파일만 그 영역으로 좁힌다. `--format-only` 는 ALSO_PATHS 를 안 본다

## 계획에서 바뀐 것 (작업 중에 드러남)

| 처음 계획 | 바꾼 것 | 까닭 · 누가 |
|---|---|---|
| 공용 변수는 값에서 `$이름` 으로 부르는 영역만 (거쳐 부르는 것까지) | 모든 영역 | reviewer 가 줄 순서 · 같은 이름 두 번 · 셸이 내보낸 이름(PATH 등) · `${#X}` 꼴에서 검사 0개 통과를 재현했다. 누가 읽는지 확실할 때만 좁힌다 |
| 바뀐 선언 `<영역>_…` 전부 → 그 영역 | `_PATH` · `_FORMAT_CHECK` · `_LINT` · `_TEST` 만 | 커밋 게이트가 돌리는 것은 그 넷뿐이다 |
| 하네스 파일이 바뀌면 `tests/run.sh` 전체 | 그 파일을 적은 테스트 파일만 | run.sh 가 이 PC 에서 597초. 사용자 선택 |
| `--format-only` 는 그대로 | ALSO_PATHS 를 안 보게 막았다 | 영역 고르기를 함께 쓰는 탓에 바뀌어 있었다 (reviewer). 안 올린 루트 파일 하나로 편집마다 다른 영역 포맷터가 돌게 됐다 |
| 루트 `.gitignore` 는 어느 영역도 안 읽는다 | ruff 는 읽는다. 그래도 `ai_ALSO_PATHS` 에 넣지 않는다 | reviewer 가 ruff 0.17.1 로 확인. 무시 규칙을 지워 숨던 파일이 드러날 때만 다르고 다음 ai 커밋 · CI 가 잡는다. 넣으면 .gitignore 커밋마다 uv 가 필요하다 — 사용자와 정함 |

## 이 저장소에서 영역 밖에 있지만 영역 검사가 읽는 파일 — 확인한 것

| 영역 | 지금 루트에 있나 | 루트에 생기면 읽는 것 | `ALSO_PATHS` |
|---|---|---|---|
| frontend | 없음 | prettier 는 `frontend/` 에 설정이 없어 위로 올라가 찾는다 — `.prettierrc*` · `prettier.config.*` · 루트 `package.json` 의 `prettier` 키 · `.editorconfig`. 루트 `package.json` · `package-lock.json` 은 npm 워크스페이스가 될 수 있다 | `.editorconfig .prettierrc* prettier.config.* package.json package-lock.json` |
| ai | 없음 | ruff · pytest · uv 설정이 `ai/pyproject.toml` 에서 멈춘다. 루트 `pyproject.toml` 에 uv 워크스페이스가 생기면 ai 가 그 일부가 될 수 있다. 루트 `.gitignore` 는 ruff 가 따른다(위 표) | `pyproject.toml uv.lock` |
| backend | 없음 | `backend/settings.gradle` 에서 Gradle 이 멈춘다. `application.yaml` 이 루트 `.env` 를 읽지만 `.env` 는 커밋되지 않는다 | `""` |
| infra | 없음 | `terraform -chdir=terraform` 와 `infra/kind/` 만 본다 | `""` |

## 바꾼 파일

- `.claude/hooks/pre-commit` — `also_match` · `also_touched` · `stack_decls` · `stack_areas`, `area_touched` · `outside_file` 이 ALSO_PATHS 를 본다, 6단계에서 `GATE_ALL` 을 빼고 위 표대로, `[하네스]`, `영역 검사 없음` 안내
- `.claude/hooks/tests/test-pre-commit.sh` — 기대값 3개를 새 동작으로 (루트 package.json · 새 stack.md · 폴더 없는 영역), 새 사례 (위 표의 칸마다 · 지운 파일 · `set -f` 가 명령으로 새지 않음 · `--format-only`)
- `.claude/stack.md` — §3 `<영역>_ALSO_PATHS` 네 줄, §4 표
- `docs/dev-environment.md` — 커밋 검사는 바꾼 영역만 · 인프라 줄
- 이 계획 — `docs/plans/2026-10-19-gate-changed-areas-only.md` 로 이름을 바꿔 같이 넣는다

## 안 바꿀 것

- `--ci` · `--ci-fast` 의 영역 고르기, `--changed-areas` 의 「모르면 전부」, `.claude/ci/*`
- 영역 폴더 안 파일을 바꾼 커밋의 동작 (도구가 없으면 지금처럼 막는다)
- `.claude/HARNESS.md` · `commit-msg` · `mr-check.sh` · `upgrade.sh` · `secret-scan.sh`
- `infra_LINT` 의 `$f` 버그 (따로 작업 카드로 올렸다) · 하네스 원본 템플릿 반영 (저장소 밖)
- 공유 폴더(`infra` 브랜치) — 작업은 스크래치패드의 별도 워크트리에서만

## 리스크와 막는 법

| 리스크 | 막는 법 · 남는 것 |
|---|---|
| 영역 도구가 읽는 루트 파일을 `ALSO_PATHS` 에 안 적으면 그 파일만 바꾼 커밋이 그 영역을 안 돈다 | 지금은 그런 파일이 없음을 확인했고 생길 수 있는 이름을 미리 적었다. 놓치면 그 영역을 바꾸는 다음 커밋과 CI(생긴 뒤)가 잡는다 — 늦게 걸릴 뿐이다 |
| 하네스 파일을 적은 테스트가 없으면 아무 테스트도 안 돈다 | ⚠️ 로 알리고 `run.sh` 를 돌리라고 찍는다. 지금 그런 파일은 `tests/run.sh` 뿐이다 |
| `.gitattributes` 줄바꿈 규칙 변경 | 다시 체크아웃해야 드러나 커밋 때 어떤 검사로도 못 잡는다 — 전에도 같다 |
| 일부만 스테이지하면 검사한 파일과 커밋할 파일이 다르다 | 전에도 같다. stack.md 판정만은 스테이지 기준 |
| 다음 템플릿 업데이트(`upgrade.sh` 3-way)에서 `pre-commit` 이 충돌 | 충돌을 풀 때 이 계획을 본다 |
| 기존 테스트 기대값 3개를 바꾼다 | 동작을 바꾸기로 한 결정 때문이다. MR 리뷰 포인트에 적는다 |

## 어떻게 검증하나 — 결과

1. 먼저 실패 — 새 사례를 고치기 전 훅에 돌려 29개 실패 · 167개 통과
2. `test-pre-commit.sh` 통과 215 · 실패 0. 핵심 줄 7곳(`set +f` 복원 · 순서 · 같은 이름 · 값에 나오는 이름 · 공용 변수 · 포맷 모드 · 폴더 확인)을 하나씩 깨뜨린 사본에서 각각 1~3개 실패
3. 워크트리에서 재현 (Terraform 을 PATH 에서 뺌)
   - `.gitignore` 한 줄 실제 커밋 → rc=0, 5초, `영역 검사 없음` (전: rc=1, 143초)
   - `infra/` 파일 한 줄 실제 커밋 → rc=1 (바꾼 영역은 지금처럼 막는다)
   - stack.md 의 `frontend_TEST` 한 줄 (임시 인덱스로 훅 직접) → `[frontend]` 만, rc=0
   - `.claude/hooks/session-start.sh` 한 줄 (임시 인덱스) → `test-session-start.sh` 만, rc=0, 8초
4. `reviewer` — 고칠 것 5개를 받아 모두 반영 (위 「계획에서 바뀐 것」)

## 되돌리는 법

- 훅 · 테스트 · 문서만 바뀐다. 데이터 · 서버는 안 건드린다. MR 전이면 브랜치를 버리고, 머지 뒤면 그 커밋을 `git revert` 해 MR 로 올린다
- 재현용 임시 브랜치 `tmp/gate-repro-no-terraform`(새 커밋 없음)과 워크트리는 끝나면 `git worktree remove` · `git branch -d` 로 지운다 (강제 삭제 · force push 안 함)

## 작업 순서

- [x] 워크트리 정리 — 재현 때 스테이지한 `.gitignore` 를 되돌리고 `origin/dev` 에서 작업 브랜치를 딴다
- [x] 새 사례 · 바뀌는 기대값을 먼저 쓰고 고치기 전 훅에서 빨간지 본다
- [x] `pre-commit` 을 고치고 `test-pre-commit.sh` · `run.sh` 통과
- [x] `stack.md` §3 · §4 · `docs/dev-environment.md` 를 고친다
- [x] 실제 커밋 재현을 돌리고 `reviewer` 로 본다
- [ ] 사용자에게 묻고: Jira 티켓 → 커밋 → push → `dev` 로 MR (`.gitlab/merge_request_templates/Default.md`). 작업 브랜치를 딴 뒤 dev 에 들어온 `stack.md` 변경은 §7 이라 §3 · §4 와 겹치지 않는다
