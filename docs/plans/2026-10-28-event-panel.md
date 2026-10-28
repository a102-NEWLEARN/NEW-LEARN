# S15P31A102-52 사건 패널 — 사건 요약 · 관련 기사 · 이전 · 다음 사건

## 무엇을 / 왜

이슈 화면(-50)에서 사건 노드를 누르면 지금은 주소에 `?event=` 만 붙는다. 그 자리에 F08 사건별 관련 기사 조회 패널을 연다 — 사건 제목 · 날짜 · 요약(A5)과 관련 기사(A6), 이전 · 다음 사건. 백엔드 A5 · A6(Jira 49)은 끝났다.
모양은 프로토타입 v21 `EventPanel` · `DetailPanel`, 자리와 닫기는 EXPERIENCE.md 「오른쪽 패널」 행을 따른다.

```mermaid
flowchart LR
  N["타임라인 노드"] -- "누르기" --> Q["?event=:id"]
  Q --> P["사건 패널 — A5 · A6"]
  P -- "이전 · 다음 사건" --> Q
  P -- "기사 행" --> A["/articles/:id (기사 마인드맵 -58 전까지 찾을 수 없음)"]
  P -- "X · Esc · 타임라인 빈 곳" --> C["?event= 지움 · 포커스는 그 노드로"]
```

## 만들 구조

```
frontend/src/
├─ api/event.ts (+test)                  🆕 A5 — fetchEvent(id) · eventQuery(id) · EventDetail 타입
├─ api/eventArticles.ts (+test)          🆕 A6 — 쪽 단위 fetchEventArticles(id, page, size) · eventArticlesQuery(무한 쪽)
├─ api/types.ts                          ✏️ 기사 요약 · 언론사 참조 타입 (A7 · A22 도 쓴다)
├─ mocks/handlers.ts                     ✏️ A5 · A6 가짜 — 사건마다 요약 · 언론사 · 이전 · 다음, 기사 목록(쪽 나눔)
├─ lib/date.ts (+test)                   ✏️ 기사 날짜 — 오늘 · 어제는 상대 시간, 그 밖은 「10월 14일」
├─ components/AiBadge.tsx                🆕 「AI 생성」 표시 (EXPERIENCE Voice and Tone)
├─ components/ArticleRow.tsx (+test)     🆕 기사 행 — 제목 두 줄 · 언론사 · 날짜 · 분석 중 · 원문 보기 (홈 최신 기사 -45 도 쓴다)
├─ components/issue/EventPanel.tsx (+test) 🆕 패널 내용 — 이슈 이름 · 제목 · 날짜 칩 · 요약 · 관련 기사 · 이전 · 다음
├─ pages/IssuePage.tsx (+test)           ✏️ 넓은 화면은 오른쪽에 붙는 패널, 좁은 화면은 SEED BottomSheet. 닫기 · 포커스 · 다른 이슈의 사건
├─ components/issue/Timeline.tsx         ✏️ 노드에 data-event-id(닫을 때 포커스 돌려주기), TIP Esc 를 캡처 단계로(패널보다 먼저)
└─ components/shell/AppShell.tsx         ✏️ 화면이 사이드바를 접을 수 있게 Outlet context 로 collapseSidebar
_bmad-output/…/EXPERIENCE.md             ✏️ 사건 패널 관련 기사 수 · 날짜 칩 · 요약 없음 · 다른 이슈의 사건
docs/plans/2026-10-28-event-panel.md     ✏️ 이 계획
```

## 정한 것 (사용자가 볼 것)

| 무엇 | 정한 값 | 근거 |
| --- | --- | --- |
| 자리 | lg · md: 본문 오른쪽에 붙는 420px 패널(본문을 덮지 않고 타임라인이 좁아진다). sm 이하: 아래에서 올라오는 시트(화면 높이 85%, 뒤는 딤) — SEED BottomSheet | EXPERIENCE 오른쪽 패널 · Responsive. 폭 420px 은 프로토타입 |
| 열면 | 사이드바를 접는다. 넓은 화면은 포커스를 패널 제목으로, 시트는 SEED 가 시트 안으로 | EXPERIENCE 오른쪽 패널 · Accessibility Floor `[가정]` |
| 닫기 | X(「상세 패널 닫기」) · Esc · 타임라인 빈 곳 · 시트 바깥 → `?event=` 를 지운다(기록 안 쌓기). 닫으면 포커스를 그 사건 노드로 | EXPERIENCE 오른쪽 패널 · Accessibility Floor |
| Esc 순서 | TIP(팝오버)이 열려 있으면 TIP 만 닫는다. 그다음 Esc 가 패널을 닫는다 | EXPERIENCE Interaction Primitives(팝오버 → … → 오른쪽 패널) |
| 머리 | 이슈 이름(청록 작은 글자) · 사건 제목(h2) · 칩 「사건 발생 2026.10.06」(추정이면 「추정」) · 「첫 기사 2026.10.09」(관련 기사가 있을 때) | 프로토타입. 「첫 기사」는 내가 정함 — A6 의 첫 쪽이 발행 순이라 맨 앞이 첫 기사다 |
| 요약 | 「요약」 카드 + 「AI 생성」 표시. `summary` 가 null 이면 카드를 두지 않는다 | 프로토타입 · EXPERIENCE Voice and Tone. null 처리는 내가 정함 |
| 관련 기사 | 「관련 기사 4」 · 「발행 순」. 처음 5건(A6 `size=5`), 더 있으면 「기사 N개 더 보기」로 다음 쪽을 아래에 붙인다. 없으면 「아직 이 사건을 다룬 기사가 없어요.」 | IA 표(5건) · 프로토타입. A6 문서의 4건과 다르다 — EXPERIENCE 「아직 정하지 않은 것」에서 화면이 고르기로 한 값 |
| 기사 행 | 행 전체가 기사 마인드맵 링크. 제목 두 줄 · 「바른신문 · 3시간 전」 · `QUEUED` 면 「분석 중」. 오른쪽에 원문 보기(새 탭) | EXPERIENCE 기사 행 · 날짜 표 · 프로토타입. 북마크 버튼은 -67 |
| 이전 · 다음 사건 | 패널 맨 아래 두 버튼(사건 키워드 · 날짜). 누르면 패널을 연 채 `?event=` 만 바꾼다. 없으면 그쪽 버튼을 두지 않는다 | EXPERIENCE 오른쪽 패널 · A5 |
| 상태 | 패널: 스켈레톤 · 「사건을 불러오지 못했어요」 + 다시 시도 · 404 「사건을 찾을 수 없어요」. 관련 기사: 스켈레톤 · 「관련 기사를 불러오지 못했어요」 + 다시 시도 | EXPERIENCE State Patterns. 사건 404 를 화면 전체로 바꾸지 않는 것은 내가 정함(주소의 이슈는 있다) |
| 다른 이슈의 사건 | A5 의 `issue.id` 가 주소의 이슈와 다르면 그 이슈 주소로 바꾼다(기록 안 쌓기). `issue` 가 null 이면 패널은 보이고 이전 · 다음은 없다 | 내가 정함 (-50 리뷰의 「확인 필요」) |

## 안 바꿀 것

- *기사들을 마인드맵으로 보기* — EXPERIENCE 「QA 때」
- 북마크(-67) · 관점(P2) · 변화(F09 · F10) · 사건 패널의 언론사 목록 표시
- 기사 마인드맵 화면(-58) — 기사 행은 `/articles/:id` 로만 간다
- `docs/api*.md`

## 리스크

- md 768px 근처는 사이드바 64 + 패널 420 을 빼면 타임라인이 284px 다 — EXPERIENCE 가 「구현하며 확인한다」고 둔 일. 화면을 재 보고 좁으면 적는다
- 패널이 열리고 닫히며 타임라인 폭이 바뀐다 — 배치는 폭을 따라 다시 계산된다(-50). 고른 사건이 화면 밖으로 밀리면 옮겨야 한다
- Esc 를 받는 곳이 셋(TIP · 패널 · SEED 시트 · 서랍)이다 — 캡처 순서와 `defaultPrevented` 로 맞추고 테스트한다
- A6 쪽 나눔에서 더 보기 중 사건이 바뀌면 앞 사건 쪽이 섞이지 않게 query key 를 사건마다 둔다

## 어떻게 검증하나

- `frontend/` 포맷 · 린트 · 타입 · 테스트(Node 24 · 26) · 빌드
- 새 테스트: A5 · A6 가짜(404, 쪽 나눔), 기사 날짜, 기사 행(링크 · 분석 중 · 원문 보기), 패널(머리 · 칩 · 요약 · AI · 요약 없음 · 관련 기사 5건 · 더 보기 · 빈 기사 · 실패와 다시 시도 · 이전 · 다음), 이슈 화면(노드 → 패널, X · Esc · 빈 곳 닫기와 포커스 복귀, TIP 이 먼저 닫힘, 사이드바 접힘, 좁은 화면 시트, 다른 이슈의 사건 → 주소 바꿈, 사건 404)
- 되돌림 확인: 기록 안 쌓기 · 포커스 복귀 · Esc 순서 · 다른 이슈 이동 · 더 보기 쪽 붙이기를 각각 깨면 실패하는지
- 화면: `dev:mock` 을 헤드리스 Chrome 으로 1280 · 900 · 375 — 패널 폭과 타임라인, 시트, 콘솔 오류 → `.notes/mr/S15P31A102-52/`
- 리뷰: `reviewer` 조수

## 되돌리는 법

이 MR 을 revert 하면 노드를 눌러도 `?event=` 만 바뀌는 -50 상태로 돌아간다. 데이터 · 배포 · 인증과는 상관없다.

## 작업 순서

- [ ] `feat(frontend)`: A5 사건 패널 · A6 관련 기사를 부르는 함수와 가짜 응답
- [ ] `feat(frontend)`: 기사 날짜 표기
- [ ] `feat(frontend)`: 기사 행과 AI 생성 표시
- [ ] `feat(frontend)`: 사건 패널 내용
- [ ] `feat(frontend)`: 이슈 화면에 사건 패널 — 자리 · 닫기 · 포커스 · 시트
- [ ] `docs(frontend)`: EXPERIENCE 사건 패널 행
- [ ] 화면 확인 · 리뷰 반영

## 하지 않은 것 · 남은 것

(끝나면 채운다)
