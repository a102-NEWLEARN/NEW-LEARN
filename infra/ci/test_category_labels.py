"""category_labels.py 시험 — 분야 라벨 나누기 · 합치기 (Jira S15P31A102-180)

견본 기사는 지어낸 값이다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "category_labels.py"
_spec = importlib.util.spec_from_file_location("category_labels", SCRIPT)
category_labels = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(category_labels)

BROKEN_TITLE = "ÃÂÃÂÃÂ 깨진 제목"  # U+00C0 ~ U+024F 글자 6자
NEARLY_BROKEN_TITLE = "ÃÂÃÂÃ 멀쩡한 제목"  # 5자


def article(no, title=None):
    return {"url": f"https://example.com/{no}", "title": title or f"제목 {no}"}


class Base(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = pathlib.Path(tmp.name)
        self.export = self.root / "export.jsonl"
        self.batches = self.root / "batches"
        self.output = self.root / "labels.tsv"

    def write_export(self, rows):
        lines = [row if isinstance(row, str) else json.dumps(row, ensure_ascii=False) for row in rows]
        self.export.write_bytes(("".join(f"{line}\n" for line in lines)).encode("utf-8"))

    def run_main(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = category_labels.main([str(a) for a in args])
        return code, out.getvalue()

    def split(self, size=2):
        return self.run_main("split", self.export, self.batches, "--size", size)

    def merge(self):
        return self.run_main("merge", self.export, self.batches, self.output)

    def batch_lines(self, name):
        return (self.batches / name).read_bytes().decode("utf-8").split("\n")[:-1]

    def write_result(self, name, text):
        (self.batches / name).write_bytes(text.encode("utf-8"))


class Split(Base):
    def test_번호는_목록_줄_번호이고_정한_크기로_나눈다(self):
        self.write_export([article(n) for n in range(1, 6)])
        code, _ = self.split()
        self.assertEqual(code, 0)
        self.assertEqual(self.batch_lines("b01.txt"), ["1\t제목 1", "2\t제목 2"])
        self.assertEqual(self.batch_lines("b02.txt"), ["3\t제목 3", "4\t제목 4"])
        self.assertEqual(self.batch_lines("b03.txt"), ["5\t제목 5"])
        self.assertFalse((self.batches / "b04.txt").exists())

    def test_기본_크기는_2000건(self):
        self.write_export([article(n) for n in range(1, 2002)])
        code, _ = self.run_main("split", self.export, self.batches)
        self.assertEqual(code, 0)
        self.assertEqual(len(self.batch_lines("b01.txt")), 2000)
        self.assertEqual(self.batch_lines("b02.txt"), ["2001\t제목 2001"])

    def test_제목의_탭_줄바꿈은_빈칸이_되어_한_줄로_남는다(self):
        self.write_export([article(1, "앞\t뒤\n다음 끝")])
        self.split()
        self.assertEqual(self.batch_lines("b01.txt"), ["1\t앞 뒤 다음 끝"])

    def test_빈_목록이면_묶음을_만들지_않는다(self):
        self.write_export([])
        code, out = self.split()
        self.assertEqual(code, 0)
        self.assertEqual(list(self.batches.glob("b*")), [])
        self.assertIn("0", out)

    def test_이미_묶음이_있는_폴더는_덮지_않는다(self):
        self.write_export([article(1)])
        self.batches.mkdir()
        self.write_result("b01.txt", "9\t옛 묶음\n")
        code, _ = self.split()
        self.assertEqual(code, 1)
        self.assertEqual(self.batch_lines("b01.txt"), ["9\t옛 묶음"])

    def test_결과만_남은_폴더도_덮지_않는다(self):
        self.write_export([article(1)])
        self.batches.mkdir()
        self.write_result("b01.tsv", "9\tP\n")
        code, _ = self.split()
        self.assertEqual(code, 1)
        self.assertFalse((self.batches / "b01.txt").exists())

    def test_COPY_를_깨는_URL_이면_멈추고_묶음을_안_만든다(self):
        for url in ("https://example.com/a\\b", "https://example.com/a\tb", "https://example.com/a\nb", ""):
            with self.subTest(url=url):
                self.write_export([article(1), {"url": url, "title": "제목"}])
                code, out = self.split()
                self.assertEqual(code, 1)
                self.assertIn("2", out)
                self.assertEqual(list(self.batches.glob("b*")), [])

    def test_같은_URL_이_두_번이면_멈춘다(self):
        self.write_export([article(1), article(1)])
        code, _ = self.split()
        self.assertEqual(code, 1)
        self.assertEqual(list(self.batches.glob("b*")), [])

    def test_못_읽는_줄이면_멈춘다(self):
        for row in ("{깨진 줄", '{"url": "https://example.com/1"}', '{"url": 1, "title": "제목"}', "[]"):
            with self.subTest(row=row):
                self.write_export([row])
                code, _ = self.split()
                self.assertEqual(code, 1)
                self.assertEqual(list(self.batches.glob("b*")), [])

    def test_출력에_제목을_찍지_않는다(self):
        self.write_export([article(1, "찍으면 안 되는 제목")])
        _, out = self.split()
        self.assertNotIn("찍으면 안 되는 제목", out)


class Merge(Base):
    def prepare(self, rows, size=2):
        self.write_export(rows)
        code, _ = self.split(size)
        self.assertEqual(code, 0)

    def assert_stopped(self, needle):
        code, out = self.merge()
        self.assertEqual(code, 1)
        self.assertIn(needle, out)
        self.assertFalse(self.output.exists())

    def test_URL_탭_코드_LF_끝_줄_줄바꿈으로_쓴다(self):
        self.prepare([article(n) for n in range(1, 4)])
        self.write_result("b01.tsv", "2\tE\n1\tP\n")
        self.write_result("b02.tsv", "3\tS\n")
        code, out = self.merge()
        self.assertEqual(code, 0)
        self.assertEqual(
            self.output.read_bytes(),
            "https://example.com/1\tP\nhttps://example.com/2\tE\nhttps://example.com/3\tS\n".encode("utf-8"),
        )
        self.assertIn("3", out)

    def test_일곱_코드를_받는다(self):
        self.prepare([article(n) for n in range(1, 8)], size=7)
        self.write_result("b01.tsv", "".join(f"{n}\t{c}\n" for n, c in enumerate("PESWITC", 1)))
        code, _ = self.merge()
        self.assertEqual(code, 0)

    def test_CRLF_와_빈_줄은_받아_준다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\r\n\r\n2\tE\r\n")
        code, _ = self.merge()
        self.assertEqual(code, 0)

    def test_빠진_번호가_있으면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\n")
        self.assert_stopped("b01")

    def test_없는_번호가_있으면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n3\tS\n")
        self.assert_stopped("b01")

    def test_같은_번호를_두_번_쓰면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\n1\tP\n2\tE\n")
        self.assert_stopped("b01")

    def test_모르는_코드면_멈춘다(self):
        self.prepare([article(1), article(2)])
        for code_text in ("p", "X", "PE", "", "모름"):
            with self.subTest(code=code_text):
                self.write_result("b01.tsv", f"1\t{code_text}\n2\tE\n")
                self.assert_stopped("b01")

    def test_칸_수가_틀리면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\textra\n2\tE\n")
        self.assert_stopped("b01")

    def test_번호가_숫자가_아니면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "하나\tP\n2\tE\n")
        self.assert_stopped("b01")

    def test_결과_파일이_없는_묶음이면_멈춘다(self):
        self.prepare([article(n) for n in range(1, 4)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        self.assert_stopped("b02")

    def test_묶음_파일이_사라지면_빠진_번호로_멈춘다(self):
        self.prepare([article(n) for n in range(1, 4)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        (self.batches / "b02.txt").unlink()
        self.assert_stopped("빠짐")

    def test_묶음끼리_번호가_겹치면_멈춘다(self):
        self.prepare([article(n) for n in range(1, 3)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        self.write_result("b09.txt", "2\t제목 2\n")
        self.write_result("b09.tsv", "2\tE\n")
        self.assert_stopped("겹침")

    def test_목록에_없는_번호를_묶음이_가지면_멈춘다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        self.write_result("b09.txt", "7\t제목 7\n")
        self.write_result("b09.tsv", "7\tE\n")
        self.assert_stopped("목록에 없는")

    def test_목록을_다시_뽑아_제목이_달라지면_멈춘다(self):
        self.prepare([article(1, "먼저 뽑은 제목"), article(2)])
        self.write_result("b01.tsv", "1\tT\n2\tE\n")
        self.write_export([article(1, "나중에 뽑은 제목"), article(2)])
        self.assert_stopped("제목이 다른")

    def test_제목의_빈칸을_고친_기사도_같은_제목으로_본다(self):
        self.prepare([article(1, "앞\t뒤"), article(2)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        code, _ = self.merge()
        self.assertEqual(code, 0)

    def test_깨진_제목은_조수의_값_대신_X(self):
        self.prepare([article(1, BROKEN_TITLE), article(2, NEARLY_BROKEN_TITLE)])
        self.write_result("b01.tsv", "1\tE\n2\tS\n")
        code, _ = self.merge()
        self.assertEqual(code, 0)
        self.assertEqual(
            self.output.read_text(encoding="utf-8"),
            "https://example.com/1\tX\nhttps://example.com/2\tS\n",
        )

    def test_이미_있는_라벨_파일은_덮지_않는다(self):
        self.prepare([article(1), article(2)])
        self.write_result("b01.tsv", "1\tP\n2\tE\n")
        self.output.write_text("옛 파일\n", encoding="utf-8")
        code, _ = self.merge()
        self.assertEqual(code, 1)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "옛 파일\n")

    def test_출력에_제목을_찍지_않는다(self):
        self.prepare([article(1, "찍으면 안 되는 제목"), article(2)])
        self.write_result("b01.tsv", "1\tP\n")
        _, out = self.merge()
        self.assertNotIn("찍으면 안 되는 제목", out)


if __name__ == "__main__":
    unittest.main()
