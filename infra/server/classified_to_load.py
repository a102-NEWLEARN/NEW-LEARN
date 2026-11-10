"""AI 기반 분석 SQLite → 적재 묶음 SQL (Jira S15P31A102-152, 계획 docs/plans/2026-11-10-classified-sqlite-load.md)

AI 팀이 올린 이슈 · 사건 분류 SQLite(data/classified_with_articles_*.sqlite, 표는 data/README.md)를 검사하고, 임시 스키마
`load` 를 만들어 COPY 로 채우는 SQL 하나를 쓴다. 이 파일 뒤에 classified-load.sql → category-labels-apply.sql →
classified-load-finish.sql 을 한 트랜잭션으로 이어 운영에 넣는다(infra/server/data-load.md 「AI 결과가 SQLite 로 올 때」).

  python -I infra/server/classified_to_load.py <sqlite> <out.sql> [--known-urls <운영 URL 목록>]

- 칸 목록이 다르거나, meta 의 건수와 다르거나, 시각 · 역할 · JSON · 참조가 이상하면 아무것도 쓰지 않고 종료 1
- 기사는 URL 로 운영과 맞춘다. --known-urls(줄마다 URL)에 있는 기사는 본문 대신 md5 만 싣는다 — 운영에 이미 있어 적재가 md5 로
  견주기만 한다. 목록에 없는 기사는 본문까지 싣는다(운영에 없으면 새 기사로 넣는다). 목록을 안 주면 모두 싣는다
- 분야 원문(top,politics)을 배열로 나누는 규칙은 sqlite_to_b2.py 한 곳의 split_categories 를 그대로 쓴다
- article_embedding 표(article_url · model · vector = float32 1024개 리틀엔디언)는 있으면 싣고 없으면 건너뛴다
- COPY 텍스트 형식 규칙대로 역슬래시 · 탭 · CR · LF 를 바꿔 쓴다. 그래서 데이터 줄이 `\\.` 이 되는 일이 없다
- 출력 파일은 이 스크립트가 직접 쓴다(PowerShell 의 > 는 바이트를 바꾼다). 끝에 줄 수 · sha256 · 건수를 JSON 한 줄로 찍는다
표준 라이브러리만 쓴다
"""

import argparse
import hashlib
import importlib.util
import json
import math
import pathlib
import re
import sqlite3
import struct
import sys
from datetime import datetime

sys.dont_write_bytecode = True  # 옆 파일을 읽어도 저장소 폴더에 __pycache__ 를 남기지 않는다
_B2 = pathlib.Path(__file__).resolve().parent / "sqlite_to_b2.py"
_spec = importlib.util.spec_from_file_location("sqlite_to_b2", _B2)
_sqlite_to_b2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sqlite_to_b2)
split_categories = _sqlite_to_b2.split_categories

# SQLite 표와 칸 — 하나라도 다르면 멈춘다(AI 팀 파일 모양이 바뀐 것)
COLUMNS = {
    "meta": ["key", "value"],
    "issue": ["id", "title", "summary", "created_at", "updated_at", "source_issue_key", "prompt_version"],
    "issue_category": ["issue_id", "category_code"],
    "event": [
        "id", "title", "label", "summary", "role", "reacts_to", "reacts_to_event_id", "issue_id", "occurred_at",
        "occurred_at_basis", "created_at", "updated_at", "creator_url", "reason", "prompt_version",
    ],
    "article_event": ["article_url", "event_id", "linked_at", "title", "publisher_code", "published_at", "category_code"],
    "article_extract": [
        "article_url", "content", "summary", "primary_core_index", "occurred_at", "schema_version", "model",
        "prompt_version", "generated_at",
    ],
    "article_body": ["article_url", "newsdata_article_id", "description", "content", "source_name", "newsdata_category"],
}
EMBEDDING_COLUMNS = ["article_url", "model", "vector"]
EMBEDDING_MODEL = "dragonkue/BGE-m3-ko"  # data-load.md 3절 「article_embedding」 — 운영 EMBED 워커가 W1 로 보내는 값
DIMENSION = 1024

ROLES = {"MAIN", "REACTION"}
BRANCH_TYPES = {"CORE", "CAUSE", "REACTION", "OUTLOOK"}  # 마인드맵 가지 넷(docs/api-screen.md 3절, W1 ExtractResult 와 같은 종류)
COUNTED = ("issue", "issue_category", "event", "article_event", "article_extract", "article_body")  # meta counts 에 꼭 있어야 하는 표
BASES = {"EXTRACTED", "FIRST_PUBLISHED"}
CATEGORIES = {"politics", "economy", "society", "world", "it_science"}
ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}")

# load 스키마 표 — 칸 순서가 COPY 순서다. 운영 표와 칸 이름이 같은 것만 classified-load.sql 이 옮긴다
LOAD_TABLES = {
    "meta": "key text primary key, value text not null",
    "issue": "id bigint primary key, title text not null, summary text, created_at timestamptz not null, updated_at timestamptz not null",
    "event": (
        "id bigint primary key, issue_id bigint, title text not null, label text not null, summary text, "
        "occurred_at timestamptz not null, occurred_at_basis text not null, created_at timestamptz not null, "
        "updated_at timestamptz not null, role text not null, reacts_to text, reacts_to_event_id bigint"
    ),
    "article_src": (
        "url text primary key, publisher_code text not null, source_name text not null, title text not null, body text, "
        "body_md5 text not null, published_at timestamptz not null, category_code text, source_categories text[] not null"
    ),
    "article_event": "url text primary key, event_id bigint not null, linked_at timestamptz not null",
    "article_mindmap": (
        "url text primary key, summary text, content jsonb not null, occurred_at timestamptz, schema_version text not null, "
        "model text not null, prompt_version text not null, generated_at timestamptz not null, primary_core_index int"
    ),
    "article_embedding": f"url text primary key, model text not null, embedding public.vector({DIMENSION}) not null",
}


# begin; 없이 돌리면(문장마다 커밋) 첫 문장에서 멈춘다 — 트랜잭션 안이면 BEGIN 시각이 이 문장 시각보다 앞선다
TRANSACTION_GUARD = (
    "do $$ begin if transaction_timestamp() = statement_timestamp() then "
    "raise exception '트랜잭션 밖이다 — begin; 으로 감싸 돌린다(data-load.md 9절)'; end if; end $$;"
)


class ConvertError(Exception):
    """검사에 걸렸다 — 까닭 목록을 들고 있다."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = problems


def copy_escape(value):
    """COPY 텍스트 형식 한 칸. None 은 \\N, 역슬래시 · 탭 · CR · LF 는 두 글자로"""
    if value is None:
        return "\\N"
    text = str(value)
    return text.replace("\\", "\\\\").replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n")


def pg_text_array(values):
    """['top', 'politics'] → {"top","politics"} — 배열 글자 규칙대로 따옴표 안 역슬래시 · 큰따옴표를 바꾼다"""
    return "{" + ",".join('"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"' for v in values) + "}"


def is_iso(value):
    if not isinstance(value, str) or not ISO_RE.fullmatch(value):
        return False
    try:
        datetime.fromisoformat(value)
    except ValueError:
        return False
    return True


def table_columns(conn, table):
    return [row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')]


def check_shape(conn, problems):
    for table, cols in COLUMNS.items():
        found = table_columns(conn, table)
        if found != cols:
            problems.append(f"{table} 칸이 다르다: {found}")
    found = table_columns(conn, "article_embedding")
    if found and found != EMBEDDING_COLUMNS:
        problems.append(f"article_embedding 칸이 다르다: {found}")
    return bool(found) and found == EMBEDDING_COLUMNS


def rows(conn, sql):
    cur = conn.execute(sql)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r, strict=True)) for r in cur.fetchall()]


def check_text(problems, where, value, *, empty_ok=False):
    if not isinstance(value, str) or (not empty_ok and not value.strip()):
        problems.append(f"{where}: 글자가 아니거나 비었다")


def check_mindmap(problems, where, content, pci):
    try:
        doc = json.loads(content)
    except (TypeError, ValueError):
        problems.append(f"{where}: 마인드맵이 JSON 이 아니다")
        return
    branches = doc.get("branches") if isinstance(doc, dict) else None
    if not isinstance(branches, list) or not branches:
        problems.append(f"{where}: 마인드맵에 가지(branches)가 없다")
        return
    seen = set()
    for b in branches:
        if not isinstance(b, dict) or b.get("type") not in BRANCH_TYPES or not isinstance(b.get("items"), list):
            problems.append(f"{where}: 가지 모양 · 종류가 다르다")
            return
        if b["type"] in seen:
            problems.append(f"{where}: 가지 {b['type']} 가 두 번 있다")
            return
        seen.add(b["type"])
        if any(not isinstance(i, dict) or not isinstance(i.get("text"), str) or not i["text"].strip() for i in b["items"]):
            problems.append(f"{where}: 빈 잎이 있다")
            return
    if pci is not None:
        core = next((b["items"] for b in branches if b["type"] == "CORE"), [])
        if not isinstance(pci, int) or pci < 0 or pci >= len(core):
            problems.append(f"{where}: primary_core_index {pci!r} 가 CORE 잎({len(core)}개) 범위 밖이다")


def read_vector(problems, where, blob):
    if not isinstance(blob, bytes) or len(blob) != DIMENSION * 4:
        problems.append(f"{where}: 벡터가 float32 {DIMENSION}개가 아니다")
        return None
    values = struct.unpack(f"<{DIMENSION}f", blob)
    if not all(math.isfinite(x) for x in values):
        problems.append(f"{where}: 벡터에 NaN · 무한대가 있다")
        return None
    norm = math.sqrt(math.fsum(x * x for x in values))
    if abs(norm - 1.0) > 1e-3:
        problems.append(f"{where}: 벡터가 정규화되지 않았다(길이 {norm:.4f})")
        return None
    return values


def read_classified(path, known_urls=None):
    """SQLite 를 읽고 검사해 load 표마다 (칸, 행) 을 돌려준다. 검사에 걸리면 ConvertError"""
    conn = sqlite3.connect(f"file:{pathlib.Path(path).as_posix()}?mode=ro", uri=True)
    try:
        problems = []
        has_embedding = check_shape(conn, problems)
        if problems:
            raise ConvertError(problems)

        meta = {r["key"]: r["value"] for r in rows(conn, "SELECT key, value FROM meta")}
        try:
            counts = json.loads(meta.get("counts", ""))
        except ValueError:
            counts = None
        if not isinstance(counts, dict):
            problems.append("meta 에 counts 가 없다")
            counts = {}
        for table in COUNTED:
            if table not in counts:
                problems.append(f"meta counts 에 {table} 가 없다")
        for table, expected in counts.items():
            if table not in COLUMNS and table != "article_embedding":
                continue
            actual = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            if actual != expected:
                problems.append(f"{table} 건수 {actual} ≠ meta {expected}")

        for table in (*COLUMNS, *(["article_embedding"] if has_embedding else [])):
            text_cols = [c for c in table_columns(conn, table) if c != "vector"]
            found = conn.execute(
                f'SELECT COUNT(*) FROM "{table}" WHERE ' + " OR ".join(f'instr(CAST("{c}" AS TEXT), char(0)) > 0' for c in text_cols)
            ).fetchone()[0]
            if found:
                problems.append(f"{table}: NUL 글자가 든 행 {found}개(PostgreSQL text 에 못 넣는다)")

        issues = rows(conn, "SELECT * FROM issue ORDER BY id")
        events = rows(conn, "SELECT * FROM event ORDER BY id")
        links = rows(conn, "SELECT * FROM article_event ORDER BY article_url")
        extracts = rows(conn, "SELECT * FROM article_extract ORDER BY article_url")
        bodies = {r["article_url"]: r for r in rows(conn, "SELECT * FROM article_body")}
        embeddings = rows(conn, "SELECT * FROM article_embedding ORDER BY article_url") if has_embedding else []

        issue_ids = set()
        for r in issues:
            where = f"issue {r['id']}"
            if not isinstance(r["id"], int):
                problems.append(f"{where}: 번호가 정수가 아니다")
            issue_ids.add(r["id"])
            check_text(problems, where + " title", r["title"])
            for col in ("created_at", "updated_at"):
                if not is_iso(r[col]):
                    problems.append(f"{where}: {col} 가 시간대 있는 ISO 가 아니다")

        event_ids = {r["id"] for r in events}
        for r in events:
            where = f"event {r['id']}"
            if not isinstance(r["id"], int):
                problems.append(f"{where}: 번호가 정수가 아니다")
            check_text(problems, where + " title", r["title"])
            check_text(problems, where + " label", r["label"])
            if r["role"] not in ROLES:
                problems.append(f"{where}: role {r['role']!r}")
            if r["occurred_at_basis"] not in BASES:
                problems.append(f"{where}: occurred_at_basis {r['occurred_at_basis']!r}")
            if r["issue_id"] is not None and r["issue_id"] not in issue_ids:
                problems.append(f"{where}: 없는 이슈 {r['issue_id']}")
            if r["reacts_to_event_id"] is not None and r["reacts_to_event_id"] not in event_ids:
                problems.append(f"{where}: 없는 반응 대상 {r['reacts_to_event_id']}")
            for col in ("occurred_at", "created_at", "updated_at"):
                if not is_iso(r[col]):
                    problems.append(f"{where}: {col} 가 시간대 있는 ISO 가 아니다")

        linked = set()
        events_with_article = set()
        for r in links:
            u = r["article_url"]
            where = f"article_event {u}"
            if not isinstance(u, str) or not u.startswith(("http://", "https://")) or re.search(r"\s", u):
                problems.append(f"{where}: URL 모양이 다르다")
            linked.add(u)
            if r["event_id"] not in event_ids:
                problems.append(f"{where}: 없는 사건 {r['event_id']}")
            events_with_article.add(r["event_id"])
            check_text(problems, where + " title", r["title"])
            check_text(problems, where + " publisher_code", r["publisher_code"])
            if r["category_code"] is not None and r["category_code"] not in CATEGORIES:
                problems.append(f"{where}: 모르는 분야 {r['category_code']!r}")
            for col in ("linked_at", "published_at"):
                if not is_iso(r[col]):
                    problems.append(f"{where}: {col} 가 시간대 있는 ISO 가 아니다")
        for eid in sorted(event_ids - events_with_article):
            problems.append(f"event {eid}: 묶인 기사가 없다")

        for r in extracts:
            where = f"article_extract {r['article_url']}"
            if r["article_url"] not in linked:
                problems.append(f"{where}: 사건에 묶이지 않은 기사")
            check_mindmap(problems, where, r["content"], r["primary_core_index"])
            for col in ("schema_version", "model", "prompt_version"):
                check_text(problems, f"{where} {col}", r[col])
            if not is_iso(r["generated_at"]) or (r["occurred_at"] is not None and not is_iso(r["occurred_at"])):
                problems.append(f"{where}: 시각이 시간대 있는 ISO 가 아니다")

        if set(bodies) != linked:
            problems.append(f"article_body 기사가 article_event 와 다르다(빠짐 {len(linked - set(bodies))} · 남음 {len(set(bodies) - linked)})")
        for u, r in bodies.items():
            check_text(problems, f"article_body {u} content", r["content"], empty_ok=True)
            check_text(problems, f"article_body {u} source_name", r["source_name"])

        vectors = {}
        for r in embeddings:
            where = f"article_embedding {r['article_url']}"
            if r["model"] != EMBEDDING_MODEL:
                problems.append(f"{where}: model {r['model']!r} ≠ {EMBEDDING_MODEL}")
            if r["article_url"] not in linked:
                problems.append(f"{where}: 사건에 묶이지 않은 기사")
            values = read_vector(problems, where, r["vector"])
            if values is not None:
                vectors[r["article_url"]] = values
        if has_embedding and set(r["article_url"] for r in embeddings) != linked:
            problems.append("article_embedding 이 사건 기사 전부에 있지 않다")

        if problems:
            raise ConvertError(problems)

        known = known_urls or set()
        out = {
            "issue": (["id", "title", "summary", "created_at", "updated_at"], [[r[c] for c in ("id", "title", "summary", "created_at", "updated_at")] for r in issues]),
            "event": (
                ["id", "issue_id", "title", "label", "summary", "occurred_at", "occurred_at_basis", "created_at", "updated_at", "role", "reacts_to", "reacts_to_event_id"],
                [[r[c] for c in ("id", "issue_id", "title", "label", "summary", "occurred_at", "occurred_at_basis", "created_at", "updated_at", "role", "reacts_to", "reacts_to_event_id")] for r in events],
            ),
            "article_src": (
                ["url", "publisher_code", "source_name", "title", "body", "body_md5", "published_at", "category_code", "source_categories"],
                [
                    [
                        r["article_url"], r["publisher_code"], bodies[r["article_url"]]["source_name"], r["title"],
                        None if r["article_url"] in known else bodies[r["article_url"]]["content"],
                        hashlib.md5(bodies[r["article_url"]]["content"].encode("utf-8")).hexdigest(),
                        r["published_at"], r["category_code"],
                        pg_text_array(split_categories(bodies[r["article_url"]]["newsdata_category"])),
                    ]
                    for r in links
                ],
            ),
            "article_event": (["url", "event_id", "linked_at"], [[r["article_url"], r["event_id"], r["linked_at"]] for r in links]),
            "article_mindmap": (
                ["url", "summary", "content", "occurred_at", "schema_version", "model", "prompt_version", "generated_at", "primary_core_index"],
                [[r["article_url"], r["summary"], r["content"], r["occurred_at"], r["schema_version"], r["model"], r["prompt_version"], r["generated_at"], r["primary_core_index"]] for r in extracts],
            ),
        }
        if has_embedding:
            out["article_embedding"] = (
                ["url", "model", "embedding"],
                [[u, EMBEDDING_MODEL, "[" + ",".join(format(x, ".9g") for x in v) + "]"] for u, v in sorted(vectors.items())],
            )
        body_included = sum(1 for row in out["article_src"][1] if row[4] is not None)
        summary = {
            "issue": len(issues),
            "event": len(events),
            "article_event": len(links),
            "article_mindmap": len(extracts),
            "article_src": len(links),
            "article_embedding": len(embeddings),
            "body_included": body_included,
        }
        return out, summary, meta
    finally:
        conn.close()


def render_sql(out, summary, source_sha256):
    lines = [
        "-- classified_to_load.py 가 만든 적재 묶음 — 사람이 고치지 않는다 (Jira S15P31A102-152, infra/server/data-load.md)",
        f"-- 원본 sha256 {source_sha256}",
        TRANSACTION_GUARD,
        "create schema load;",
    ]
    tables = ["meta", *out]
    for table in tables:
        lines.append(f"create table load.{table} ({LOAD_TABLES[table]});")
    meta_rows = [[k, str(v)] for k, v in summary.items()] + [["source_sha256", source_sha256]]
    blocks = {"meta": (["key", "value"], meta_rows), **out}
    for table in tables:
        cols, data = blocks[table]
        lines.append(f"copy load.{table} ({', '.join(cols)}) from stdin;")
        for row in data:
            lines.append("\t".join(copy_escape(v) for v in row))
        lines.append("\\.")
    return "\n".join(lines) + "\n"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description="AI 기반 분석 SQLite → 적재 묶음 SQL")
    parser.add_argument("sqlite")
    parser.add_argument("out")
    parser.add_argument("--known-urls", help="운영에 이미 있는 URL 목록(줄마다 하나) — 이 기사는 본문 대신 md5 만")
    args = parser.parse_args(argv)

    known = None
    if args.known_urls:
        known = {line.strip() for line in pathlib.Path(args.known_urls).read_text(encoding="utf-8").splitlines() if line.strip()}
    try:
        out, summary, _ = read_classified(args.sqlite, known)
    except ConvertError as e:
        for p in e.problems[:50]:
            print(f"ERROR: {p}", file=sys.stderr)
        if len(e.problems) > 50:
            print(f"ERROR: … 모두 {len(e.problems)}건", file=sys.stderr)
        return 1

    text = render_sql(out, summary, sha256_file(args.sqlite))
    target = pathlib.Path(args.out)
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.write_bytes(text.encode("utf-8"))
    tmp.replace(target)
    print(json.dumps({"file": str(target), "lines": text.count("\n"), "sha256": sha256_file(target), "counts": summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
