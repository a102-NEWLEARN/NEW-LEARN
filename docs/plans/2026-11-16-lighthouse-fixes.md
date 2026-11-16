# Jira S15P31A102-218 Lighthouse 로 프론트 첫 화면을 재고, 지적 받은 것 중 한 줄짜리 두 가지를 고친다

작업 폴더 `S15P31A102-218`, 브랜치 `perf/frontend/S15P31A102-218-lighthouse-fixes`(origin/frontend 기준). 216 디자인 피드백이 frontend 에 머지된 뒤 시작했다(2026-11-16).

**처음 계획은 화면 단위 코드 분할이었는데, 1단계 측정을 보고 뺐다(2026-11-16 사용자).** 코드 분할로 줄일 몫은 우리 JS 의 약 14%(gzip 약 40KB, 추정)다. 랜딩이 느린 더 큰 까닭은 애니메이션의 CPU 사용과 사용 분석 스크립트로 보였다. 측정 원본은 `.notes/lighthouse/2026-11-16/`(커밋 안 함)에 있고, 숫자는 SSOT 10절에 옮겼다.

**로고 크기 고치기도 뺐다(2026-11-16 사용자).** Lighthouse 가 이슈 · 기사 CLS 의 원인 후보로 「크기 없는 그림(헤더 로고)」을 짚었는데, 로고에 width · height 를 적어도 CLS 가 그대로였다. Chrome 의 layout-shift 기록으로 보니 밀리는 까닭은 로딩 중 자리(Skeleton)가 실제 제목 · 요약보다 작아서다. 이슈는 본문이 61px, 기사는 한 줄 자리에 두 줄 제목이 들어오며 탭 영역이 95px 내려간다. 글꼴을 막고 재도 같았다. Skeleton 높이 맞추기는 로딩 화면 모양을 바꾸는 일이라 발표 뒤로 미뤘다.

## 무엇을 / 왜

운영 Lighthouse 에서 한 줄로 고칠 수 있는 지적 두 가지를 고치고, 같은 조건으로 다시 재서 발표에 쓸 전후 숫자를 만든다.

| 지적 | 어디서 | 고치는 법 |
| --- | --- | --- |
| SEO 92 — `/robots.txt` 가 없어 화면 HTML 이 대신 나간다(오류 98개) | 모든 화면 | `public/robots.txt` 를 둔다 |
| 화면 그리기를 막는 자원 — `<head>` 의 `analytics.js` 가 async · defer 없이 불린다 | 모든 화면 | `defer` 를 붙인다 |
| 권장사항 charset — SEED 테마 script 가 `<meta charset>` 앞에 들어가 첫 1024바이트 밖으로 밀리고, 응답 머리에도 문자셋이 없다 | 모든 화면 | `nginx.conf` 에 `charset utf-8;` — 응답 머리에 문자셋을 붙인다(7단계, 2026-11-16 사용자가 더함) |

## 발표에서 말할 것

- **이미 있는 숫자:** gzip 을 켜서 느린 4G 폰의 첫 화면이 6.6초에서 2.5초로, JS 가 829KB 에서 260KB 로 줄었다(Jira 32)
- **운영 측정:** 화면 다섯 개의 Lighthouse 점수와 LCP · TBT · CLS(SSOT 10절)
- **이번에 고친 것:** SEO 92 → 100(5화면 모두), 화면 그리기를 막던 analytics.js 가 빠졌다. 홈 FCP 2.88 → 2.71초(나머지 화면은 줄었지만 잡음과 못 가름)
- **찾았지만 이번에 안 고친 것:** 이슈 · 기사 CLS(로딩 자리 높이), 코드 분할(gzip 약 40KB), 랜딩 애니메이션의 CPU(스크립트 실행 8.3초), 사용 분석 205KB(JS 의 42%), 글꼴 485KB
- **Lighthouse 의 원인 후보는 추정이다:** CLS 원인으로 짚은 로고는 아니었다. layout-shift 기록으로 직접 봐야 했다
- **같이 말할 단서:** 실험실 값이다. 느린 4G(왕복 150ms · 1.6Mbps)와 CPU 4배 느림을 흉내 낸 조건이고, 화면마다 3번 잰 가운데 값이다

## 바꿀 파일

- 새 `frontend/public/robots.txt` — 모든 로봇 허용, `/api/` 만 막기
- `frontend/index.html` — `<script src="/analytics.js" defer>`
- 새 `frontend/src/page-load.test.ts` — index.html 이 analytics.js 를 defer 로 부르는지, robots.txt 가 있고 규칙이 맞는지, nginx.conf 가 charset 을 거는지(파일을 읽는 시험. `pwa/manifest.test.ts` 와 같은 방식)
- `frontend/nginx.conf` — server 블록에 `charset utf-8;`. 기본 `charset_types` 가 text/html · text/plain · application/javascript 라 화면 HTML 과 robots.txt 에 붙는다
- `SSOT.md` 10절 「잰 것」 — 운영 측정과 전후 숫자
- 이 계획 파일 — `2026-11-16-lighthouse-fixes.md` 로 이름을 바꾼다

## 작업 순서

- [x] 0. Jira 218 · 작업 폴더 · 계획 커밋
- [x] 1. 운영 측정 · 번들 분석 (커밋 없음)
- [x] 2. 브랜치 이름과 계획 파일 이름을 `lighthouse-fixes` 로 바꾼다(커밋)
- [x] 3. 로고 크기 — 시험 먼저 커밋했다가 5단계에서 효과가 없어 브랜치에서 뺐다
- [x] 4. robots.txt · analytics defer — 시험 먼저(커밋 두 개)
- [x] 5. 전후 다시 재기 — scratchpad 의 Node 시험 서버(gzip 레벨 5, 없는 파일은 index.html, `/api` 는 운영으로)에 지금 `origin/frontend` 빌드와 이 브랜치 빌드를 두 포트로 띄우고 번갈아 화면 다섯 개를 3번씩 쟀다. SSOT 10절에 적는다(커밋)
- [ ] 6. `/verify` → MR(대상 `frontend`) → 배포 뒤 운영에서 다시 잰다
- [x] 7. charset — 시험 먼저, `nginx.conf` 한 줄(커밋). 로컬 시험 서버에 같은 머리를 붙여 Lighthouse charset 항목이 통과하는지 본다. SSOT 10절 줄에 더한다

## 안 바꿀 것

- 라우트 · 화면 코드 · 로딩 화면(Skeleton) · 애니메이션 · 글꼴 · 로고
- `public/analytics.js` 의 내용(217 작업 파일). 부르는 줄에 `defer` 만 붙인다
- `nginx.conf` 의 charset 한 줄 밖 · infra · `vite.config.ts` · `package.json` 의존성
- 접근성 지적(명암 · 랜딩 단계 버튼 이름 · SEED 탭 패널의 `aria-selected`)과 권장사항 지적(제3자 쿠키 · 401 콘솔 오류). 탭 패널의 `aria-selected` 는 SEED 탭이 붙이고 props 로 못 지운다(`mergeProps` 가 `undefined` 를 덮어쓰지 않는다)

## 리스크

- **로컬에서는 사용 분석이 돌지 않는다.** `analytics.js` 가 운영 도메인에서만 GA · Clarity 를 붙인다. 그래서 5단계 전후 비교에는 GA · Clarity 가 빠진다. defer 의 효과는 배포 뒤 운영에서 다시 재야 온전히 보인다
- `defer` 로 바꾸면 GA · Clarity 가 HTML 을 다 읽은 뒤에 붙는다. 화면 코드(module script)보다 먼저 도는 순서는 그대로이고(빌드 결과 index.html 에서 확인), 화면 쪽 `track()` 은 gtag 가 없어도 조용히 넘어간다(`src/lib/analytics.ts`). 첫 페이지뷰가 몇십 ms 늦게 잡힐 수 있다
- robots.txt 로 `/api/` 를 막으면 검색 로봇이 API 를 긁지 않는다. 화면 주소는 모두 허용이라 검색 노출에는 영향이 없다
- **nginx 를 이 PC 에서 못 돌린다**(Docker 없음, 11-06 gzip 때와 같다). `charset` 은 nginx 기본 모듈(`ngx_http_charset_module`) 지시어이고 server 블록에서 쓸 수 있다는 것을 문서로 확인한다. 설정이 틀리면 이미지가 뜨지 않으니 배포 뒤 바로 `curl -I` 로 본다

## 어떻게 검증하나

- 새 시험이 고치기 전에 실패하고 고친 뒤 통과한다. 전체 frontend 시험 · 린트 · 포맷 · 빌드는 커밋 게이트로, 푸시 전에는 Node 26 으로도 돈다
- 5단계: SEO 가 100 으로, 「화면 그리기를 막는 자원」에서 analytics.js 가 빠진다. 성능 점수 · LCP 는 잡음 범위(3번 값의 최소 ~ 최대) 안에서 나빠지지 않는다
- 배포 뒤: 운영에서 화면 다섯 개를 다시 3번씩 재서 1단계 표와 견준다. `curl https://newlearn.io.kr/robots.txt` 가 텍스트를 돌려준다

## 되돌리는 법

- 커밋마다 revert 하면 된다. 바뀌는 것은 index.html 한 줄 · 새 텍스트 파일 하나와 시험뿐이다. 데이터와 배포 설정은 건드리지 않는다
- 운영에서 문제가 나면 dev 에서 MR 을 revert 하고 다시 배포한다
