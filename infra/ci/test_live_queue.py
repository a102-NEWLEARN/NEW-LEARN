"""live_queue.py 시험 — 실시간 판정 몫 고르기 (Jira S15P31A102-206)

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import importlib.util
import io
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "live_queue.py"
_spec = importlib.util.spec_from_file_location("live_queue", SCRIPT)
lq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lq)

ARTICLES = {7001, 7002}
EVENTS = {500, 501}
ISSUES = {90}


def live(key):
    return lq.is_live(key, ARTICLES, EVENTS, ISSUES)


class IsLive(unittest.TestCase):
    # M 은 기사가 기준이다 — 켠 뒤 붙은 기사라야 판정기가 한 일이다
    def test_member_follows_the_article_not_the_event(self):
        self.assertTrue(live("M:500:7001"))
        self.assertTrue(live("M:12:7002"), "적재분 사건에 켠 뒤 붙은 기사도 실시간 몫")
        self.assertFalse(live("M:500:6999"), "켠 뒤 생긴 사건이어도 옛 기사면 적재분")

    # P 는 둘 중 하나만 새 사건이어도 본다 — 「새 사건을 옛 사건과 합쳤어야 하나」가 재현율이다
    def test_event_pair_is_live_when_either_side_is_new(self):
        self.assertTrue(live("P:12:500"))
        self.assertTrue(live("P:500:501"))
        self.assertFalse(live("P:12:13"))

    def test_issue_member_and_outside_follow_the_event(self):
        self.assertTrue(live("I:90:500"))
        self.assertTrue(live("I:3:501"), "옛 이슈에 붙은 새 사건도 실시간 몫")
        self.assertFalse(live("I:90:12"))
        self.assertTrue(live("O:500:3"))
        self.assertFalse(live("O:12:3"))

    def test_issue_pair_is_live_when_either_issue_is_new(self):
        self.assertTrue(live("Q:3:90"))
        self.assertFalse(live("Q:3:4"))

    def test_unknown_task_stops(self):
        with self.assertRaises(ValueError):
            live("Z:1:2")


class TaskFilter(unittest.TestCase):
    # 이슈 밖 사건(O)은 보정에서 사람과 κ 가 음수였다 — 전수에서 빼고 돌릴 수 있어야 한다
    def test_only_the_asked_tasks_are_live(self):
        self.assertTrue(lq.is_live("M:500:7001", ARTICLES, EVENTS, ISSUES, {"M", "P"}))
        self.assertTrue(lq.is_live("P:12:500", ARTICLES, EVENTS, ISSUES, {"M", "P"}))
        self.assertFalse(lq.is_live("O:500:3", ARTICLES, EVENTS, ISSUES, {"M", "P"}))
        self.assertFalse(lq.is_live("I:90:500", ARTICLES, EVENTS, ISSUES, {"M", "P"}))

    def test_no_filter_keeps_everything(self):
        self.assertTrue(lq.is_live("O:500:3", ARTICLES, EVENTS, ISSUES, None))


class ReadIds(unittest.TestCase):
    def test_reads_one_id_per_line_and_skips_blanks(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "ids.txt"
            p.write_text("12\n\n500\n 501 \n", encoding="utf-8")
            self.assertEqual(lq.read_ids(str(p)), {12, 500, 501})

    def test_missing_path_is_an_empty_set(self):
        self.assertEqual(lq.read_ids(None), set())


if __name__ == "__main__":
    unittest.main()
