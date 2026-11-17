# 산출물 5번 포팅 매뉴얼 — `exec/` 폴더 (2026-11-17)

## 무엇을 / 왜

SSAFY 사무국이 11/18(수) 12:00 까지 팀 GitLab 저장소에 `exec` 폴더로 포팅 매뉴얼을 내라고 했다. 항목은 넷이다 — ① 클론 → 빌드 · 배포 문서(제품 · 설정값 · 버전 · IDE, 빌드 환경 변수, 배포 특이사항, DB 계정 · 설정 파일 목록) ② 외부 서비스 ③ DB 덤프 최신본 ④ 시연 시나리오(화면별 · 클릭별).
지금 저장소에는 이 내용이 SSOT · README · `infra/` 문서에 흩어져 있다. `exec/` 는 최신 상태를 **심사자가 따라 할 수 있게** 한 번에 모은 제출용 스냅샷이고, 다르면 원본 문서가 이긴다(약속 4). GitLab 기본 브랜치가 `dev` 라 dev 머지로 사무국이 본다. 목표는 **오늘 18:00 까지 dev 머지**, 11-18 오전은 여유로 남긴다.

## 운영에 닿는 것 — 모두 읽기

운영 서버에서 새로 도는 명령은 없다.

- 덤프: 이미 관리 서버에 있는 매일 백업 파일(`postgres-backup` CronJob, 관리 서버 Pod 가 만든 것)을 PC 로 받기만 한다. 회원 표를 비우는 일은 PC 에서 한다
- 캡처: 공개 사이트 둘러보기. 회원 화면은 북마크 · 관심 이슈 · 관심 분야 저장 버튼을 누르지 않고 있는 그대로 찍는다. 용어사전 말풍선 캡처에 드래그 한두 번(GMS 호출 한두 번, 하루 한도 3,000 안)
- 「클론 → 실행」 확인은 관리자 PC 의 Docker 에서만 한다

## 바꿀 파일

모두 새 파일이다. 본보기는 예전 프로젝트 `loanreview-excluded/exec`(README 한 장 + `files/`)이고, 여기서는 장마다 파일을 나눈다.

- `exec/README.md` — 제출 항목 ↔ 위치 표, 폴더 안 파일 표, 「비밀값 없음 · 기준일 2026-11-17 · 원본이 이긴다」
- `exec/1-build-deploy.md`
  - 1-1 제품 · 설정값 · 버전: 표에 「설정값 · 설정 파일」 칸을 둔다
    - JVM Eclipse Temurin 25 JRE(`JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70`, `infra/k8s/services/app/backend.yaml`)
    - WAS Spring Boot 4.1 내장 Tomcat(graceful shutdown 20초, `application.yaml`)
    - 웹서버 nginx-unprivileged 1.30.6(`frontend/nginx.conf`) · 입구 Envoy Gateway(`routes.yaml` · `ratelimit.yaml`)
    - Node 26 · Python 3.14 · uv, PostgreSQL 18 + pgvector 0.8.7 · Redis 8.10.2, kubeadm · Cilium · cert-manager · Argo CD · Sealed Secrets · 관측
    - 서버 사양: EC2 t3.large(관리) · Lightsail xlarge(워커)
    - IDE · 개발 도구: 우리가 확인한 것만 적는다 — 저장소에 IDE 설정 파일이 없고(IDE 에 묶이지 않음) 개발 환경은 컨테이너다. 관리자 PC 에서 읽은 판: VS Code 1.146.0 · Claude Code 2.1.284 · Docker Desktop 4.83.0 · Git 2.55.0. 빌드에 실제로 쓰는 JDK · Node · Python 판은 컨테이너 이미지에 고정된 값
    - 원본: `.claude/stack.md` §2 · Dockerfile 셋 · `compose.yaml` · SSOT 6절
  - 1-2 클론 → 실행: `README.md` 「시작하기」 · `docs/dev-environment.md` 요약, 빌드 · 테스트 명령(`.claude/stack.md` §3). `GIT_LFS_SKIP_SMUDGE=1` 로 클론하고 덤프만 `git lfs pull --include` 로 받는 법(`data/*.sqlite` 약 1.66GB 를 건너뛴다)
  - 1-3 환경 변수 — 값은 적지 않는다
    - 로컬: `.env.example` 이름 · 뜻 표
    - 빌드 · CI: GitLab CI/CD 변수 `GHCR_USER` · `GHCR_TOKEN` · `DEPLOY_MR_TOKEN`(보호 · 가림), 잡 변수 `IMAGE_PREFIX` · `W4_PUSH`, 화면 빌드 모드(`vite build` · `--mode demo`)
    - 운영: 서비스별 변수 이름 · 넣는 곳(매니페스트 값 / 봉인 Secret 이름 · `infra/server/seal-secrets.sh` 하위 명령)
  - 1-4 배포: 흐름 그림 하나(Mermaid — push → CI → GHCR → 배포 태그 MR → Argo CD), 무중단 조건 · DB 변경 하위 호환 · Sealed Secrets 키 백업 · GHCR 비공개 · 토큰 만료 11-30 · 새로 세우는 순서는 `infra/server/README.md`. 서버 명령은 서버가 있을 때만 된다고 적는다
  - 1-5 DB 접속 정보 · 계정 · 설정 파일: `application.yaml` · `compose.yaml` · migration V1~V16 · `infra/k8s/services/data/`. 계정(`newlearn` · `newlearn_monitor` · 관리 화면 팝업 Secret `basic-auth`)과 Secret 이름. Redis 는 비밀번호 없이 NetworkPolicy 로만 막는다. ERD 는 `docs/data-model.md` 의 erDiagram 을 가리키고, 실제 표는 migration 이 이긴다
- `exec/2-external-services.md` — 서비스 표(쓰는 곳 · **지금 쓰나** · 가입 · 발급 · 환경 변수 / Secret 이름 · 한도 · 만료) + 서비스마다 짧은 절. 「지금 쓰나」는 코드 · 설정으로 확인한다 — 예: 표준국어대사전은 키 등록 · backend A19(`GET /api/v1/dictionary`) · 봉인 Secret `stdict-api` 가 연결돼 있지만 화면은 2026-11-10 부터 A26(`/dictionary/meaning`)만 불러 「지금 서비스에서 안 씀(되돌릴 때만)」. 대상: SSAFY GMS · NewsData.io · 국립국어원 표준국어대사전 · Hugging Face(BGE-m3-ko 모델) · AWS(EC2 · S3 · 예산 · IAM) · SSAFY Lightsail · 가비아 DNS · Let's Encrypt · GitHub(GHCR · 공개 미러) · Vercel(데모) · Google Analytics 4 · Microsoft Clarity · SSAFY GitLab · Mattermost. 소셜 로그인은 없고 아이디 · 비밀번호로 직접 로그인한다고 적는다
- `exec/3-db-dump.md` — 원본 백업 시각 · Flyway 판, 개인정보 처리 표(회원 네 표 비움 · 운영 작업용 표 · 스키마 뺌), 되살리는 법(`docker cp` 로 넣고 컨테이너 안에서 `pg_restore` — PowerShell 파이프는 바이너리를 깨뜨린다), 다시 만드는 법
- `exec/4-demo-scenario.md`
  - 시연은 실시간 운영 서버에서 한다(목데이터 없음). 원본은 지금 운영 사이트이고, 프로토타입 · `docs/user-flow.md` 는 쓰지 않는다. 화면 이름 · 주소만 EXPERIENCE.md(11-13 반영)로 맞추고, 다르면 사이트가 이긴다
  - 머리에 접속 길 둘: 운영 `https://newlearn.io.kr`(발표 뒤 서버를 내리기 전까지), 로컬 실행 + 3장 덤프(서버를 내린 뒤에도 같은 데이터). Vercel 데모는 화면만 보는 길로 한 줄(회원 · 용어사전은 가짜 응답, `docs/plans/2026-11-16-demo-snapshot.md`)
  - 순서: 랜딩 → (손님) 홈 · 추천 이슈 → 분야별 이슈 → 이슈 화면 · 이슈 흐름(F07 사건 중심 이슈 에볼루션 맵) → 사건 패널 · 관련 기사(F08 사건별 관련 기사 조회) → 기사 마인드맵 흐름지도 · 마인드맵(F04 기사 마인드맵 생성) → 이 기사가 속한 이슈 보기(F11 기사·이슈 양방향 연결) → 용어사전 드래그(F13 용어사전) → 통합 검색 → 가입 화면 → (회원) 관심 분야 · 북마크 · 관심 이슈 · 나의 뉴스함 · 마이페이지(F12 회원·관심 분야)
  - 예시 이슈는 10/21 ~ 11/11 분으로 사건이 많이 쌓여 잘 안 바뀌는 것으로 고르고, 캡처 날짜를 붙인다. 클릭 위치는 「홈 추천 이슈 첫 카드」처럼 자리로도 적는다
- `exec/files/db/newlearn-<백업 시각>.dump` — `pg_dump -Fc`, Git LFS
- `exec/files/db/schema.sql` — `pg_dump --schema-only`, 같은 제외 옵션(평문, 읽기용)
- `exec/files/demo/NN-<화면>.png` — 캡처 약 12 ~ 15장
- `exec/.gitattributes` — `files/db/*.dump filter=lfs diff=lfs merge=lfs -text`
- `docs/plans/2026-11-17-porting-manual-exec.md` — 이 계획

## 작업 순서

시각은 목표다. 작업은 `C:/tmp/wt-<Jira 번호>` worktree 에서 한다(본 폴더는 다른 세션도 쓴다).

- [x] 10:30 Jira 티켓(S15P31A102-225) · 스토리 포인트 3 · worktree · 브랜치 `docs/common/S15P31A102-<번호>-porting-manual` — 원격 dev 에서 갈라졌는지
- [x] 10:45 사람 몫을 먼저 넘긴다 — 백업 받기 명령(파일 카드, 아래)
- [x] 11:00 ~ 13:00 1장 · 2장 · README — 운영 · CI 변수 표는 explorer 조수가 매니페스트 · `.gitlab-ci.yml` 을 읽어 모은다. 커밋 하나
- [x] 13:00 ~ 14:00 3장 덤프 만들기(아래) · 커밋 하나. push 전에 LFS 포인터 확인
- [x] 14:00 ~ 16:30 4장 — Claude in Chrome 으로 캡처. 회원 화면은 사용자가 Chrome 에서 한 번 로그인해 둔다(비밀번호는 Claude 가 넣지 않는다). 커밋 하나
- [ ] 16:30 ~ 17:30 검증 · reviewer 조수 · MR(템플릿) · 파이프라인 · 머지 직전 원격 dev 확인 · 머지
- [ ] 머지 뒤 Jira 완료, 분야 브랜치 넷(infra · backend · frontend · ai)을 dev 에 맞춤

**백업 받기 (사용자가 관리자 PC Git Bash 에서)** — `infra/server/db-backup.md` 「PC 로 가져오기」 그대로다. 백업에는 회원 정보가 있으니 저장소 밖 `C:/tmp/exec-dump/` 에 받고, 작업이 끝나면 지운다.

```bash
ssh <EC2> 'sudo ls -t /var/lib/newlearn/pg-backup/ | head -3'
ssh <EC2> "sudo cat /var/lib/newlearn/pg-backup/<가장 새 파일>" > /c/tmp/exec-dump/<가장 새 파일>
ssh <EC2> "sudo sha256sum /var/lib/newlearn/pg-backup/<가장 새 파일>"; sha256sum /c/tmp/exec-dump/<가장 새 파일>
```

**덤프 만들기 (Claude, PC Docker)**

1. 버리는 컨테이너(`pgvector/pgvector:0.8.7-pg18`, 운영과 같은 판)에 받은 백업을 `docker cp` 로 넣고 `pg_restore`
2. `\dn` · `\dt *.*` 로 스키마 · 표 목록을 본다. Flyway 밖 운영 작업용(`embed_load` · `load_undo` · `category_label` · `rt_before` 같은 스키마, `public.fix_bigevent_detached` 같은 표)은 계획 파일에 목록을 적고 뺀다
3. 다시 덤프: `pg_dump -Fc --no-owner --no-privileges --exclude-table-data=member --exclude-table-data=member_category --exclude-table-data=bookmark --exclude-table-data=interest_issue -N <뺄 스키마> -T <뺄 표>`, 같은 옵션으로 `--schema-only` → `schema.sql`. `-n public` 은 쓰지 않는다(`CREATE EXTENSION vector` 가 빠진다)
4. 원본 백업 파일과 버리는 컨테이너를 지운다

회원 네 표(`member` 의 `login_id` · `name` · `password_hash`, 그리고 회원을 참조하는 `member_category` · `bookmark` · `interest_issue` — `references member` 는 이 셋뿐)는 구조만 남고 행은 비어 있다. 로그인 세션은 Redis 에 있어 덤프 밖이다.

## 안 바꿀 것

- 코드(`frontend/` · `backend/` · `ai/`) · 매니페스트(`infra/k8s/`) · CI(`.gitlab-ci.yml`)
- 팀 문서(`SSOT.md` · `README.md` · `docs/*` · PRD · MVP 개요) — `exec/` 가 가리키기만 한다. MVP 개요의 F13 「로그인한 회원이 쓴다」가 코드(손님도 씀, Jira 205)와 다른 것은 PM 확인 문서라 고치지 않고 알리기만
- 운영 클러스터 · DB — 새로 도는 명령 없음
- `dev` → `master` 합치기 — 팀 규칙상 마지막에 할 일이고 팀이 정한다. 기본 브랜치가 `dev` 라 이 계획은 dev 머지로 끝난다
- PDF 는 만들지 않는다 — GitLab 이 마크다운을 그려 준다
- 다른 세션의 `docs/plans/zazzy-questing-zebra.md`

## 리스크

- 🔴 **브랜치에 push 한 덤프는 지울 수 없다고 본다.** push 하는 순간 GitLab LFS 저장소에 올라가고, 되돌려도 기록에 남는다(지우는 권한이 누구에게 있는지는 미확인). 그래서 개인정보 · 비밀값 검사를 모두 **push 전에** 마친다
- worktree 에는 LFS 올리기 훅이 없다(`core.hooksPath` 가 상대 경로인데 LFS 훅은 커밋하지 않는 파일이다). push 전에 `git lfs ls-files` 에 덤프가 보이는지, `git cat-file -s HEAD:exec/files/db/<파일>` 이 수백 바이트(포인터)인지 보고, `git lfs push origin <브랜치>` 를 먼저 한 뒤 `git push`
- 덤프 크기: 11-14 04:00 백업이 200MB(-Fc)였고 그 뒤 기사 벡터를 채워(Jira 207) 더 클 수 있다. 운영 작업용 스키마를 빼면 준다. LFS 한 파일 상한은 확인하지 않았지만 같은 저장소에 868MB LFS 파일이 올라가 있다
- 백업이 오늘 새벽 것이라 그 뒤 수집분은 없다. 사무국 「최신본」은 마감 전 마지막 백업으로 본다. 11-18 04:00 백업으로 바꾸고 싶으면 같은 절차로 30분 MR 하나
- 문서와 운영이 어긋남: 판 숫자 · 변수 이름은 쓰는 날 원본에서 뽑아 대조하고, 기준일과 원본 경로를 붙인다
- 캡처에 개인정보: 로그인한 화면의 이름을 가리고 한 장씩 열어 본다
- 시간: 4장이 가장 늦어질 수 있다. 16:30 에 덜 됐으면 캡처 수를 줄이고 글로 채운다. 그래도 넘치면 11-18 08:00 ~ 10:00 에 마친다

## 어떻게 검증하나

push 전 (되돌릴 수 없는 일 앞)
- 덤프 개인정보: 다시 만든 덤프를 새 컨테이너에 되살려 회원 네 표 0행, 뺀 스키마 · 표가 없는지(`pg_restore -l` 의 스키마 · TABLE DATA 목록)
- 덤프 비밀값: 자유 글 칸(`analysis_job.error_message` · `result`, `ingest_run.next_cursor`)과 `pg_restore -f -` 출력 전체에서 키 모양 · IP 모양을 찾아 0건
- 심사자가 밟을 길 그대로: 새 worktree 에서 `docker compose up -d` 로 DB 만 띄움(프로젝트 이름 · 포트를 바꿔 다른 compose 와 겹치지 않게) → 3장 방법으로 덤프 넣기 → `--profile full` 로 전부 띄움 → backend 가 Flyway 검사 · `ddl-auto: validate` 를 지나 뜨는지 → 분야 목록 API · 이슈 화면 200, 화면에 이슈가 보이는지 → 내리기. `flyway_schema_history` 마지막 판이 dev 의 마지막 마이그레이션(V16)과 같은지
- LFS: 위 리스크 둘째 줄
- 판 숫자 · 변수 이름: Dockerfile · `compose.yaml` · `build.gradle` · `package.json` · `pyproject.toml` · 매니페스트 · `.gitlab-ci.yml` 에서 스크립트로 뽑아 문서 표와 대조
- 경로: `exec/*.md` 가 가리키는 저장소 경로가 모두 origin/dev 에 있는지 스크립트로
- 비밀값(문서): `bash .claude/hooks/secret-scan.sh --all` 통과, `exec/` 문서 안 IP 모양 · 키 모양 0건
- Mermaid: 브라우저에서 `mermaid.parse` · `render` 오류 없음
- 캡처: 한 장씩 열어 이름 · 아이디 · IP 가 안 보이는지
- 4장: 새 시크릿 창에서 처음부터 문서대로 눌러 클릭 자리 · 화면이 맞는지

push 뒤
- reviewer 조수가 MR diff 를 새 눈으로 본다
- MR 화면에서 덤프가 「Stored with Git LFS」로 보이는지
- 파이프라인 success → 머지 직전 원격 dev SHA · 열린 MR → 머지 → dev 에서 `exec/` 가 보이는지

## 되돌리는 법

- 문서 · 캡처 · 스키마: dev 에서 머지 커밋을 revert 하는 MR
- 🔴 덤프: 위 리스크 첫 줄 — 되돌려도 LFS 객체와 기록은 남는다
- 운영: 바꾸는 것이 없다

## 하면서 바뀐 것

- 4장 순서는 최종 발표 대본의 시연 대본(검색 「스마트안경」 → 마이크로소프트 서비스 장애 이슈 → 접속 장애 · 복구 사건 → 기사 흐름지도 · 용어사전 「MS365」 · 마인드맵)을 그대로 따랐다(사용자가 대본을 줌). 처음 고른 코스피 이슈 예시는 뺐다
- 회원 화면(나의 뉴스함 · 마이페이지)은 운영 계정 로그인이 필요해 캡처 없이 글로 적었다. 손님 화면 13장만 찍었다
- 원본 백업은 `newlearn-20261117-0724.dump`(454,779,501 바이트, sha256 서버 · PC 같음). Flyway 밖에서 뺀 것: 스키마 `category_label` · `embed_load` · `load_undo` · `rt_before`, 표 `public.fix206_detached` · `fix211_merged` · `fix211_moved` · `fix211_reacts` · `fix_bigevent_detached`
- 심사자 길 확인에서 로컬 목록 기준값(`QUERY_MIN_*`)이 운영과 달라 숫자가 다른 것을 찾았다. compose 가 넘기지 않아 `backend/.env` 에 세 줄을 넣는 방법을 3장에 적고 운영과 같아지는 것을 확인했다
- 캡처는 Claude in Chrome 대신 Playwright(헤드리스 Chromium)로 찍었다 — 파일로 바로 남기고, 사용 분석(GA4 · Clarity) 요청을 막아 우리 방문이 통계에 잡히지 않게 하려고
