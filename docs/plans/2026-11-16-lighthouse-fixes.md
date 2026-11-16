# Jira S15P31A102-218 Lighthouse 로 프론트 첫 화면을 재고, 지적 받은 것 중 한 줄짜리 세 가지를 고친다

작업 폴더 `S15P31A102-218`, 브랜치 `perf/frontend/S15P31A102-218-lighthouse-fixes`(origin/frontend 기준). 216 디자인 피드백이 frontend 에 머지된 뒤 시작했다(2026-11-16).

**처음 계획은 화면 단위 코드 분할이었는데, 1단계 측정을 보고 뺐다(2026-11-16 사용자).** 코드 분할로 줄일 몫은 우리 JS 의 약 14%(gzip 약 40KB, 추정)다. 랜딩이 느린 더 큰 까닭은 애니메이션의 CPU 사용과 사용 분석 스크립트로 보였다. 측정 결과는 `.notes/lighthouse/2026-11-16/README.md`(커밋 안 함)에 있고, 숫자는 4단계에서 SSOT 10절로 옮긴다.

## 무엇을 / 왜

운영 Lighthouse 에서 한 줄로 고칠 수 있는 지적이 세 가지 나왔다. 고치고 같은 조건으로 다시 재서 발표에 쓸 전후 숫자를 만든다.

| 지적 | 어디서 | 고치는 법 |
| --- | --- | --- |
| 화면 밀림 CLS 0.054 · 0.098 — 헤더 로고가 뜨면서 아래가 밀린다 | 이슈 · 기사 화면 | 로고 `<img>` 에 원본 크기(652 × 120)를 width · height 로 적는다 |
| SEO 92 — `/robots.txt` 가 없어 화면 HTML 이 대신 나간다(오류 98개) | 모든 화면 | `public/robots.txt` 를 둔다 |
| 화면 그리기를 막는 자원 — `<head>` 의 `analytics.js` 가 async · defer 없이 불린다 | 모든 화면 | `defer` 를 붙인다 |

## 발표에서 말할 것

- **이미 있는 숫자:** gzip 을 켜서 느린 4G 폰의 첫 화면이 6.6초에서 2.5초로, JS 가 829KB 에서 260KB 로 줄었다(Jira 32)
- **1단계 숫자:** 운영 화면 다섯 개의 Lighthouse 점수와 LCP · TBT · CLS(`.notes/lighthouse/2026-11-16/README.md`)
- **이번에 고친 것:** 이슈 · 기사의 CLS, SEO 점수, 화면 그리기를 막던 스크립트 — 전후 숫자
- **찾았지만 이번에 안 고친 것:** 코드 분할(gzip 약 40KB), 랜딩 애니메이션의 CPU(스크립트 실행 8.3초), 사용 분석 205KB(JS 의 42%), 글꼴 485KB
- **같이 말할 단서:** 실험실 값이다. 느린 4G(왕복 150ms · 1.6Mbps)와 CPU 4배 느림을 흉내 낸 조건이고, 화면마다 3번 잰 가운데 값이다

## 바꿀 파일

- `frontend/src/components/Logo.tsx` — `<img>` 에 `width={652} height={120}`. 높이는 지금처럼 style 이 정하고, 속성은 그림이 오기 전 가로세로 비율을 알려 주는 데만 쓴다
- 새 `frontend/src/components/Logo.test.tsx` — 위 속성이 붙는지
- 새 `frontend/public/robots.txt` — 모든 로봇 허용, `/api/` 만 막기
- `frontend/index.html` — `<script src="/analytics.js" defer>`
- 새 `frontend/src/page-load.test.ts` — index.html 이 analytics.js 를 defer 로 부르는지, robots.txt 가 있고 규칙이 맞는지(파일을 읽는 시험. `pwa/manifest.test.ts` 와 같은 방식)
- `SSOT.md` 10절 「잰 것」 — 운영 측정과 전후 숫자 한 줄
- 이 계획 파일 — `2026-11-16-lighthouse-fixes.md` 로 이름을 바꾼다

## 작업 순서

- [x] 0. Jira 218 · 작업 폴더 · 계획 커밋
- [x] 1. 운영 측정 · 번들 분석 (커밋 없음)
- [ ] 2. 브랜치 이름과 계획 파일 이름을 `lighthouse-fixes` 로 바꾼다(커밋). 아직 푸시 안 해서 이름만 바꾸면 된다
- [ ] 3. 로고 크기 — 시험 먼저(커밋)
- [ ] 4. robots.txt · analytics defer — 시험 먼저(커밋 두 개)
- [ ] 5. 전후 다시 재기 — scratchpad 의 Node 시험 서버(gzip 레벨 5, 없는 파일은 index.html, `/api` 는 운영으로)로 지금 `origin/frontend` 빌드와 이 브랜치 빌드를 차례로 내주고 화면 다섯 개를 3번씩 잰다. SSOT 10절에 적는다(커밋)
- [ ] 6. `/verify` → MR(대상 `frontend`) → 배포 뒤 운영에서 다시 잰다

## 안 바꿀 것

- 라우트 · 화면 코드 · 애니메이션 · 글꼴(코드 분할 · 랜딩 애니메이션은 이번에 안 한다)
- `public/analytics.js` 의 내용(217 작업 파일). 부르는 줄에 `defer` 만 붙인다
- `nginx.conf` · infra · `vite.config.ts` · `package.json` 의존성
- 접근성 지적(명암 · aria 속성)과 권장사항 지적(제3자 쿠키 · 401 콘솔 오류 · charset)

## 리스크

- **로컬에서는 사용 분석이 돌지 않는다.** `analytics.js` 가 운영 도메인에서만 GA · Clarity 를 붙인다. 그래서 5단계 전후 비교에는 GA · Clarity 가 빠진다. defer 의 효과는 배포 뒤 운영에서 다시 재야 온전히 보인다
- `defer` 로 바꾸면 GA · Clarity 가 HTML 을 다 읽은 뒤에 붙는다. 화면 코드(module script)보다 먼저 도는 순서는 그대로이고, 화면 쪽 `track()` 은 gtag 가 없어도 조용히 넘어간다(`src/lib/analytics.ts`). 첫 페이지뷰가 몇십 ms 늦게 잡힐 수 있다
- robots.txt 로 `/api/` 를 막으면 검색 로봇이 API 를 긁지 않는다. 화면 주소는 모두 허용이라 검색 노출에는 영향이 없다
- 로고 속성을 잘못 적으면 로고가 찌그러진다. 헤더 · 랜딩 · 로그인 · 가입 다섯 곳의 스크린샷으로 본다

## 어떻게 검증하나

- 새 시험이 고치기 전에 실패하고 고친 뒤 통과한다. 전체 frontend 시험 · 린트 · 포맷 · 빌드는 커밋 게이트로, 푸시 전에는 Node 26 으로도 돈다
- 로고: 393 · 1440 폭에서 헤더(홈) · 랜딩 · 로그인 스크린샷. 로고 크기가 전과 같다
- 5단계: 이슈 · 기사의 CLS 가 0 에 가깝게, SEO 가 100 으로, 「화면 그리기를 막는 자원」에서 analytics.js 가 빠진다. 성능 점수 · LCP 는 잡음 범위(3번 값의 최소 ~ 최대) 안에서 나빠지지 않는다
- 배포 뒤: 운영에서 화면 다섯 개를 다시 3번씩 재서 1단계 표와 견준다. `curl https://newlearn.io.kr/robots.txt` 가 텍스트를 돌려준다

## 되돌리는 법

- 커밋마다 revert 하면 된다. 바뀌는 것은 로고 한 줄 · index.html 한 줄 · 새 텍스트 파일 하나와 시험뿐이다. 데이터와 배포 설정은 건드리지 않는다
- 운영에서 문제가 나면 dev 에서 MR 을 revert 하고 다시 배포한다
