# S15P31A102-221 넓은 화면 이슈 흐름 세로 보기 — 세로 흐름 + 고른 사건 2단, 지도는 전환으로

## 무엇을 / 왜

F07 사건 중심 이슈 에볼루션 맵의 넓은 화면에 **세로 보기**를 더하고 기본으로 둔다. 「흐름을 한눈에 보기엔 세로가 편하다」는 피드백을 받았다. 지금 가로 지도는 사건 제목이 「응시자격 …」처럼 잘리고, 사건이 몰린 곳은 라벨이 겹친다.
세로 보기는 이슈 흐름 카드 안을 두 칸으로 나눈다. 왼쪽은 폰과 같은 세로 타임라인(제목 전체), 오른쪽은 고른 사건 내용(지금 사건 패널 내용)이고 붙박이로 둔다. 가로 지도는 「세로 | 지도」 전환으로 남긴다.
목업: `.notes/issue-vertical-flow/b-split.png` (로컬, 커밋 안 함). 최종 발표(11-18) 전 `frontend` 머지가 목표다.

## 정한 것 (2026-11-16 사용자)

| 무엇 | 정한 것 |
| --- | --- |
| 모양 | B — 왼쪽 세로 흐름 + 오른쪽 고른 사건 붙박이. 두 칸은 따로 스크롤한다 |
| 지도 | 없애지 않고 「세로 \| 지도」 전환으로 둔다. **세로가 기본**이고, 지도를 고르면 `?view=map` (주소만 replace, 기록 안 쌓음). 기본인 세로는 쿼리를 붙이지 않는다 — 홈 `?view=latest` · 기사 `?view=map` 과 같은 규칙 (EXPERIENCE.md:53 · :60 · :64 · :77) |
| 처음 고른 사건 | `?event=` 없이 열면 **최신 사건**(`timelineLayout.latestEventId`)을 오른쪽에 보인다. 주소에는 사용자가 고를 때(목록 누르기 · 이전/다음)만 남긴다. 왼쪽 목록은 위(첫 사건)에서 시작한다 |
| 폰 | 그대로 — 세로 목록 + 아래 시트. `?view` 는 무시한다 |
| 오른쪽 내용 | 지금 사건 패널 내용 `EventPanel` 을 그대로 쓴다. 닫기 버튼은 없다 |

**내가 정한 것** (승인할 때 같이 봐 주세요)
- **포커스**: 왼쪽에서 사건을 고르면 포커스를 오른쪽 사건 제목(h2)으로 옮긴다. 지금 패널을 열 때와 같은 규칙이다 (EXPERIENCE.md:91). 오른쪽 칸 안에서 Esc 를 누르면 닫지 않고 **고른 사건 줄로 포커스를 돌린다**. 닫을 것이 없어서 「닫으면 그 노드로」를 이렇게 옮겼다. 처음 골라 둔 최신 사건과 이전/다음 사건은 포커스를 옮기지 않는다. 이전/다음은 지금처럼 그 버튼에 남는다
- **목록 스크롤**: 주소로 연 사건(`?event=`)이나 이전/다음으로 바꾼 사건이 왼쪽 목록 밖에 있으면 그 줄이 보이게 왼쪽 칸만 스크롤한다. 처음 골라 둔 최신 사건은 스크롤하지 않는다(목록은 위에서 시작)
- **왼쪽 칸 폭**: 카드의 42%, 최소 300px · 최대 440px. 넓은 화면 최소 폭(768px)에서도 오른쪽이 380px 안팎 남는다
- **전환 버튼 모양**: 관련 기사 「오래된 순 | 최신 순」 정렬 버튼(`EventPanel.tsx:414` 의 `role="group"` + `aria-pressed` 알약)과 같은 모양이다. 탭이 아니라 보기 버튼이라 DESIGN.md:438(탭은 칩 모양 금지)에 걸리지 않는다. 자리는 도구줄 오른쪽 맨 앞이다(「세로 | 지도」 → 지도면 확대 · 축소 · 전체 보기 → ! → TIP)
- **GA**: 기사 화면 `article_view_switch` 와 같은 방식으로 `issue_view_switch`(view) 를 보낸다. 피드백대로 세로를 기본으로 둔 뒤 지도를 얼마나 다시 고르는지 볼 수 있다
- **TIP 다루는 법 한 줄**: 「사건을 누르면 오른쪽에 그 사건의 요약과 기사를 보여 줘요.」
- **관련 기사 정렬**: 세로 보기에서는 다른 사건을 골라도 고른 정렬이 남는다(지금 이전/다음과 같다). 보기를 바꾸거나 화면을 떠나면 처음(오래된 순)으로 돌아간다

## 바꿀 파일

- `frontend/src/components/issue/TimelineList.tsx` — 사건 목록 부분(민트 선 · 달 제목 · 사건 줄)을 `TimelineEvents` 로 떼어 export 한다. `TimelineList` 는 머리 + `TimelineEvents` 로 그대로 그린다(폰 모양 그대로)
- `frontend/src/components/issue/IssueFlowSplit.tsx` (새로) — 넓은 화면 세로 보기. 카드 + 도구줄(이슈 흐름 · 기간 · 전환 · ! · TIP) + 왼쪽 `TimelineEvents` + 오른쪽 `<aside aria-label="사건 상세">` 안의 `EventPanel`. 포커스 · Esc · 목록 스크롤 · 사건이 바뀌면 오른쪽을 맨 위로(`EventDetailPane.tsx:42` 와 같은 규칙)를 맡는다
- `frontend/src/components/issue/IssueViewSwitch.tsx` (새로) — 「세로 | 지도」 버튼 묶음. 지도 도구줄과 세로 도구줄이 같이 쓴다
- `frontend/src/components/issue/Timeline.tsx` — 도구줄에 `viewSwitch?: ReactNode` 자리 하나만 더한다
- `frontend/src/pages/IssuePage.tsx` — `?view=map` 읽기 · 쓰기(`ArticlePage.tsx:67-71 · :116-130` 방식, 기본이면 쿼리를 지운다 — `HomePage.tsx:79-92`). 넓은 화면은 세로면 `IssueFlowSplit`(보이는 사건 = `?event=` 또는 최신 사건)을 그리고 `EventDetailPane` 을 그리지 않는다. 지도면 지금 그대로다. 좁은 화면도 지금 그대로다
- `frontend/src/lib/analytics.ts` — 이벤트 이름 `issue_view_switch` 를 더한다
- 시험: `frontend/src/components/issue/IssueFlowSplit.test.tsx` (새로) · `frontend/src/pages/IssuePage.test.tsx` · `frontend/src/components/issue/Timeline.test.tsx` (전환 자리 하나)
- 문서: `_bmad-output/planning-artifacts/ux-designs/ux-S15P31A102-2026-10-15/EXPERIENCE.md` — :62 이슈 화면 행 · :63 사건 패널 행(정렬 되돌림) · :72 · :91 오른쪽 패널(세로 보기 붙박이, Esc 는 사건 줄로) · :138 사건 노드 · :199 모션(세로 보기는 폰과 같은 움직임) · :230-231 · :240 Responsive · :259 Flow A 4단계(처음부터 최신 사건이 보인다) · :281
- 문서: 같은 폴더 `DESIGN.md` — :360 Timeline 패턴(넓은 화면 기본은 세로 목록 + 사건 칸, 지도는 전환) · :450 아직 정하지 않은 것 · 보기 전환 버튼 모양 한 줄
- 계획: 승인되면 이 파일을 `docs/plans/2026-11-16-issue-vertical-flow.md` 로 이름을 바꾼다 (티켓 본문이 이 이름을 가리킨다)

## 작업 순서

- [x] 1. `refactor(frontend)` — `TimelineList` 에서 `TimelineEvents` 를 떼어 낸다. 확인: 고치지 않은 `TimelineList.test.tsx` 10개와 `IssuePage.test.tsx` 좁은 화면 시험이 그대로 통과한다
- [x] 2. `feat(frontend)` — `IssueFlowSplit` · `IssueViewSwitch`. 시험을 먼저 쓴다: 처음엔 최신 사건(120) 내용 · 줄을 누르면 고르고 오른쪽 제목으로 포커스 · 오른쪽에서 Esc 면 고른 줄로 포커스 · 고른 줄 `aria-current` · 처음 골라 둔 사건은 목록을 스크롤하지 않고 주소로 연 사건은 스크롤 · 전환 버튼 `aria-pressed`. 확인: `IssueFlowSplit.test.tsx` 빨강 → 초록
- [x] 3. `feat(frontend)` — 이슈 화면에 전환을 붙인다(`IssuePage` · `Timeline` 자리 · `analytics`). 시험을 먼저 쓴다: 넓은 화면 기본은 세로 보기이고 `?event=` 없이 최신 사건이 오른쪽에 있으며 주소는 비어 있다 · 「지도」를 누르면 `?view=map`(REPLACE) + 가로 지도이고 패널은 닫혀 있다 · 「세로」로 돌아오면 쿼리가 지워진다 · `?view=map` 으로 열면 지도다 · 세로 보기에서 이전/다음을 누르면 `?event=` 가 붙는다 · 좁은 화면은 `?view=map` 이어도 세로 목록 + 시트다. 기존 넓은 화면 시험 중 **지도 동작을 보는 것은 주소에 `?view=map` 을 붙인다** — 기본 보기가 바뀌어서다. 단언은 그대로 두고, 주소 문자열을 통째로 비교하는 곳만 `view=map` 을 넣는다(예: `"?event=119"` → `"?view=map&event=119"`). 확인: Node 26 전체 시험
- [x] 4. `docs(frontend)` — EXPERIENCE.md · DESIGN.md 를 위 줄대로 고친다. 확인: 문서끼리, 그리고 코드와 어긋나는 문장이 없는지 grep(「가로 지도」 · 「사건 패널이 열」 · 「닫으면」)
- [x] 5. 화면 확인 — 목업 모드 5199 에서 1440×900 · 1024×768 스크린샷(처음 연 모습 · 사건을 고른 모습 · 지도로 바꾼 모습), 키보드(Tab 으로 줄 → Enter → 오른쪽 제목 → Esc → 그 줄). `.notes/mr/S15P31A102-221/` 에 둔다. 그다음 `/verify` · MR 초안 `.notes/mr/S15P31A102-221.md`

## 안 바꿀 것

- 가로 지도 자체(`Timeline.tsx` 의 그리기 · 확대 · 축소 · 빈 곳 눌러 풀기 · 패널을 닫으면 처음 보기) — 도구줄에 자리 하나만 더한다
- 지도 보기의 사건 패널(`EventDetailPane.tsx`) — 480px · X · Esc 닫기 그대로
- `EventPanel.tsx` 내용 · 순서 · 애니메이션
- 폰 화면(세로 목록 모양 · 시트)
- API · 백엔드 · `docs/api-screen.md` · `SSOT.md` (화면 배치 문장이 없다). 화면용 F07 스펙 파일은 없어 새로 만들지 않는다
- 세로 보기의 사건 줄이기(메인 10 · 서브 5 · +N, api-screen.md:153) — 폰처럼 전부 보인다
- 고른 보기를 기억하기(localStorage) — 주소로만 둔다
- 세로 목록 사건 누르기 GA(`timeline_node_click`) — 지도에만 있는 것을 그대로 둔다

## 리스크

- **기존 시험 수정**: 넓은 화면 시험 약 15개가 기본 = 지도를 가정한다. `?view=map` 을 붙이면서 단언을 약하게 바꾸는 실수가 섞일 수 있다 → 주소 문자열 외의 단언은 건드리지 않는다. 바꾼 시험 목록을 MR 에 적는다
- **포커스 · Esc 겹침**: TIP(캡처 단계) · 용어사전 말풍선 · 가입 권유 창과 Esc 가 겹친다 → `EventDetailPane.tsx:51-67` 과 같은 거름(`defaultPrevented` · `isComposing` · dialog 안)을 쓰고, 오른쪽 칸 안에 포커스가 있을 때만 움직인다
- **두 칸 스크롤**: 화면 높이를 채우는 레이아웃이라 `min-h-0` 이 빠지면 칸이 늘어나 스크롤이 안 된다 → 1024×768 스크린샷으로 확인한다
- **최신 사건을 주소에 안 남김**: EXPERIENCE.md:53 「주소를 복사해 열면 같은 선택으로」와 살짝 어긋난다. 새 사건이 붙으면 같은 주소가 다른 사건을 보인다. 그래도 「고르지 않음 = 그때의 최신」으로 문서에 적는다. 새 사건 연결은 발표 뒤에 켠다(SSOT.md:389)
- **발표 이틀 전**: 다 못 끝내면 3번 커밋(전환)을 머지하지 않으면 지금 화면 그대로다. 머지한 뒤 반응이 나쁘면 `DEFAULT_VIEW` 를 `"map"` 으로 바꾸면 지도가 기본이 된다(시험 몇 곳도 같이 — 되돌리는 법)

## 어떻게 검증하나

화면용 스펙이 없어 티켓 221 완료 기준을 번호로 쓴다.
- **AC-1** 넓은 화면 이슈 화면이 세로 보기로 열리고 최신 사건 내용이 오른쪽에 보인다 — `IssuePage.test` 「넓은 화면 기본은 세로 보기 …」(12번 이슈 → 120번 제목이 `사건 상세` 안 h2, `location.search === ""`) + 1440×900 스크린샷
- **AC-2** 「지도」로 바꾸면 지금 가로 지도가 그대로 나오고 `?view=map` 이 남는다 — `IssuePage.test` 「지도를 누르면 …」(`svg[aria-label="사건 타임라인"]` · `?view=map` · REPLACE) + `?view=map` 을 붙인 기존 지도 시험 전부 통과 + 스크린샷
- **AC-3** 키보드로 사건을 고르고 이전 · 다음으로 넘길 수 있다 — `IssueFlowSplit.test` 포커스 · Esc 시험 + 화면에서 Tab/Enter/Esc 직접 확인
- **AC-4** frontend 시험(Node 26) · 린트 · 포맷 · 빌드 통과 — 숫자로 적는다
- 폰이 그대로인지 — 고치지 않은 `TimelineList.test.tsx` 와 좁은 화면 시험 통과 + 390×844 스크린샷 한 장

## 한 일 (2026-11-16)

- 커밋: `2db4f95` 목록 떼어 내기 · `5ecba1e` 세로 보기 · 전환 버튼 · `2a330b0` 이슈 화면 연결 · `d255684` 문서
- 순서를 하나 바꿨다 — 문서(4) 전에 화면 확인(5)을 먼저 했다. 레이아웃이 어긋나면 문서 내용도 바뀌어서다
- 계획에 없던 것 하나: 지도 보기에서 다른 이슈의 사건 주소로 옮길 때 `?view=map` 을 남긴다(`IssuePage` 의 이슈 바로잡기). 보기 쿼리를 더하면서 생긴 빈틈이라 같은 커밋에 넣고 시험을 붙였다
- 기존 시험 12곳에 `?view=map` 을 붙였다 — 단언은 그대로, 주소 문자열만 `view=map` 을 넣었다. 목록은 MR 초안 `.notes/mr/S15P31A102-221.md`
- 화면: `.notes/mr/S15P31A102-221/` 1440 · 1024 · 폰 스크린샷 5장, 키보드(줄 → Enter → 오른쪽 제목 → Esc → 그 줄) 확인

## 되돌리는 법

- 데이터 · API 변경이 없어 언제든 되돌릴 수 있다. 커밋 단위로 `git revert`(3 → 2 → 1 순서)
- 지도만 다시 기본으로 하려면 `IssuePage.tsx` 의 `DEFAULT_VIEW` 를 `"map"` 으로 바꾼다. 이때 기본 보기 시험과 주소 문자열 단언(`?view=map` → `?view=list`)을 같이 고쳐야 한다 — 한 줄로 끝나지는 않는다
