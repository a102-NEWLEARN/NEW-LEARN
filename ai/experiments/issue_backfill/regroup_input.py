"""데이터셋의 최종 선정 기사와 BGE-m3-ko 벡터로 regroup.py 입력 DB 를 만든다.

- 기사: 데이터셋 DB(저장소 data/newsdata_*.sqlite)에서 selection.status='selected' 인 기사
- 벡터: 벡터 DB 여러 개(vectors 표, 노트북이 GPU 로 만든 것)에서 기사ID 로 찾는다. 앞 DB 에 있으면 그것을 쓴다
- 저장된 text_hash 가 지금 입력 글(제목 + 줄바꿈 + 본문 앞 800자)과 맞는지, 기사마다 벡터가 하나씩 있는지 확인한다.
  하나라도 어긋나면 종료 코드 1

ai/ 에서: python experiments/issue_backfill/regroup_input.py <데이터셋 DB> <출력 DB> <벡터 DB> [<벡터 DB> ...]
"""

import hashlib
import sqlite3
import sys
from pathlib import Path

import issue_grouping as ig

COLS = "article_id, link, title, description, content, published, source_id, source_name, category, fetched_at"


def main():
    data, out, *vector_dbs = sys.argv[1:]
    out = Path(out)
    out.unlink(missing_ok=True)
    conn = sqlite3.connect(out)
    conn.executescript(
        f"CREATE TABLE articles({', '.join(c + ' TEXT' for c in COLS.split(', '))});"
        "CREATE INDEX articles_published ON articles(published);"
        "CREATE TABLE vectors(model TEXT NOT NULL, article_id TEXT NOT NULL, text_hash TEXT NOT NULL, "
        "vector BLOB NOT NULL, PRIMARY KEY(model, article_id));"
    )
    conn.execute("ATTACH DATABASE ? AS d", (data,))
    conn.execute(
        f"INSERT INTO articles SELECT {', '.join('a.' + c for c in COLS.split(', '))} FROM d.articles a "
        "JOIN d.selection s ON s.day = substr(a.published, 1, 10) AND s.article_id = a.article_id "
        "WHERE s.status = 'selected' ORDER BY a.published, a.article_id"
    )
    conn.commit()
    conn.execute("DETACH DATABASE d")
    for k, path in enumerate(vector_dbs):
        conn.execute("ATTACH DATABASE ? AS v", (path,))
        before = conn.total_changes
        conn.execute(
            "INSERT OR IGNORE INTO vectors SELECT x.model, x.article_id, x.text_hash, x.vector FROM v.vectors x "
            "JOIN articles a ON a.article_id = x.article_id WHERE x.model = ?",
            (ig.MODEL_ID,),
        )
        conn.commit()
        print(f"벡터 DB {k + 1} {Path(path).name}: {conn.total_changes - before:,}건")
        conn.execute("DETACH DATABASE v")
    conn.execute("CREATE INDEX vectors_article ON vectors(article_id)")
    n_articles = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    n_vectors = conn.execute("SELECT COUNT(*) FROM vectors").fetchone()[0]
    keys = ("article_id", "title", "description", "content")
    stale = missing = 0
    stored = dict(conn.execute("SELECT article_id, text_hash FROM vectors"))
    for row in conn.execute(
        "SELECT article_id, title, description, content FROM articles"
    ):
        a = dict(zip(keys, row, strict=True))
        h = stored.get(a["article_id"])
        if h is None:
            missing += 1
        elif h != hashlib.sha1(ig.embedding_text(a).encode()).hexdigest():
            stale += 1
    first, last = conn.execute(
        "SELECT MIN(published), MAX(published) FROM articles"
    ).fetchone()
    conn.close()
    print(
        f"기사 {n_articles:,} · 벡터 {n_vectors:,} · 벡터 없음 {missing} · 입력 글 바뀜 {stale} · {first} ~ {last} → {out}"
    )
    if missing or stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
