"""vectors_to_sqlite.py 시험 — 운영 기사 벡터를 평가 도구가 읽는 모양으로 (Jira S15P31A102-206)

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

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "vectors_to_sqlite.py"
_spec = importlib.util.spec_from_file_location("vectors_to_sqlite", SCRIPT)
vts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vts)


def unit(seed, dim=None):
    dim = vts.DIMENSION if dim is None else dim
    raw = [math.sin(seed + i) for i in range(dim)]
    norm = math.sqrt(sum(x * x for x in raw))
    return [x / norm for x in raw]


def as_float32(v):
    """pgvector 가 찍는 값처럼 — float4 로 깎은 뒤 그대로 되돌아오는 십진수로."""
    return struct.unpack("<f", struct.pack("<f", v))[0]


def line(url, values):
    return url + "|[" + ",".join(repr(as_float32(v)) for v in values) + "]"


class Convert(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.src = pathlib.Path(self.dir.name) / "rows.txt"
        self.out = pathlib.Path(self.dir.name) / "v.sqlite"
        self.addCleanup(self.dir.cleanup)

    def write(self, lines):
        self.src.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def run_it(self):
        return vts.convert(str(self.src), str(self.out))

    def rows(self):
        db = sqlite3.connect(self.out)
        try:
            return dict(db.execute("select url, vector from vectors"))
        finally:
            db.close()

    def test_writes_one_row_per_article(self):
        self.write([line("http://a", unit(1)), line("http://b", unit(2))])

        report = self.run_it()

        rows = self.rows()
        self.assertEqual(sorted(rows), ["http://a", "http://b"])
        self.assertEqual(len(rows["http://a"]), vts.DIMENSION * 4)
        self.assertEqual(report["rows"], 2)

    def test_values_round_trip_as_float32(self):
        values = unit(3)
        self.write([line("http://a", values)])

        self.run_it()

        got = struct.unpack(f"<{vts.DIMENSION}f", self.rows()["http://a"])
        want = struct.unpack(f"<{vts.DIMENSION}f", struct.pack(f"<{vts.DIMENSION}f", *values))
        self.assertEqual(list(got), list(want))

    def test_rejects_wrong_dimension(self):
        self.write([line("http://a", unit(1, dim=512))])

        with self.assertRaises(ValueError) as e:
            self.run_it()
        self.assertIn("차원", str(e.exception))

    def test_rejects_non_finite_value(self):
        bad = unit(1)
        bad[0] = float("inf")
        self.write(["http://a|[" + ",".join("inf" if math.isinf(v) else f"{v:.9g}" for v in bad) + "]"])

        with self.assertRaises(ValueError) as e:
            self.run_it()
        self.assertIn("유한", str(e.exception))

    def test_rejects_vector_that_is_not_unit_length(self):
        half = [v * 0.5 for v in unit(1)]
        self.write([line("http://a", half)])

        with self.assertRaises(ValueError) as e:
            self.run_it()
        self.assertIn("길이", str(e.exception))

    def test_rejects_duplicate_url(self):
        v = unit(1)
        self.write([line("http://a", v), line("http://a", v)])

        with self.assertRaises(ValueError) as e:
            self.run_it()
        self.assertIn("두 번", str(e.exception))

    def test_skips_blank_lines(self):
        self.write([line("http://a", unit(1)), "", line("http://b", unit(2)), ""])

        report = self.run_it()

        self.assertEqual(report["rows"], 2)

    def test_rejects_line_without_separator(self):
        self.write(["http://a 벡터없음"])

        with self.assertRaises(ValueError) as e:
            self.run_it()
        self.assertIn("모양", str(e.exception))


if __name__ == "__main__":
    unittest.main()
