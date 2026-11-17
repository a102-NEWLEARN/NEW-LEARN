#!/usr/bin/env python3
"""운영 `article_embedding` → 평가 도구가 읽는 벡터 SQLite (Jira S15P31A102-206).

`clustering_eval.py` 는 `vectors(url, vector blob)` 모양의 SQLite 를 읽는다(`read_vectors`).
적재분(10/21 ~ 11/11)은 AI 팀이 준 파일이 있지만, **켠 뒤 실시간으로 들어온 기사의 벡터는
운영 DB 에만 있다.** 실시간 판정을 같은 자로 재려면 그 벡터를 같은 모양으로 뽑아야 한다.

입력은 psql 한 줄 한 기사다 — `<주소>|[v,v,…]`. 벡터는 pgvector 가 찍는 그대로.

    kubectl -n data exec postgres-0 -- psql -U newlearn -d newlearn -At -F'|' -c \
      "select a.url, e.embedding from article_embedding e join article a on a.id = e.article_id" > rows.txt
    python3 infra/server/eval/vectors_to_sqlite.py --rows rows.txt --out vectors-ops.sqlite

표준 라이브러리만 쓴다.
"""

import argparse
import io
import math
import sqlite3
import struct
import sys

DIMENSION = 1024
# 정규화한 벡터라 길이가 1 이다. float32 로 저장하며 생기는 오차만 봐 준다
NORM_TOLERANCE = 1e-3
FLOAT4_MAX = 3.4028234663852886e38


def parse_vector(url, text):
    body = text.strip()
    if not (body.startswith("[") and body.endswith("]")):
        raise ValueError(f"벡터 모양이 아니다: {url} 는 {body[:24]!r}")
    values = [float(x) for x in body[1:-1].split(",")]
    if len(values) != DIMENSION:
        raise ValueError(f"차원이 다르다: {url} 는 {len(values)}개, {DIMENSION}개여야 한다")
    for v in values:
        if not math.isfinite(v) or abs(v) > FLOAT4_MAX:
            raise ValueError(f"유한한 float4 가 아닌 값: {url}")
    norm = math.sqrt(math.fsum(v * v for v in values))
    if abs(norm - 1.0) > NORM_TOLERANCE:
        raise ValueError(f"길이가 1 이 아니다: {url} 는 {norm:.6f}")
    return values


def read_rows(path):
    out = {}
    with io.open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if "|" not in line:
                raise ValueError(f"줄 모양이 아니다(주소|벡터): {line[:40]!r}")
            url, text = line.split("|", 1)
            if url in out:
                raise ValueError(f"같은 주소가 두 번 나온다: {url}")
            out[url] = parse_vector(url, text)
    return out


def convert(rows_path, out_path):
    rows = read_rows(rows_path)
    db = sqlite3.connect(out_path)
    try:
        db.execute("drop table if exists vectors")
        db.execute("create table vectors (url text primary key, vector blob not null)")
        db.executemany(
            "insert into vectors (url, vector) values (?, ?)",
            ((url, struct.pack(f"<{DIMENSION}f", *values)) for url, values in sorted(rows.items())),
        )
        db.commit()
    finally:
        db.close()
    return {"rows": len(rows)}


def main(argv=None):
    p = argparse.ArgumentParser(description="운영 기사 벡터 → 평가용 SQLite")
    p.add_argument("--rows", required=True, help="psql 로 뽑은 `주소|[v,…]` 줄들")
    p.add_argument("--out", required=True, help="만들 SQLite")
    a = p.parse_args(argv)
    report = convert(a.rows, a.out)
    print(f"기사 {report['rows']}건 → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
