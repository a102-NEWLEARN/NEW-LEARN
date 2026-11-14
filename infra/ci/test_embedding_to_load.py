"""embedding_to_load.py 시험 — 기사 벡터 적재 파일 만들기 (Jira S15P31A102-207)

견본 벡터는 지어낸 값이다. 운영 DB 는 쓰지 않는다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import importlib.util
import io
import math
import pathlib
import sqlite3
import struct
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "embedding_to_load.py"
_spec = importlib.util.spec_from_file_location("embedding_to_load", SCRIPT)
etl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(etl)

MODEL = "dragonkue/BGE-m3-ko"


def unit_vector(seed, dim=None):
    """길이 1 인 1024차원 벡터. seed 로 값이 달라진다."""
    dim = etl.DIMENSION if dim is None else dim
    raw = [math.sin(seed + i) for i in range(dim)]
    norm = math.sqrt(sum(x * x for x in raw))
    return [x / norm for x in raw]


def blob(values):
    return struct.pack(f"<{len(values)}f", *values)


def make_sqlite(path, rows, model=MODEL):
    """rows: (url, vector, same_input_as_ops, title_changed_by_b2)"""
    db = sqlite3.connect(path)
    db.execute(
        "create table vectors (url text, newsdata_article_id text, event_id integer,"
        " published_kst text, text_hash text, input_source text,"
        " title_changed_by_b2 integer, same_input_as_ops integer, vector blob)"
    )
    db.execute("create table meta (key text, value text)")
    db.execute("insert into meta values ('model', ?)", (model,))
    for url, vector, same, changed in rows:
        db.execute(
            "insert into vectors values (?,?,?,?,?,?,?,?,?)",
            (url, "n1", 1, "2026-11-01T09:00:00+09:00", "h", "content", changed, same, blob(vector)),
        )
    db.commit()
    db.close()


def make_urls(path, pairs):
    with io.open(path, "w", encoding="utf-8") as f:
        for article_id, url in pairs:
            f.write(f"{article_id}|{url}\n")


class Build(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.sqlite = pathlib.Path(self.dir.name) / "v.sqlite"
        self.urls = pathlib.Path(self.dir.name) / "urls.tsv"
        self.out = pathlib.Path(self.dir.name) / "out.tsv"
        self.addCleanup(self.dir.cleanup)

    def build(self):
        return etl.build(str(self.sqlite), str(self.urls), str(self.out))

    def test_writes_one_copy_line_per_article(self):
        v1, v2 = unit_vector(1), unit_vector(2)
        make_sqlite(self.sqlite, [("http://a", v1, 1, 0), ("http://b", v2, 0, 1)])
        make_urls(self.urls, [(10, "http://a"), (20, "http://b")])

        report = self.build()

        lines = self.out.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        ids = sorted(int(line.split("\t")[0]) for line in lines)
        self.assertEqual(ids, [10, 20])
        aid, model, vec = lines[0].split("\t")
        self.assertEqual(aid, "10")
        self.assertEqual(model, MODEL)
        self.assertTrue(vec.startswith("[") and vec.endswith("]"))
        self.assertEqual(len(vec[1:-1].split(",")), etl.DIMENSION)
        self.assertEqual(report["rows"], 2)
        self.assertEqual(report["same_input_as_ops"], 1)
        self.assertEqual(report["title_changed_by_b2"], 1)

    def test_values_round_trip_as_float32(self):
        v1 = unit_vector(3)
        make_sqlite(self.sqlite, [("http://a", v1, 1, 0)])
        make_urls(self.urls, [(10, "http://a")])

        self.build()

        vec = self.out.read_text(encoding="utf-8").split("\t")[2].strip()
        # 칸이 float4 라 다시 float32 로 읽으면 원래 값과 비트까지 같다
        got = [struct.unpack("<f", struct.pack("<f", float(x)))[0] for x in vec[1:-1].split(",")]
        want = struct.unpack(f"<{etl.DIMENSION}f", blob(v1))
        self.assertEqual(got, list(want))

    def test_rejects_wrong_dimension(self):
        make_sqlite(self.sqlite, [("http://a", unit_vector(1, dim=512), 1, 0)])
        make_urls(self.urls, [(10, "http://a")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("차원", str(e.exception))

    def test_rejects_vector_that_is_not_unit_length(self):
        half = [x * 0.5 for x in unit_vector(1)]
        make_sqlite(self.sqlite, [("http://a", half, 1, 0)])
        make_urls(self.urls, [(10, "http://a")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("길이", str(e.exception))

    def test_rejects_non_finite_value(self):
        bad = unit_vector(1)
        bad[0] = float("inf")
        make_sqlite(self.sqlite, [("http://a", bad, 1, 0)])
        make_urls(self.urls, [(10, "http://a")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("유한", str(e.exception))

    def test_rejects_url_missing_in_production(self):
        make_sqlite(self.sqlite, [("http://a", unit_vector(1), 1, 0)])
        make_urls(self.urls, [(10, "http://other")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("운영에 없는", str(e.exception))

    def test_rejects_production_article_without_vector(self):
        make_sqlite(self.sqlite, [("http://a", unit_vector(1), 1, 0)])
        make_urls(self.urls, [(10, "http://a"), (20, "http://b")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("벡터가 없는", str(e.exception))

    def test_rejects_duplicate_url(self):
        v = unit_vector(1)
        make_sqlite(self.sqlite, [("http://a", v, 1, 0), ("http://a", v, 1, 0)])
        make_urls(self.urls, [(10, "http://a")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("두 번", str(e.exception))

    def test_rejects_unexpected_model_name(self):
        make_sqlite(self.sqlite, [("http://a", unit_vector(1), 1, 0)], model="other/model")
        make_urls(self.urls, [(10, "http://a")])

        with self.assertRaises(ValueError) as e:
            self.build()
        self.assertIn("모델", str(e.exception))

    def test_lines_are_sorted_by_article_id(self):
        v1, v2, v3 = unit_vector(1), unit_vector(2), unit_vector(3)
        make_sqlite(self.sqlite, [("http://c", v3, 1, 0), ("http://a", v1, 1, 0), ("http://b", v2, 1, 0)])
        make_urls(self.urls, [(30, "http://c"), (10, "http://a"), (20, "http://b")])

        self.build()

        ids = [int(line.split("\t")[0]) for line in self.out.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(ids, [10, 20, 30])


if __name__ == "__main__":
    unittest.main()
