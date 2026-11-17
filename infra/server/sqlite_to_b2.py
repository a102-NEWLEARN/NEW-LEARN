"""10/21 ~ 11/3 NewsData 최종 기사(SQLite) → B2 요청 모양 JSONL (Jira S15P31A102-169)

AI 팀원이 올린 data/newsdata_2026-10-21_2026-11-03.sqlite(표는 data/README.md)에서 최종 기사(selection.status = 'selected')만
뽑아, 한 줄에 B2 요청 본문 하나(docs/api-internal.md 2절)를 쓴다. 이 파일을 수집 배치의 INGEST_SOURCE=file 로 운영에 넣고
(infra/server/ingest.md 「지난 기사 파일로 넣기」), AI 팀도 같은 파일을 로컬 B2 로 넣어 덤프 적재 때 값이 같게 한다(data-load.md 2절).

  python -I infra/server/sqlite_to_b2.py <sqlite> <out.jsonl> [before]

- before(기본 2026-11-04): published 가 이 날 0시(KST) 전인 기사만 — 그날부터는 운영 수집 배치가 받는다
- published 는 한국 시간이고 시간대 표시가 없다(README) → 값은 그대로 두고 +09:00 을 붙인다. B2 가 오프셋대로 UTC 로 바꿔 저장한다
- category 는 쉼표로 이은 글자 → 나눠서 배열로(빈 값 · 겹침 뺌). 한 덩어리로 보내면 대응 표에서 못 찾아 대표 카테고리가 빈다
- 제목 · 본문은 손대지 않는다 — 덤프 적재가 운영 본문과 md5 로 견준다(data-load.md 5절)
- 기자 · 태그 칸은 SQLite 에 없어 보내지 않는다
- 출력 파일은 이 스크립트가 직접 쓴다(PowerShell 의 > 는 바이트를 바꾼다). 값이 하나라도 이상하면 아무것도 쓰지 않고 멈춘다
끝에 줄 수 · sha256 · 발행 시각 범위를 JSON 한 줄로 찍는다. 표준 라이브러리만 쓴다
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import date

PUBLISHED_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")
REQUIRED = ("url", "pressSourceId", "pressName", "title", "body")
QUERY = """
    SELECT a.link, a.source_id, a.source_name, a.title, a.content, a.published, a.category
    FROM articles a
    JOIN selection s ON s.article_id = a.article_id AND s.day = substr(a.published, 1, 10)
    WHERE s.status = 'selected'
    ORDER BY a.published, a.article_id
"""


class ConvertError(Exception):
    pass


def split_categories(raw):
    """「top, ,business,top」 → ["top", "business"] — 앞뒤 공백 · 빈 값 · 겹침을 뺀다"""
    seen = []
    for value in (raw or "").split(","):
        value = value.strip()
        if value and value not in seen:
            seen.append(value)
    return seen


def to_b2(row):
    link, source_id, source_name, title, content, published, category = row
    if not isinstance(published, str) or not PUBLISHED_RE.fullmatch(published):
        raise ConvertError(f"published 모양이 다르다: {published!r} ({link})")
    body = {
        "url": link,
        "pressSourceId": source_id,
        "pressName": source_name,
        "title": title,
        "body": content,
        "publishedAt": published.replace(" ", "T") + "+09:00",
    }
    for key in REQUIRED:
        if not isinstance(body[key], str) or not body[key].strip():
            raise ConvertError(f"{key} 가 비었다 ({link})")
    categories = split_categories(category)
    if categories:
        body["sourceCategories"] = categories
    return body


def convert(sqlite_path, out_path, before):
    cutoff = date.fromisoformat(before).isoformat()  # 날짜가 아니면 ValueError
    con = sqlite3.connect(f"file:{os.fspath(sqlite_path)}?mode=ro&immutable=1", uri=True)
    try:
        # 최종 기사를 모두 먼저 검사한 뒤 날짜로 거른다 — SQL 에서 거르면 모양이 이상한 published 가 조용히 빠질 수 있다
        bodies = [to_b2(row) for row in con.execute(QUERY)]
    finally:
        con.close()
    lines = [json.dumps(b, ensure_ascii=False, separators=(",", ":")) for b in bodies if b["publishedAt"][:10] < cutoff]
    raw = "".join(line + "\n" for line in lines).encode("utf-8")
    with open(out_path, "wb") as f:  # 다 바꾼 뒤에만 쓴다 — 중간에 멈추면 파일이 없다
        f.write(raw)
    first = json.loads(lines[0])["publishedAt"] if lines else None
    last = json.loads(lines[-1])["publishedAt"] if lines else None
    return {"lines": len(lines), "sha256": hashlib.sha256(raw).hexdigest(), "publishedMin": first, "publishedMax": last}


def main(argv, out):
    if len(argv) not in (2, 3):
        out.write(json.dumps({"error": "쓰는 법: sqlite_to_b2.py <sqlite> <out.jsonl> [before]"}, ensure_ascii=False) + "\n")
        return 2
    before = argv[2] if len(argv) == 3 else "2026-11-04"
    try:
        result = convert(argv[0], argv[1], before)
    except (ConvertError, ValueError, sqlite3.Error) as err:
        out.write(json.dumps({"error": str(err)}, ensure_ascii=False) + "\n")
        return 2
    out.write(json.dumps({"before": before, **result}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], sys.stdout))
