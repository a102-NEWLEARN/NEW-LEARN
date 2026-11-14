"""공개 기사 수 · 언론사 수 문턱 시험 — 화면에 보일 몫만 채점하기 (Jira S15P31A102-206)

11-14 측정에서 「사건마다 공개 기사 3건 이상만 화면에 보이게 하면 이슈 쌍 정밀도가 오른다」가 나왔는데,
그 표는 임시 스크립트로 낸 것이라 다시 낼 수 없었다. 문턱을 `metrics` 에 넣어 명령 한 줄로 다시 나오게 한다.

문턱은 **채점 대상만** 줄인다. 정답 묶음은 그대로다 — 문턱을 넘은 사건의 기사가 정답에서 어디에 붙든
그 자리는 바뀌지 않는다. 기본값(1 · 1)은 아무것도 거르지 않아야 한다.

견본 기사 · 사건은 지어낸 값이고 기댓값은 손으로 셈했다(시험마다 주석).

표준 라이브러리만 쓴다: python3 -B -m unittest discover -s infra/ci
"""

import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parent.parent / "server" / "eval" / "clustering_eval.py"
_spec = importlib.util.spec_from_file_location("clustering_eval", SCRIPT)
ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ce)

NEWLINE = chr(10)
TAB = chr(9)


def event(no, issue, articles=None, presses=None):
    """사건 한 줄. articles 를 주면 목록에 공개 기사 수 · 언론사 수 칸이 있는 것이다."""
    row = {
        "kind": "event", "id": no, "issue_id": issue, "title": f"사건 {no}", "label": "가",
        "summary": None, "occurred_at": "2026-11-14T00:00:00+00:00", "role": "MAIN",
        "reacts_to_event_id": None,
    }
    if articles is not None:
        row["released_articles"] = articles
        row["released_presses"] = presses
    return row


def article(no, event_id):
    return {
        "kind": "article", "id": no, "url": f"https://example.com/{no}", "event_id": event_id,
        "title": f"제목 {no}", "lead": "앞부분", "published_at": "2026-11-14T01:00:00+00:00",
        "category": "P", "released": True,
    }


class ReadEventCounts(unittest.TestCase):
    """`사건id|공개기사수|언론사수` 파일 읽기 — 목록에 칸이 없던 때 운영에서 따로 받아 둔 수."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = pathlib.Path(tmp.name) / "event-press.txt"

    def write(self, *lines):
        self.path.write_text(NEWLINE.join(lines) + NEWLINE, encoding="utf-8")

    def test_reads_three_fields(self):
        self.write("1001|6|6", "1002|16|12", "")

        self.assertEqual(ce.read_event_counts(self.path), {1001: (6, 6), 1002: (16, 12)})

    def test_rejects_a_line_that_is_not_three_numbers(self):
        self.write("1001|6|6", "1002|열여섯|12")

        with self.assertRaises(ce.CheckError) as caught:
            ce.read_event_counts(self.path)

        self.assertIn("2번째 줄", " ".join(caught.exception.problems))

    def test_rejects_the_same_event_twice(self):
        self.write("1001|6|6", "1001|7|7")

        with self.assertRaises(ce.CheckError):
            ce.read_event_counts(self.path)


class EventCounts(unittest.TestCase):
    """목록 칸과 따로 받은 파일 가운데 무엇이 이기나."""

    def test_uses_the_export_columns(self):
        events = {10: event(10, 1, 4, 3), 20: event(20, 1, 2, 1)}

        self.assertEqual(ce.event_counts(events), {10: (4, 3), 20: (2, 1)})

    def test_an_event_without_the_columns_has_no_count(self):
        events = {10: event(10, 1, 4, 3), 20: event(20, 1)}

        self.assertEqual(ce.event_counts(events), {10: (4, 3)})

    def test_the_counts_file_wins_and_unknown_events_are_dropped(self):
        events = {10: event(10, 1, 4, 3), 20: event(20, 1)}

        counts = ce.event_counts(events, {10: (9, 9), 20: (2, 1), 99: (5, 5)})

        self.assertEqual(counts, {10: (9, 9), 20: (2, 1)}, "목록에 없는 사건 번호는 쓰지 않는다")


class PassingEvents(unittest.TestCase):
    """문턱을 넘는 사건 고르기."""

    def setUp(self):
        self.events = {10: event(10, 1), 20: event(20, 1), 30: event(30, None)}
        self.counts = {10: (4, 3), 20: (2, 1), 30: (1, 1)}

    def test_default_keeps_everything_even_without_counts(self):
        self.assertEqual(ce.passing_events(self.events, {}), {10, 20, 30})
        self.assertEqual(ce.passing_events(self.events, {}, 1, 1), {10, 20, 30})

    def test_min_articles_drops_the_small_events(self):
        self.assertEqual(ce.passing_events(self.events, self.counts, 3, 1), {10})
        self.assertEqual(ce.passing_events(self.events, self.counts, 2, 1), {10, 20})

    def test_min_publishers_drops_single_press_events(self):
        self.assertEqual(ce.passing_events(self.events, self.counts, 1, 2), {10})

    def test_both_thresholds_must_be_met(self):
        counts = dict(self.counts)
        counts[20] = (9, 1)

        self.assertEqual(ce.passing_events(self.events, counts, 3, 2), {10}, "기사는 넘고 언론사가 모자라면 뺀다")

    def test_an_event_without_a_count_cannot_pass_a_threshold(self):
        counts = {10: (4, 3)}

        self.assertEqual(ce.passing_events(self.events, counts, 3, 1), {10}, "수를 모르면 통과시키지 않는다")


class PressBucketErrors(unittest.TestCase):
    """이슈에 붙은 사건을 언론사 수로 갈라 `I` 판정이 `Y` 가 아닌 비율."""

    def test_buckets_by_publisher_count(self):
        events = {e: event(e, 1) for e in (10, 20, 30, 40)}
        counts = {10: (5, 1), 20: (5, 2), 30: (5, 3), 40: (5, 9)}
        gold = {"I:1:10": "0", "I:1:20": "Y", "I:1:30": "B", "I:1:40": "Y"}

        report = ce.issue_member_errors(events, gold, counts)

        table = report["by_publishers"]
        self.assertEqual((table["1"]["events"], table["1"]["not_y"], table["1"]["rate"]), (1, 1, 1.0))
        self.assertEqual((table["2"]["events"], table["2"]["not_y"], table["2"]["rate"]), (1, 0, 0.0))
        self.assertEqual((table["3+"]["events"], table["3+"]["not_y"]), (2, 1), "3곳 이상은 한 칸으로 모은다")
        self.assertAlmostEqual(table["3+"]["rate"], 0.5)

    def test_events_outside_an_issue_and_unjudged_events_are_left_out(self):
        events = {10: event(10, 1), 20: event(20, None), 30: event(30, 1)}
        counts = {10: (5, 3), 20: (5, 3), 30: (5, 3)}

        report = ce.issue_member_errors(events, {"I:1:10": "Y"}, counts)

        self.assertEqual(report["by_publishers"]["3+"]["events"], 1, "이슈 밖 사건 · 판정 없는 사건은 세지 않는다")

    def test_events_without_counts_are_reported_separately(self):
        events = {10: event(10, 1), 20: event(20, 1)}
        gold = {"I:1:10": "Y", "I:1:20": "0"}

        report = ce.issue_member_errors(events, gold, {10: (5, 3)})

        self.assertEqual(report["no_counts"], 1)
        self.assertEqual(report["by_publishers"]["3+"]["events"], 1)

    def test_an_empty_bucket_has_no_rate(self):
        report = ce.issue_member_errors({}, {}, {})

        self.assertIsNone(report["by_publishers"]["1"]["rate"])


class MetricsThreshold(unittest.TestCase):
    """`metrics` 를 끝까지 돌린다.

    견본: 사건 10(이슈 1 · 기사 101~104 · 공개 4건 · 언론사 3곳) · 사건 20(이슈 1 · 기사 201~202 · 2건 · 1곳)
    · 사건 30(이슈 밖 · 기사 301 · 1건 · 1곳). 정답은 기사 104 를 사건 10 에서 떼고(`M:10:104` = `B`),
    사건 20 을 이슈 1 에서 뺀다(`I:1:20` = `0`).
    """

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = pathlib.Path(tmp.name)
        self.work = self.root / "work"
        self.gold = self.root / "gold"
        self.work.mkdir()
        self.gold.mkdir()

    def write_world(self, columns=True):
        rows = [{"kind": "issue", "id": 1, "title": "이슈", "summary": None, "categories": ["P"]}]
        rows += [
            event(10, 1, *((4, 3) if columns else (None, None))),
            event(20, 1, *((2, 1) if columns else (None, None))),
            event(30, None, *((1, 1) if columns else (None, None))),
        ]
        rows += [article(no, 10) for no in (101, 102, 103, 104)]
        rows += [article(no, 20) for no in (201, 202)]
        rows += [article(301, 30)]
        export = self.root / "export.jsonl"
        export.write_text("".join(json.dumps(r, ensure_ascii=False) + NEWLINE for r in rows), encoding="utf-8")
        (self.work / "prep.json").write_text(
            json.dumps({"export": str(export), "random_pairs": [], "same_day_outside": 0}), encoding="utf-8"
        )
        verdicts = [
            ("M:10:101", "Y"), ("M:10:102", "Y"), ("M:10:103", "Y"), ("M:10:104", "B"),
            ("M:20:201", "Y"), ("M:20:202", "Y"), ("M:30:301", "Y"),
            ("I:1:10", "Y"), ("I:1:20", "0"),
        ]
        lines = [ce.GOLD_HEADER] + [TAB.join([k, v, "sonnet", "census", "2026-11-14T10:00:00+09:00"]) for k, v in verdicts]
        (self.gold / "sonnet.tsv").write_text(NEWLINE.join(lines) + NEWLINE, encoding="utf-8")

    def run_metrics(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = ce.main(["metrics", str(self.work), str(self.gold), "--bootstrap", "0", *[str(a) for a in args]])
        report = json.loads((self.gold / "metrics.json").read_text(encoding="utf-8")) if code == 0 else None
        return code, out.getvalue(), report

    def test_default_scores_every_article(self):
        # 시스템 쌍 C(4,2)+C(2,2)=7 · 정답 쌍 C(3,2)+1=4 · 맞은 쌍 3+1=4 → 정밀 4/7 · 재현 1.0
        self.write_world()

        code, out, report = self.run_metrics()

        self.assertEqual(code, 0, out)
        self.assertEqual(report["event"]["n"], 7)
        self.assertAlmostEqual(report["event"]["pair_precision"], 4 / 7)
        self.assertAlmostEqual(report["event"]["pair_recall"], 1.0)
        self.assertEqual(report["threshold"]["min_articles"], 1)
        self.assertEqual(report["threshold"]["min_publishers"], 1)
        self.assertEqual(report["threshold"]["events_kept"], 3)

    def test_min_articles_scores_only_the_passing_event(self):
        # 사건 10 만 남는다 → 시스템 쌍 6 · 정답 쌍 3 · 맞은 쌍 3 → 정밀 0.5 · 재현 1.0
        self.write_world()

        code, out, report = self.run_metrics("--min-articles", 3)

        self.assertEqual(code, 0, out)
        self.assertEqual(report["event"]["n"], 4, "사건 20 · 30 의 기사는 채점하지 않는다")
        self.assertAlmostEqual(report["event"]["pair_precision"], 0.5)
        self.assertAlmostEqual(report["event"]["pair_recall"], 1.0)
        self.assertEqual(report["threshold"]["events_kept"], 1)
        self.assertEqual(report["threshold"]["events_total"], 3)
        self.assertEqual(report["threshold"]["articles_kept"], 4)

    def test_min_publishers_scores_only_the_passing_event(self):
        self.write_world()

        code, out, report = self.run_metrics("--min-publishers", 2)

        self.assertEqual(code, 0, out)
        self.assertEqual(report["event"]["n"], 4)
        self.assertAlmostEqual(report["event"]["pair_precision"], 0.5)

    def test_the_gold_partition_is_not_reduced(self):
        # 문턱은 채점 대상만 줄인다 — 기사 104 는 정답에서 여전히 사건 10 밖이라 정밀도가 1 이 되지 않는다
        self.write_world()

        _, out, report = self.run_metrics("--min-articles", 3)

        self.assertLess(report["event"]["pair_precision"], 1.0, out)
        self.assertEqual(report["gold_counts"], self.run_metrics()[2]["gold_counts"], "정답은 그대로다")

    def test_the_issue_metric_uses_the_same_threshold(self):
        # 문턱 없이: 운영이 사건 10 · 20 을 이슈 1 에 넣었고 정답은 20 을 뺐다 → 쌍 1개가 다 틀림(정밀 0)
        # 문턱 3건: 사건 10 만 남아 쌍이 없다 → 정밀 · 재현 1
        self.write_world()

        _, out, loose = self.run_metrics()
        _, _, tight = self.run_metrics("--min-articles", 3)

        self.assertEqual(loose["issue"]["n"], 3, out)
        self.assertAlmostEqual(loose["issue"]["pair_precision"], 0.0)
        self.assertEqual(tight["issue"]["n"], 1)
        self.assertAlmostEqual(tight["issue"]["pair_precision"], 1.0)

    def test_counts_can_come_from_a_file_when_the_export_has_no_columns(self):
        self.write_world(columns=False)
        counts = self.root / "event-press.txt"
        counts.write_text(NEWLINE.join(["10|4|3", "20|2|1", "30|1|1"]) + NEWLINE, encoding="utf-8")

        code, out, report = self.run_metrics("--min-articles", 3, "--event-counts", counts)

        self.assertEqual(code, 0, out)
        self.assertEqual(report["event"]["n"], 4)
        self.assertEqual(report["threshold"]["events_kept"], 1)

    def test_a_threshold_without_any_counts_keeps_nothing_and_stops(self):
        self.write_world(columns=False)

        code, out, _ = self.run_metrics("--min-articles", 3)

        self.assertEqual(code, 1)
        self.assertIn("문턱", out)

    def test_events_without_counts_are_reported(self):
        self.write_world(columns=False)
        counts = self.root / "event-press.txt"
        counts.write_text("10|4|3" + NEWLINE, encoding="utf-8")

        code, out, report = self.run_metrics("--min-articles", 3, "--event-counts", counts)

        self.assertEqual(code, 0, out)
        self.assertEqual(report["threshold"]["events_without_counts"], 2)
        self.assertIn("수를 모르는 사건 2", out)

    def test_the_error_table_is_printed_and_stored(self):
        self.write_world()

        code, out, report = self.run_metrics()

        self.assertEqual(code, 0, out)
        table = report["issue_member_errors"]["by_publishers"]
        self.assertEqual((table["1"]["events"], table["1"]["not_y"]), (1, 1), "사건 20 은 언론사 1곳이고 이슈에서 빠졌다")
        self.assertEqual((table["3+"]["events"], table["3+"]["not_y"]), (1, 0), "사건 10 은 언론사 3곳이고 맞다")
        self.assertIn("이슈 붙임 오류율", out)

    def test_by_category_and_by_size_follow_the_threshold(self):
        # 문턱 없이: 분야 P 에 기사 7건 · 묶음 크기 칸에도 7건. 문턱 3건: 둘 다 사건 10 의 기사 4건만
        self.write_world()

        _, out, loose = self.run_metrics()
        _, _, tight = self.run_metrics("--min-articles", 3)

        self.assertEqual(loose["by_category"]["P"]["n"], 7, out)
        self.assertEqual(tight["by_category"]["P"]["n"], 4)
        self.assertEqual(sorted(tight["by_size"]), ["5-9"], "남은 기사는 4건이라 가장 작은 칸 하나뿐")
        self.assertEqual(tight["by_size"]["5-9"]["n"], 4)


if __name__ == "__main__":
    unittest.main()
