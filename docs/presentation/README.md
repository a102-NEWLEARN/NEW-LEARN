# 발표 자료용 이미지

발표 슬라이드에 바로 넣을 수 있는 이미지 모음입니다. 화면 캡처는 **프로토타입 v15** 기준이고, 2026-10-15에 찍었습니다.

기사 마인드맵(`screens/06`, `07`, `jensen/08`, `jensen/09`)은 라벨이 겹치지 않도록 그래프 설정의 노드 간격을 1.4배로 넓히고 *화면에 맞추기*를 누른 뒤 찍었습니다. 젠슨 황 마인드맵은 노드 세 개(엔비디아, 블랙웰 GPU 약 26만 장 공급, 다온뉴스)를 끌어서 자리를 옮겼어요. 시연할 때도 노드 간격을 넓혀 두면 같은 화면이 나옵니다.

- **screens/**: 한빛반도체 이슈와 공통 화면. 3200×1800(16:9) PNG입니다.
- **screens/jensen/**: 젠슨 황 이슈 화면. 3200×1800(16:9) PNG입니다.
- **diagrams/**: 변화 분석 흐름도와 유저 플로우. 가로 약 2200px PNG이고, 흰 배경에 여백이 있습니다.

언론사, 기사 제목, 발행 시각은 모두 프로토타입용 가상 데이터입니다. 젠슨 황 이슈의 사건 날짜, 숫자, 인물 발언은 실제 보도를 따랐습니다([../claude-design-brief-jensen-huang.md](../claude-design-brief-jensen-huang.md)).

## 추천 순서

| 슬라이드 | 이미지 |
| --- | --- |
| 서비스 소개 | `screens/01-landing.png` |
| 페르소나 | `diagrams/user-flow-2-personas.png` |
| 전체 흐름 | `diagrams/user-flow-1-overview.png` |
| 시연 A: 사쿠 | `diagrams/user-flow-3-saku.png` → `screens/02` → `03` → `04` → `05` → `screens/card-conflict.png` |
| 시연 B: 요섭 | `diagrams/user-flow-4-yoseop.png` → `screens/06` → `07` → `08` → `09` → `10` → `screens/card-update.png` |
| 두 번째 이슈: 젠슨 황 | `jensen/01` → `02` → `03` → `05` → `jensen/card-conflict.png` |
| 핵심 기술: 변화 분석 | `diagrams/change-analysis-1-pipeline.png`, `diagrams/change-analysis-2-decision-tree.png` |
| 판정 예시 | `jensen/card-update.png`(갱신), `jensen/card-conflict.png`(상충 후보), `jensen/card-cannot-judge.png`(판단 불가) |
| MVP 범위 | `diagrams/change-analysis-3-scope.png` |

## screens/ (한빛반도체 이슈)

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
| `card-conflict.png` | 카드 확대 | 상충 후보 카드 |
| `card-update.png` | 카드 확대 | 갱신 카드 |

## screens/jensen/ (젠슨 황 방한과 GPU 26만 장 공급)

| 파일 | 화면 | 보이는 것 |
| --- | --- | --- |
| `01-home-it-tab.png` | 홈 | 추천 이슈 IT/과학 탭의 이슈 카드 |
| `02-issue-map.png` | 이슈 에볼루션 맵 | 사건 6개(10.28 ~ 11.03), 예고 → 공식 발표 "갱신 1" 화살표 |
| `03-event-panel.png` | 사건 패널 | 10.31 GPU 26만 장 공급 발표: 요약, 핵심 근거, 관련 기사 4건 |
| `04-event-panel-changes.png` | 사건 패널 | 같은 패널 아래쪽, 이 사건의 변화 4건 |
| `05-change-list-conflict.png` | 변화 목록 | 상충 후보: SK 5만 장 vs 최대 6만 개 |
| `06-change-list-top.png` | 변화 목록 | 필터(전체 8 · 갱신 1 · 새 정보 5 · 반복 1 · 상충 후보 1)와 맨 위 카드 |
| `07-cannot-judge.png` | 변화 목록 | 판단 불가 펼침: 외신 전망 vs 공식 발표 |
| `08-article-mindmap.png` | 기사 마인드맵 | 누리경제 「엔비디아, 한국에 블랙웰 GPU 26만 장 공급…」 |
| `09-node-panel.png` | 노드 패널 | 정부 물량은 국가 AI 컴퓨팅 센터에 |
| `card-update.png` | 카드 확대 | 갱신: 진행 상태 예고 → 공식 발표 |
| `card-conflict.png` | 카드 확대 | 상충 후보: SK 5만 장 vs 최대 6만 개 |
| `card-cannot-judge.png` | 카드 확대 | 판단 불가: 주장 유형이 달라 비교하지 않음 |

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

### MVP 이후 기능

프로토타입에는 MVP 이후 기능이 함께 보입니다. 아래 기능을 MVP 기능처럼 설명하지 마세요.

| 화면에 보이는 것 | 들어 있는 이미지 | 실제 범위 |
| --- | --- | --- |
| "서진님을 위한 추천 이슈", 관심사 편집 | 02, jensen/01 | 개인화 추천은 MVP 이후(FR-28). 분야별 이슈 카드를 MVP에 둘지는 팀 확인 중 |
| 나의 뉴스함, 마이페이지, 스크랩, 별표 | 01을 뺀 모든 화면 | MVP 이후(FR-17~19) |
| "지난 방문 이후 새 사건 2" | 03, 04, 05, 09, 10 | MVP 이후(FR-19) |
| *관점 비교*, *관점* 탭, 타임라인의 ◆ | 한빛반도체 03~05, 09, 10 / 젠슨 황 헤더 | MVP 이후(FR-24~26) |
| 타임라인 태그 #새사실, #수치변경 | 맵이 보이는 화면 전부 | PRD 이름은 #새 정보, #갱신, #상충 후보(Q22) |
| 마인드맵 분류 누가·언제·어디서·무엇을·어떻게·왜 | 06, 07, jensen/08, jensen/09 | MVP 개요 F03은 인물·기관·사건·시점·배경·결과. 팀 확인 중 |

## 원본

- 변화 분석 흐름: [../change-analysis-flow.html](../change-analysis-flow.html)
- 유저 플로우: [../user-flow.html](../user-flow.html), [../user-flow.md](../user-flow.md)
- 젠슨 황 이슈 구성: [../claude-design-brief-jensen-huang.md](../claude-design-brief-jensen-huang.md)
- 프로토타입: [../prototype/NEW-LEARN 프로토타입 v15.html](<../prototype/NEW-LEARN 프로토타입 v15.html>)

원본을 고쳐서 이미지를 다시 뽑아야 하면 말씀해 주세요.
