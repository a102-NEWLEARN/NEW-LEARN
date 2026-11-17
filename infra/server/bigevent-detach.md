# 큰 사건에서 그 사건이 아닌 기사 떼기

기사가 많이 모인 사건일수록 다른 사건 기사가 섞인다. 섞인 기사를 **이미 단 판정**으로 집어내 떼고, 되돌릴 수 있게 남긴다.

왜 이 일이 필요한지와 숫자는 `SSOT.md` 10절, 측정 방법은 `infra/server/eval/README.md` 「실시간 몫 측정」.

| 파일 | 하는 일 |
|---|---|
| `bigevent-detach.sql` | 되돌리기 표 · 임시 표를 만들고 쌍 목록을 받는다. 마지막 문장이 `COPY` 다 |
| `bigevent-detach-apply.sql` | 줄 수 · 겹침 · `Y` 섞임 · 실행 이름 중복을 단언하고, 기록한 뒤 뗀다. 뗀 뒤 사건 크기와 화면에서 사라지는 사건 수를 찍는다 |
| `bigevent-restore.sql` | 그 실행으로 뗀 것을 `linked_at` 까지 제자리로 돌리고 표에서 지운다 |

## 1. 뗄 쌍 목록 만들기

판정은 새로 하지 않는다. `infra/server/eval/gold/` 의 `M:<사건>:<기사>` 가 `Y`(맞음)가 아닌 것을 고른다 — `B`~`Z`(다른 한 사건) · `0`(혼자 · 사건 없음). 같은 키에 사람 판정(`human.tsv`)이 있으면 사람 쪽을 쓴다.

줄마다 `사건번호<탭>기사번호<탭>판정`. **저장소 밖에 둔다.**

어떤 사건을 손댈지는 그때 정한다. 2026-11-15 에는 운영에서 공개 기사 50건 이상인 사건 33개를 골랐다 — 그 크기부터 쌍 정밀도가 0.466 으로 떨어진다.

## 2. 수를 먼저 본다 — 끝이 `rollback;` (EC2)

`expected` 는 쌍 목록 줄 수(`wc -l`), `run` 은 이번 실행 이름이다. **실행마다 새 이름을 쓴다** — 같은 이름이면 되돌릴 때 앞 실행과 묶인다. `rollback` 으로 끝낸 실행은 표에 안 남아 같은 이름을 그대로 쓴다.

```bash
{ echo 'begin;'; cat infra/server/bigevent-detach.sql pairs.tsv; printf '\\.\n'; cat infra/server/bigevent-detach-apply.sql; echo 'rollback;'; } | kubectl -n data exec -i postgres-0 -- psql -X -v ON_ERROR_STOP=1 -v expected=<줄 수> -v run=<실행 이름> -U newlearn -d newlearn
```

**볼 것**

- 마지막 줄이 `ROLLBACK`
- `쌍 목록` = `지금 붙어 있음` — 「이미 없음」이 많으면 목록이 낡았다
- **`3건 미만 — 화면에서 사라짐` 이 0 인지.** 0 이 아니면 그만큼 사건이 화면에서 없어진다(`QUERY_MIN_PUBLIC_ARTICLES`, `SSOT.md` 9절). 0 이 아닌 채로 넣을지는 사람이 정한다
- `다른 사건에 남아 있음` — 0 이면 뗀 기사는 사건 없는 기사가 된다. 기사 목록 · 마인드맵에는 그대로 보이고 사건 · 이슈만 없어진다

수가 맞으면 끝만 `commit;` 으로 바꿔 한 번 더 돌린다.

## 3. 되돌리기

```bash
{ echo 'begin;'; cat infra/server/bigevent-restore.sql; echo 'rollback;'; } | kubectl -n data exec -i postgres-0 -- psql -X -v ON_ERROR_STOP=1 -v run=<실행 이름> -U newlearn -d newlearn
```

`되돌린 쌍` 이 뗀 수와 같으면 끝만 `commit;` 으로.

## 안 건드리는 것

- **`analysis_job`** — 판정 작업 행은 그대로 둔다. 지우면 그 기사가 다시 판정 줄에 서서 **같은 큰 사건에 또 붙는다**(백엔드 `AnalysisJobRepository.findNextMatchArticle()` 이 단계 행이 있는지로 고른다. `infra/server/realtime-restore.sql` 머리에도 같은 말이 있다)
- `event` 행 · `event.issue_id` · `event.occurred_at` — 사건 자체와 이슈 소속은 남는다. 사건 시점은 뗀 뒤에도 다시 계산하지 않는다
- `article.released_at` · 북마크 · 관심 이슈

## 한계

- 뗀 기사 가운데 「다른 사건이다」로 판정된 것은 **그 다른 사건에 붙여 주지 않는다.** 판정의 `B`~`Z` 는 그때 보여 준 후보 가운데 몇 번째인지라, 후보 목록 없이는 어느 사건인지 되살릴 수 없다. 그래서 결과는 「틀린 사건에 붙음」이 「사건 없음」이 되는 것이다
- 뗀 뒤 같은 정답으로 다시 재면 정밀도가 저절로 올라간다. **그 값은 성적으로 쓰지 않는다**(`SSOT.md` 10절에 같은 주의가 2026-11-14 이슈 34건 때도 적혀 있다)
