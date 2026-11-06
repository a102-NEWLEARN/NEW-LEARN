# S15P31A102-184 앱 전체 애니메이션 — 화면 · 목록 · 카드 등장, 호버 안내

S15P31A102-184. 2026-11-06 사용자가 「프로토타입처럼 전반적으로 애니메이션」은 앱 전체였다고 답했다(181 은 기사 · 이슈 화면만 했다). 사용자 결정 세 가지 — **길이는 프로토타입 값**, **호버 안내 글자(「흐름 보기」 · 「마인드맵 보기」)를 넣는다**, **랜딩은 첫 화면 그림만**. 커밋만 하고 푸시 · MR 은 요청 때.

## 무엇을 / 왜

기사 · 이슈 화면 밖은 열면 다 그려진 채로 뜬다. 프로토타입 v21 · 모바일 v1 이 모든 화면에 쓰는 세 가지 — **화면이 바뀔 때 본문이 10px 떠오름**, **카드 · 목록 행이 차례로 나옴**, **마우스를 올리면 나타나는 작은 안내** — 를 옮긴다. 데이터 · API · 배치는 그대로다.

| 프로토타입 규칙 | 값 | 앱에 넣을 곳 |
| --- | --- | --- |
| `.im-screen` | 떠오름 300ms, 10px | 셸 안 모든 화면(주소가 바뀔 때마다) |
| `.grid > *` | 떠오름 440ms, 45ms 간격(8번째 315ms 까지) | 홈 추천 이슈 카드 |
| `ul > li` | 떠오름 380ms, 30ms 간격(10번째 270ms 까지) | 홈 최신 기사 · 나의 뉴스함 · 사이드바 펼친 분야의 이슈 행 |
| 호버 안내 | 나타남 + 왼쪽 4px 에서 미끄러짐 150 · 180ms | 이슈 카드 「흐름 보기 ›」, 기사 행 「마인드맵 보기」 |

## 바꿀 파일

공통
- `frontend/src/newlearn-theme.css` — 키프레임 `newlearn-rise-in`(10px 떠오름) 하나
- `frontend/src/components/motion/appMotion.ts` (새 파일) — 위 표의 클래스(`motion-safe:animate-[…]`)와 차례 지연 `cardAt(i)` · `rowAt(i)`(상한 포함). `screenMotion.ts` 는 181 기사 · 이슈 전용(예외 숫자)이라 나눈다. 지연 style 은 `screenMotion.ts` 의 `enterAt` 을 쓴다
- `frontend/src/components/shell/AppShell.tsx` — `<Outlet>` 을 `key={pathname}` 인 떠오름 칸으로 감싼다

화면별
- `pages/LoginPage.tsx` — 화면 나타남 150ms + 폼 떠오름 260ms
- `components/home/HomeHeroBackground.tsx` — 배경 그림 전체 나타남 520ms
- `components/home/RecommendedIssues.tsx` — 분야를 바꿀 때 묶음 떠오름 260ms, 카드 차례
- `components/home/LatestArticles.tsx` — 행 차례(분야를 바꾸면 `key=cat` 이라 다시 나옴)
- `components/home/HomeViewTabs.tsx` — 좁은 화면 추천 이슈 / 최신 기사 탭 패널 나타남 180ms
- `pages/BookmarksPage.tsx` — 행 차례
- `components/home/SearchBox.tsx` — 결과 목록 나타남 120ms
- `components/shell/DictionaryWindow.tsx` — 말풍선 떠오름(사전 200ms · 내 질문 160ms)
- `components/InterestChips.tsx` — 칩 눌림 축소 `var(--seed-scale-s97)` · 150ms (가입 · 마이페이지. EXPERIENCE 「호버 · 눌림」이 칩 축소를 요구한다)
- `components/shell/IssueExplorer.tsx` — 분야를 펼치면 그 아래 이슈 행이 차례로 떠오름
- `components/shell/Header.tsx` · `Sidebar.tsx` · `IssueExplorer.tsx` · `components/issue/InterestButton.tsx` — 바탕이 바뀌는데 전환이 없는 곳에 150ms 색 · opacity 전환
- `pages/LandingPage.tsx` — 첫 화면 그림(`HeroTimeline`): 인사 막이 걷힌 뒤 가로선 → 세로선이 그려지고(`DRAW`) 카드가 떠오르고 노드 · 라임 점이 튀어나옴(`SPRING_IN`). 둘 다 `screenMotion.ts` 에 있는 것을 쓴다

호버 안내 (새 글자)
- `components/IssueCard.tsx` — 사건 · 기사 수 줄 오른쪽 끝에 「흐름 보기 ›」(브랜드색 13px). 평소 투명, 카드 호버 · 키보드 포커스 때 나타남 + 미끄러짐. 화면 읽기에서는 뺀다(`aria-hidden`) — 카드 링크 이름은 그대로
- `components/ArticleRow.tsx` — 새 prop `listIndex`(행 차례) · `mindmapHint`. `mindmapHint` 이고 마인드맵이 있는 기사(`SUCCEEDED`)일 때만, 768px 이상에서 링크 오른쪽 끝에 「마인드맵 보기」. 홈 최신 기사 · 나의 뉴스함에만 켠다(사건 패널은 좁아서 끈다)

시험 · 문서
- 시험: `AppShell` · `LoginPage` · `RecommendedIssues` · `LatestArticles` · `BookmarksPage` · `IssueCard` · `ArticleRow` · `SearchBox` · `DictionaryWindow` · `InterestChips` · `IssueExplorer` · `LandingPage` 의 `.test.tsx` 에 더한다. 도우미는 `test/motion.ts` 의 `expectMotionSafe` · `enterDelay`
- EXPERIENCE 「모션」 — 앱 전체 한 줄(화면 떠오름 · 카드 · 목록 행은 위 숫자의 예외, 프로토타입 값). 「호버 · 눌림」 — 호버 안내는 꾸밈이라 없어도 쓸 수 있다는 한 줄
- DESIGN — 이슈 카드 · 기사 행 표에 호버 안내 모양 행

## 작업 순서

- [x] 계획 — 이 파일
- [ ] 공통 키프레임 · `appMotion.ts` · 화면 떠오름(셸) · 로그인 (시험 먼저) — `AppShell.test.tsx` · `LoginPage.test.tsx`
- [ ] 홈 — 배경 나타남 · 추천 묶음 · 카드 차례 · 최신 기사 행 차례 · 좁은 화면 탭 패널 (시험 먼저)
- [ ] 호버 안내 — 이슈 카드 · 기사 행 (시험 먼저)
- [ ] 목록 · 작은 반응 — 나의 뉴스함 · 검색 목록 · 용어사전 말풍선 · 칩 눌림 · 사이드바 펼친 행 · 색 전환 (시험 먼저)
- [ ] 랜딩 첫 화면 그림 (시험 먼저)
- [ ] 문서 — EXPERIENCE · DESIGN
- [ ] 화면 확인 — 1440 · 393 프레임 · GIF, 동작 줄이기

## 안 바꿀 것

- 기사 · 이슈 화면 안의 움직임(181). 화면 떠오름만 셸에서 같이 받는다
- SEED 가 정한 움직임 — 스낵바 · 메뉴 서랍 · 탭 밑줄 · 프로필 메뉴 · 스켈레톤. 프로토타입과 조금 달라도 디자인 시스템을 따른다
- 랜딩 소개 본문(단계 · 기능 카드 · FAQ) · 큰 제목 줄 올라오기 · 화살표 까딱 · 스크롤 헤더, 프로토타입 그림 모양(`LandingHeroMap`) — 지금 그림에 움직임만 넣는다
- 이슈 카드 미니 타임라인 — 요소부터 새로 만드는 일이다
- 사이드바 분야 펼침의 높이 애니메이션 — 접힌 목록을 DOM 에 남기면 키보드 포커스가 들어간다. 펼친 행이 떠오르기만 한다
- 카드 눌림 축소(EXPERIENCE 대로 그대로), 카드 호버 들림 · 그림자(DESIGN 「그림자 넣지 않기」)
- 데이터 · API · 배치 · 문구(호버 안내 두 개 말고)

## 리스크

- 화면 떠오름 칸에 `key={pathname}` 을 주면 같은 화면이라도 주소가 바뀌면(기사 1 → 기사 2) 화면을 새로 그린다. 화면 안 상태가 처음으로 돌아간다 — 보기 탭 · 고른 사건은 주소(`?view=` · `?event=`)에 있어 남는다. 이슈 화면에서 `?event=` 만 바뀔 때는 다시 그리지 않는다
- 떠오르는 300ms 동안은 본문에 `transform` 이 걸려 그 안의 `position: fixed` 가 본문 기준이 된다. 지금 화면 안에는 fixed 요소가 없다(셸 · 용어사전 · SEED 포털은 본문 밖)
- 홈을 처음 열면 화면 떠오름 · 배경 나타남 · 카드 차례가 겹친다. 프로토타입도 같지만 어지러우면 화면 떠오름을 홈에서 뺀다
- 기사 행 「마인드맵 보기」는 투명할 때도 자리를 차지한다(약 100px). 768px 이상에서 제목이 그만큼 일찍 꺾인다 — 스크린숏으로 본다
- 목록이 다시 불러와져도 행 `key` 가 id 라 다시 돌지 않는다. 분야를 바꿀 때만 다시 돈다

## 어떻게 검증하나

- 시험(새로, 빨강 먼저)
  - 셸: 본문 칸에 떠오름 클래스, 주소가 바뀌면 새 칸(같은 요소가 아님), `?event=` 만 바뀌면 같은 칸
  - 카드 · 행 차례: 지연이 차례로 커지고, 상한(카드 8번째 315ms · 행 10번째 270ms) 뒤로는 같다. 분야를 바꾸면 다시 그린다
  - 호버 안내: 마인드맵이 있는 기사 · `mindmapHint` 일 때만 「마인드맵 보기」, 사건 패널에는 없음, 두 안내 모두 `aria-hidden` 이고 링크 이름이 그대로. 꾸밈(나타남 · 미끄러짐)을 지우면 실패하는 단언
  - 칩 눌림 축소 클래스, 말풍선 · 검색 목록 · 로그인 · 랜딩 그림 클래스와 차례
  - 손댄 시험마다 `expectMotionSafe()` — 움직임 클래스가 하나라도 `motion-safe:` 없이 붙으면 실패
- 기존 시험 그대로 통과(Node 26)
- 화면: `dev:mock` 에서 1440 · 393 — 홈 · 나의 뉴스함 · 로그인 · 랜딩을 0 · 150 · 300 · 600ms 에 멈춰 찍고(`document.getAnimations()` 의 `currentTime`), 카드 · 행 호버 안내를 찍는다. 홈 GIF 하나. `reducedMotion: "reduce"` 로 열면 첫 프레임이 다 그린 모양이고 우리 키프레임이 0개다
- 게이트: 포맷 · 린트 · 시험(Node 26) · 빌드

## 되돌리는 법

- 이 브랜치 커밋을 revert 하면 움직임과 호버 안내만 빠진다. 데이터 · 배포 · 인증과는 상관없다. 호버 안내만 빼려면 그 커밋 하나만 되돌린다
