# 포팅 매뉴얼 — NEW:LEARN

뉴스 기사를 AI 로 마인드맵(가지 4개: 핵심 내용 · 원인·배경 · 반응 · 전망)으로 구조화하고, 같은 사건을 다룬 기사를 묶어 이슈의 흐름으로 보여 주는 AI 뉴스 서비스입니다. SSAFY 15기 자율 프로젝트 A102 팀(S15P31A102).

이 폴더만 보고 저장소를 클론해 빌드 · 실행 · 배포하고, 시연 순서대로 사이트를 눌러 볼 수 있게 정리했습니다.

| 제출 항목 | 위치 |
|---|---|
| 1. 빌드 · 배포 — 제품 · 설정값 · 버전, 환경 변수, 배포 특이사항, DB 계정 · 설정 파일 목록 | [1-build-deploy.md](1-build-deploy.md) |
| 2. 외부 서비스 | [2-external-services.md](2-external-services.md) |
| 3. DB 덤프 최신본 | [files/db/](files/db/) · 설명은 [3-db-dump.md](3-db-dump.md) |
| 4. 시연 시나리오 | [4-demo-scenario.md](4-demo-scenario.md) · 캡처는 [files/demo/](files/demo/) |
| PDF 한 권 | [porting-manual.pdf](porting-manual.pdf) — 이 README 와 1 ~ 4장을 이어 인쇄한 것. 내용은 Markdown 이 원본이고, 다르면 Markdown 이 맞습니다 |

| `exec/files/` | 내용 |
|---|---|
| `db/newlearn-*.dump` | 운영 DB 덤프(`pg_dump -Fc`, Git LFS). 회원 정보는 행을 비웠습니다 — 3장 |
| `db/schema.sql` | 같은 덤프의 스키마만(평문, 읽기용) |
| `demo/` | 시연 시나리오 화면 캡처 — 운영 사이트 손님 화면 12장 |

## 읽기 전에

- **비밀값은 없습니다.** 키 · 비밀번호 · 토큰 · 서버 IP 는 적지 않았고, 환경 변수와 Secret 의 **이름**과 넣는 곳만 적었습니다.
- **기준일은 2026-11-18 입니다.** 이 폴더는 제출용 스냅샷입니다. 저장소의 원본 문서와 다르면 원본이 맞습니다 — 시스템 · 기술 · 배포는 [`SSOT.md`](../SSOT.md), 기능 · 범위는 [`docs/mvp-overview.md`](../docs/mvp-overview.md), 명령은 [`.claude/stack.md`](../.claude/stack.md) 3절.
- **운영 서버는 2026-11-27 에 회수됩니다.** 그 뒤나 운영 사이트(https://newlearn.io.kr)가 열리지 않을 때는 클론 → 3장 방법으로 빈 DB 에 덤프 넣기 → 로컬 실행 순서로 같은 데이터를 볼 수 있습니다(1-2 · 3장).
- 클론할 때 `data/` 의 기사 SQLite(Git LFS, 약 1.66GB)는 받지 않아도 됩니다. 받는 법은 1-2.
