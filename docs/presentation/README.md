# 발표 자료용 이미지

발표 슬라이드에 바로 넣을 수 있는 이미지 모음입니다. 2026-10-15에 만들었습니다.

- **screens/**: 프로토타입 v13 화면 캡처. 3200×1800(16:9) PNG입니다.
- **diagrams/**: 변화 분석 흐름도와 유저 플로우. 가로 약 2200px PNG이고, 흰 배경에 여백이 있습니다.

화면 속 기업, 언론사, 기사는 모두 프로토타입용 가상 데이터입니다.

## 추천 순서

| 슬라이드 | 이미지 |
| --- | --- |
| 서비스 소개 | `screens/01-landing.png` |
| 페르소나 | `diagrams/user-flow-2-personas.png` |
| 전체 흐름 | `diagrams/user-flow-1-overview.png` |
| 시연 A: 사쿠 | `diagrams/user-flow-3-saku.png` → `screens/02` → `03` → `04` → `05` → `screens/card-conflict.png` |
| 시연 B: 요섭 | `diagrams/user-flow-4-yoseop.png` → `screens/06` → `07` → `08` → `09` → `10` → `screens/card-update.png` |
| 핵심 기술: 변화 분석 | `diagrams/change-analysis-1-pipeline.png`, `diagrams/change-analysis-2-decision-tree.png` |
| MVP 범위 | `diagrams/change-analysis-3-scope.png` |

## screens/ (프로토타입 v13)

| 파일 | 화면 | 보이는 것 |
| --- | --- | --- |
| `01-landing.png` | 랜딩 | "기사는 많아도, 이슈는 한 흐름으로." |
| `02-home.png` | 홈 | 검색, 추천 이슈, 최신 기사 |
| `03-issue-map.png` | 이슈 에볼루션 맵 | 한빛반도체 미국 공장 건설, 사건 8개 타임라인 |
| `04-event-panel.png` | 사건 패널 | 10.09 현지 인력 수급 우려: 요약, 핵심 근거, 관련 기사 |
| `05-change-list-conflict.png` | 변화 목록 | 상충 후보 카드: 약 900명 vs 1,500명 |
| `06-article-mindmap.png` | 기사 마인드맵 | 가람일보 「한빛반도체 텍사스 공장 첫 삽…」 |
| `07-node-panel.png` | 노드 패널 | 2027년 하반기 장비 반입: 요약과 원문 근거 |
| `08-evidence-modal.png` | 근거 모아 보기 | 이 기사에서 쓰인 근거 문장 모음 |
| `09-issue-from-article.png` | 이슈 에볼루션 맵 | 기사에서 넘어와 착공식 사건이 열린 상태 |
| `10-change-list-update.png` | 변화 목록 | 갱신 카드: 총 투자 규모 20조 원 → 25조 원 |
| `card-conflict.png` | 카드 확대 | 상충 후보 카드만 잘라 냄 |
| `card-update.png` | 카드 확대 | 갱신 카드만 잘라 냄 |

## diagrams/

| 파일 | 내용 |
| --- | --- |
| `change-analysis-1-pipeline.png` | 새 기사 → 주장 추출 → 비교 대상 찾기 → 관계 판정 → 변화 카드. 갱신과 상충 후보 예시를 단계별로 따라감 |
| `change-analysis-2-decision-tree.png` | 관계 판정 순서: 질문 4개, 결과 5개(판단 불가, 새 정보, 반복, 갱신, 상충 후보) |
| `change-analysis-3-scope.png` | MVP에서 뽑는 것(주장)과 뽑지 않는 것(논점·관점) |
| `user-flow-1-overview.png` | Flow A(이슈부터)와 Flow B(기사부터) |
| `user-flow-2-personas.png` | 사쿠(취준생), 요섭(직장인) |
| `user-flow-3-saku.png` | 사쿠의 여정 4단계와 핵심 순간 |
| `user-flow-4-yoseop.png` | 요섭의 여정 5단계와 핵심 순간 |

## 발표 전에 꼭 확인할 것

프로토타입에는 MVP 이후 기능이 함께 보입니다. 아래 기능을 MVP 기능처럼 설명하지 마세요.

| 화면에 보이는 것 | 들어 있는 이미지 | 실제 범위 |
| --- | --- | --- |
| "서진님을 위한 추천 이슈", 관심사 편집 | 02 | 개인화 추천은 MVP 이후(FR-28). 분야별 이슈 카드를 MVP에 둘지는 팀 확인 중 |
| 나의 뉴스함, 마이페이지, 스크랩, 별표 | 02~10 | MVP 이후(FR-17~19) |
| "지난 방문 이후 새 사건 2" | 03, 04, 05, 09, 10 | MVP 이후(FR-19) |
| *관점 비교*, *관점* 탭, 타임라인의 ◆ | 03, 04, 05, 09, 10 | MVP 이후(FR-24~26) |
| 타임라인 태그 #새사실, #수치변경 | 03, 04, 05, 09, 10 | PRD 이름은 #새 정보, #갱신, #상충 후보(Q22) |
| 마인드맵 분류 누가·언제·어디서·무엇을·어떻게·왜 | 06, 07 | MVP 개요 F03은 인물·기관·사건·시점·배경·결과. 팀 확인 중 |

## 원본

- 변화 분석 흐름: [../change-analysis-flow.html](../change-analysis-flow.html)
- 유저 플로우: [../user-flow.html](../user-flow.html), [../user-flow.md](../user-flow.md)
- 프로토타입: [../prototype/NEW-LEARN 프로토타입 v13.html](<../prototype/NEW-LEARN 프로토타입 v13.html>)

원본을 고쳐서 이미지를 다시 뽑아야 하면 말씀해 주세요.
