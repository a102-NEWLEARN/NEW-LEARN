# 사건 · 이슈 묶기 정확도 평가

운영에 묶인 사건 · 이슈가 얼마나 맞는지 정답과 견줘 숫자로 낸다. 조회 속도가 아니라 정확성이다. 계획은 `docs/plans/2026-11-13-event-issue-accuracy.md`, Jira S15P31A102-206.

| 파일 | 하는 일 |
|---|---|
| `eval_export.sql` | 운영에서 읽기만으로 이슈 · 사건 · 사건에 묶인 기사를 JSONL 로 뽑는다(기사 글은 제목과 본문 앞 240자) |
| `clustering_eval.py` | 후보 만들기 · Sonnet 묶음 나누기 · 모으기 · 사람 표본 · 기록 · 일치율 · 지표. 표준 라이브러리만 |
| `criteria-v4.md` | 판정 기준 — AI 팀 v4 사본 |
| `judge-prompt.md` | Sonnet 판정 지시문 |
| `gold/` | 정답 — 번호와 판정만(`human.tsv` 사람 · `sonnet*.tsv` Sonnet · `metrics.json` 지표) |
| 시험 | `infra/ci/test_clustering_eval.py` (CI `infra_TEST`) |

## 1. 무엇을 판정하나

| 일 | 질문 | 판정 |
|---|---|---|
| `M:<사건>:<기사>` | 이 기사가 이 사건에 맞나 | `Y` · 다른 한 사건 `B` ~ `Z` · 혼자 / 사건 없음 `0` |
| `P:<사건>:<사건>` | 두 사건이 같은 사건인가 | `same_event` · `same_issue` · `unrelated` |
| `I:<이슈>:<사건>` | 이 사건이 이 이슈 흐름에 드나 | `Y` · `B` ~ `Z` · `0` |
| `O:<사건>:<이슈>` | 이슈 밖 사건이 이 이슈에 드나 | `Y` · `N` |
| `Q:<이슈>:<이슈>` | 두 이슈가 한 흐름인가 | `same_issue` · `unrelated` |

`P` 후보는 발생일 ±3일 안에서 제목 글자 겹침 상위 3 ∪ 벡터 중심 코사인 상위 3, 겹침 0.10 · 코사인 0.60 둘 다 아래면 뺀다. 후보 밖 놓침은 같은 날 사건 쌍 무작위 40개로 어림한다. 벡터는 AI 팀 파일(`dragonkue/BGE-m3-ko`, 제목 + 줄바꿈 + 본문 앞 800자)이다.

### 어느 것이 train · validation · test 인가

표준 용어로 적어 둔다. 어디까지 손댄 데이터이고 어디가 손대지 않은 데이터인지가 숫자를 읽는 기준이다.

| 우리 것 | 표준 용어 | 쓰임 | 이 몫으로 정확도를 보고하나 |
|---|---|---|---|
| 보정 50건 (`human.tsv` stage `calib`) | **train (fit)** | Sonnet 지시문의 「보탬」을 여기서 정했다 | **아니다** — 맞춘 데이터다 |
| Sonnet 전수 18,104건 (`sonnet.tsv`) | **silver label** (LLM-as-a-judge) | 정답 묶음을 만드는 바탕 | 사람 몫으로 보정해서만 |
| 검수 150건 (`human.tsv` stage `verify`) | **held-out audit** | silver 가 얼마나 맞는지 사람이 층화 표본으로 | **그렇다** — 역확률 가중치 · Wilson 구간 |
| 재생 개발 창 1일 | **validation (dev)** | 문턱 τ · 후보 수 k · 프롬프트 고르기 | 아니다 |
| 재생 시험 창 1일 | **test (held-out)** | 고른 값을 한 번만 돌려 보고 | **그렇다** |

- 모델 가중치를 학습하지는 않는다. 그래서 엄밀한 train 은 없고, 「개발 창에서 값을 고르고 시험 창은 손대지 않는다」가 그 자리를 대신한다. B1(임베딩만)의 문턱 τ 하나만 개발 창에서 맞춘다
- 사람이 단 판정만 gold 다. Sonnet 이 단 18,104건은 silver 이고, 둘을 섞어 「정답셋」이라 부를 때는 어느 쪽인지 밝힌다
- **보정 50건의 일치도는 held-out 값이 아니다.** 사람과 엇갈린 6건을 사람이 다시 가린 뒤에 잰 값이고, 그 가운데 둘은 지시문에 되먹였다. 깨끗한 일치도는 검수 150건에서 나온다 — 그 150건은 Sonnet 이 사람 답을 보지 않고 전수에서 미리 판정한 것이다

## 2. 돌리는 법

목록 · 벡터 · 작업 폴더는 저장소 밖에 둔다(기사 글이 있다). 예는 `C:/tmp/206-steps/`.

```bash
# 1) 운영에서 읽기만 — kubectl exec 출력이 끊기면 서버 파일로 받는다
ssh newlearn 'kubectl -n data exec -i postgres-0 -- psql -X -q -U newlearn -d newlearn -At > eval-export.jsonl; wc -l eval-export.jsonl' < infra/server/eval/eval_export.sql
scp newlearn:eval-export.jsonl C:/tmp/206-steps/export.jsonl && ssh newlearn 'rm eval-export.jsonl'

# 2) 후보 · 대표 기사(약 25초)
python -X utf8 -B infra/server/eval/clustering_eval.py prepare C:/tmp/206-steps/export.jsonl <벡터.sqlite> C:/tmp/206-steps/w2

# 3) 사람 보정 — 표본을 뽑고, 질문 상자로 4건씩 통과 · 불통과를 받아 바로 기록
python -X utf8 -B infra/server/eval/clustering_eval.py sample C:/tmp/206-steps/w2 infra/server/eval/gold calib
python -X utf8 -B infra/server/eval/clustering_eval.py record infra/server/eval/gold M:1183:22625 통과

# 4) 같은 표본을 Sonnet 으로 → 일치율 · κ
python -X utf8 -B infra/server/eval/clustering_eval.py split C:/tmp/206-steps/w2 --stage calib
#    묶음마다 Sonnet 조수 하나에 judge-prompt.md 를 주고 bNN.tsv 를 받는다
python -X utf8 -B infra/server/eval/clustering_eval.py merge C:/tmp/206-steps/w2 infra/server/eval/gold --stage calib
python -X utf8 -B infra/server/eval/clustering_eval.py agree infra/server/eval/gold --workdir C:/tmp/206-steps/w2 --stage calib --sonnet sonnet-calib.tsv

# 5) κ ≥ 0.6 이면 전수 → 사람 검수 150건(verify) → 지표
python -X utf8 -B infra/server/eval/clustering_eval.py split C:/tmp/206-steps/w2
python -X utf8 -B infra/server/eval/clustering_eval.py merge C:/tmp/206-steps/w2 infra/server/eval/gold
python -X utf8 -B infra/server/eval/clustering_eval.py sample C:/tmp/206-steps/w2 infra/server/eval/gold verify
python -X utf8 -B infra/server/eval/clustering_eval.py metrics C:/tmp/206-steps/w2 infra/server/eval/gold
```

사람 판정은 Sonnet 답을 보지 않고 한다. 같은 키를 다시 기록하면 뒤 줄이 이긴다. 지표를 낼 때 사람 판정이 Sonnet 판정을 덮는다.

## 3. 지표

| 지표 | 무엇을 보나 |
|---|---|
| 쌍 정밀도 · 재현율 · F1 | 같은 사건으로 묶인 기사 쌍이 정답에서도 같은가 · 정답의 같은 쌍을 묶었나. 10-23 평가 · PRD SM-3 와 같은 자 |
| B³ 정밀도 · 재현율 · F1 | 기사 하나씩, 내 묶음과 정답 묶음이 얼마나 겹치나의 평균 |
| 균질성 · 완전성 · V | 묶음 안이 섞이지 않았나 · 정답 한 사건이 쪼개지지 않았나 |
| ARI | 우연히 맞을 몫을 뺀 일치 |

비율은 Wilson 95% 구간, F1 · B³ 는 묶음 덩어리(정답이 잇는 시스템 묶음끼리) 단위 부트스트랩 1,000번. 사람 표본은 층별 역확률 가중치로 되돌린다. 숫자 옆에 범위를 적는다: 「사건에 묶인 기사 14,493건 안에서」, 「사람 1명 + Sonnet 판정」.

## 4. 결과

**보정 50건 — train(fit) 몫** (2026-11-13, 사람 1명이 Sonnet 답을 보지 않고 먼저 판정). 아래 일치도는 **held-out 값이 아니다**(3절 표).

| 일 | 건수 | 사람 통과율(층 가중) | Sonnet 과 일치 | κ |
|---|---|---|---|---|
| 전체 | 50 | 0.71 | 0.989 | 0.973 |
| M 기사-사건 | 30 | 0.78 | 0.987 | 0.962 |
| P 사건 쌍 | 10 | 0.10 | 1.000 | 1.000 |
| I 사건-이슈 | 10 | 1.00 | 1.000 | 1.000 |

처음 돌렸을 때는 κ 0.67(M 0.48)이었고, 엇갈린 6건이 모두 「사람 통과 · Sonnet 불통과」 한쪽이었다. 여섯 건을 사람이 다시 가려 넷은 Sonnet 쪽(해설 · 현황 집계 · 다음 거래일 전망 · 다른 행위)으로, 둘은 사람 쪽(지주 · 자회사 같은 날 실적, 같은 법안의 위원회 단계)으로 정하고 그 둘을 `judge-prompt.md` 「보탬」에 넣었다. 위 표는 바로잡은 뒤 값이다. 문턱은 κ ≥ 0.6(계획 A-1).

사람 통과율 0.71 은 「운영 묶음이 71% 맞다」는 뜻이 아니다 — 표본이 중심에서 먼 기사 · 후보 사건 쌍을 일부러 더 뽑았고, 역확률 가중치로 되돌린 값이다. 운영 묶음 전체 정확도는 전수 · 검수 뒤 `metrics` 로 낸다.

**Sonnet 전수 — silver label** (2026-11-13, 18,104건 · 42묶음). 키 수와 결과 줄 수가 모든 묶음에서 같았다.

| 일 | 판정 |
|---|---|
| M 기사-사건 14,493 | 맞음 12,161 · 다른 사건 1,137 · 사건 없음 · 홀로 1,195 |
| P 사건 쌍 2,064 | 같은 사건 46 · 같은 흐름 1,367 · 무관 651 |
| I 사건-이슈 878 | 든다 864 · 다른 흐름 4 · 홀로 10 |
| O 이슈 밖 사건 249 | 든다 25 · 아님 224 |
| Q 이슈 쌍 420 | 한 흐름 102 · 무관 318 |

**첫 지표 (silver 만, 사람 검수 전 — 보고용 아님)**

| | 쌍 F1 | 정밀 | 재현 | B³ F1 | V | ARI |
|---|---|---|---|---|---|---|
| 사건 (기사 14,493) | 0.749 | 0.620 | 0.945 | 0.853 | 0.957 | 0.749 |
| 이슈 (사건 961) | 0.251 | 0.993 | 0.144 | 0.743 | 0.892 | 0.245 |

🔴 **이슈 쪽 숫자는 아직 쓰면 안 된다.** `Q:same_issue` 102쌍을 이행으로 이으니(A~B, B~C) 정답 묶음 하나가 운영 이슈를 24개까지 삼켰고, 운영 이슈 3개 이상을 삼킨 묶음이 10개다. 재현율 0.144 는 그 거대 묶음이 만든 값이지 실제 놓친 합침이 아니다. 묶음 단위로 다시 확인하기 전까지 이슈 지표는 보고하지 않는다 — `metrics` 가 이 경우 경고를 낸다.

사건 쪽은 거대 묶음이 없다(정답 사건 묶음 2,357개, 가장 큰 것 기사 103건). 정밀도 0.620 은 Sonnet 이 운영 사건 하나를 여러 사건으로 쪼갠 결과다(운영 961 → 정답 2,357).

**검수 150건 — held-out audit**: 뽑아 두었다(`queue-verify.jsonl`). 사람이 판정하면 이 숫자를 보정하고 Wilson 구간을 붙인다. 그때가 보고할 수 있는 값이다.
