# Jira 120 — 화면 응답에 보안 머리 (1단계: 바로 거는 넷 + CSP 는 보고만)

## 무엇을 / 왜

2026-10-26 사이트에 GET 만 해 보니 화면 첫 장 `/` 응답에 보안 머리가 하나도 없다(CSP · X-Frame-Options · nosniff · HSTS). 같은 사이트의 `/api` 응답은 스프링 시큐리티 기본으로 nosniff · HSTS · `X-Frame-Options: DENY` 가 붙는다. 화면 응답에도 같은 머리를 붙이고, CSP 는 먼저 「보고만」(Report-Only)으로 띄워 화면이 깨지지 않는지 본다.

## 정한 것

| 항목 | 정한 것 |
|---|---|
| 넣는 자리 | Envoy Gateway — `infra/k8s/services/app/routes.yaml` 의 `/`(frontend) 규칙에 Gateway API 표준 필터 `ResponseHeaderModifier`(`set`). 이미지를 다시 굽지 않고 Argo CD 가 몇 초 만에 반영 · Revert 로 되돌림. frontend nginx 는 `location` 에 `add_header` 가 있으면 바깥 머리를 물려받지 않는 함정이 있어(지금 `/index.html` · `/assets/` 둘 다 `add_header`) 피한다 |
| 바로 거는 넷 | `Strict-Transport-Security: max-age=31536000 ; includeSubDomains`(API 와 같은 값) · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` |
| CSP(보고만) | `Content-Security-Policy-Report-Only` — `default-src 'self'; script-src 'self' 'sha256-YBQY3WM31w/XgUZiCAkDXyEKGqOEfxNRIDEAoPoaHXY='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. 보고 받을 주소는 두지 않고 브라우저 콘솔로 본다 |
| 인라인 두 개 | script 는 seed-design 플러그인(`frontend/vite.config.ts`, `colorMode: "light-only"`)이 넣는 테마 초기화 — 2026-10-27 사이트 HTML 에서 해시를 잼. style 은 `@layer` 순서 한 줄 → `'unsafe-inline'`(스타일은 위험이 낮고 런타임에 붙는 스타일이 있을 수 있어 보고로 확인) |
| 2단계(이번 MR 아님) | 며칠 보고 콘솔 위반 0 이면 Report-Only → 강제로. 그때 frontend 인라인 script 가 바뀌면 해시도 바꿔야 하는 묶임을 CI 검사로 지킬지 같이 정한다 |

> 리뷰(2026-10-27, reviewer 조수) 뒤 바꾼 것: ① 해시를 바꾸는 것은 플러그인이 아니라 `@seed-design/css`(`generateThemingScript`) — 주석 · SSOT 를 「그 패키지 판 · 플러그인 설정」으로 ② 스프링이 붙이는 것은 HSTS · nosniff · XFO 셋(Referrer-Policy 는 아님)이라 이름을 적음 ③ `font-src` 의 `data:` 는 쓰는 곳이 없어 뺌, `img-src data:` 는 로고 SVG 가 data: 로 번들돼 남김(주석) ④ 지금 사이트 화면은 개발 확인 화면 하나라, 강제 전환은 마인드맵 · 이슈 화면이 올라간 뒤로 ⑤ 위반은 `[Report Only]` 로 센다(report-uri 없음 경고 한 줄은 정상)

## 바꿀 파일

- `infra/k8s/services/app/routes.yaml` — `/` 규칙에 `filters: ResponseHeaderModifier` 와 왜 · 해시 출처 주석
- `SSOT.md` 6절 「도메인 · HTTPS」 — 화면 응답 머리 · CSP 보고만 · 해시 묶임 한 줄. 8절에 「CSP 강제 전환」 한 줄
- `docs/plans/2026-10-27-frontend-security-headers.md` — 승인한 계획 사본

## 작업 순서

- [x] Jira 120 진행 중, 브랜치 `feat/infra/S15P31A102-120-security-headers` ← `origin/infra`
- [ ] 반영 전 기준: `/` · `/assets/*.js` · `/api/v1/categories` 응답 머리를 적어 둠(이미 `/` 는 0개 확인)
- [x] 필터 · 주석 · SSOT · 계획 사본, `kubectl apply --dry-run=server` 로 스키마 확인, 게이트
- [x] reviewer 조수 → MR → infra → dev(머지 직전 원격 dev · 열린 MR — Jira 123 세션과 겹치면 먼저 들어간 쪽 반영) → Argo CD `app` 동기화
- [x] 반영 뒤 확인 → Jira 120 은 1단계 결과 댓글(2단계 전이라 진행 중 유지) · 브랜치 맞추기 · zoo_docs

## 안 바꿀 것

- frontend 코드 · nginx · 이미지(굽기 없음), backend 의 스프링 머리
- `/api` · `/actuator/health` · Swagger · `/grafana` · `/argocd` 라우트(이번엔 frontend 규칙만)
- CSP 강제(2단계), 보고 받을 주소(report-uri), 해시 CI 검사

## 리스크

- **CSP 는 보고만이라 화면이 깨지지 않는다** — 위반은 콘솔 경고로만 뜬다. FE 팀원이 사이트 콘솔에서 경고를 볼 수 있어 MR · Jira 에 알린다(로컬 vite 개발 서버는 Envoy 를 안 거쳐 영향 없음)
- **X-Frame-Options DENY** — 사이트를 다른 페이지의 iframe 에 넣을 수 없게 된다. 지금 넣는 곳 없음(발표 화면에 넣을 계획이 생기면 다시 본다)
- **HSTS** — 이미 `/api` 응답이 같은 값을 보내고 있어 브라우저 동작은 바뀌지 않는다
- **필터를 잘못 쓰면 frontend 길 전체가 영향** → server dry-run · 반영 직후 첫 화면 확인, 안 되면 바로 Revert

## 어떻게 검증하나

- `curl -sD -`: `/` 와 `/assets/<js>` 에 다섯 머리(넷 + CSP-Report-Only), `/api/v1/categories` 는 반영 전과 같음(머리 중복 없음), `/swagger-ui.html` · `/grafana` 그대로
- 화면(Claude in Chrome): 사이트에 있는 화면(2026-10-27 기준 `/` → `/home` 개발 확인 화면 · 없는 주소 404)을 열고 콘솔에서 CSP 위반을 센다(`[Report Only]` 패턴 — 「report-uri 없음」 경고 한 줄은 위반이 아님). 화면 캡처
- Argo CD `app` Synced · Healthy, 사이트 health 200
- reviewer 조수: 머리 값 · 필터 위치 · 다른 규칙에 번지지 않는지

## 되돌리는 법

- MR Revert → dev → Argo CD 가 필터를 뺀다. 데이터 · 이미지 변화가 없어 되돌릴 수 없는 것은 없다
- HSTS 는 브라우저가 1년 기억하지만 이미 `/api` 가 같은 값을 보내 왔으므로 되돌려도 새로 생기는 영향은 없다
