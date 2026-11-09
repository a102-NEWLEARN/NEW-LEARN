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
