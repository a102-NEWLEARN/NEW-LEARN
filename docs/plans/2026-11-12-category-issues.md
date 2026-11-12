# 분야별 이슈 전체 화면 · 홈 「전체보기」 · 왼쪽 사이드바 제거 (Jira S15P31A102-196)

## 무엇을 / 왜

홈 추천 이슈는 분야마다 3개만 보여서, 나머지 이슈를 보려면 왼쪽 사이드바를 펼쳐야 했다. 분야별 이슈를 모두 보는 화면 `/issues?category=` 를 만들고, 홈 추천 이슈 아래에 그 화면으로 가는 버튼을 단다. 그다음 왼쪽 사이드바(넓은 화면 레일 · 좁은 화면 서랍)를 뺀다 (2026-11-12 사용자 결정, PM 의논 완료).
PRD FR-3 · FR-4 카테고리별 이슈 목록은 이제 이 화면이 맡는다. PRD 메모(「별도 목록 화면이 필요한지」)와 user-flow 5절(「분야 → 이슈 목록 화면이 따로 없음」)도 이것으로 닫힌다.
195 모바일 QA 계획 8번(좁은 화면 서랍 · 메뉴 버튼 빼기)은 195 가 마저 하고 `frontend` 에 먼저 머지한다. 이 작업의 4번은 그 뒤 rebase 해서 넓은 화면 사이드바만 뺀다 (2026-11-12 사용자 결정 — 처음에는 196 이 맡기로 했으나 195 가 이미 고치고 있었다).

## 화면

```
분야별 이슈                                       ← h1, 탭 제목 「분야별 이슈」
여러 언론사 기사를 사건 단위로 묶어 정리한 이슈예요. 마지막 사건이 최근인 이슈부터 보여줘요.
★IT·과학  정치  [경제]  사회  국제  스포츠 준비 중 …   ← 홈과 같은 분야 탭 · 같은 순서(관심 분야 먼저)
┌카드┐ ┌카드┐ ┌카드┐                                ← IssueCard, 홈과 같은 그리드(280px 이상, 넓으면 3열)
┌카드┐ ┌카드┐ ┌카드┐   … 처음 12개
        [ 이슈 12개 더 보기 ⌄ ]                      ← 남은 게 있을 때만. 누르면 다음 12개를 붙이고 첫 새 카드로 포커스

홈 추천 이슈:  카드 3장
              [ 경제 이슈 29개 전체보기 › ]            ← 카드 아래 가운데, 보조 버튼(neutralOutline). 이슈가 있을 때만
```

- 주소 `?category=` 는 홈처럼 기록을 쌓지 않고 바꾼다. 없거나 모르는 코드면 맨 앞 탭이다
- 순서는 A2 기본(마지막 사건 최신순). 관심 이슈를 앞으로 당기지 않는다 — 전체 목록이라서. 관심 이슈는 카드의 「관심 이슈」 표시로 보인다
- 비었을 때 「이 분야의 이슈가 아직 없어요」, 실패하면 다시 시도. 등장 움직임은 홈 추천 카드와 같다(`GROUP_RISE` · `CARD_RISE`)

## 바꿀 파일

새로 만든다
- `frontend/src/pages/IssuesPage.tsx` · `.test.tsx` — 분야별 이슈 화면
- `docs/plans/2026-11-12-category-issues.md` — 이 계획 (승인 뒤 이 파일 이름을 바꿔 커밋한다)

고친다
- `frontend/src/api/issues.ts` · `.test.ts` — `ISSUES_PAGE_SIZE = 12`, 쪽 넘김 쿼리 `issuesPagesQuery(category)`. `articlesQuery`(`api/articles.ts`)와 같은 꼴. 키는 `["issues", "pages", { category }]` — 홈의 `["issues", {…}]` 와 모양이 달라 섞이지 않게
- `frontend/src/api/interestIssues.ts` · `.test.ts` — `patchIssue` 가 쪽 넘김 응답(`pages[].items`)에서도 별을 바꾼다. 안 하면 이슈 화면에서 별을 누르고 돌아왔을 때 카드의 「관심 이슈」 표시가 옛 값이다
- `frontend/src/components/CategoryTabs.tsx` — `RecommendedIssues` 의 `orderTabs` 를 여기로 옮겨 두 화면이 같은 탭 순서를 쓴다
- `frontend/src/components/home/RecommendedIssues.tsx` · `.test.tsx` — 카드 아래 「OO 이슈 N개 전체보기」(N 은 A2 `totalElements`)
- `frontend/src/routes.tsx` · `routes.test.tsx` — `/issues` 를 셸 안에 둔다
- 사이드바 제거
  - 지운다: `components/shell/Sidebar.tsx` · `SidebarDrawer.tsx` · `IssueExplorer.tsx` · `useShell.ts` 와 그 시험들
  - `AppShell.tsx` — 사이드바 · 서랍 상태, ⌘/Ctrl+\, 화면에 넘기던 `collapseSidebar` 를 뺀다. ⌘/Ctrl+K 빠른 이동 · 화면 바뀔 때 h1 포커스 · 용어사전은 그대로
  - `Header.tsx` · `.test.tsx` — 좁은 화면 메뉴 버튼을 빼서 로고가 맨 왼쪽
  - `pages/IssuePage.tsx` · `.test.tsx` — 패널 열 때 사이드바 접기, 사이드바 사건 링크 표시(`isSidebarEventPick`)를 뺀다
  - `components/issue/InterestButton.tsx` — 사이드바에서만 쓰던 `small` 크기 · 제목 붙이기를 뺀다
  - 사이드바가 있다/없다를 보던 시험 줄(`ArticlePage` · `LandingPage` · `LoginPage` · `SignupPage` · `routes`)을 고친다
  - 주석만: `useQuickSearch.ts` · `useMediaQuery.ts` · `useSnackbar.tsx` · `interestIssues.ts` 의 「사이드바」
- 문서 — 그 코드와 같은 커밋에서 고친다
  - `EXPERIENCE.md` — IA 에 「분야별 이슈」 행을 더하고 홈 행에 전체보기. 앱 셸(헤더 · 사이드바 · 본문 · 오른쪽 패널), 키보드(⌘/Ctrl+\ 삭제, Esc 닫는 순서에서 서랍 삭제), Responsive 표의 사이드바 열, 관심 이슈 별 · aria-current 의 사이드바 언급
  - PRD `prd.md` — 단축키 줄, FR-3 · FR-4 본문 · 메모, 우선순위 표 · 화면 표의 「사이드바」를 분야별 이슈 화면으로
  - `docs/user-flow.md` 5절 · 6절, `docs/api-screen.md` A1 · A22 · A23 설명의 「사이드바」

## 작업 순서 — 한 줄이 커밋 하나

- [x] 1 계획 커밋 (`docs(plan)`)
- [x] 2 분야별 이슈 화면 — 쿼리 · 별 갱신 · 탭 순서 옮기기 · 화면 · 주소 + EXPERIENCE IA 행. 실패하는 시험 먼저(첫 12개 · 더 보기로 붙고 포커스 · 탭 바꾸면 주소 · 모르는 코드면 첫 탭 · 빈 분야 · 별 갱신)
- [x] 3 홈 추천 이슈 전체보기 버튼 + EXPERIENCE 홈 행. 시험: 고른 분야 주소로 가는 링크 · 개수 · 이슈 없으면 숨김
- [x] 4 **195 머지 뒤에 한다.** (2026-11-12 사용자 「쭉 진행」 — 195 를 기다리지 않고 195 브랜치 위로 rebase 해서 했다) rebase 하고, 하다 멈춘 변경(`.notes/mr/S15P31A102-196/step4-wip.patch` — 이슈 화면 · 관심 이슈 별 · 셸 시험)을 다시 얹는다. 서랍 · 메뉴 버튼 · `SidebarDrawer` 는 195 가 뺀다. 사이드바 제거 + EXPERIENCE 앱 셸 · 키보드 · Responsive, PRD, user-flow, api-screen. 시험: 셸에 사이드바 · 메뉴 버튼 없음, ⌘/Ctrl+K 는 그대로
- [x] 5 스크린숏 확인(393 · 1440) → MR 초안 `.notes/mr/S15P31A102-196.md`

## 안 바꿀 것

- 백엔드 · A2 API — 이미 `category` · `page` · `size` 를 받는다
- 홈 추천 이슈의 고르는 규칙(관심 이슈 먼저 3개)과 머리 부분 — 195 가 머리를 고쳤다(`fbc993d`). 이 작업은 카드 아래만 건드린다
- `RequireMember.tsx` — 인증 코드다. 셸이 넘길 것이 없어져도 받은 것을 그대로 넘길 뿐이라 둔다
- 마인드맵 · 타임라인 · 검색창의 「서랍 같은 다른 창 안의 Esc」 처리 — 서랍이 아니어도 다른 창(195 의 크게 보기 등)에 그대로 필요하다
- `useMediaQuery` 의 좁은 화면 판정 — 헤더 · 홈이 계속 쓴다
- `docs/mvp-overview.md` — 사이드바 언급이 없다

## 리스크

- **사이드바의 「분야 → 연도 → 이슈 → 사건」 길이 없어진다.** 사건으로 바로 가는 길은 이슈 화면 타임라인 · 검색만 남는다
- **넓은 화면에서 본문이 64px 넓어진다.** 홈 · 목록은 가운데 정렬 최대 폭이 있어 그대로지만, 이슈 · 기사 화면 지도는 칸이 넓어진다 — 1440 스크린숏으로 본다
- **195 와 머지 충돌.** `RecommendedIssues.tsx`(195 는 머리, 이 작업은 카드 아래)와 EXPERIENCE 홈 행(59) · 앱 셸 행이 겹친다. 195 가 먼저 머지하고 196 이 rebase 로 푼다. 셸 파일(`AppShell` · `Header` · `Sidebar` · `IssueExplorer` · `IssuePage.test`)은 195 의 8번 결과 위에서 4번을 다시 한다
- **더 보기 사이에 순서가 바뀌면 같은 이슈가 두 번 올 수 있다.** 사건이 새로 붙은 이슈가 맨 앞으로 오면 다음 쪽이 밀린다. 최신 기사처럼 `uniqueById`(`lib/uniqueById.ts`)로 처음 것만 남긴다
- PRD 는 PM 확인 문서다 — 사용자가 PM 과 의논을 마쳤다고 했다. MR 에 PRD 를 고쳤다고 적는다

## 어떻게 검증하나

- 시험: `IssuesPage.test.tsx`, `RecommendedIssues.test.tsx`, `issues.test.ts`, `interestIssues.test.ts`, `routes.test.tsx`, 셸 · 이슈 화면 시험. 앞에서부터 실패하는 시험을 먼저 쓴다
- 게이트: `/verify` — `.claude/stack.md` §3 명령. 프런트 시험은 Node 26(`npx node@26`)으로도 돌린다(CI 와 같게)
- 화면(`dev:mock`, 393 · 1440 스크린숏)
  - 홈 → 「경제 이슈 N개 전체보기」 → `/issues?category=economy`, 12개 · 더 보기로 24개, 탭 바꾸면 주소 바뀜
  - 홈 · 이슈 · 기사 화면에 왼쪽 사이드바가 없다. 좁은 화면 헤더는 로고가 맨 왼쪽, 메뉴 버튼이 없다
  - ⌘/Ctrl+K 가 여전히 홈 검색창으로 간다. ⌘/Ctrl+\ 는 아무 일도 하지 않는다
  - 이슈 화면에서 별을 누르고 뒤로 오면 그 카드에 「관심 이슈」가 붙어 있다

## 되돌리는 법

MR 을 Revert 한다. 화면 코드와 문서만 바뀐다(데이터 · API 없음). 사이드바 제거는 4번 커밋 하나라, 그것만 되돌리면 사이드바가 돌아오고 분야별 이슈 화면은 남는다.
