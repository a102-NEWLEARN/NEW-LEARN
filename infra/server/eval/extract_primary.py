"""EXTRACT 가 대표 사건을 고르는 정확도 채점 (Jira S15P31A102-206 후속, F06 동일 사건 기사 클러스터링)

무엇을 재나 — 기사에 대표 사건(`primaryCoreIndex`)이 있는지를 워커가 맞게 가르나.
대표 사건이 없다고 본 기사는 판정(MATCH_EVENT)을 아예 걸지 않아서(`docs/api-internal.md` 3절),
여기서 틀리면 그 기사는 어떤 사건 · 이슈에도 못 들어간다.

정답은 `gold/sonnet-extract-primary.tsv` 다. 이름 그대로 **Sonnet 이 단 silver** 이고 사람 검수는 없다
(README 1절의 gold · silver 구분). 기준은 운영 지시문(`ai/app/extract/prompt.py`)을 그대로 쓴다 —
요약본으로 재면 숫자가 달라진다. 2026-11-15 에 계약 한 줄 요약으로 쟀다가 2.4배 틀린 적이 있다.

🔴 표본이 **층화**다 — 워커가 건너뛴 기사와 고른 기사를 따로 뽑았다. 그래서 날것의 정밀도 · 재현율은
모집단 값이 아니다. 층마다 따로 재고 `--skip-share`(모집단에서 건너뛴 기사의 몫)로 다시 묶는다.

쓰는 법은 README 6절. 표준 라이브러리만 쓴다.
"""

import argparse
import math
import pathlib
import sys

GOLD_HEADER = "key\tverdict\tjudge\tstage\tat"
VERDICTS = frozenset({"Y", "N"})
Z = 1.96


def read_silver(path):
    """정답 파일을 {기사 번호: 판정} 으로. 키는 `E:<기사>`, 판정은 Y · N 뿐이다."""
    path = pathlib.Path(path)
    out = {}
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            line = line.rstrip("\r\n")
            if no == 1:
                if line != GOLD_HEADER:
                    raise ValueError(f"{path.name}: 첫 줄이 머리줄이 아님")
                continue
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) != 5:
                raise ValueError(f"{path.name} {no}번째 줄: 칸 수가 틀림")
            key, verdict = parts[0], parts[1]
            if not key.startswith("E:") or not key[2:].isdigit():
                raise ValueError(f"{path.name} {no}번째 줄: 키가 E:<기사 번호> 가 아님 — {key}")
            if verdict not in VERDICTS:
                raise ValueError(f"{path.name} {no}번째 줄: 판정은 Y · N 뿐 — {verdict}")
            out[int(key[2:])] = verdict
    return out


def read_worker(path):
    """운영에서 뽑은 워커 결과 — 한 줄에 「기사 번호<탭>1 또는 0」. 1 이 대표 사건을 고른 것이다."""
    path = pathlib.Path(path)
    out = {}
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            line = line.rstrip("\r\n")
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) != 2 or not parts[0].strip().isdigit() or parts[1].strip() not in ("0", "1"):
                raise ValueError(f"{path.name} {no}번째 줄: 「기사 번호<탭>0|1」 이 아님")
            out[int(parts[0].strip())] = parts[1].strip() == "1"
    return out


def wilson(x, n):
    """비율의 95% Wilson 구간. 0건 · 전건에서도 구간이 0 · 1 밖으로 안 나간다."""
    if n == 0:
        return 0.0, 0.0, 0.0
    p = x / n
    d = 1 + Z * Z / n
    center = (p + Z * Z / (2 * n)) / d
    half = Z / d * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n))
    return p, max(0.0, center - half), min(1.0, center + half)


def score(silver_path, worker_path, skip_share):
    """층마다 세고, 모집단에서 건너뛴 기사의 몫(skip_share)으로 정밀도 · 재현율 · F1 을 낸다.

    정밀도는 워커가 고른 기사 중 실제로 사건이 있는 비율이라 층 안에서 바로 나온다.
    재현율은 두 층을 모집단 비율로 다시 묶어야 나온다 — 놓친 몫이 건너뛴 층에만 있기 때문이다.
    """
    silver = read_silver(silver_path)
    worker = read_worker(worker_path)

    skip_total = skip_missed = keep_total = keep_wrong = missing = 0
    for key, verdict in silver.items():
        if key not in worker:
            missing += 1
            continue
        if worker[key]:
            keep_total += 1
            if verdict == "N":
                keep_wrong += 1
        else:
            skip_total += 1
            if verdict == "Y":
                skip_missed += 1

    miss_rate, miss_lo, miss_hi = wilson(skip_missed, skip_total)
    wrong_rate, wrong_lo, wrong_hi = wilson(keep_wrong, keep_total)

    precision = 1.0 - wrong_rate
    kept_share = 1.0 - skip_share
    found = kept_share * precision
    lost = skip_share * miss_rate
    recall = found / (found + lost) if (found + lost) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "skip_total": skip_total,
        "skip_missed": skip_missed,
        "miss_rate": miss_rate,
        "miss_lo": miss_lo,
        "miss_hi": miss_hi,
        "keep_total": keep_total,
        "keep_wrong": keep_wrong,
        "wrong_rate": wrong_rate,
        "wrong_lo": wrong_lo,
        "wrong_hi": wrong_hi,
        "missing": missing,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def report(result, skip_share, daily_skip=None):
    out = []
    out.append("== 층별 (표본 안 값, 구간은 95% Wilson) ==")
    out.append(
        "건너뛴 기사 중 사실은 사건 있음: %d/%d = %.1f%% (%.1f ~ %.1f%%)"
        % (result["skip_missed"], result["skip_total"], result["miss_rate"] * 100,
           result["miss_lo"] * 100, result["miss_hi"] * 100))
    out.append(
        "고른 기사 중 사실은 사건 없음:   %d/%d = %.1f%% (%.1f ~ %.1f%%)"
        % (result["keep_wrong"], result["keep_total"], result["wrong_rate"] * 100,
           result["wrong_lo"] * 100, result["wrong_hi"] * 100))
    if result["missing"]:
        out.append("🔴 워커 결과에 없어 못 센 기사 %d건" % result["missing"])
    out.append("")
    out.append("== 모집단으로 옮긴 값 (건너뛴 기사의 몫 %.1f%%) ==" % (skip_share * 100))
    out.append("정밀도 %.3f · 재현율 %.3f · F1 %.3f" % (result["precision"], result["recall"], result["f1"]))
    if daily_skip:
        out.append(
            "하루에 사건이 있는데 건너뛰는 기사: 약 %.0f건 (%.0f ~ %.0f)"
            % (daily_skip * result["miss_rate"], daily_skip * result["miss_lo"], daily_skip * result["miss_hi"]))
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description="EXTRACT 대표 사건 고르기 채점")
    parser.add_argument("silver", help="gold/sonnet-extract-primary.tsv")
    parser.add_argument("worker", help="운영에서 뽑은 「기사 번호<탭>0|1」 파일")
    parser.add_argument("--skip-share", type=float, required=True,
                        help="모집단에서 대표 사건이 빈 기사의 몫 (0 ~ 1)")
    parser.add_argument("--daily-skip", type=float, default=None,
                        help="하루 평균 건너뛰는 기사 수 — 주면 건수로도 적는다")
    args = parser.parse_args(argv)
    if not 0.0 <= args.skip_share <= 1.0:
        parser.error("--skip-share 는 0 ~ 1 이다")
    print(report(score(args.silver, args.worker, args.skip_share), args.skip_share, args.daily_skip))
    return 0


if __name__ == "__main__":
    sys.exit(main())
