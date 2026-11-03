# Jira 120 2단계 — 화면 CSP 를 보고만에서 강제로

## 무엇을 / 왜

화면(`/`, frontend) 응답의 CSP 머리 이름을 `Content-Security-Policy-Report-Only` → `Content-Security-Policy` 로 바꾼다. 규칙 값은 그대로 둔다. 1단계(2026-10-27)는 화면이 개발 확인 화면 하나뿐이라 강제를 미뤘다. 2026-11-03 15:42 실제 화면(frontend `53cbbe56`)이 사이트에 올라가 관찰할 수 있게 됐다. XSS 가 생겨도 끼워 넣은 스크립트가 돌지 않게 하는 2차 방어를 실제로 켜는 일이다.

## 관찰한 것 (2026-11-03, 강제 전)

| 무엇 | 결과 | 어떻게 |
|---|---|---|
| 손님 화면 셋 `/` · `/login` · `/signup` | CSP 위반 0. 콘솔 오류는 손님일 때 정상인 `GET /api/v1/members/me` 401 뿐 | 앱 안 브라우저(확장 없음). 화면마다 `securitypolicyviolation` 수신 + `ReportingObserver`(buffered) + 콘솔 읽기 |
| 잡는 방법이 동작하나(대조) | JS 로 붙인 인라인 script(`createElement('script')` + `textContent`)가 **돌았고**(`window.__probe === 1`, 보고만이라서) `script-src-elem` 위반으로 잡힘. 바깥 이미지(`https://example.com/…`)는 `img-src` 위반. 콘솔에도 `The policy is report-only` 줄 | `/login` 에서 |
| 인라인 테마 script 해시 | 사이트 HTML 의 유일한 인라인 script(3,259자) 해시 = 정책 값 `sha256-YBQY3W…` 그대로 | `curl` 로 받은 `index.html` 의 `<script>…</script>` 안 글자를 SHA-256 → Base64 |
| 번들이 부르는 바깥 출처 | 0 — JS(754KB, 청크 하나) 안 `http(s)://` 는 라이브러리 안내 문구 · `http://localhost` 기본값뿐, CSS 의 `url()` 은 모두 `/assets/Pretendard…woff2`. `eval` · `new Function` · Worker · `serviceWorker` 0. `data:image/svg+xml` 하나(로고, `img-src data:` 로 허용) | `curl` 로 받은 `/assets/index-*.js` · `.css` 를 정규식으로 셈 |
| 화면 코드 | 바깥 자원을 부를 길이 없다 — `<img>` 는 로고 하나, `innerHTML` · `dangerouslySetInnerHTML` · iframe 0, 글꼴은 npm `pretendard` 를 번들에 넣음, 이슈 타임라인 SVG 는 `url(#timeline-plot)` 처럼 문서 안만 가리킴. 기사 원문은 링크(`a href`)라 CSP 와 무관 | origin/dev `frontend/src` 검색 |
| 테마 script 가 막히면 | 색 값 · 배경 · 버튼은 그대로(밝은 · 다크 OS 둘 다, `/login` 화면). 다크 OS 에서는 `color-scheme` 이 `light dark` 로 남아 스크롤바 · 스타일을 안 준 기본 폼 부품이 어두워질 수 있다 | script 가 붙이는 `data-seed-*` 속성 넷을 지우고 계산된 색 · 캡처 비교. 다크는 앱 브라우저의 `prefers-color-scheme: dark` 흉내 |
| 사이트 데이터 | 이슈 0건(카테고리 다섯 모두 `issueCount 0`), 기사는 있음(`id 1` 마인드맵 SUCCEEDED) — **이슈 화면은 강제 전에 못 본다** | 공개 API GET(reviewer 조수) |
| 로그인해야 보이는 화면 | CSP 위반 0 — `/home` · 홈 검색 · 기사 `/articles/1` 흐름지도 · 마인드맵(확대 · 맞추기 · 설정 · 노드) · 용어사전 창 찾기 · `/bookmarks` · `/me` · 메뉴 · `/issues/1`(이슈 없음 화면) · 없는 주소. 세션 전체 콘솔의 CSP 줄은 대조로 넣은 두 줄뿐 | 사용자가 로그인한 뒤 같은 방법. 화면 안 이동은 수신기를 둔 채로 |

### 「며칠 보기」를 하루(반영 뒤 몇 시간)로 줄이는 까닭

- 보고 주소가 없어 보고만 판은 누가 콘솔을 열어야만 위반을 안다. 며칠 둬도 아는 것이 거의 늘지 않는다. 강제 판에서는 위반이 화면에서 깨져 보여 FE 가 알아챈다
- FE 가 계속 배포한다. 한 빌드를 며칠 봐도 다음 빌드는 보증되지 않는다
- 번들과 화면 코드에 같은 사이트 밖을 부르는 곳이 없음을 정적으로 확인했다(위 표). 데이터가 무엇이든 바깥 자원을 부를 길이 없어, 못 본 이슈 화면도 같은 판단이다
- 되돌리기는 머리 이름 한 줄이다(MR 두 번 — 분 단위, 아래 「되돌리는 법」). 발표(11-18) 직전보다 지금 켜고 2주 동안 강제 판으로 보는 편이 낫다

## 정한 것

| 항목 | 정한 것 |
|---|---|
| 규칙 값 | 1단계와 같다(출처 더하기 없음) — `default-src 'self'; script-src 'self' 'sha256-YBQY3WM31w/XgUZiCAkDXyEKGqOEfxNRIDEAoPoaHXY='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| 보고 주소(report-to) | 두지 않는다 — 받을 곳이 없다. 위반은 브라우저 콘솔(`Refused to …`)로 본다 |
| 해시 CI 검사 | **두지 않는다.** ① `@seed-design/css` 3.0.3 · `@seed-design/vite-plugin` 2.1.1 이 정확한 판으로 고정돼 있고(잠금 파일에 css 한 벌, Dockerfile 은 `npm ci`), GitLab 에 자동 판 올리기(Renovate)가 없어 FE 가 손으로 바꿀 때만 글이 바뀐다. 두 판은 10-18 뒤로 그대로다 ② 어긋나도 막히는 것은 테마 script 하나이고, 위 관찰대로 색 값은 그대로다 ③ 검사는 `generateThemingScript` 결과 해시를 `routes.yaml` 값과 견주는 vitest 몇 줄이면 되지만, FE 영역 코드라 FE 동의가 필요하고 두 영역이 서로 묶인다. 운영은 길어야 12월이다. **받아들이는 것:** 보고 주소가 없어 어긋나도 콘솔 오류 말고는 조용하다. 대신 `routes.yaml` 주석에 재는 법 · 판을 올리는 순서를 적고, FE 에 「seed-design 판 · 플러그인 설정 · 바깥 출처를 바꾸면 인프라에 알려 달라」고 Jira 120 댓글로 알린다 |
| 판을 올리는 순서 | `script-src` 는 해시를 여럿 받는다. 새 해시를 옛 해시 옆에 먼저 넣고(infra MR), FE 반영이 끝난 뒤 옛 것을 뺀다 — 두 MR 사이에 막히는 틈이 없다 |

## 바꿀 파일

- `infra/k8s/services/app/routes.yaml` — 머리 이름 한 줄, 주석: 「보고만」 → 강제(2026-11-03) · 되돌리는 법 한 줄 · 해시를 잰 날에 11-03 더하기 · 재는 법 · 판을 올리는 순서 · 바깥 출처를 쓰려면 규칙에 더해야 함. **해시가 바뀌는 조건 · 재는 법은 이 주석 한 곳에만 둔다**
- `SSOT.md`
  - 6절 「도메인 · HTTPS」 응답 보안 머리 줄 — 「CSP 는 강제 · 해시 CI 검사 없음(까닭 한 줄) · 해시가 바뀌는 조건과 다시 재는 법은 `routes.yaml` 주석」. 지금 줄에 있는 바뀌는 조건(`colorMode` · `fontScaling`)은 주석과 겹쳐 빼고, 「막혀도 겉모습」은 10절 날짜 줄을 가리킨다
  - 8절 CSP 줄 지우기
  - 10절에 잰 것 한 줄(관찰 표 · 로그인 화면 결과, 「말하지 못하는 것」: 이슈 화면 · 다른 브라우저)
- `docs/plans/2026-11-03-csp-enforce.md` — 승인한 계획 사본(이 파일을 옮김)

## 작업 순서

- [x] 1. 로그인 화면 관찰 — 사용자가 앱 안 브라우저에서 로그인 → Claude 가 `/home` · 기사 마인드맵(`/articles/1`) · 용어사전 창 · 검색 · `/bookmarks` · `/me` 를 열어 위반을 모은다. **위반이 하나라도 나오면 멈추고 계획을 고친다**
- [x] 2. worktree `C:/tmp/wt-120` · 브랜치 `feat/infra/S15P31A102-120-csp-enforce` ← `origin/infra`, 파일 셋 고치기(10절에는 반영 전에 잰 것만), infra 게이트(stack.md 3절), YAML 이 그대로 읽히는지(`kubectl apply --dry-run=server` — 권한이 막으면 사용자에게 파일 카드)
- [ ] 3. reviewer 조수(MR) → MR(→ infra) → 파이프라인 success → 머지 직전 원격 infra · dev SHA · 열린 MR 을 같은 스크립트에서 읽고 머지 → infra → dev MR 같은 방식 → Argo CD `app` 반영
- [ ] 4. 반영 뒤 확인(아래 「어떻게 검증하나」). 결과는 Jira 120 댓글 · zoo_docs 에 남긴다(SSOT 를 고치는 MR 을 하나 더 만들지 않는다)
- [ ] 5. 분야 브랜치 맞추기 — infra · backend · ai 를 dev 에(내용 차이부터). frontend 는 11-03 FE 머지 때 지웠다가 FE 가 다시 만들어 쓰는 중이라 FE 에 맡긴다(11-03 메인 세션 지시)
- [ ] 6. Jira 120 결과 댓글(FE 알림 · 이슈 화면 남은 확인) · 완료, `/feature-done`, zoo_docs 기록
- [ ] 7. 남는 확인 한 줄 — 11-15 데이터 적재 뒤 `/issues/:id` 를 강제 상태에서 한 번 열어 위반 0 확인(Jira 120 댓글 · 현황판에 적어 둠)

## 안 바꿀 것

- 규칙 값(출처 · 해시 · `'unsafe-inline'`), 바로 거는 넷(HSTS · nosniff · XFO · Referrer-Policy)
- frontend 코드 · nginx · 이미지, backend 스프링 머리, `/api` · Swagger · health · `/grafana` · `/argocd` 라우트
- 보고 주소(report-to), 해시 CI 검사, frontend 분야 브랜치, SSOT 9절(8절의 「며칠 보고」는 정한 것이 아니었다)

## 리스크

- **못 본 화면(이슈 · 이 판에서 못 연 곳)에서 막히는 것이 나올 수 있다** — 정적 근거상 낮다. 반영 뒤 다시 보고, 막히면 되돌린다
- **FE 가 나중에 바깥 출처(뉴스 사진 · 글꼴 · 분석 도구)를 쓰면 막힌다** — 로컬 개발 서버는 Envoy 를 안 거쳐 거기서는 안 보이고 사이트에서만 깨진다. Jira 댓글 · 주석으로 알린다
- **seed-design 판이 바뀌면 테마 script 가 막힌다** — 색 값은 그대로지만 콘솔 오류가 뜨고, 다크 OS 에서 기본 부품이 어두워질 수 있다. 「판을 올리는 순서」대로 하면 틈이 없다
- **FE 가 사이트 콘솔에서 강제 위반 오류를 볼 수 있다** — Jira 댓글로 알린다

## 어떻게 검증하나

- 응답 머리(`curl -sD -`): `/` · `/home` · `/assets/<js>` 에 `content-security-policy`(값 같음)가 있고 `…-report-only` 는 없음. HSTS 등 넷 그대로. `/api/v1/categories` · `/swagger-ui.html` · `/actuator/health` · `/grafana` 는 반영 전과 같음
- 화면(앱 안 브라우저, 확장 없음, 반영 뒤 새로 고침): 손님 셋 + 로그인 화면들에서 콘솔 `Refused to …` 0, `<html>` 에 `data-seed-color-mode="light-only"` 가 붙음(번들 JS 에는 `data-seed-*` 를 붙이는 코드가 없어, 이 속성이 있으면 해시로 허용한 테마 script 가 돈 것)
- 강제가 걸렸다는 증거: 반영 전과 같은 탐침(인라인 script 를 DOM 에 붙임)이 반영 뒤에는 **돌지 않고**(`window.__probe` 없음), `securitypolicyviolation` 이벤트의 `disposition` 이 `enforce`
- 화면 캡처(계정 정보 가리기), Argo CD `app` Synced · Healthy, 사이트 health 200

## 되돌리는 법

- 화면이 깨지면: `routes.yaml` 머리 이름을 `Content-Security-Policy-Report-Only` 로 되돌리는 MR(또는 이번 MR Revert)을 infra 에 머지하고 곧바로 infra → dev. MR 파이프라인 두 번이라 분 단위다(10-21 실측 117 ~ 192초씩, 몰리면 10분대). dev 에 들어간 뒤 Argo CD 반영은 몇 초다
- kubectl 로 직접 고치는 길은 없다 — Argo CD `app` 이 `selfHeal: true` 라 다시 되돌린다
- 브라우저는 CSP 를 기억하지 않아 다음 화면 요청부터 풀린다(`index.html` 은 `no-cache`). 데이터 · 이미지 변화가 없어 되돌릴 수 없는 것은 없다
