# F13 용어사전 — 문맥에 맞는 뜻 하나를 드래그 말풍선으로

## 무엇을 / 왜

지금 용어사전은 표준국어대사전을 그대로 불러 「이자」처럼 뜻이 여러 개 나온다. 사람이 궁금한 것은 「이 기사에서 이 말의 뜻」이다.
기사 · 이슈 · 사건 화면에서 글자를 드래그하면 말풍선에 「의미」 버튼이 뜨고, 누르면 gpt-6-luna 가 그 문맥에 맞는 뜻 하나를 사전 모양으로 돌려준다.
DB 마이그레이션은 없다(문맥은 기존 칸, 결과 저장은 Redis). 11/12 덤프 적재와 겹치지 않는다.

## 동작

**화면**

| 단계 | 모습 |
|---|---|
| 드래그 끝 | 선택 영역 위에 작은 말풍선, 버튼은 「의미」 하나. 좁은 화면은 OS 메뉴를 피해 아래. GMS 는 아직 안 부른다 |
| 「의미」 누름 | 메인 컬러(`bg-bg-brand-solid`) 점 셋이 하나씩 위로 튄다(0.9초 주기, 한 번에 한 점). 동작 줄이기를 켜면 멈춘 점 |
| 뜻 도착 | 말풍선이 200ms 로 커지며 **표제어 · 품사 · 뜻풀이** 와 작은 「AI 생성」 표시(팀 규칙 EXPERIENCE.md Voice and Tone) |
| 풀이 불가 | 「뜻을 풀이하기 어려워요. 낱말 전체를 골라 보세요」 |
| 실패 | 502 「지금은 찾을 수 없어요」, 429 「요청이 많아요. 잠시 뒤 다시 시도해 주세요」, 그 밖은 `errorDescription`. 다시 부르지 않는다(`retry: false`) |
| 닫기 | 바깥 누르기(capture pointerdown — d3 가 전파를 막는다, 선택도 지운다) · Esc(맨 위 하나만 닫는 기존 순서의 첫 자리) · 휠 · 확대 · 스크롤 · 화면 이동. 기다리는 중 새로 드래그하면 앞 응답은 버린다 |

드래그 끝은 마우스는 `pointerup`, 터치 · Shift+화살표는 `selectionchange` 를 300ms 기다려 판단한다. 「의미」 버튼은 mousedown 을 막아 선택이 풀리지 않게 한다.

**드래그 규칙** — `pickTerm` 순수 함수 하나가 정한다. 표 전부를 시험으로 고정한다. 공백은 양쪽(JS · Java) 모두 `[\s\p{Z}\uFEFF]` 로 본다.

| 드래그한 것 | 결과 | 왜 |
|---|---|---|
| 띄어쓰기만 | 안 뜸 | 글자가 없다 |
| 「.」 같은 문장부호 · 기호만 | 안 뜸 | 글자가 없다 |
| 숫자만 「2026」 「3.5%」 | 안 뜸 | 글자(`\p{L}`)가 없다 |
| 앞뒤에 공백 · 문장부호가 딸림 「금리,」 | 잘라서 「금리」 | |
| 앞 글자에 붙은 한 글자 — 「받은」의 「은」, 「했습니다」의 「다」 | 안 뜸 | 조사 · 어미 · 말 조각이다 |
| 어절 맨 앞 한 글자 — 「빚을」의 「빚」 | 뜸 | 한 글자 낱말이 있다 |
| 조사가 붙은 어절 「이자를」 | 뜸, 표제어는 「이자」 | 모델이 기본형으로 정리 |
| 영문 · 숫자 낱말의 중간 — 「F13」의 「F1」, 「Apple」의 「ppl」 | 안 뜸 | 낱말이 잘렸다 |
| 영문 낱말 통째 「F13」 「GDP」 「F-35」 | 뜸 | 규칙으로는 F13 과 F-35 를 못 가른다. 모델이 문맥으로 판단 |
| 말 조각 「리했」 · 문맥에 근거가 없는 말 | 뜸 → 풀이 불가 | 규칙으로 못 막는 몫. 모델이 `found: false` 로 답한다 |
| 50자 초과 · 6어절 초과 · 문장 경계를 넘음(`[.!?]` 뒤 공백) · 줄바꿈 · 다른 글에 걸침 | 안 뜸 | 용어가 아니다 |
| 줄임표(…)에 닿은 낱말 | 안 뜸 | 화면에서 낱말이 잘렸다 |

드래그 대상은 기사 제목 · 흐름지도 잎 · 마인드맵 잎과 가운데 제목 · 이슈 제목과 요약 · 사건 패널 제목과 요약 · 타임라인 사건 이름이다. 날짜 · 언론사 · 가지 이름 · 레인 이름 같은 고정 문구와 메뉴 · 목록은 대상이 아니다. 「라벨 표시」를 끈 마인드맵의 잎 글도 대상이 아니다(마우스가 떠나면 글이 사라진다).

**SVG 두 화면(마인드맵 보기 · 가로 타임라인)** — 글자 위에서 누르면 글자 선택, 빈 곳 · 노드에서 누르면 지금처럼 지도 이동이다.
d3-zoom `filter` 를 `(!e.ctrlKey || e.type === "wheel") && !e.button && !(mousedown 이고 드래그 대상 글자)` 로 준다(기본 조건을 그대로 두고 하나만 더한다). 휠 확대와 터치 이동은 그대로다.

**사건 시트(좁은 화면)** — 선택이 시트 안이면 말풍선도 시트 안에 포털한다. 바깥에 그리면 누르는 순간 시트가 닫힌다.

**결정으로 남긴다** — 옛 창이 없어지면 키보드만 쓰는 사람의 경로가 줄어든다. Shift+화살표로 고르면 말풍선은 뜨지만 버튼까지 Tab 으로 가기 어렵다. 뜻은 `aria-live` 로 읽어 준다. EXPERIENCE.md 에 이 한계를 적는다.

## 새 API — A26 `POST /api/v1/dictionary/meaning`

단어와 기사 글이 주소에 실려 접근 로그에 남지 않게 POST 본문으로 받는다. 로그인 필요(CSRF 번호표는 axios 가 붙인다).

```json
{ "term": "이자를", "around": "…", "contextType": "ARTICLE", "contextId": 409 }
```
```json
{ "query": "이자를", "word": "이자", "pos": "명사", "definition": "남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈." }
```

`around` 는 드래그한 말의 앞뒤 30자씩을 포함한 조각이다(120자까지, 줄임표 앞까지만). 풀이 불가면 200 에 `word` · `pos` · `definition` 이 null 이다.

처리 순서: 입력 검사 → DB 에서 문맥 읽기(짧은 읽기 트랜잭션) → `term ⊂ around ⊂ 그 대상의 글` → 저장본 → 하루 한도 → GMS.

- **비교는 공백을 뺀 NFC 로 한다.** 줄바꿈으로 공백이 사라진 잎 글(`wrapText`)도 맞는다. 대상의 글: ARTICLE 제목 · `content.title` · 잎 글, ISSUE 제목 · 요약, EVENT 제목 · 이름 · 요약. 맞지 않으면 400 이고 GMS 를 부르지 않는다
- **공개 규칙은 기존 것을 그대로 쓴다.** 기사 `ReleasedArticles.get`(마인드맵이 없어도 제목은 통과), 이슈 `IssueService.get`, 사건 `EventService.get`. 숨긴 대상은 404
- 모델에 주는 것: 제목 · 조각 · 문맥(기사는 본문에서 그 말 앞뒤 500자, 없으면 앞 1,000자). 입력은 자료로만 다루라고 지시한다. 답은 JSON `{found, word, pos, definition}`. `found` 가 없거나 `found: true` 인데 `word` · `definition` 이 비었거나 길면(50자 · 200자) 502. `pos` 는 10자를 넘으면 null
- 저장: `meaning:<종류>:<id>:<공백 뺀 말>` 하루(풀이 불가 포함, 실패는 저장 안 함). 같은 글의 같은 말은 처음 답으로 하루 고정한다
- 하루 한도 3,000번(`meaningquota:<날짜>`, 저장본은 안 셈). **세지 못하면 막는다**(502) — 사전 한도와 반대다. 이 한도가 GMS 비용의 상한이라서다. 3,000 은 첫 실측 전 제안값이고 실측으로 조정한다
- GMS: 연결 2초 · 읽기 12초. 2초 안에 실패한 연결 오류 · 5xx 만 한 번 다시(14초 안에 끝남). `reasoning_effort` 와 토큰 상한은 실측 뒤 정한다. 실패 · 키 없음 · 한도 초과는 502 `DICTIONARY_UNAVAILABLE`
- 호출 중 DB 연결을 잡지 않는다(트랜잭션 밖). 단어 · 문맥 · 키 · GMS 답을 로그에 남기지 않는다

## 바꿀 파일

**backend** (`backend/src/main/java/kr/io/newlearn/dictionary/`)
- 새로: `MeaningController` · `MeaningService` · `MeaningContextLoader` · `MeaningSource` · `GmsMeaningClient` · `MeaningCache` · `MeaningQuota` · `dto/MeaningRequest` · `dto/MeaningResponse`
- `DictionaryConfig` · `application.yaml`(`newlearn.dictionary.meaning.*`, 하루 한도는 env `MEANING_DAILY_LIMIT`). `DictionaryQuota` 는 Lua 스크립트만 패키지 안에서 같이 쓰게 공개 범위를 넓힌다
- 시험: 새 `DictionaryMeaningApiIntegrationTest` · `dictionary/GmsMeaningClientTest` · `dictionary/MeaningQuotaTest`, 고침 `OpenApiDocsTest`

**frontend** (`frontend/src/`)
- 새로: `components/meaning/pickTerm.ts` · `MeaningBubble.tsx`(셸에 하나, 포털) · `meaningProps.ts`(글자에 붙이는 `data-meaning="ARTICLE:409"`, 잘린 글은 `data-meaning-cut`) · `isTextDragClick`
- 뺌: `components/shell/DictionaryWindow.tsx` · `useHideOnScroll.ts` 와 시험, `AppShell` · `useShell` · `EventDetailPane` 의 패널 폭 알림, `appMotion` 의 말풍선 상수, 옛 키프레임
- 고침: `api/dictionary.ts`(A26 호출로 교체) · `mocks/handlers.ts` · `main.tsx` · `newlearn-theme.css`(점 · 말풍선) · `routes.test.tsx` · `IssuePage.test.tsx`
- 드래그 대상 표시: `ArticleHeader` · `IssueHeader` · `EventPanel`(`detail.id` 로) · `FlowView` · `TimelineList` · `MindmapGraph` · `Timeline`. 버튼 · SVG 글자에는 `select-text`, 가운데 제목은 `pointer-events-none` 을 뺀다
- 드래그 뒤 따라오는 클릭은 선택이 그 요소 안에 있으면 건너뜀: 잎 강조, 빈 곳 풀기(`releaseAll`), 패널 닫기(`onDeselect`), 사건 열기(`Timeline` · `TimelineList`)
- `MindmapGraph` · `Timeline` — d3-zoom `filter`
- FE 문서(사전 부분은 사용자가 위임받음, `frontend` MR 로): `EXPERIENCE.md` 64 · 82 · 90 · 126 · 137 · 168 · 169 · 178 · 180 · 209 · 216 · 237 · 242행, `frontend/README.md`

**infra**
- `infra/k8s/services/app/routes.yaml` — 새 규칙 `meaning`, `timeouts.request: 20s`(Envoy 기본 15초, `argocd.yaml:30` 에 기록)
- `infra/k8s/services/app/ratelimit.yaml` — `meaning-rate-limit`(IP 마다 1분 100건, 사전과 다른 바구니)
- `infra/k8s/services/app/backend.yaml` — `GMS_BASE_URL` · `GMS_MODEL`(값은 `ai.yaml` 과 같게, 주석으로 가리킨다), `GMS_API_KEY`(Secret `gms-api`, optional), `MEANING_DAILY_LIMIT`
- `infra/server/seal-secrets.sh` — `gms-app`(출력 `sealed-gms-api-app.yaml`). 봉인 뒤 `infra/k8s/services/app/sealed-gms-api.yaml` · `kustomization.yaml`

**문서**: `docs/specs/F13-dictionary-api.md`(AC 추가) · `docs/api-screen.md` · `docs/api.md` · `SSOT.md`(3 · 5 · 9절). `docs/mvp-overview.md` 82행은 PM 확인 MR 을 따로 연다.

## 작업 순서

- [ ] Jira 티켓(스토리 포인트), worktree(`C:/tmp/wt-…`) — 본 폴더는 다른 세션이 쓴다
- [ ] **실험**: 실제 브라우저에서 SVG 글자 드래그, 흰 테두리(HALO) 아래 선택 색, `Range` 위치 재기, HTML 버튼 글자. 안 되면 멈추고 그 부분만 빼는 안을 보고
- [ ] backend 실패 시험 → 구현 — 고친 코드를 되돌려 단언에서 빨개지는지
- [ ] 로컬 실호출로 고정 표(동음이의어 · 말 조각 · 주입 문구, 10 ~ 15번) 측정, 하루 한도 · GMS 설정 확정 — worktree backend 를 `--spring.config.import` 로 본 폴더 `.env` 에 붙인다. 앱이 읽고 Claude 는 값을 보지 않는다
- [ ] frontend: `pickTerm` 시험 → 말풍선 → 드래그 대상 → 옛 창 제거
- [ ] 화면 확인(아래) → reviewer → MR 셋(backend · frontend · infra)
- [ ] 머지 · 배포는 사용자와 정한다: backend → infra → 봉인(사용자) → frontend. `mvp-overview` 는 PM 확인이 끝나면

## 안 바꿀 것

- A19 동작 · 표준국어대사전 키(화면에서만 뺀다) · AI 워커 코드 · DB 마이그레이션 · `SecurityConfig`
- 지도의 휠 확대 · 터치 이동 · 노드 누르기, 화면 여백(`pb-[96px]`)
- 드래그 대상 밖의 글자, 홈 · 목록 · 검색 화면

## 리스크

- **SVG 선택은 코드로만 확인했다.** 실제 드래그 · 선택 색 · 위치 계산은 위 실험에서 본다. Firefox · 터치는 미확인이라 터치 지도 이동은 유지한다
- 글자 위에서 시작하면 지도를 끌 수 없다(요청대로의 맞바꿈). 잎이 ±3px 떠다닌다
- 모델이 틀린 뜻을 낼 수 있다 — 평가셋은 없다. 「AI 생성」 표시 · 풀이 불가 답 · 시연 단어 미리 확인으로 줄인다
- 한 사람이 하루 한도를 다 쓰면 그날 전원 502 — 회원별 몫은 넣지 않는다. 필요해지면 키 하나로 더할 수 있다
- 같은 와이파이의 발표장은 IP 가 같아 1분 100건을 나눠 쓴다(사전과 같은 조건)
- Redis 가 멈추면 이 기능은 502 다(비용 상한을 지키려는 선택). A19 와 다르다
- GMS 는 팀 공용이다 — 로그인 · 하루 한도 · 입구 상한 · 저장으로 묶는다
- frontend 가 backend 보다 먼저 나가면 「의미」가 실패한다 — 순서를 지킨다

## 어떻게 검증하나

- `/verify` — backend · frontend 영역 명령
- 새 AC(F13 스펙에 AC-10 ~ AC-18로 적는다): 권한(손님 401 · 번호표) · 응답 모양과 풀이 불가 · 입력 400(`term` 밖, `around` 밖 포함)과 GMS 안 부름 · 세 대상 문맥 · 숨긴 대상 404 · 마인드맵 없는 기사의 제목 · 저장(대상별, 공백 무시, 만료, 실패 제외) · 한도(세지 못하면 막음) · GMS 실패 502 · 로그 · Swagger
- `pickTerm` — 위 드래그 규칙 표 전부
- 화면(mock + 로컬 실호출 각각), 내장 브라우저의 실제 마우스 드래그(`left_click_drag`)로:
  - 흐름지도 잎 · 제목 · 사건 패널 · 마인드맵 잎과 가운데 제목 · 가로 타임라인 이름에서 말풍선 → 점 → 뜻 → 커짐
  - 「.」 · 공백 · 「받은」의 「은」 · 줄임표에 닿은 낱말에서 안 뜸
  - 드래그 뒤 잎 강조 · 패널이 안 바뀜, 빈 곳 끌기 · 휠은 지도 이동, 일반 클릭은 그대로, 우클릭은 이동 안 함
  - 좁은 화면 사건 시트에서 「의미」를 눌러도 시트가 안 닫힘(에뮬레이션)
  - 「이자」를 다른 문맥의 두 글에서 찾아 뜻이 문맥을 따르는지, 스크린샷 증거
- 운영(배포 뒤, 사용자와): A26 손님 401 · 상한 429, 20초 제한, Loki 에 단어가 없는지, Redis 키 만료, 시연 단어 확인

## 되돌리는 법

- frontend 이미지 태그를 앞으로 되돌리면 옛 창이 돌아온다(A19 서버가 남아 있어 그대로 동작). backend · infra 는 추가뿐이라 남겨도 무해하고, Git 으로 되돌리면 Argo CD 가 맞춘다
- GMS 호출만 끄려면 `backend.yaml` 의 `MEANING_DAILY_LIMIT` 을 0 으로(MR 뒤 Pod 재시작)
- DB 변화 없음. Redis 키는 하루 · 이틀 뒤 저절로 지워진다. **이미 쓴 GMS 크레딧은 돌아오지 않는다**
