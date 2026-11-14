"""second_pass.py 시험 — 두 번째 사람 검수 (Jira S15P31A102-206)

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import collections
import importlib.util
import io
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "second_pass.py"
_spec = importlib.util.spec_from_file_location("second_pass", SCRIPT)
sp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sp)

HEAD = "key\tverdict\tjudge\tstage\tat\n"


def gold_dir(rows):
    d = tempfile.TemporaryDirectory()
    path = pathlib.Path(d.name) / "human.tsv"
    path.write_text(HEAD + "".join(rows), encoding="utf-8")
    return d, str(pathlib.Path(d.name))


class FirstPass(unittest.TestCase):
    def test_reads_only_the_asked_stage(self):
        d, g = gold_dir(
            [
                "M:1:10\tY\thuman\tverify\t2026-11-13T21:00:00+09:00\n",
                "M:1:11\t불통과\thuman\tverify\t2026-11-13T21:00:00+09:00\n",
                "M:1:12\tY\thuman\tcalib\t2026-11-13T21:00:00+09:00\n",
            ]
        )
        self.addCleanup(d.cleanup)

        rows = sp.first_pass(g)

        self.assertEqual(rows, {"M:1:10": 1, "M:1:11": 0})


class Pick(unittest.TestCase):
    def test_spreads_across_task_kinds(self):
        keys = {f"M:1:{i}": "Y" for i in range(40)}
        keys.update({f"P:{i}:{i + 1}": "N" for i in range(10)})
        keys.update({f"I:1:{i}": "Y" for i in range(10)})

        picked = sp.pick(keys, 9)

        kinds = sorted({k.split(":")[0] for k in picked})
        self.assertEqual(len(picked), 9)
        self.assertEqual(kinds, ["I", "M", "P"])
        counts = collections.Counter(k.split(":")[0] for k in picked)
        self.assertEqual(sorted(counts.values()), [3, 3, 3], "종류마다 고르게 — 한 종류에 쏠리지 않는다")

    def test_is_repeatable(self):
        keys = {f"M:1:{i}": "Y" for i in range(40)}
        self.assertEqual(sp.pick(keys, 5), sp.pick(keys, 5))

    def test_never_asks_for_more_than_there_is(self):
        keys = {"M:1:1": "Y", "P:2:3": "N"}
        self.assertEqual(sorted(sp.pick(keys, 10)), ["M:1:1", "P:2:3"])


class ReadAnswers(unittest.TestCase):
    def write(self, text):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        p = pathlib.Path(d.name) / "ans.md"
        p.write_text(text, encoding="utf-8")
        return str(p)

    def test_reads_the_sheet_back(self):
        path = self.write("## 1. (M:1:10)\n\n질문\n\n답: 통과\n\n## 2. (P:2:3)\n\n질문\n\n답: 불통과\n")

        self.assertEqual(sp.read_answers(path), {"M:1:10": 1, "P:2:3": 0})

    def test_reads_a_plain_tsv_too(self):
        path = self.write("M:1:10\t통과\nP:2:3\t불통과\n")

        self.assertEqual(sp.read_answers(path), {"M:1:10": 1, "P:2:3": 0})

    def test_blank_answer_is_left_out(self):
        path = self.write("## 1. (M:1:10)\n\n답: \n\n## 2. (P:2:3)\n\n답: 통과\n")

        self.assertEqual(sp.read_answers(path), {"P:2:3": 1})

    def test_unknown_word_stops(self):
        path = self.write("M:1:10\t아마도\n")

        with self.assertRaises(Exception) as e:
            sp.read_answers(path)
        self.assertIn("모르는 답", str(e.exception.problems[0]))


class Words(unittest.TestCase):
    # 종이에는 통과 · 불통과로 적어 달라고 하지만 사람은 예 · 네 · 아니오로도 적는다
    def test_accepts_the_words_people_actually_write(self):
        for word, want in (("통과", 1), ("예", 1), ("네", 1), ("불통과", 0), ("아니오", 0), ("아니요", 0)):
            self.assertEqual(sp.WORDS[word], want, word)

    def test_a_note_after_the_answer_is_ignored(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        p = pathlib.Path(d.name) / "ans.md"
        nl = chr(10)
        p.write_text(
            nl.join(["## 1. (P:1:2)", "", "답: 아니요 (근데 날씨 기사는 사건 처리 안 하기로 하지 않았나?)", ""]),
            encoding="utf-8",
        )

        self.assertEqual(sp.read_answers(str(p)), {"P:1:2": 0})


class Compare(unittest.TestCase):
    def test_counts_agreement_and_kappa(self):
        d, g = gold_dir(
            [
                "M:1:10\tY\thuman\tverify\tt\n",
                "M:1:11\tY\thuman\tverify\tt\n",
                "M:1:12\tN\thuman\tverify\tt\n",
                "P:2:3\tN\thuman\tverify\tt\n",
            ]
        )
        self.addCleanup(d.cleanup)

        report = sp.compare(g, {"M:1:10": 1, "M:1:11": 0, "M:1:12": 0, "P:2:3": 0})

        self.assertEqual(report["n"], 4)
        self.assertAlmostEqual(report["agree"], 0.75)
        self.assertEqual(report["by_task"]["M"]["n"], 3)
        self.assertEqual(report["by_task"]["P"]["n"], 1)

    def test_stops_when_the_first_person_never_judged_it(self):
        d, g = gold_dir(["M:1:10\tY\thuman\tverify\tt\n"])
        self.addCleanup(d.cleanup)

        with self.assertRaises(Exception) as e:
            sp.compare(g, {"M:9:99": 1})
        self.assertIn("판정하지 않은", str(e.exception.problems[0]))


if __name__ == "__main__":
    unittest.main()
