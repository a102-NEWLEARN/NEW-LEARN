# 3. DB 덤프

운영 DB(PostgreSQL 18.6 + pgvector 0.8.7)의 **2026-11-18 07:42(한국) 백업**에서 회원 정보를 비우고 다시 뜬 덤프입니다. 스키마는 Flyway V17 까지로 저장소의 마지막 마이그레이션과 같습니다.

이 백업은 그날 아침 마지막 기사 분야 라벨(라벨이 없던 공개 기사 4,826건, 07:41 반영)을 넣은 **바로 뒤**에 뜬 것입니다. 그 뒤 15분마다 들어온 기사는 없습니다. 분야별 이슈 수는 백업 직후 운영 사이트와 같았습니다(아래 「되살리는 법」).

| 파일 | 내용 |
|---|---|
| `exec/files/db/newlearn-20261118-0742.dump` | 데이터 + 스키마 (`pg_dump -Fc`, gzip, 422,914,363 바이트). Git LFS 로 올렸습니다 — 받는 법은 1-2 ① |
| `exec/files/db/schema.sql` | 같은 덤프의 스키마만 (`pg_dump --schema-only`, 평문, 읽기용). 실제 스키마는 backend 가 뜰 때 Flyway 가 `backend/src/main/resources/db/migration/` 으로 만듭니다 |

## 들어 있는 것

| 표 | 행 수 | 내용 |
|---|---|---|
| `article` | 182,203 | 뉴스 기사(NewsData.io 수집). 화면에 나오는 것은 분석 · 분야 기준을 넘은 공개 기사만 |
| `analysis_job` | 89,647 | 분석 작업(마인드맵 추출 · 임베딩 · 동일 사건 판정 · 이슈)과 상태 |
| `article_mindmap` | 34,473 | 기사 마인드맵(가지 4개)과 근거 문장 |
| `article_embedding` | 34,492 | 기사 벡터(1024차원, pgvector) |
| `article_event` | 26,320 | 기사 ↔ 사건 연결 |
| `event` | 8,137 | 사건 |
| `issue` · `issue_category` | 370 · 366 | 이슈와 분야 |
| `press` · `press_mapping` | 112 · 114 | 언론사 |
| `category` · `category_mapping` | 5 · 18 | 분야(정치 · 경제 · 사회 · 국제 · IT·과학) |
| `flyway_schema_history` | 17 | 마이그레이션 기록 V1 ~ V17 |
| `ingest_run` | 0 | 수집 배치 실행 기록 |
| `member` · `member_category` · `bookmark` · `interest_issue` | 0 | **회원 정보 — 비움** (아래) |

## 개인정보 처리

| 대상 | 처리 | 이유 |
|---|---|---|
| `member`(아이디 · 이름 · 비밀번호 해시), `member_category`, `bookmark`, `interest_issue` | 표 구조만 두고 행을 비움 (`--exclude-table-data`) | 운영에서 가입한 실제 사람의 정보. 뒤의 셋은 회원을 참조하는 표라 같이 비워야 복원이 깨지지 않음 |
| 운영 작업용 스키마 `category_label` · `embed_load` · `load_undo` · `rt_before`, `public.fix206_detached` · `fix211_*` 셋 · `fix_bigevent_detached` | 통째로 뺌 (`-N` · `-T`) | 데이터 적재 · 라벨 교체 · 일회성 보정 때 만든 되돌리기 사본. Flyway 밖이고 서비스가 읽지 않음 |
| 로그인 세션 | 덤프에 없음 | Redis 에 있음 |
| 기사 본문 · 기자 이름 | 그대로 | 언론사가 공개한 기사와 바이라인 |

push 전에 확인한 것:

- 새 DB 에 끝까지 되살려 표마다 행 수를 원본 백업과 견줬습니다. 회원 네 표만 0 이고(원본 16 · 41 · 4 · 6), 나머지 14개 표는 원본과 같습니다. 남은 스키마는 `public` 하나입니다.
- 덤프 전체를 평문으로 풀어 키 모양(AWS · GitHub · GitLab · OpenAI 형식 · 개인키 머리)과 GMS 주소를 찾았습니다 — 0건. 자유 글 칸(`analysis_job.error_message` · `result`)에도 키 · IP 모양 · 비밀 낱말 0건입니다(오류 문구 9건은 모두 「가지 0개」).
- 덤프에 회원 네 표의 데이터 줄(`COPY`)이 없습니다.

## 되살리는 법 (로컬)

1-2 ① ~ ② 로 클론 · 덤프 받기 · `.env` 까지 마친 뒤, **backend 를 띄우기 전에** 빈 DB 에 넣습니다. backend 가 먼저 뜨면 Flyway 가 빈 스키마를 만들어 덤프와 부딪힙니다 — 그때는 `docker compose --profile full down` 뒤 `docker volume rm newlearn_db-data` 로 로컬 DB 볼륨만 지우고 다시 합니다(로컬 DB 데이터가 지워집니다).

```bash
docker compose up -d --wait db
```

```bash
docker compose cp exec/files/db/newlearn-20261118-0742.dump db:/tmp/newlearn.dump
```

```bash
docker compose exec -T db pg_restore -U newlearn -d newlearn --no-owner --no-privileges /tmp/newlearn.dump
```

```bash
docker compose --profile full up -d --wait
```

- `-U` · `-d` 는 `.env` 의 `POSTGRES_USER` · `POSTGRES_DB` 입니다(`.env.example` 그대로면 둘 다 `newlearn`).
- 덤프는 컨테이너 안으로 복사한 뒤 컨테이너 안의 `pg_restore`(PostgreSQL 18)로 넣습니다. PowerShell 파이프(`Get-Content … | docker exec`)로 넣으면 바이너리가 깨집니다.
- 다 뜨면 http://localhost:5173 홈에 이슈가 보이고, 4장의 예시 이슈(`/issues/231`)와 기사(`/articles/162025`)를 열 수 있습니다. 회원 표가 비어 있으니 회원 기능은 새로 가입해서 봅니다.
- **운영과 같은 화면으로 보려면 목록 기준값을 운영처럼 켭니다.** 운영 backend 는 공개 기사가 3건 미만인 사건 · 보이는 사건이 3개 미만이거나 메인 흐름 사건이 없는 이슈를 목록에서 뺍니다(`infra/k8s/services/app/backend.yaml`). 로컬 기본값은 이 기준이 낮아 이슈 231 이 사건 8개 · 기사 51건으로 보이고 분야별 이슈 수도 더 많습니다. compose 는 이 값을 backend 에 넘기지 않으므로 `backend/.env`(git 이 무시하는 파일)에 아래 세 줄을 넣고 `docker compose restart backend` 합니다. IDE 에서 띄우면 루트 `.env` 에 넣습니다.

  ```text
  QUERY_MIN_PUBLIC_ARTICLES=3
  QUERY_MIN_PUBLIC_EVENTS=3
  QUERY_MIN_MAIN_EVENTS=1
  ```

  2026-11-17 에 그날 덤프로 이렇게 해서 분야별 이슈 수와 이슈 231(사건 4 · 기사 47)이 운영과 같아지는 것을 확인했습니다. 2026-11-18 덤프는 backend 의 목록 조건(`PublicEventSql`)을 같은 기준값으로 덤프에 바로 돌려, 분야별 이슈 수 정치 45 · 경제 57 · 사회 46 · 국제 44 · IT·과학 11 이 백업 직후 운영 사이트(`/api/v1/categories`)와 같고 이슈 231 이 사건 4 · 기사 47 그대로인 것을 봤습니다. 다 본 뒤에는 `backend/.env` 를 지웁니다 — 호스트에서 돌리는 `./gradlew test` 도 이 파일을 읽습니다.
- 넣은 뒤 컨테이너 안 사본(423MB)은 지워도 됩니다: `docker compose exec db rm /tmp/newlearn.dump`
- 확인한 시간(관리자 PC, Docker Engine 29.6.2): 덤프 넣기 20초, 처음 `up`(의존성 받기 · 컴파일) 약 5분.
- 로컬 기본값은 워커 스위치가 비어 있어(`WORKER_ALLOW_MOCK` 등) AI 워커가 큐를 읽지 않습니다. 덤프의 분석 결과를 그대로 보여 줄 뿐 새 분석은 돌지 않습니다.

## 덤프를 다시 만드는 법 (운영 · 사람)

운영에서 새로 도는 명령 없이, 이미 있는 매일 백업 파일로 만듭니다.

1. 관리 서버(`ssh newlearn`)의 `/var/lib/newlearn/pg-backup/` 에서 가장 새 `.dump` 를 관리자 PC 로 받고 sha256 을 견줍니다(`infra/server/db-backup.md` 「PC 로 가져오기」). 백업에는 회원 정보가 있으니 저장소 밖에 둡니다.
2. 버리는 컨테이너(`pgvector/pgvector:0.8.7-pg18`, 포트 열지 않음)에 `pg_restore` 로 되살립니다.
3. 같은 컨테이너에서 다시 뜹니다.

   ```bash
   pg_dump -U newlearn -d newlearn -Fc --no-owner --no-privileges \
     -N category_label -N embed_load -N load_undo -N rt_before \
     -T public.fix206_detached -T public.fix211_merged -T public.fix211_moved -T public.fix211_reacts -T public.fix_bigevent_detached \
     --exclude-table-data=public.member --exclude-table-data=public.member_category \
     --exclude-table-data=public.bookmark --exclude-table-data=public.interest_issue \
     -f /tmp/newlearn-<백업 시각>.dump
   ```

   `-n public` 은 쓰지 않습니다 — `CREATE EXTENSION vector` 가 빠져 `article_embedding` 이 되살아나지 않습니다. 뺄 스키마 · 표는 그때의 `\dn` · `\dt *.*` 로 다시 봅니다.
4. 새 컨테이너에 되살려 위 「push 전에 확인한 것」을 다시 봅니다.
5. 받은 원본 백업과 버리는 컨테이너를 지웁니다.
