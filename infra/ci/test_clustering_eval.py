"""clustering_eval.py 시험 — 사건 · 이슈 묶기 정확도 평가 (Jira S15P31A102-206)

견본 기사 · 사건은 지어낸 값이다. 지표 기댓값은 손으로 셈한 값이다(각 시험의 주석).

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import contextlib
import importlib.util
import io
import json
import math
import pathlib
import sqlite3
import struct
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "clustering_eval.py"
_spec = importlib.util.spec_from_file_location("clustering_eval", SCRIPT)
ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ce)


def labels(groups):
    """[[항목…], …] → {항목: 묶음 번호}."""
    return {item: no for no, group in enumerate(groups) for item in group}


class Scores(unittest.TestCase):
    def test_same_partition_is_perfect(self):
        part = labels([[1, 2, 3], [4, 5], [6]])
        result = ce.scores(part, dict(part))
        for name in ("pair_precision", "pair_recall", "pair_f1", "b3_f1", "homogeneity", "completeness", "v_measure", "ari"):
            self.assertAlmostEqual(result[name], 1.0, msg=name)

    def test_textbook_example(self):
        # 시스템 {1,2,3}{4,5,6} · 정답 {1,2}{3,4,5,6}
        # 칸: (S1,G1)=2 (S1,G2)=1 (S2,G2)=3 → 맞은 쌍 1+0+3=4, 시스템 쌍 3+3=6, 정답 쌍 1+6=7
        # B³ 정밀 = (4/3+1/3+9/3)/6 = 7/9, 재현 = (4/2+1/4+9/4)/6 = 3/4
        # ARI = (4 - 6·7/15) / ((6+7)/2 - 6·7/15) = 1.2/3.7
        # 균질성 = 1 - H(G|S)/H(G) = 1/2, 완전성 = 1 - H(S|G)/H(S)
        system = labels([[1, 2, 3], [4, 5, 6]])
        gold = labels([[1, 2], [3, 4, 5, 6]])
        result = ce.scores(system, gold)
        self.assertAlmostEqual(result["pair_precision"], 4 / 6)
        self.assertAlmostEqual(result["pair_recall"], 4 / 7)
        self.assertAlmostEqual(result["pair_f1"], 2 * (4 / 6) * (4 / 7) / (4 / 6 + 4 / 7))
        self.assertAlmostEqual(result["b3_precision"], 7 / 9)
        self.assertAlmostEqual(result["b3_recall"], 3 / 4)
        self.assertAlmostEqual(result["ari"], 1.2 / 3.7)
        self.assertAlmostEqual(result["homogeneity"], 0.5)
        h_s_given_g = (4 / 6) * -(0.25 * math.log(0.25) + 0.75 * math.log(0.75))
        self.assertAlmostEqual(result["completeness"], 1 - h_s_given_g / math.log(2))

    def test_everything_in_one_cluster(self):
        # 정답 {1,2}{3,4} 를 한 묶음으로: 쌍 6개 중 맞은 쌍 2 → 정밀 1/3, 재현 1
        result = ce.scores(labels([[1, 2, 3, 4]]), labels([[1, 2], [3, 4]]))
        self.assertAlmostEqual(result["pair_precision"], 1 / 3)
        self.assertAlmostEqual(result["pair_recall"], 1.0)
        self.assertAlmostEqual(result["b3_precision"], 0.5)
        self.assertAlmostEqual(result["completeness"], 1.0)

    def test_everything_alone(self):
        # 붙인 쌍이 없으면 정밀도는 1(잘못 붙인 쌍 없음), 재현은 0
        result = ce.scores(labels([[1], [2], [3], [4]]), labels([[1, 2], [3, 4]]))
        self.assertAlmostEqual(result["pair_precision"], 1.0)
        self.assertAlmostEqual(result["pair_recall"], 0.0)
        self.assertAlmostEqual(result["homogeneity"], 1.0)
        self.assertAlmostEqual(result["b3_recall"], 0.5)

    def test_subset_counts_only_pairs_inside(self):
        system = labels([[1, 2, 3], [4, 5, 6]])
        gold = labels([[1, 2], [3, 4, 5, 6]])
        result = ce.scores(system, gold, items=[4, 5, 6])
        self.assertEqual(result["n"], 3)
        self.assertAlmostEqual(result["pair_f1"], 1.0)

    def test_mismatched_items_rejected(self):
        with self.assertRaises(ce.CheckError):
            ce.scores({1: 0, 2: 0}, {1: 0})

    def test_bootstrap_is_reproducible_and_brackets_estimate(self):
        system = labels([[i * 3 + j for j in range(3)] for i in range(20)])
        gold = labels([[i * 3, i * 3 + 1] for i in range(20)] + [[i * 3 + 2] for i in range(20)])
        first = ce.scores(system, gold, bootstrap=200, seed=7)
        again = ce.scores(system, gold, bootstrap=200, seed=7)
        self.assertEqual(first["ci"], again["ci"])
        low, high = first["ci"]["pair_precision"]
        self.assertLessEqual(low, first["pair_precision"])
        self.assertGreaterEqual(high, first["pair_precision"])

    def test_components_keep_merged_clusters_together(self):
        # 정답이 시스템 묶음 0 과 1 을 잇는다 → 한 덩어리, 묶음 2 는 따로
        system = labels([[1, 2], [3, 4], [5]])
        gold = labels([[1, 2, 3], [4], [5]])
        groups = sorted(sorted(c) for c in ce.components(system, gold))
        self.assertEqual(groups, [[1, 2, 3, 4], [5]])


class Agreement(unittest.TestCase):
    def test_kappa_hand_example(self):
        # 둘 다 통과 8 · 둘 다 불통과 6 · 사람만 통과 4 · Sonnet 만 통과 2
        # 일치 0.7, 사람 통과 0.6, Sonnet 통과 0.5 → 우연 0.5 → κ 0.4
        pairs = [(1, 1, 1.0)] * 8 + [(0, 0, 1.0)] * 6 + [(1, 0, 1.0)] * 4 + [(0, 1, 1.0)] * 2
        result = ce.kappa(pairs)
        self.assertAlmostEqual(result["agreement"], 0.7)
        self.assertAlmostEqual(result["kappa"], 0.4)
        self.assertAlmostEqual(result["n_eff"], 20)

    def test_weights_change_agreement(self):
        result = ce.kappa([(1, 1, 3.0), (1, 0, 1.0)])
        self.assertAlmostEqual(result["agreement"], 0.75)
        self.assertAlmostEqual(result["n_eff"], 16 / 10)

    def test_wilson_known_value(self):
        low, high = ce.wilson(8, 10)
        self.assertAlmostEqual(low, 0.4902, places=4)
        self.assertAlmostEqual(high, 0.9433, places=4)


ISSUES = [{"kind": "issue", "id": 1, "title": "이슈 하나", "summary": "요약", "categories": ["P"]}]
EVENTS = [
    {"kind": "event", "id": 10, "issue_id": 1, "title": "사건 열", "label": "가", "summary": None,
     "occurred_at": "2026-10-21T00:00:00+00:00", "role": "MAIN", "reacts_to_event_id": None},
    {"kind": "event", "id": 20, "issue_id": None, "title": "사건 스물", "label": "나", "summary": None,
     "occurred_at": "2026-10-21T03:00:00+00:00", "role": "MAIN", "reacts_to_event_id": None},
]
ARTICLES = [
    {"kind": "article", "id": art, "url": f"https://example.com/{art}", "event_id": event, "title": f"제목 {art}",
     "lead": "앞부분", "published_at": "2026-10-21T01:00:00+00:00", "category": "P", "released": True}
    for art, event in ((101, 10), (102, 10), (103, 10), (201, 20), (202, 20))
]


class Work(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = pathlib.Path(tmp.name)
        self.export = self.root / "export.jsonl"
        self.work = self.root / "work"
        self.gold = self.root / "gold"

    def write_export(self, rows):
        self.export.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")

    def write_vectors(self, rows, skip=()):
        path = self.root / "vectors.sqlite"
        connection = sqlite3.connect(path)
        connection.execute("create table vectors(url text primary key, vector blob not null)")
        for row in rows:
            if row["kind"] != "article" or row["id"] in skip:
                continue
            vector = [0.0] * ce.DIM
            vector[row["event_id"] % ce.DIM] = 1.0
            vector[row["id"] % ce.DIM] += 0.1
            connection.execute("insert into vectors values (?, ?)", (row["url"], struct.pack(f"<{ce.DIM}f", *vector)))
        connection.commit()
        connection.close()
        return path

    def run_main(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = ce.main([str(a) for a in args])
        return code, out.getvalue()

    def prepared(self):
        rows = ISSUES + EVENTS + ARTICLES
        self.write_export(rows)
        code, out = self.run_main("prepare", self.export, self.write_vectors(rows), self.work)
        self.assertEqual(code, 0, out)

    def answer_all(self, verdicts):
        """묶음마다 결과 파일을 쓴다 — verdicts 에 없는 키는 일 종류의 기본 판정."""
        default = {"M": "Y", "P": "unrelated", "I": "Y", "O": "N", "Q": "unrelated"}
        for kind in ("members", "pairs", "issues"):
            for batch in sorted((self.work / kind).glob("b*.txt")):
                keys = [line.split(" | ")[0] for line in batch.read_text(encoding="utf-8").splitlines()]
                keys = [k for k in keys if k[:2] in ("M:", "P:", "I:", "O:", "Q:")]
                batch.with_suffix(".tsv").write_text("".join(f"{k}\t{verdicts.get(k, default[k[0]])}\n" for k in keys), encoding="utf-8")


class ExportChecks(Work):
    def test_unknown_event_and_duplicate_rejected(self):
        bad = dict(ARTICLES[0], event_id=99)
        self.write_export(ISSUES + EVENTS + [bad, ARTICLES[1], ARTICLES[1]])
        with self.assertRaises(ce.CheckError) as caught:
            ce.read_export(self.export)
        text = " ".join(caught.exception.problems)
        self.assertIn("목록에 없는 사건", text)
        self.assertIn("또 나옴", text)

    def test_missing_vector_rejected(self):
        rows = ISSUES + EVENTS + ARTICLES
        self.write_export(rows)
        code, out = self.run_main("prepare", self.export, self.write_vectors(rows, skip={202}), self.work)
        self.assertEqual(code, 1)
        self.assertIn("벡터가 없는 기사 1건", out)


class SplitMerge(Work):
    def test_split_then_merge_writes_every_task_once(self):
        self.prepared()
        code, out = self.run_main("split", self.work)
        self.assertEqual(code, 0, out)
        self.answer_all({"M:10:103": "B"})
        code, out = self.run_main("merge", self.work, self.gold)
        self.assertEqual(code, 0, out)
        gold = ce.read_gold(self.gold / "sonnet.tsv")
        self.assertEqual(gold["M:10:103"][0], "B")
        self.assertEqual(sum(1 for k in gold if k.startswith("M:")), len(ARTICLES))
        self.assertIn("P:10:20", gold)
        self.assertIn("O:20:1", gold)

    def test_merge_rejects_missing_unknown_and_bad_verdict(self):
        self.prepared()
        self.run_main("split", self.work)
        self.answer_all({})
        members = next((self.work / "members").glob("b*.tsv"))
        lines = members.read_text(encoding="utf-8").splitlines()
        lines = lines[1:] + ["M:10:999\tY", lines[1].split("\t")[0] + "\tmaybe"]
        members.write_text("\n".join(lines) + "\n", encoding="utf-8")
        code, out = self.run_main("merge", self.work, self.gold)
        self.assertEqual(code, 1)
        self.assertIn("빠진 일 1개", out)
        self.assertIn("묶음에 없는 키", out)
        self.assertIn("판정 · 칸이 틀림", out)
        self.assertFalse((self.gold / "sonnet.tsv").exists())

    def test_merge_refuses_to_overwrite(self):
        self.prepared()
        self.run_main("split", self.work)
        self.answer_all({})
        self.assertEqual(self.run_main("merge", self.work, self.gold)[0], 0)
        code, out = self.run_main("merge", self.work, self.gold)
        self.assertEqual(code, 1)
        self.assertIn("덮지 않는다", out)

    def test_split_refuses_non_empty_folder(self):
        self.prepared()
        self.assertEqual(self.run_main("split", self.work)[0], 0)
        code, out = self.run_main("split", self.work)
        self.assertEqual(code, 1)
        self.assertIn("빈 폴더", out)


class Human(Work):
    def test_record_last_answer_wins_and_rejects_other_words(self):
        self.assertEqual(self.run_main("record", self.gold, "M:10:101", "통과")[0], 0)
        self.assertEqual(self.run_main("record", self.gold, "M:10:101", "불통과")[0], 0)
        self.assertEqual(ce.read_gold(self.gold / "human.tsv")["M:10:101"][0], "N")
        code, out = self.run_main("record", self.gold, "M:10:101", "글쎄")
        self.assertEqual(code, 1)
        code, out = self.run_main("record", self.gold, "X:1:2", "통과")
        self.assertEqual(code, 1)

    def test_calib_sample_hides_sonnet_and_skips_done(self):
        self.prepared()
        ce.record(self.gold, "M:10:101", "통과", "calib")
        code, out = self.run_main("sample", self.work, self.gold, "calib")
        self.assertEqual(code, 0, out)
        queue = [json.loads(line) for line in (self.work / "queue-calib.jsonl").read_text(encoding="utf-8").splitlines()]
        keys = [item["key"] for item in queue]
        self.assertNotIn("M:10:101", keys)
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(all("Sonnet" not in item["text"] and "→" in item["text"] for item in queue))


class GoldPartitions(unittest.TestCase):
    def events(self):
        return {e["id"]: e for e in EVENTS}

    def articles(self):
        return {a["id"]: a for a in ARTICLES}

    def gold(self, **changes):
        gold = {f"M:{a['event_id']}:{a['id']}": "Y" for a in ARTICLES}
        gold.update({"I:1:10": "Y", "P:10:20": "unrelated", "O:20:1": "N"})
        gold.update({k.replace("_", ":"): v for k, v in changes.items()})
        return gold

    def test_letters_split_and_zero_stands_alone(self):
        article_gold, _ = ce.gold_partitions(self.events(), self.articles(), self.gold(M_10_103="B", M_20_202="0"))
        self.assertEqual(article_gold[101], article_gold[102])
        self.assertNotEqual(article_gold[101], article_gold[103])
        self.assertNotEqual(article_gold[201], article_gold[202])

    def test_same_event_pair_merges_events_and_issue(self):
        article_gold, event_gold = ce.gold_partitions(self.events(), self.articles(), self.gold(P_10_20="same_event"))
        self.assertEqual(article_gold[101], article_gold[201])
        self.assertEqual(event_gold[10], event_gold[20])

    def test_outside_event_joins_issue_by_o_or_same_issue(self):
        _, event_gold = ce.gold_partitions(self.events(), self.articles(), self.gold(O_20_1="Y"))
        self.assertEqual(event_gold[10], event_gold[20])
        _, event_gold = ce.gold_partitions(self.events(), self.articles(), self.gold(P_10_20="same_issue"))
        self.assertEqual(event_gold[10], event_gold[20])
        _, event_gold = ce.gold_partitions(self.events(), self.articles(), self.gold())
        self.assertNotEqual(event_gold[10], event_gold[20])

    def test_missing_verdict_rejected(self):
        gold = self.gold()
        del gold["M:10:101"]
        with self.assertRaises(ce.CheckError):
            ce.gold_partitions(self.events(), self.articles(), gold)

    def test_human_overrides_sonnet(self):
        with tempfile.TemporaryDirectory() as tmp:
            gold = pathlib.Path(tmp)
            (gold / "sonnet.tsv").write_text(
                ce.GOLD_HEADER + "\nM:10:101\tY\tsonnet\tcensus\tt\nM:10:102\tB\tsonnet\tcensus\tt\nP:10:20\tsame_issue\tsonnet\tcensus\tt\n",
                encoding="utf-8",
            )
            ce.record(gold, "M:10:101", "불통과", "verify")
            ce.record(gold, "M:10:102", "불통과", "verify")
            ce.record(gold, "P:10:20", "불통과", "verify")
            final = ce.final_gold(gold)
        self.assertEqual(final["M:10:101"], "N")  # Sonnet Y → 사람 불통과면 홀로
        self.assertEqual(final["M:10:102"], "B")  # Sonnet 이 다른 묶음을 줬으면 그 묶음 유지
        self.assertEqual(final["P:10:20"], "same_issue")  # 같은 사건은 아니지만 같은 흐름은 남김


if __name__ == "__main__":
    unittest.main()
