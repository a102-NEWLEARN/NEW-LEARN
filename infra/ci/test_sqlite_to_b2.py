"""sqlite_to_b2.py 시험 — 10/21 ~ 11/3 최종 기사를 B2 요청 모양 JSONL 로 (Jira S15P31A102-169)

시험마다 data/README.md 의 표 모양(articles · selection)만 따른 작은 SQLite 를 만든다. 기사 값은 지어낸 것이다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import hashlib
import importlib.util
import io
import json
import pathlib
import sqlite3
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "sqlite_to_b2.py"
_spec = importlib.util.spec_from_file_location("sqlite_to_b2", SCRIPT)
sqlite_to_b2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sqlite_to_b2)


def article(n, published, **over):
    row = {
        "article_id": f"nd{n:04d}",
        "link": f"https://news.example.com/a/{n}",
        "title": f"제목 {n}",
        "description": "요약",
        "content": f"본문 {n}\n둘째 줄 \"따옴표\" \\ 역슬래시",
        "published": published,
        "source_id": "garam_kr",
        "source_name": "가람일보",
        "category": "top,business",
        "fetched_at": "2026-11-04 10:32:54",
    }
    row.update(over)
    return row


class Fixture(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.db = pathlib.Path(self.dir.name) / "news.sqlite"
        self.out = pathlib.Path(self.dir.name) / "articles.jsonl"
        con = sqlite3.connect(self.db)
        con.execute(
            "create table articles (article_id text, link text, title text, description text, content text,"
            " published text, source_id text, source_name text, category text, fetched_at text)"
        )
        con.execute("create table selection (day text, article_id text, status text, primary key (day, article_id))")
        con.commit()
        con.close()

    def add(self, row, status="selected"):
        con = sqlite3.connect(self.db)
        con.execute(
            "insert into articles values (:article_id, :link, :title, :description, :content, :published,"
            " :source_id, :source_name, :category, :fetched_at)",
            row,
        )
        con.execute("insert into selection values (?, ?, ?)", (row["published"][:10], row["article_id"], status))
        con.commit()
        con.close()

    def convert(self, before="2026-11-04"):
        result = sqlite_to_b2.convert(self.db, self.out, before)
        lines = self.out.read_bytes().decode("utf-8").splitlines()
        return result, [json.loads(line) for line in lines]


class Fields(Fixture):
    def test_maps_columns_to_b2_body(self):
        self.add(article(1, "2026-10-21 18:50:55"))
        _, rows = self.convert()
        self.assertEqual(rows, [{
            "url": "https://news.example.com/a/1",
            "pressSourceId": "garam_kr",
            "pressName": "가람일보",
            "title": "제목 1",
            "body": "본문 1\n둘째 줄 \"따옴표\" \\ 역슬래시",
            "publishedAt": "2026-10-21T18:50:55+09:00",
            "sourceCategories": ["top", "business"],
        }])

    def test_published_is_kst_so_offset_is_plus_nine(self):
        # README: published 는 한국 시간(시간대 표시 없음) — 9시간을 빼지 않고 +09:00 을 붙인다
        self.add(article(1, "2026-11-03 23:59:59"))
        _, rows = self.convert()
        self.assertEqual(rows[0]["publishedAt"], "2026-11-03T23:59:59+09:00")

    def test_body_and_title_are_kept_as_is(self):
        self.add(article(1, "2026-10-22 09:00:00", title="  앞뒤 공백 ", content="  본문\r\n그대로  "))
        _, rows = self.convert()
        self.assertEqual(rows[0]["title"], "  앞뒤 공백 ")
        self.assertEqual(rows[0]["body"], "  본문\r\n그대로  ")

    def test_categories_split_on_comma_without_blanks_or_repeats(self):
        self.add(article(1, "2026-10-22 09:00:00", category=" top, ,business,top,politics,"))
        _, rows = self.convert()
        self.assertEqual(rows[0]["sourceCategories"], ["top", "business", "politics"])

    def test_no_categories_leaves_the_field_out(self):
        self.add(article(1, "2026-10-22 09:00:00", category=""))
        self.add(article(2, "2026-10-22 09:00:01", category=None))
        _, rows = self.convert()
        self.assertNotIn("sourceCategories", rows[0])
        self.assertNotIn("sourceCategories", rows[1])

    def test_sqlite_has_no_reporter_or_tags(self):
        self.add(article(1, "2026-10-22 09:00:00"))
        _, rows = self.convert()
        self.assertNotIn("reporter", rows[0])
        self.assertNotIn("sourceTags", rows[0])


class Selection(Fixture):
    def test_only_selected_articles(self):
        self.add(article(1, "2026-10-22 09:00:00"))
        self.add(article(2, "2026-10-22 09:00:01"), status="extra")
        self.add(article(3, "2026-10-22 09:00:02"), status="empty_body")
        _, rows = self.convert()
        self.assertEqual([r["url"] for r in rows], ["https://news.example.com/a/1"])

    def test_only_before_the_cutoff_day(self):
        # 11/4 0시 기사는 운영 11/4 수집과 겹친다 — 넣지 않는다
        self.add(article(1, "2026-11-03 23:59:59"))
        self.add(article(2, "2026-11-04 00:00:00"))
        _, rows = self.convert(before="2026-11-04")
        self.assertEqual([r["url"] for r in rows], ["https://news.example.com/a/1"])

    def test_sorted_by_published_then_article_id(self):
        self.add(article(3, "2026-10-23 08:00:00"))
        self.add(article(2, "2026-10-21 20:00:00"))
        self.add(article(1, "2026-10-23 08:00:00"))
        _, rows = self.convert()
        self.assertEqual([r["url"][-1] for r in rows], ["2", "1", "3"])


class Output(Fixture):
    def test_result_counts_lines_and_hashes_the_file(self):
        self.add(article(1, "2026-10-21 18:50:55"))
        self.add(article(2, "2026-11-03 23:59:59"))
        result, rows = self.convert()
        raw = self.out.read_bytes()
        self.assertEqual(result["lines"], 2)
        self.assertEqual(result["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(result["publishedMin"], "2026-10-21T18:50:55+09:00")
        self.assertEqual(result["publishedMax"], "2026-11-03T23:59:59+09:00")

    def test_utf8_one_line_per_article_with_lf(self):
        self.add(article(1, "2026-10-21 18:50:55"))
        self.add(article(2, "2026-10-22 18:50:55"))
        self.convert()
        raw = self.out.read_bytes()
        self.assertNotIn(b"\r\n", raw.replace(b"\\r\\n", b""))
        self.assertTrue(raw.endswith(b"\n"))
        self.assertEqual(raw.count(b"\n"), 2)
        self.assertIn("가람일보".encode("utf-8"), raw)  # \uXXXX 로 바꿔 적지 않는다

    def test_bad_published_stops_without_writing(self):
        self.add(article(1, "2026-10-21 18:50:55"))
        self.add(article(2, "2026-10-22T09:00:00Z"))
        with self.assertRaises(sqlite_to_b2.ConvertError):
            self.convert()
        self.assertFalse(self.out.exists())

    def test_blank_required_field_stops(self):
        self.add(article(1, "2026-10-21 18:50:55", content="   "))
        with self.assertRaises(sqlite_to_b2.ConvertError):
            self.convert()
        self.assertFalse(self.out.exists())

    def test_main_prints_summary_and_returns_zero(self):
        self.add(article(1, "2026-10-21 18:50:55"))
        out = io.StringIO()
        code = sqlite_to_b2.main([str(self.db), str(self.out)], out)
        self.assertEqual(code, 0)
        summary = json.loads(out.getvalue())
        self.assertEqual(summary["lines"], 1)
        self.assertEqual(summary["before"], "2026-11-04")

    def test_main_returns_two_on_bad_input(self):
        self.add(article(1, "bad"))
        out = io.StringIO()
        self.assertEqual(sqlite_to_b2.main([str(self.db), str(self.out)], out), 2)
        self.assertIn("error", json.loads(out.getvalue()))


if __name__ == "__main__":
    unittest.main()
