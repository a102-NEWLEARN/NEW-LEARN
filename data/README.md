# NewsData 기사 10/21 ~ 11/3 (운영 DB 밖)

`newsdata_2026-10-21_2026-11-03.sqlite` 는 운영 DB 에 없는 10/21 ~ 11/3 기사다(운영은 11/4 부터, `infra/server/data-load.md` 2절). NewsData 에서 받은 기사 **120,744건**과, 날마다 같은 기준으로 고른 **최종 79,335건** 표시가 한 파일에 있다.

- 기간(KST): 2026-10-21 18:50 ~ 2026-11-03 24:00. 10/21 은 저녁부터, 10/28 은 14:42 까지만 있다
- 수집 조건: `country=kr` · `language=ko` · `removeduplicate=1` · 스포츠 · 연예 · 생활 · 음식 · 여행 분류 제외
- sha256: `7b5edc807a0dee2add20b31c1829a725a172f30b4c88b363dd53448ec1bfc5ec` (577,716,224 바이트)
- 받은 방법 · 고르는 기준 · 날짜별 건수: `ai/experiments/issue_backfill/README.md` 「하루 단위 수집」

## 표

| 표 | 내용 |
|---|---|
| `articles` | 기사. `article_id`(NewsData) · `link` · `title` · `description` · `content`(본문, 없으면 빈 글자) · `published` · `source_id` · `source_name` · `category` · `fetched_at`(받은 시각) |
| `selection` | 날마다 기사 하나에 한 줄. `status` 가 `selected`(최종) · `extra`(멀쩡하지만 하루 7,000건 밖) · 뺀 사유(`empty_body` · `no_match` · `unclear` · `wrong_body` · `duplicate`) |
| `days` | 날짜마다 기사 수 · 불량 제외 후 · 최종 · 뺀 사유 · 기사가 없는 시간 |
| `requests` · `archive_hours` · `archive_days` | 10/29 ~ 11/3 수집 요청 기록과 진행 표시 |

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
