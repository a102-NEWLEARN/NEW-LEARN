# CI 잡이 Git LFS 파일을 받지 않게 — GIT_LFS_SKIP_SMUDGE · LFS 훅은 로컬 전용 (Jira S15P31A102-164)

> 승인 뒤 작업 폴더에서 `docs/plans/2026-11-04-ci-skip-lfs.md` 로 커밋한다

## 무엇을 / 왜

11-04 dev 에 들어온 `data/newsdata_2026-10-21_2026-11-03.sqlite`(Git LFS, 577,716,224바이트 — 팀원이 밖에서 받은 10/21 ~ 11/3 기사)를 CI 가 잡마다 받는다. CI 잡은 이 파일을 쓰지 않는다. 사람 PC 는 그대로 받아야 한다(사용자 11-04 — 본 폴더에서 `git lfs pull` 로 받아 크기 · sha256 이 `data/README.md` 와 같음을 확인).

잡 로그의 「Checking out」 → 「Skipping Git submodules」 시각으로 잰 체크아웃 시간(11-04, 로그에 LFS 줄은 따로 없음):

| 커밋 | 관리 서버 러너(잡마다 새로 클론) | 노트북 러너(저장소를 남겨 둠) |
|---|---|---|
| `data/` 없음(`a1b6309d` · `089fe129` · `6cde1991` · `f58ef643` 등) | 1.0 ~ 1.6초(7잡) | 0.0 ~ 1.0초 |
| `data/` 있음(`e3cf4f82` · `2e212ac2` · `20432c43`) | **42.1 ~ 45.7초(4잡)** | 처음 받을 때 183 ~ 251초(3잡), 그 뒤 0.1 ~ 7.2초 |

## 바꿀 파일

- `.gitlab-ci.yml` — `default:` 뒤에 최상위 `variables:` 를 새로 두고 `GIT_LFS_SKIP_SMUDGE: "true"`(GitLab 문서 「Skip Git LFS objects」 — 러너가 `git lfs pull` 을 건너뛰고 LFS 파일은 가리킴 파일로 둠, 값은 문서 예시 그대로). `default:` 는 `variables` 를 받지 않아 최상위가 맞고, 잡 변수와 이름이 겹치지 않아 잡 10개 모두에 합쳐진다. 주석에는 덮어쓰는 법(파일이 필요한 잡에서만 `"false"`)과 「까닭은 SSOT 6절 「CI 파이프라인」」만 둔다
  - `data/` 를 읽는 곳 확인(11-04, 계획 리뷰 포함): 굽기 컨텍스트는 `$CI_PROJECT_DIR/$AREA`(backend · frontend · ai), `deploy_mr.py` 는 GitLab API 만, 영역 게이트는 CI 에서 시크릿 스캔을 건너뛰고 문서 크기 검사는 `.md` 만, 하네스 시험은 임시 저장소에 지정 파일만 복사, 코드 어디에도 sqlite 를 안 씀
  - 시크릿 스캔 `secret-scan.sh --all`(w0:rules)은 추적 파일 전부를 읽어 `data/*.sqlite` 도 읽는다. 지금은 `grep -I` 가 이진 파일로 보고 건너뛰고, 바꾼 뒤에는 가리킴 파일 세 줄이라 어느 규칙에도 안 걸린다. `--range` 는 이력의 가리킴 파일을 읽어 그대로다 — 결과가 바뀌지 않는다
- `.gitignore` · `.claude/stack.md` 8절 — Git LFS 가 훅 폴더(`core.hooksPath` = `.claude/hooks`)에 스스로 만드는 `post-checkout` · `post-commit` · `post-merge` · `pre-push` 넷을 이름 그대로 적는다(`.claude/hooks/*` 처럼 넓히면 추적하는 훅까지 가려짐). 팀 규칙대로 두 곳에 같이(`.gitignore` 1줄 · stack.md 8절)
  - 커밋하면 안 되는 까닭: 그 훅은 `git-lfs` 가 없으면 `exit 2` 다. Git for Windows 에는 git-lfs 가 들어 있지만, git-lfs 가 없는 리눅스 클론(SSOT 7절의 WSL2 클론 같은)에서는 `pre-push` 가 push 를 막는다. 추적하는 훅과 이름이 겹치지 않고 `install.sh` · `upgrade.sh` 도 그 이름을 쓰지 않는다
- `SSOT.md`
  - 6절 「CI 파이프라인」 아래에 정한 것과 까닭 한 줄 — CI 잡은 Git LFS 파일을 받지 않는다(원본 `.gitlab-ci.yml`)
  - 10절에 전후 체크아웃 시간 한 줄(위 표의 전 값 + 이 MR 파이프라인으로 잰 뒤 값). 숫자는 10절에만
- `docs/plans/2026-11-04-ci-skip-lfs.md` — 이 계획

## 작업 순서

- [x] Jira 164 진행 중 → worktree `C:/tmp/wt-164`, 브랜치 `chore/infra/S15P31A102-164-ci-skip-lfs` ← `origin/infra`(이미 `data/` 가 있음 — 이 MR 파이프라인이 곧 시험). worktree 는 `GIT_LFS_SKIP_SMUDGE=1` 을 붙여 만든다(이 PC 시스템 git 설정에 LFS 필터가 있어 안 붙이면 578MB 를 다시 풀어 놓음), 계획 커밋
- [x] `.gitlab-ci.yml` · `.gitignore` · stack.md 8절 · SSOT 6절 → 커밋 게이트 → push → MR(→ infra) — !642
- [x] MR 파이프라인에서 확인(아래) → 잰 값으로 SSOT 10절 한 줄 커밋 → 파이프라인 다시 success — 관리 서버 1.0 ~ 1.5초 · 굽기 러너 1.5 ~ 2.5초
- [ ] reviewer 조수(MR) → 머지 직전 원격 SHA · 열린 MR 을 같은 스크립트에서 읽고 머지 → infra → dev 같은 방식 → 맞추기(infra · backend · ai, 내용 차이부터. frontend 는 FE 몫)
- [ ] dev 에서 이미지 셋이 다시 구워지고 배포 태그 MR 이 생긴다 — 코드 차이가 없으면 닫는 것을 기본으로 사용자에게 묻는다(158 때와 같은 판단)
- [ ] 본 폴더의 계획 초안 파일(`docs/plans/zazzy-questing-zebra.md`, 추적 안 됨) 지우기, Jira 164 댓글 · 완료, 개인 기록

## 안 바꿀 것

- `data/` 와 `.gitattributes`(팀원 몫) · 사람 PC 의 LFS 설정
- 러너 설정(`gitlab-runner-values.yaml` 등) — 잡 변수로 충분하다
- Argo CD — 저장소를 클론하지만 LFS 동작은 이 계획에서 확인하지 않음
- 잡별 `GIT_LFS_PULL_FLAGS` — 러너 19.6 부터라 지금 러너(셋 모두 18.11.4)에서는 못 쓴다

## 리스크

- 러너 18.11.4 가 이 변수를 문서대로 처리하지 않을 수 있다 — MR 파이프라인의 관리 서버 잡 체크아웃이 40초대 그대로면 안 먹은 것이다. 그러면 멈추고 다시 묻는다
- 프로젝트 설정의 CI 변수가 같은 이름을 덮는지는 모른다 — 위와 같은 방법으로 드러난다
- `.gitlab-ci.yml` 이 바뀌어 MR 에서 이미지 굽기(w4)가 「굽기만」으로 돌고, `.claude/` 도 바뀌어 영역 잡이 전부 돈다 — 파이프라인이 수 분 길어진다

## 어떻게 검증하나

- 이 MR 파이프라인(브랜치에 `data/` 가 있음)의 관리 서버(`newlearn-ec2-k8s`) 잡 체크아웃이 1 ~ 2초대 — 같은 러너가 `data/` 있는 커밋에서 42 ~ 46초(4잡)였으니, 2초 안에 578MB 를 받을 수는 없다
- 굽기 러너(`newlearn-build`, 워커 노드에서 따로 클론)의 `w4:*` 잡 체크아웃도 같은 방식으로 본다
- 노트북 러너는 저장소를 남겨 두어 이미 받은 파일이 있으므로 판정에 쓰지 않는다
- 사람 PC: 본 폴더의 SQLite 가 그대로(크기 577,716,224 · sha256 `7b5edc80…`)
- MR 파이프라인 success, reviewer 조수 「통과」

## 되돌리는 법

- 변수 한 줄만 빼는 MR 로 되돌린다. MR 을 통째로 Revert 하면 이미지 굽기 · 배포 태그 MR 이 또 돌고 훅 넷이 다시 추적 안 된 파일로 뜬다. 변수를 빼면 잡마다 다시 받을 뿐 깨지지는 않는다

## 계획에서 바뀐 것 (reviewer 계획 리뷰 반영, 11-04)

- 시크릿 스캔이 추적 파일 전부를 읽는 것과, 바꿔도 결과가 같은 까닭을 적음
- 전 값을 한 잡이 아니라 표로(관리 서버 4잡 · 노트북 첫 받기 3잡), LFS 줄이 로그에 없어 체크아웃 시간으로 판정, `w4:*` 를 검증에 더함
- 까닭은 SSOT 6절 · 숫자는 10절 · CI 주석은 덮어쓰는 법만, 훅 넷은 이름 그대로
- 배포 태그 MR 은 「생길 수 있다」가 아니라 「생긴다」, 되돌리기는 변수 줄만 빼는 MR, worktree 는 `GIT_LFS_SKIP_SMUDGE=1` 로, `pre-push` 가 막는 쪽은 git-lfs 가 없는 리눅스 클론
