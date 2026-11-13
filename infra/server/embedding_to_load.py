#!/usr/bin/env python3
"""AI 팀에게 받은 기사 벡터 SQLite → `article_embedding` 적재용 COPY 파일 (Jira S15P31A102-207).

운영 `article_embedding` 은 비어 있다. 11-12 적재 때 쓴 SQLite 에 벡터 표가 없었기 때문이다
(`infra/server/data-load.md` 9절). 벡터는 판정(MATCH_EVENT)의 후보 사건을 고를 때 쓴다
(`CandidateEventFinder.nearest`) — 없으면 새 기사가 사건 후보를 하나도 못 받는다.

기사를 **URL 로** 맞춘다. 사건에 묶인 기사(`article_event`)와 벡터가 1:1 로 맞지 않으면 멈춘다 —
한쪽만 있으면 그 기사는 후보에서 빠지거나 엉뚱한 기사에 벡터가 붙는다.

쓰는 법(관리자 PC)
    # 1) 운영에서 사건에 묶인 기사 번호 · 주소를 읽는다(읽기만)
    kubectl -n data exec postgres-0 -- psql -U newlearn -d newlearn -Atc \
      "select ae.article_id, a.url from article_event ae join article a on a.id = ae.article_id" > urls.tsv
    # 2) COPY 파일을 만든다
    python3 infra/server/embedding_to_load.py --sqlite vectors_linked_1021_1111.sqlite \
      --urls urls.tsv --out embeddings-207.tsv
    # 3) 넣기는 `infra/server/embedding-load.sql`

표준 라이브러리만 쓴다.
"""

import argparse
import io
import math
import sqlite3
import struct
import sys

# 운영 EMBED 워커가 W1 으로 보내는 이름과 같아야 한다(`ai/app/embed/run.py` MODEL_NAME, data-load.md 3절)
MODEL_NAME = "dragonkue/BGE-m3-ko"
DIMENSION = 1024
# 정규화한 벡터라 길이가 1 이다. float32 로 저장하며 생기는 오차만 봐 준다
NORM_TOLERANCE = 1e-3
# float4(article_embedding.embedding) 가 받는 가장 큰 수
FLOAT4_MAX = 3.4028234663852886e38


def read_meta_model(db):
    row = db.execute("select value from meta where key = 'model'").fetchone()
    return row[0] if row else None


def unpack(url, raw):
    if len(raw) != DIMENSION * 4:
        raise ValueError(f"차원이 다르다: {url} 는 float32 {len(raw) / 4:.0f}개, {DIMENSION}개여야 한다")
    values = list(struct.unpack(f"<{DIMENSION}f", raw))
    for v in values:
        if not math.isfinite(v) or abs(v) > FLOAT4_MAX:
            raise ValueError(f"유한한 float4 가 아닌 값: {url}")
    norm = math.sqrt(math.fsum(v * v for v in values))
    if abs(norm - 1.0) > NORM_TOLERANCE:
        raise ValueError(f"길이가 1 이 아니다: {url} 는 {norm:.6f}")
    return values


def read_vectors(path):
    db = sqlite3.connect(path)
    try:
        model = read_meta_model(db)
        if model != MODEL_NAME:
            raise ValueError(f"모델 이름이 다르다: meta.model 이 {model!r}, {MODEL_NAME!r} 여야 한다")
        out = {}
        rows = db.execute(
            "select url, vector, same_input_as_ops, title_changed_by_b2 from vectors order by url"
        )
        for url, raw, same, changed in rows:
            if url in out:
                raise ValueError(f"같은 주소가 두 번 나온다: {url}")
            out[url] = {
                "vector": unpack(url, raw),
                "same_input_as_ops": int(same or 0),
                "title_changed_by_b2": int(changed or 0),
            }
        return out
    finally:
        db.close()


def read_urls(path):
    out = {}
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            article_id, url = line.split("|", 1)
            if url in out:
                raise ValueError(f"운영 목록에 같은 주소가 두 번 나온다: {url}")
            out[url] = int(article_id)
    return out


def check_pairs(vectors, urls):
    missing = sorted(set(vectors) - set(urls))
    if missing:
        raise ValueError(f"운영에 없는 주소 {len(missing)}건 — 예: {missing[0]}")
    extra = sorted(set(urls) - set(vectors))
    if extra:
        raise ValueError(f"벡터가 없는 운영 기사 {len(extra)}건 — 예: {extra[0]}")


def vector_literal(values):
    # float32 는 열 자리 미만(유효숫자 9)이면 그대로 되돌아온다 — 칸이 float4 라 다시 읽어도 같은 값이다.
    # repr(v) 는 float32 를 double 로 올린 값의 자릿수(20자)를 내서 파일이 1.7배 커진다
    return "[" + ",".join(f"{v:.9g}" for v in values) + "]"


def build(sqlite_path, urls_path, out_path):
    vectors = read_vectors(sqlite_path)
    urls = read_urls(urls_path)
    check_pairs(vectors, urls)

    rows = sorted((urls[url], url) for url in vectors)
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as f:
        for article_id, url in rows:
            f.write(f"{article_id}\t{MODEL_NAME}\t{vector_literal(vectors[url]['vector'])}\n")

    return {
        "rows": len(rows),
        "same_input_as_ops": sum(1 for v in vectors.values() if v["same_input_as_ops"] == 1),
        "title_changed_by_b2": sum(1 for v in vectors.values() if v["title_changed_by_b2"] == 1),
        "first_article_id": rows[0][0] if rows else None,
        "last_article_id": rows[-1][0] if rows else None,
    }


def changed_ids(sqlite_path, urls_path):
    """제목이 B2 에서 바뀌어 운영 입력과 글이 다른 기사 번호 — 받은 그대로 넣고 목록만 남긴다."""
    vectors = read_vectors(sqlite_path)
    urls = read_urls(urls_path)
    check_pairs(vectors, urls)
    return sorted(urls[url] for url, v in vectors.items() if v["title_changed_by_b2"] == 1)


def main(argv=None):
    p = argparse.ArgumentParser(description="기사 벡터 SQLite → article_embedding COPY 파일")
    p.add_argument("--sqlite", required=True, help="AI 팀 벡터 파일")
    p.add_argument("--urls", required=True, help="운영에서 읽은 `기사번호|주소` 줄들")
    p.add_argument("--out", required=True, help="만들 COPY 파일")
    p.add_argument("--changed-out", help="제목이 바뀐 기사 번호를 적을 파일(한 줄에 하나)")
    a = p.parse_args(argv)

    report = build(a.sqlite, a.urls, a.out)
    if a.changed_out:
        ids = changed_ids(a.sqlite, a.urls)
        with io.open(a.changed_out, "w", encoding="utf-8", newline="\n") as f:
            for article_id in ids:
                f.write(f"{article_id}\n")

    print(f"줄 {report['rows']}개 → {a.out}")
    print(f"  운영 입력과 글자까지 같은 것 {report['same_input_as_ops']}건")
    print(f"  B2 가 제목을 바꾼 것 {report['title_changed_by_b2']}건 (받은 그대로 넣는다 — data-load.md 10절)")
    print(f"  기사 번호 {report['first_article_id']} ~ {report['last_article_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
