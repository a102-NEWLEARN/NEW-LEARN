"""`final_gold(..., also=...)` 시험 — 나중에 더 판정한 전수 파일 읽기 (Jira S15P31A102-206)

실시간 판정 몫은 `sonnet-live.tsv` 로 따로 모은다. 그런데 `final_gold` 가 `sonnet.tsv` 만 읽으면
지표가 그 판정을 보지 못한다. 같은 폴더에 **고치기 전 지시문으로 판정한** `sonnet-calib.tsv` 도
있어서 싸잡아 읽을 수도 없다 — 그래서 읽을 파일을 이름으로 받는다.

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import importlib.util
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "clustering_eval.py"
_spec = importlib.util.spec_from_file_location("clustering_eval", SCRIPT)
ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ce)

NEWLINE = chr(10)
TAB = chr(9)


class FinalGoldAlso(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.gold = pathlib.Path(self.dir.name)
        self.addCleanup(self.dir.cleanup)
        self.write("sonnet.tsv", [("M:1:10", "Y"), ("M:1:11", "N")])
        self.write("human.tsv", [])

    def write(self, name, rows):
        lines = [ce.GOLD_HEADER]
        lines += [TAB.join([k, v, "sonnet", "census", "2026-11-14T10:00:00+09:00"]) for k, v in rows]
        (self.gold / name).write_text(NEWLINE.join(lines) + NEWLINE, encoding="utf-8")

    def test_without_also_only_the_census_file_is_read(self):
        self.write("sonnet-live.tsv", [("M:2:20", "Y")])

        gold = ce.final_gold(self.gold)

        self.assertNotIn("M:2:20", gold, "이름을 주지 않으면 읽지 않는다 — 옛 판정이 섞이지 않게")

    def test_also_adds_the_named_file(self):
        self.write("sonnet-live.tsv", [("M:2:20", "Y")])

        gold = ce.final_gold(self.gold, ("sonnet-live.tsv",))

        self.assertEqual(gold["M:2:20"], "Y")
        self.assertEqual(gold["M:1:10"], "Y", "먼저 읽은 전수도 그대로")

    def test_the_later_file_wins_on_the_same_key(self):
        self.write("sonnet-live.tsv", [("M:1:11", "Y")])

        gold = ce.final_gold(self.gold, ("sonnet-live.tsv",))

        self.assertEqual(gold["M:1:11"], "Y", "나중에 더 판정한 것이 이긴다")

    def test_missing_file_stops(self):
        with self.assertRaises(ce.CheckError):
            ce.final_gold(self.gold, ("없는파일.tsv",))

    def test_human_still_overrides_the_added_file(self):
        self.write("sonnet-live.tsv", [("M:2:20", "Y")])
        self.write("human.tsv", [("M:2:20", "N")])

        gold = ce.final_gold(self.gold, ("sonnet-live.tsv",))

        self.assertEqual(gold["M:2:20"], "N", "사람 판정이 전수를 덮는다")


if __name__ == "__main__":
    unittest.main()
