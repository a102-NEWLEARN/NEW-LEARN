# NewsData 기사 10/21 ~ 11/8 (기반 분석 데이터셋)

`newsdata_2026-10-21_2026-11-08.sqlite` 는 NewsData 에서 받은 10/21 ~ 11/8 기사 **151,762건**과, 날마다 같은 기준으로 고른 **최종 94,587건** 표시가 한 파일에 있다. 하루 7,000건은 받은 원본 기준 상한이라(2026-11-04 팀 합의) 원본 112,380건에서 불량 본문과 운영에서 숨긴 기사를 뺀 것이 최종이다.

- 기간(KST): 2026-10-21 18:50 ~ 2026-11-08 24:00. 10/21 은 저녁부터, 10/28 은 14:42 까지만 있다. `articles` 에는 11/8 latest 가 함께 받은 11/9 0시대 기사 몇 건도 있지만 어느 날에도 들지 않는다
- 10/21 ~ 11/3 은 운영 DB 에 없는 기간이다(`infra/server/data-load.md` 2절). 11/4 ~ 11/8 은 운영 수집과 따로 같은 조건으로 받은 것이다
- 수집 조건: `country=kr` · `language=ko` · `removeduplicate=1` · 스포츠 · 연예 · 생활 · 음식 · 여행 분류 제외
- sha256: `ba9bb47ca06425ae74797e3e0bce7169cafaa9249e9f916d21018af8cb676331` (726,491,136 바이트, 2026-11-09)
- 받은 방법 · 고르는 기준 · 날짜별 건수 · 숨긴 기사 목록: `ai/experiments/issue_backfill/README.md` 「하루 단위 수집」 · 「숨긴 기사」
- 옛 `newsdata_2026-10-21_2026-11-03.sqlite` 는 10/21 ~ 11/3 만 있고 숨긴 기사를 빼기 전 값이다(이 저장소 판은 최종 79,335건, 원본 상한 기준으로 다시 만든 판은 72,402건). 숨긴 뒤 10/21 ~ 11/3 최종은 69,253건이다

## 표

| 표 | 내용 |
|---|---|
| `articles` | 기사. `article_id`(NewsData) · `link` · `title` · `description` · `content`(본문, 없으면 빈 글자) · `published` · `source_id` · `source_name` · `category` · `fetched_at`(받은 시각) |
| `selection` | 날마다 기사 하나에 한 줄. `status` 가 `selected`(최종) · `extra`(하루 원본 7,000건 밖, 불량 여부는 보지 않음) · 원본 안에서 뺀 사유(`empty_body` · `no_match` · `unclear` · `wrong_body` · `duplicate` · `hidden`) |
| `days` | 날짜마다 기사 수(`unique_articles`) · 원본(`raw`, 상한 7,000) · 최종(`final`, `clean` 도 같은 값) · 뺀 사유 · 기사가 없는 시간 |
| `hidden_urls` | 운영에서 라벨로 숨긴 기사 URL(`link`) · 받은 목록 이름(`source`) · 넣은 시각. 3,515개(`hidden-urls-1105.txt` 3,500 · `hidden-urls-1109.txt` 15) |
| `requests` · `archive_hours` · `archive_days` | 10/29 ~ 11/3 · 11/4 ~ 11/8 수집 요청 기록과 진행 표시 |

- **`published` 는 한국 시간이다**(`YYYY-MM-DD HH:MM:SS`, 시간대 표시 없음). B2 로 넣거나 운영 `published_at`(UTC)과 견줄 때는 9시간을 빼서 UTC 로 바꾼다
- `source_id` 가 운영 `press.code` 에 해당한다(B2 가 처음 보는 언론사를 `source_id` 로 등록)

최종 기사만 꺼내기

```sql
SELECT a.* FROM articles a
JOIN selection s ON s.article_id = a.article_id AND s.day = substr(a.published, 1, 10)
WHERE s.status = 'selected'
ORDER BY a.published;
```

`selection` 의 기본 키가 `(day, article_id)` 라 `day` 까지 걸어 조인한다. `article_id` 만으로 걸면 인덱스를 못 타 매우 느리다.

# 이슈 · 사건 분류 10/21 ~ 11/8 (기반 분석)

`classified_1021_1108.sqlite` 는 위 데이터셋의 최종 기사를 이슈 · 사건으로 나눈 결과다. 표 이름 · 칸은 운영 DB(`docs/data-model.md`, V2 · V8 · V10)를 따른다. **운영 기사 ID 를 모르므로 기사는 URL(`article_url`)로 잇는다** — 덤프 적재와 같은 기준(`infra/server/data-load.md`).

- sha256: `3436b9afae7480ef034de858ec9077372e01a5090cdfad590fc070f3186bd6bd` (8,224,768 바이트, 2026-11-09)
- 건수: 이슈 **162** · 사건 **825**(이슈에 든 것 746, 이슈 밖 79) · 기사 연결 **12,717** · 사건을 만든 기사의 EXTRACT 결과 825
- 사건 역할: MAIN 601 · REACTION 224(같은 이슈의 반응 대상이 있는 것 103)
- 발생 시점: 본문에서 뽑음(EXTRACTED) 624 · 첫 기사 시각(FIRST_PUBLISHED, 화면 「추정」) 201
- 이슈 분야: 정치 78 · 경제 39 · 사회 27 · IT·과학 11 · 국제 7

## 표

| 표 | 칸 | 뜻 |
|---|---|---|
| `issue` | `id` · `title` · `summary` · `created_at` · `updated_at` · `source_issue_key` · `prompt_version` | 사건 3개 이상인 이슈. `id` 는 만든 순서(세 번째 사건이 생긴 때). 이름 · 요약은 `issue-summary-v4` |
| `issue_category` | `issue_id` · `category_code` | 이슈 기사 대표 분야 중 가장 많은 것 하나(같으면 sort_order). 운영은 적재 때 다시 계산한다 |
| `event` | `id` · `title` · `label` · `summary` · `role` · `reacts_to` · `reacts_to_event_id` · `issue_id` · `occurred_at` · `occurred_at_basis` · `created_at` · `updated_at` · `creator_url` · `reason` · `prompt_version` | 판정이 만든 사건 전부. 이슈가 안 된 사건은 `issue_id` NULL. `reacts_to_event_id` 는 같은 이슈 사건일 때만 |
| `article_event` | `article_url` · `event_id` · `linked_at` · `title` · `publisher_code` · `published_at` · `category_code` | 기사 하나에 사건 하나. `publisher_code` 는 NewsData `source_id`(운영 `press.code`) |
| `article_extract` | `article_url` · `content` · `summary` · `primary_core_index` · `occurred_at` · `schema_version` · `model` · `prompt_version` · `generated_at` | 사건을 만든 기사의 EXTRACT(v4.14) 결과 — 운영 `article_mindmap` 과 같은 모양(`content` 는 마인드맵 JSON) |
| `meta` | `key` · `value` | 만든 때 · 버전 · 건수 · 덤프와 다른 점 |

시각은 모두 `+09:00` ISO 글이다.

```sql
-- 이슈 하나의 타임라인(A4 와 같은 순서)
SELECT e.id, e.label, e.title, e.role, e.reacts_to_event_id, e.occurred_at, e.occurred_at_basis,
       (SELECT COUNT(*) FROM article_event ae WHERE ae.event_id = e.id) AS articles
FROM event e WHERE e.issue_id = ? ORDER BY e.occurred_at, e.id;
```

## 기사 본문을 붙인 파일 (`classified_with_articles_1021_1108.sqlite`)

분류 파일에 사건 기사 12,717건의 원본 글을 URL 로 붙인 것이다. 두 파일을 따로 받아 잇지 않아도 된다.

- sha256: `f11083b6df3446f1200ea071c566298c6f19e0aa341eff22eb9704db9cfcf5ff` (72,142,848 바이트, 2026-11-10)
- 위 표 6개는 분류 파일과 같다. 아래 표 하나와 뷰 하나만 더했다

| 표 · 뷰 | 칸 | 뜻 |
|---|---|---|
| `article_body` | `article_url` · `newsdata_article_id` · `description` · `content` · `source_name` · `newsdata_category` | 사건 기사 12,717건의 설명 · 본문 · 언론사 이름 · NewsData 분야 원문(`top,politics` 꼴). 위 기사 데이터셋의 `articles` 에서 최종 기사만 `article_event.article_url = articles.link` 로 가져왔다(빠진 기사 0) |
| `issue_event_article` (뷰) | 이슈 · 사건 · 기사 칸과 본문 | 이슈 → 사건 → 기사를 한 줄로 펼친 것. 이슈 밖 사건의 기사(1,389건)는 `issue_id` 가 NULL |

```sql
-- 이슈 하나의 기사를 사건 순서대로, 본문까지
SELECT event_label, event_title, article_title, publisher_code, published_at, content
FROM issue_event_article WHERE issue_id = ? ORDER BY occurred_at, event_id, published_at;
```

## 어떻게 만들었나

1. **사건 후보 묶기:** 최종 기사 BGE-m3-ko 벡터로 사건(72시간 · 거리 0.25) · 이슈(7일 · 0.40), 기사 5건 이상 사건만(`ai/experiments/issue_backfill/issue_grouping.py`). 이슈 207개 · 사건 묶음 1,038개
2. **EXTRACT v4.14**(`ai/app/extract` 그대로): 묶음 기사를 발행 순으로 앞에서 3건까지 돌려 대표 사건이 처음 나온 기사가 사건을 만든다. 3건 모두 없으면 사건이 안 생긴다(144개)
3. **판정**(MR !766 의 `match-v1` 과 같은 규칙): 같은 이슈 안에서 만든 순서대로, 같은 사건이면 기존 사건에 붙이고(69개) 아니면 새 사건의 이름 · 키워드 · 요약 · 역할 · 반응 대상을 짓는다. 판정 1개는 세 번 모두 형식 오류라 대표 사건 글로 이름을 채웠다
4. **이슈 이름 · 요약**(`issue-summary-v4`): 사건 제목 · 요약으로 짓는다. 사건이 3개 아래로 준 이슈 45개는 서비스 규칙대로 이슈를 만들지 않았다(그 사건 79개는 이슈 밖)

GMS: EXTRACT 1,485번 · 판정 1,101번 · 이슈 이름 162번(시험분 포함), 토큰 약 1,270만.

## 덤프 규칙과 다른 점 (적재 전에 같이 볼 것)

- **기사 키가 URL 이다.** 운영 기사와 URL 로 맞춘다. 10/21 ~ 11/3 은 운영에 옛 선정(79,335건) 기사가 있어 대부분 맞겠지만, 11/4 ~ 11/8 은 운영 수집과 따로 받아 운영에 없는 URL 이 있을 수 있다
- `analysis_job` · `article_embedding` 행이 없다. 마인드맵(`article_extract`)은 사건을 만든 기사 825건뿐이다 — 덤프 규칙(공개 기사마다 마인드맵 · 작업 행)을 채우려면 나머지 기사 분석이 더 필요하다
- 판정 후보를 같은 이슈 사건으로 좁혔다(운영은 전체 사건에서 가까운 5개). 이슈는 LLM 이슈 판정(ISSUE)이 아니라 임베딩 묶음으로 정했다 — MR !766 평가에서 이슈 판정은 이 묶음과 같은 이슈 쌍 정밀도 1.0 · 재현율 0.905
- 이슈 이름 판정에서 「주제 모음」(이어지는 흐름이 아님)으로 본 이슈 16개(업종별 3분기 실적 발표 · 여러 쟁점 묶음 등)도 그대로 넣었다. 빼려면 `source_issue_key` 로 거른다(I0031 · I0040 · I0073 · I0091 · I0101 · I0110 · I0115 · I0116 · I0119 · I0131 · I0160 · I0186 · I0187 · I0196 · I0198 · I0200)
- 공인이 아닌 사람 실명은 이름 · 요약에 쓰지 않게 했다(기사 속 「이름(나이)」 + 피의자 두 명). 사건을 만든 기사의 `article_extract` 원문 근거 문장에는 이름이 남아 있을 수 있다
