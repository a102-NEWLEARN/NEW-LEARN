# 관심 이슈를 나의 뉴스함으로 옮기기 · 쓰지 않는 Zustand 정리 (Jira 216)

## 무엇을 / 왜

관심 이슈 목록을 마이페이지에서 **나의 뉴스함**으로 옮긴다. 저장한 것(별표한 이슈 · 북마크한 기사)은 뉴스함에, 계정 설정(이름 · 아이디 · 관심 분야)은 마이페이지에 두는 편이 흐름이 자연스럽다(2026-11-16 사용자). EXPERIENCE.md 「아직 정하지 않은 것」의 「나의 뉴스함 범위 — 관심 이슈는 마이페이지에 둔다 `[가정]`」이 이것으로 닫힌다. 프로토타입 v21 뉴스함(`LibraryScreen`)에도 「이슈 / 스크랩한 기사」 두 묶음이 있었다.

이어서, 코드에서 쓰지 않는 Zustand(import 0, `src/stores/` 없음)를 의존성과 문서에서 뺀다.

**티켓**: 새로 만들지 않고 216(11-16 디자인 피드백)에 붙인다. 새 티켓을 원하면 말씀해 주세요.

## 어디서 작업하나 — 새 worktree

지금 폴더(`S15P31A102`, 216 브랜치)에서 다른 세션이 216 의 3번 이후를 고치는 중이다(10:16 ~ 10:20 에 파일 8개 변경). 같은 폴더에서 하면 서로의 커밋에 섞인다. 그래서 따로 연다.

- `git worktree add --detach ../S15P31A102-216b origin/frontend` → 그 안에서 `git nb feat frontend 216 library-interest-issues`
- 내 PC 연결 파일 `.claude/hooks/prepare-commit-msg` · `pre-push` 를 원래 폴더에서 복사한다(커밋 안 되는 파일이라 새 worktree 에 없다)
- `frontend/` 에서 `npm ci`
- 이 계획 파일은 새 worktree 로 옮겨 `docs/plans/2026-11-16-library-interest-issues.md` 로 커밋한다

## 바꿀 파일

**뉴스함 모양** (넓은 화면 · 좁은 화면 같은 한 줄, 폭 760px 그대로)

```
나의 뉴스함
저장한 이슈와 기사를 모아 뒀어요.

관심 이슈                         ← h2, 마이페이지 섹션 제목과 같은 글자(t6-bold)
별표로 저장한 이슈예요.
┌──────────────────────────────────┐ ← 지금 기사 목록 상자와 같은 테두리 상자
│ 미래에셋 해킹·고객정보 유출 대응      › │
│ IT·과학 · 사건 4개                  │
├──────────────────────────────────┤
│ 마이크로소프트 서비스 장애와 영향·수습 › │
└──────────────────────────────────┘
                                    ← 섹션 사이 32px, 위 줄은 긋지 않는다(상자가 이미 나눈다)
북마크한 기사
최근에 담은 기사부터 보여줘요.
┌──────────────────────────────────┐
│ (지금 기사 행 그대로)                 │
└──────────────────────────────────┘
```

- 두 섹션은 따로 불러온다 — 한쪽이 실패해도 다른 쪽은 보인다. 빈 상태 문구는 지금 것 그대로
- 기사 쪽 오류 제목 「나의 뉴스함을 불러오지 못했어요」 → 「북마크한 기사를 불러오지 못했어요」(섹션이 둘이라 어느 쪽인지 알게)

**코드**
- `frontend/src/components/bookmarks/BookmarksSection.tsx` (새) — 섹션 틀: `section[aria-labelledby]` · h2 · 한 줄 설명 · 내용. 글자는 `MyPageSection` 과 같고 위 줄은 없다
- `frontend/src/components/mypage/InterestIssues.tsx` → `frontend/src/components/bookmarks/InterestIssues.tsx` (`git mv`) — `BookmarksSection` 으로 감싸고, 목록을 기사 목록과 같은 테두리 상자로. 행 안쪽 여백은 `ArticleRow` 와 맞춘다(`px-x2 py-x3`)
- `frontend/src/pages/BookmarksPage.tsx` — 설명 문구, `<InterestIssues />` 다음에 「북마크한 기사」 섹션. 목록 이름은 「북마크한 기사」
- `frontend/src/pages/MyPage.tsx` — 관심 이슈 섹션을 뺀다. 머리 줄 개수(관심 분야 · 관심 이슈 · 북마크)는 그대로
- `frontend/src/components/mypage/InterestSettings.tsx` — 관심 이슈를 끼워 넣던 `children` 을 뺀다
- 주석만: `components/issue/InterestButton.tsx`(「관심 이슈 목록(마이페이지 · …)」), `api/interestIssues.test.ts`(「별 · 마이페이지 관심 이슈」)

**시험**
- `components/mypage/InterestIssues.test.tsx` → `components/bookmarks/InterestIssues.test.tsx` — `/bookmarks` 에서 열고, 섹션 차례가 「관심 이슈 → 북마크한 기사」인지
- `pages/BookmarksPage.test.tsx` — 설명 · 목록 이름 · 오류 제목, A25 가 401 이면 로그인 화면으로(새)
- `pages/MyPage.test.tsx` — 섹션 차례 「개인정보 → 관심 분야」. 「개수 못 받으면 머리 줄 없음」은 관심 이슈 링크 대신 A22 응답이 온 것을 기다린 뒤 본다

**문서** (코드와 같은 커밋)
- `EXPERIENCE.md` — 마이페이지 행(관심 이슈 부분을 뺌) · 나의 뉴스함 행(관심 이슈 섹션 · 차례 · 문구) · 빈 상태 표 「관심 이슈 없음」 화면 → 나의 뉴스함 · 모바일 v1 비교 줄(「새 사건 N」 배지 자리) · 「아직 정하지 않은 것」의 뉴스함 범위 줄을 지운다
- `docs/api-screen.md` A25 — 「마이페이지의 *관심 이슈* 가 부른다」 → 나의 뉴스함 · 마이페이지 머리 줄 개수, 「새 사건 N」 배지 자리

**Zustand 정리** (따로 한 커밋)
- `frontend/package.json` · `package-lock.json` — `npm uninstall zustand`
- `.claude/stack.md` §2 frontend 줄에서 Zustand 를 뺀다
- `frontend/README.md` — `src/stores/` 줄을 뺀다

## 작업 순서

- [ ] 0. worktree · 브랜치 만들기, 계획 파일 커밋 — `docs(plan)`
- [ ] 1. 관심 이슈를 뉴스함으로 — 시험 빨강 → 초록, `/bookmarks` · `/me` 1440 · 393 스크린숏 — `feat(frontend)`
- [ ] 2. Zustand 정리 — `npm ls zustand` 없음, `git diff package-lock.json` 이 zustand 줄만, 빌드 통과 — `chore(frontend)`
- [ ] 3. `/verify` · MR 초안 `.notes/mr/S15P31A102-216-library.md`

항목마다 시작 전에 짧게 개요를 말하고 OK 를 받는다. 스크린숏은 `.notes/mr/S15P31A102-216-library/`.

## 안 바꿀 것

- API · 백엔드 · 데이터 — A22 · A25 응답 그대로
- 헤더 「나의 뉴스함」 이름 · 아이콘 · 주소(`/bookmarks`), 화면 제목
- 마이페이지 머리 줄 개수, 화면 아래에 붙은 저장 줄, `MyPageSection`
- 이슈 머리 별 · 홈 추천의 관심 이슈 먼저 · 이슈 카드 「관심 이슈」 표시
- `ArticleRow` — 216 의 7번(기사 목록 명암)이 고친다
- 216 브랜치 · 원래 폴더의 파일

## 리스크

- **216 MR 과 문서가 겹친다** — `EXPERIENCE.md` · `api-screen.md` 를 양쪽이 고친다. 줄은 다르다(216: EXPERIENCE 139 ~ 140 · api-screen 268, 이쪽: EXPERIENCE 65 · 69 · 163 · 248 · 283 · api-screen 449). 충돌이 나면 줄 단위로 푼다
- **관심 이슈가 많으면 북마크한 기사가 아래로 밀린다** — 개수 제한은 두지 않는다. 스크린숏으로 본다
- **마이페이지 머리 줄에 관심 이슈 개수는 남는데, 목록은 다른 화면에 있다** — 요약이라 그대로 두기로 했다(사용자 OK)
- **「아직 정하지 않은 것」의 정할 사람이 「팀」이다** — 이번에 닫으니 팀에 한 줄 알린다(MR 본문에도 적는다)
- `package-lock.json` 이 npm 버전 차이로 다른 줄까지 바뀔 수 있다 — diff 가 zustand 줄만인지 보고, 아니면 멈추고 말한다
- 다른 세션이 vite 를 띄우고 있을 수 있다 — 스크린숏은 5198 포트로

## 어떻게 검증하나

- 시험: 바꾸기 전 빨강 → 바꾼 뒤 초록. 전체는 Node 26 으로(`npx node@26`) `npm test`
- `npm run lint` · `npm run format:check` · `npm run build` 통과
- 화면: `npx vite --mode mock --port 5198 --strictPort` + Playwright(npx 캐시)로 1440 · 393 스크린숏
  - `/bookmarks`: 관심 이슈 → 북마크한 기사 차례, 두 상자 모양이 같다, 이슈 행을 누르면 이슈 화면
  - `/me`: 개인정보 → 관심 분야 → 저장 줄, 머리 줄 개수 그대로
  - 빈 상태 · 오류는 시험으로 본다
- Zustand: `npm ls zustand` 가 비고, `grep -r zustand frontend/src` 0, 빌드 통과
- `/verify` 로 마무리

## 되돌리는 법

- 브랜치 `feat/frontend/S15P31A102-216-library-interest-issues` 의 커밋을 `git revert`. 뉴스함 이동 · Zustand 정리가 커밋이 따로라 하나만 되돌릴 수 있다
- 데이터 · API 를 건드리지 않아 되돌릴 수 없는 것은 없다
- worktree 는 머지 뒤 `git worktree remove ../S15P31A102-216b`
