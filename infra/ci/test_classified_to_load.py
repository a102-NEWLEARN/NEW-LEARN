"""classified_to_load.py 시험 — AI 기반 분석 SQLite 를 적재 묶음 SQL 로 (Jira S15P31A102-152)

시험마다 data/README.md 「이슈 · 사건 분류」 · 「기사 본문을 붙인 파일」의 표 모양만 따른 작은 SQLite 를 만든다.
기사 · 사건 값은 지어낸 것이다. 글 칸에는 COPY 텍스트 형식에서 뜻이 달라지는 글자(역슬래시 · 탭 · CR · LF · `\\.` 한 줄)를 넣는다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import hashlib
import importlib.util
import io
import json
import math
import pathlib
import sqlite3
import struct
import tempfile
import unittest
from contextlib import redirect_stdout

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "classified_to_load.py"
_spec = importlib.util.spec_from_file_location("classified_to_load", SCRIPT)
classified_to_load = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(classified_to_load)

TRICKY = "역슬래시 \\ 탭\t끝\r\n둘째 줄\n\\.\n\\N 「따옴표」 \"큰\""

SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE issue(id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, source_issue_key TEXT NOT NULL, prompt_version TEXT);
CREATE TABLE issue_category(issue_id INTEGER NOT NULL, category_code TEXT NOT NULL, PRIMARY KEY(issue_id, category_code));
CREATE TABLE event(id INTEGER PRIMARY KEY, title TEXT NOT NULL, label TEXT NOT NULL, summary TEXT,
  role TEXT NOT NULL, reacts_to TEXT, reacts_to_event_id INTEGER, issue_id INTEGER, occurred_at TEXT NOT NULL,
  occurred_at_basis TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, creator_url TEXT NOT NULL,
  reason TEXT, prompt_version TEXT NOT NULL);
CREATE TABLE article_event(article_url TEXT PRIMARY KEY, event_id INTEGER NOT NULL, linked_at TEXT NOT NULL,
  title TEXT NOT NULL, publisher_code TEXT NOT NULL, published_at TEXT NOT NULL, category_code TEXT);
CREATE TABLE article_extract(article_url TEXT PRIMARY KEY, content TEXT NOT NULL, summary TEXT, primary_core_index INTEGER,
  occurred_at TEXT, schema_version TEXT NOT NULL, model TEXT NOT NULL, prompt_version TEXT NOT NULL, generated_at TEXT NOT NULL);
CREATE TABLE article_body(article_url TEXT PRIMARY KEY, newsdata_article_id TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
  content TEXT NOT NULL, source_name TEXT NOT NULL, newsdata_category TEXT NOT NULL);
"""

EMBEDDING_SCHEMA = "CREATE TABLE article_embedding(article_url TEXT PRIMARY KEY, model TEXT NOT NULL, vector BLOB NOT NULL);"

MINDMAP = json.dumps(
    {
        "title": None,
        "branches": [
            {"type": "CORE", "items": [{"text": "핵심 \\ \"따옴표\"", "evidence": [{"text": "근거", "paragraphIndex": 0, "sentenceIndex": 0}]}]},
            {"type": "OUTLOOK", "items": [{"text": "전망", "evidence": []}]},
        ],
    },
    ensure_ascii=False,
)


def url(n):
    return f"https://news.example.com/a/{n}"


def unit_vector(seed):
    raw = [math.sin(seed + i) for i in range(1024)]
    norm = math.sqrt(sum(x * x for x in raw))
    return struct.pack("<1024f", *[x / norm for x in raw])


class Fixture(unittest.TestCase):
    """이슈 1 · 사건 2(1001 MAIN, 1002 REACTION → 1001) · 이슈 밖 사건 1003 · 기사 4건 · 마인드맵 2건"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        self.db = self.dir / "classified.sqlite"
        self.out = self.dir / "load.sql"
        conn = sqlite3.connect(self.db)
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO issue VALUES (1, ?, ?, '2026-10-21T21:34:13+09:00', '2026-10-22T11:34:21+09:00', 'I0036', 'issue-summary-v4')",
            ("이슈 " + TRICKY, "요약 " + TRICKY),
        )
        conn.execute("INSERT INTO issue_category VALUES (1, 'politics')")
        events = [
            (1001, "MAIN", None, None, 1, "EXTRACTED"),
            (1002, "REACTION", "1001 에 반발", 1001, 1, "FIRST_PUBLISHED"),
            (1003, "MAIN", None, None, None, "EXTRACTED"),
        ]
        for eid, role, reacts_to, target, issue, basis in events:
            conn.execute(
                "INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-21T00:00:00+09:00', ?, "
                "'2026-10-21T18:54:00+09:00', '2026-10-22T09:00:00+09:00', ?, '까닭', 'match-event-emul-v2')",
                (eid, f"사건 {eid} " + TRICKY, f"키워드{eid}", "요약\t" + TRICKY, role, reacts_to, target, issue, basis, url(eid % 1000)),
            )
        links = [(1, 1001), (2, 1001), (3, 1002), (4, 1003)]
        for n, eid in links:
            conn.execute(
                "INSERT INTO article_event VALUES (?, ?, '2026-10-21T18:54:00+09:00', ?, 'garam_kr', '2026-10-21T18:50:00+09:00', 'politics')",
                (url(n), eid, f"제목 {n} " + TRICKY),
            )
            conn.execute(
                "INSERT INTO article_body VALUES (?, ?, '설명', ?, '가람일보', 'top, ,politics,top')",
                (url(n), f"nd{n:04d}", f"본문 {n} " + TRICKY),
            )
        for n in (1, 4):
            conn.execute(
                "INSERT INTO article_extract VALUES (?, ?, '한 줄 요약', 0, '2026-10-21T00:00:00+09:00', 'mindmap-v1', "
                "'gpt-6-luna', 'extract-v4.14-mindmap', '2026-11-09T13:26:19+09:00')",
                (url(n), MINDMAP),
            )
        self.set_meta(conn)
        conn.commit()
        conn.close()

    def tearDown(self):
        self.tmp.cleanup()

    def set_meta(self, conn):
        counts = {
            t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("issue", "issue_category", "event", "article_event", "article_extract", "article_body")
        }
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('counts', ?)", (json.dumps(counts),))

    def sql(self, statement, *args, meta=True):
        conn = sqlite3.connect(self.db)
        try:
            conn.executescript(statement) if not args else conn.execute(statement, args)
            if meta:
                self.set_meta(conn)
            conn.commit()
        finally:
            conn.close()

    def run_main(self, *extra):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = classified_to_load.main([str(self.db), str(self.out), *extra])
        return code, buf.getvalue()

    def assert_refused(self, *extra):
        code, _ = self.run_main(*extra)
        self.assertEqual(code, 1)
        self.assertFalse(self.out.exists(), "검사에 걸리면 출력 파일을 쓰지 않는다")


def parse_copy_blocks(text):
    """묶음 SQL 의 COPY 블록을 표 → (칸, 행 목록) 으로 되읽는다. 텍스트 형식 글자 바꾸기를 거꾸로"""
    blocks = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("copy load."):
            table = line.split()[1]
            cols = [c.strip() for c in line[line.index("(") + 1 : line.index(")")].split(",")]
            rows = []
            i += 1
            while lines[i] != "\\.":
                rows.append([unescape(f) for f in lines[i].split("\t")])
                i += 1
            blocks[table] = (cols, rows)
        i += 1
    return blocks


def unescape(field):
    if field == "\\N":
        return None
    out = []
    it = iter(field)
    for ch in it:
        if ch == "\\":
            nxt = next(it)
            out.append({"\\": "\\", "t": "\t", "n": "\n", "r": "\r"}[nxt])
        else:
            out.append(ch)
    return "".join(out)


class HappyPathTest(Fixture):
    def test_writes_copy_blocks_that_round_trip(self):
        code, printed = self.run_main()
        self.assertEqual(code, 0)
        text = self.out.read_text(encoding="utf-8")
        blocks = parse_copy_blocks(text)
        self.assertEqual(
            set(blocks),
            {"load.meta", "load.issue", "load.event", "load.article_src", "load.article_event", "load.article_mindmap"},
        )
        cols, rows = blocks["load.event"]
        by_id = {int(r[cols.index("id")]): r for r in rows}
        self.assertEqual(by_id[1001][cols.index("title")], "사건 1001 " + TRICKY)
        self.assertEqual(by_id[1002][cols.index("reacts_to_event_id")], "1001")
        self.assertIsNone(by_id[1003][cols.index("issue_id")])
        self.assertNotIn("creator_url", cols, "SQLite 에만 있는 칸은 버린다")

        cols, rows = blocks["load.article_src"]
        src = {r[cols.index("url")]: r for r in rows}
        body = src[url(3)][cols.index("body")]
        self.assertEqual(body, "본문 3 " + TRICKY)
        self.assertEqual(src[url(3)][cols.index("body_md5")], hashlib.md5(body.encode()).hexdigest())
        self.assertEqual(src[url(3)][cols.index("source_categories")], '{"top","politics"}')
        self.assertEqual(src[url(3)][cols.index("published_at")], "2026-10-21T18:50:00+09:00")

        cols, rows = blocks["load.article_mindmap"]
        self.assertEqual(json.loads(rows[0][cols.index("content")]), json.loads(MINDMAP))

        summary = json.loads(printed.strip().splitlines()[-1])
        self.assertEqual(summary["counts"]["issue"], 1)
        self.assertEqual(summary["counts"]["event"], 3)
        self.assertEqual(summary["counts"]["article_event"], 4)
        self.assertEqual(summary["counts"]["article_mindmap"], 2)
        self.assertEqual(summary["counts"]["article_embedding"], 0)
        self.assertEqual(summary["sha256"], hashlib.sha256(self.out.read_bytes()).hexdigest())

    def test_bundle_starts_by_refusing_to_run_outside_a_transaction(self):
        self.run_main()
        text = self.out.read_text(encoding="utf-8")
        self.assertIn("transaction_timestamp() = statement_timestamp()", text)
        first = text.index("transaction_timestamp() = statement_timestamp()")
        self.assertLess(first, text.index("create schema load;"), "begin; 없이 돌리면 load 스키마를 만들기 전에 멈춘다")

    def test_no_data_line_can_end_copy_early(self):
        self.run_main()
        text = self.out.read_text(encoding="utf-8")
        terminators = sum(1 for line in text.split("\n") if line == "\\.")
        self.assertEqual(terminators, text.count("\ncopy load."), "\\. 줄은 COPY 끝마다 하나씩뿐이다")
        self.assertNotIn("\r", text)

    def test_known_urls_ship_only_body_md5(self):
        known = self.dir / "known.txt"
        known.write_text(f"{url(1)}\n{url(2)}\n", encoding="utf-8")
        code, printed = self.run_main("--known-urls", str(known))
        self.assertEqual(code, 0)
        cols, rows = parse_copy_blocks(self.out.read_text(encoding="utf-8"))["load.article_src"]
        src = {r[cols.index("url")]: r for r in rows}
        self.assertIsNone(src[url(1)][cols.index("body")])
        self.assertEqual(src[url(1)][cols.index("body_md5")], hashlib.md5(("본문 1 " + TRICKY).encode()).hexdigest())
        self.assertEqual(src[url(3)][cols.index("body")], "본문 3 " + TRICKY)
        self.assertEqual(json.loads(printed.strip().splitlines()[-1])["counts"]["body_included"], 2)


class RefuseTest(Fixture):
    def test_extra_column(self):
        self.sql("ALTER TABLE event ADD COLUMN surprise TEXT")
        self.assert_refused()

    def test_missing_table(self):
        self.sql("DROP TABLE article_body", meta=False)
        self.assert_refused()

    def test_meta_count_mismatch(self):
        self.sql("UPDATE meta SET value = ? WHERE key = 'counts'", json.dumps({"issue": 99}), meta=False)
        self.assert_refused()

    def test_meta_counts_missing_a_table(self):
        self.sql("UPDATE meta SET value = ? WHERE key = 'counts'", json.dumps({"issue": 1}), meta=False)
        self.assert_refused()

    def test_nul_in_text(self):
        self.sql("UPDATE event SET summary = ? WHERE id = 1003", "앞\x00뒤")
        self.assert_refused()

    def test_unknown_branch_type(self):
        doc = json.loads(MINDMAP)
        doc["branches"][1]["type"] = "SIDE"
        self.sql("UPDATE article_extract SET content = ? WHERE article_url = ?", json.dumps(doc), url(1))
        self.assert_refused()

    def test_core_index_past_core_items(self):
        self.sql("UPDATE article_extract SET primary_core_index = 1 WHERE article_url = ?", url(1))
        self.assert_refused()

    def test_bad_role(self):
        self.sql("UPDATE event SET role = 'SIDE' WHERE id = 1003")
        self.assert_refused()

    def test_bad_basis(self):
        self.sql("UPDATE event SET occurred_at_basis = 'GUESS' WHERE id = 1003")
        self.assert_refused()

    def test_time_without_offset(self):
        self.sql("UPDATE article_event SET linked_at = '2026-10-21 18:54:00' WHERE article_url = ?", url(2))
        self.assert_refused()

    def test_event_points_outside_issue(self):
        self.sql("UPDATE event SET issue_id = 7 WHERE id = 1003")
        self.assert_refused()

    def test_reaction_target_missing(self):
        self.sql("UPDATE event SET reacts_to_event_id = 999 WHERE id = 1002")
        self.assert_refused()

    def test_link_to_missing_event(self):
        self.sql("UPDATE article_event SET event_id = 999 WHERE article_url = ?", url(4))
        self.assert_refused()

    def test_event_without_article(self):
        self.sql(
            "INSERT INTO event VALUES (1004, '사건', '키', NULL, 'MAIN', NULL, NULL, NULL, '2026-10-21T00:00:00+09:00', "
            "'EXTRACTED', '2026-10-21T18:54:00+09:00', '2026-10-21T18:54:00+09:00', 'x', NULL, 'v')"
        )
        self.assert_refused()

    def test_mindmap_for_unlinked_article(self):
        self.sql("UPDATE article_extract SET article_url = 'https://news.example.com/a/9' WHERE article_url = ?", url(4))
        self.assert_refused()

    def test_mindmap_not_json(self):
        self.sql("UPDATE article_extract SET content = '{not json' WHERE article_url = ?", url(1))
        self.assert_refused()

    def test_mindmap_without_branches(self):
        self.sql("UPDATE article_extract SET content = '{\"title\": null}' WHERE article_url = ?", url(1))
        self.assert_refused()

    def test_negative_core_index(self):
        self.sql("UPDATE article_extract SET primary_core_index = -1 WHERE article_url = ?", url(1))
        self.assert_refused()

    def test_body_missing_for_link(self):
        self.sql("DELETE FROM article_body WHERE article_url = ?", url(2))
        self.assert_refused()

    def test_empty_title(self):
        self.sql("UPDATE article_event SET title = '' WHERE article_url = ?", url(2))
        self.assert_refused()


class EmbeddingTest(Fixture):
    def add_embeddings(self, model="dragonkue/BGE-m3-ko", skip=None, blob=None):
        conn = sqlite3.connect(self.db)
        conn.executescript(EMBEDDING_SCHEMA)
        for n in (1, 2, 3, 4):
            if n == skip:
                continue
            conn.execute("INSERT INTO article_embedding VALUES (?, ?, ?)", (url(n), model, blob or unit_vector(n)))
        conn.commit()
        conn.close()

    def test_embeddings_are_shipped_as_vector_text(self):
        self.add_embeddings()
        code, printed = self.run_main()
        self.assertEqual(code, 0)
        cols, rows = parse_copy_blocks(self.out.read_text(encoding="utf-8"))["load.article_embedding"]
        self.assertEqual(len(rows), 4)
        vec = rows[0][cols.index("embedding")]
        self.assertTrue(vec.startswith("[") and vec.endswith("]"))
        values = [float(x) for x in vec[1:-1].split(",")]
        self.assertEqual(len(values), 1024)
        self.assertAlmostEqual(math.sqrt(sum(x * x for x in values)), 1.0, places=4)
        self.assertEqual(json.loads(printed.strip().splitlines()[-1])["counts"]["article_embedding"], 4)

    def test_other_model_is_refused(self):
        self.add_embeddings(model="other/model")
        self.assert_refused()

    def test_missing_embedding_for_link_is_refused(self):
        self.add_embeddings(skip=3)
        self.assert_refused()

    def test_wrong_dimension_is_refused(self):
        self.add_embeddings(blob=struct.pack("<512f", *([0.0442] * 512)))
        self.assert_refused()

    def test_not_normalized_is_refused(self):
        self.add_embeddings(blob=struct.pack("<1024f", *([1.0] * 1024)))
        self.assert_refused()

    def test_nan_is_refused(self):
        self.add_embeddings(blob=struct.pack("<1024f", *([float("nan")] * 1024)))
        self.assert_refused()


if __name__ == "__main__":
    unittest.main()
