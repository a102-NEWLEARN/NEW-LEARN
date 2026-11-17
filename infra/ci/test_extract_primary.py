"""`extract_primary.py` 시험 — EXTRACT 가 대표 사건을 고르는 정확도 채점 (Jira S15P31A102-206 후속)

표본이 층화(건너뛴 기사 90 + 고른 기사 30)라서 날것의 정밀도 · 재현율은 모집단 값이 아니다.
층마다 따로 재고 모집단 비율로 다시 묶는 셈을 여기서 못 박는다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import importlib.util
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "extract_primary.py"
_spec = importlib.util.spec_from_file_location("extract_primary", SCRIPT)
ep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ep)

TAB = chr(9)
NEWLINE = chr(10)
HEADER = "key" + TAB + "verdict" + TAB + "judge" + TAB + "stage" + TAB + "at"


def silver_file(rows):
    path = pathlib.Path(tempfile.mkdtemp()) / "silver.tsv"
    lines = [HEADER] + [TAB.join(r) for r in rows]
    path.write_text(NEWLINE.join(lines) + NEWLINE, encoding="utf-8", newline=NEWLINE)
    return path


def worker_file(rows):
    path = pathlib.Path(tempfile.mkdtemp()) / "worker.tsv"
    lines = [TAB.join(r) for r in rows]
    path.write_text(NEWLINE.join(lines) + NEWLINE, encoding="utf-8", newline=NEWLINE)
    return path


class ReadSilver(unittest.TestCase):
    def test_머리줄이_틀리면_거절한다(self):
        path = pathlib.Path(tempfile.mkdtemp()) / "bad.tsv"
        path.write_text("key" + TAB + "verdict" + NEWLINE, encoding="utf-8", newline=NEWLINE)
        with self.assertRaises(ValueError):
            ep.read_silver(path)

    def test_E_가_아닌_키는_거절한다(self):
        path = silver_file([["M:1:2", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"]])
        with self.assertRaises(ValueError):
            ep.read_silver(path)

    def test_Y_N_만_받는다(self):
        path = silver_file([["E:1", "0", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"]])
        with self.assertRaises(ValueError):
            ep.read_silver(path)

    def test_키와_판정을_읽는다(self):
        path = silver_file([
            ["E:11", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:12", "N", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
        ])
        self.assertEqual(ep.read_silver(path), {11: "Y", 12: "N"})


class Wilson(unittest.TestCase):
    def test_교과서_값과_같다(self):
        # x=1, n=10 의 95% Wilson 구간은 널리 쓰이는 값 (0.0179, 0.4042)이고
        # 자리를 더 내리면 (0.017877, 0.404156) 이다
        p, lo, hi = ep.wilson(1, 10)
        self.assertAlmostEqual(p, 0.1, places=6)
        self.assertAlmostEqual(lo, 0.017877, places=5)
        self.assertAlmostEqual(hi, 0.404156, places=5)
        self.assertEqual((round(lo, 4), round(hi, 4)), (0.0179, 0.4042))

    def test_0건이면_아래가_0이다(self):
        _, lo, _ = ep.wilson(0, 20)
        self.assertEqual(lo, 0.0)


class Score(unittest.TestCase):
    def setUp(self):
        # 건너뛴 기사 4건 중 1건이 사실 사건 있음, 고른 기사 4건 중 3건이 사건 있음
        self.silver = silver_file([
            ["E:1", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:2", "N", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:3", "N", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:4", "N", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:5", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:6", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:7", "Y", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
            ["E:8", "N", "sonnet", "extract-primary", "2026-11-15T22:00:00+09:00"],
        ])
        self.worker = worker_file([
            ["1", "0"], ["2", "0"], ["3", "0"], ["4", "0"],
            ["5", "1"], ["6", "1"], ["7", "1"], ["8", "1"],
        ])

    def test_층별로_센다(self):
        r = ep.score(self.silver, self.worker, skip_share=0.5)
        self.assertEqual((r["skip_total"], r["skip_missed"]), (4, 1))
        self.assertEqual((r["keep_total"], r["keep_wrong"]), (4, 1))

    def test_정밀도는_고른_기사의_맞은_비율이다(self):
        r = ep.score(self.silver, self.worker, skip_share=0.5)
        self.assertAlmostEqual(r["precision"], 0.75, places=6)

    def test_재현율은_모집단_비율로_다시_묶는다(self):
        # 건너뛴 쪽이 절반이면: 놓친 몫 0.5*0.25=0.125, 잡은 몫 0.5*0.75=0.375 → 0.375/0.5 = 0.75
        r = ep.score(self.silver, self.worker, skip_share=0.5)
        self.assertAlmostEqual(r["recall"], 0.75, places=6)
        self.assertAlmostEqual(r["f1"], 0.75, places=6)

    def test_건너뛴_몫이_커지면_재현율이_떨어진다(self):
        many = ep.score(self.silver, self.worker, skip_share=0.9)
        few = ep.score(self.silver, self.worker, skip_share=0.1)
        self.assertLess(many["recall"], few["recall"])

    def test_워커_결과에_없는_기사는_빠진_것으로_센다(self):
        worker = worker_file([["1", "0"], ["5", "1"]])
        r = ep.score(self.silver, worker, skip_share=0.5)
        self.assertEqual(r["missing"], 6)
        self.assertEqual(r["skip_total"] + r["keep_total"], 2)

    def test_워커_값은_0_과_1_만_받는다(self):
        worker = worker_file([["1", "null"]])
        with self.assertRaises(ValueError):
            ep.score(self.silver, worker, skip_share=0.5)


if __name__ == "__main__":
    unittest.main()
