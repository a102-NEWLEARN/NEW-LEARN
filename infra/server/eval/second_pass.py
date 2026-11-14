#!/usr/bin/env python3
"""두 번째 사람이 겹쳐 볼 판정지 (Jira S15P31A102-206).

지금 정답은 **사람 1명**이 만들었다. 그래서 사람과 LLM 의 κ 0.666 이 좋은 값인지 나쁜 값인지
견줄 기준이 없다 — 이 일(「같은 사건인가」)은 사람끼리도 잘 갈리기 때문이다.
이미 사람이 본 검수 몫에서 얼마를 뽑아 **다른 사람이 같은 질문에 답하게** 하면
사람끼리의 일치도가 나오고, 그제야 LLM 의 κ 를 읽을 수 있다.

내는 것은 **종이 한 장**이다 — 받는 사람은 이 저장소도, 도구도 필요 없다.
질문에는 먼저 본 사람의 답도, LLM 의 답도 넣지 않는다.

쓰는 법

    python3 infra/server/eval/second_pass.py --workdir work --gold infra/server/eval/gold \\
      --count 50 --out second-pass.md

답이 돌아오면 `--answers` 로 읽어 일치도를 낸다.

    python3 infra/server/eval/second_pass.py --workdir work --gold infra/server/eval/gold \\
      --answers second-pass-답.tsv

표준 라이브러리만 쓴다.
"""

import argparse
import collections
import importlib.util
import io
import pathlib
import random
import sys

_spec = importlib.util.spec_from_file_location(
    "clustering_eval", pathlib.Path(__file__).resolve().parent / "clustering_eval.py"
)
ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ce)

SEED = 20261114
# 답은 `clustering_eval.binary` 와 같은 모양(통과 1 · 불통과 0)으로 맞춘다 — κ 가 그 모양을 받는다
WORDS = {"통과": 1, "불통과": 0, "Y": 1, "N": 0}


def first_pass(golddir, stage="verify"):
    """먼저 본 사람의 판정 — {키: Y/N}. 섞이지 않게 stage 로 거른다."""
    rows = {}
    path = pathlib.Path(golddir) / "human.tsv"
    with io.open(path, encoding="utf-8") as f:
        head = next(f).rstrip("\n").split("\t")
        want = {name: head.index(name) for name in ("key", "verdict", "stage")}
        for line in f:
            if not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if cols[want["stage"]] != stage:
                continue
            rows[cols[want["key"]]] = ce.binary(cols[want["key"]], cols[want["verdict"]])
    return rows


def pick(keys, count, seed=SEED):
    """일 종류별로 고르게 — 한 종류만 쏠리면 종류별 일치도를 못 본다."""
    by_task = collections.defaultdict(list)
    for key in sorted(keys):
        by_task[key.split(":")[0]].append(key)
    rng = random.Random(seed)
    picked, order = [], sorted(by_task)
    while len(picked) < count and any(by_task[t] for t in order):
        for task in order:
            if not by_task[task] or len(picked) >= count:
                continue
            bucket = by_task[task]
            picked.append(bucket.pop(rng.randrange(len(bucket))))
    return sorted(picked)


def sheet(workdir, keys):
    prep, issues, events, articles = ce.load_work(pathlib.Path(workdir))
    anchors = {int(e): ids for e, ids in prep["anchors"].items()}
    lines = [
        "# 같은 사건인가 — 두 번째 검수 50건",
        "",
        "먼저 본 사람의 답도, AI 의 답도 적혀 있지 않습니다. **보신 대로** 答해 주세요.",
        "",
        "판정 기준은 「뉴런 사건 · 이슈 판정 기준 v4」입니다 — **같은 주체 · 같은 때 · 같은 행위**면 같은 사건입니다.",
        "말한 사람이 다르면(예: A 의원 발언 · B 의원 발언) 같은 이슈라도 **다른 사건**입니다.",
        "",
        "각 문항 끝의 `답:` 뒤에 **통과** 또는 **불통과** 만 적어 주세요. 애매하면 그대로 두고 메모를 남겨 주세요.",
        "",
        "---",
        "",
    ]
    for n, key in enumerate(keys, 1):
        lines.append(f"## {n}. ({key})")
        lines.append("")
        lines.append(ce.question(key, issues, events, articles, anchors))
        lines.append("")
        lines.append("답: ")
        lines.append("")
    return "\n".join(lines) + "\n"


def read_answers(path):
    """`키<탭>통과` 또는 판정지에서 오려 낸 `답:` 줄 — 둘 다 받는다."""
    out, pending = {}, None
    with io.open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("##") and "(" in line and ")" in line:
                pending = line[line.rindex("(") + 1 : line.rindex(")")]
                continue
            if line.startswith("답:"):
                word = line[2:].strip().strip(":").strip()
                if pending and word:
                    out[pending] = WORDS.get(word, word)
                pending = None
                continue
            if "\t" in line:
                key, word = line.split("\t", 1)
                word = word.strip()
                if word:
                    out[key.strip()] = WORDS.get(word, word)
    unknown = {k: v for k, v in out.items() if v not in (0, 1)}
    if unknown:
        raise ce.CheckError([f"모르는 답: {k} = {v!r}" for k, v in sorted(unknown.items())])
    return out


def compare(golddir, answers, stage="verify"):
    first = first_pass(golddir, stage)
    missing = sorted(set(answers) - set(first))
    if missing:
        raise ce.CheckError([f"먼저 본 사람이 판정하지 않은 키: {', '.join(missing[:5])}"])
    # κ 는 [(먼저 본 사람, 두 번째 사람, 가중치)] 를 받는다 — 겹쳐 보기는 모두 같은 무게다
    pairs = [(first[k], answers[k], 1.0) for k in sorted(answers)]
    by_task = collections.defaultdict(list)
    for key in sorted(answers):
        by_task[key.split(":")[0]].append((first[key], answers[key], 1.0))
    whole = ce.kappa(pairs)
    return {
        "n": whole["n"],
        "agree": whole["agreement"],
        "kappa": whole["kappa"],
        "by_task": {t: ce.kappa(v) for t, v in by_task.items()},
    }


def main(argv=None):
    p = argparse.ArgumentParser(description="두 번째 사람 검수 — 판정지 만들기 · 일치도 내기")
    p.add_argument("--workdir", required=True)
    p.add_argument("--gold", required=True, help="gold 폴더(human.tsv 가 있는 곳)")
    p.add_argument("--stage", default="verify", help="먼저 본 사람의 단계(기본 verify)")
    p.add_argument("--count", type=int, default=50)
    p.add_argument("--out", help="만들 판정지(.md)")
    p.add_argument("--answers", help="돌아온 답 — 이걸 주면 일치도를 낸다")
    a = p.parse_args(argv)
    try:
        if a.answers:
            report = compare(a.gold, read_answers(a.answers), a.stage)
            print(f"겹쳐 본 {report['n']}건 — 사람끼리 일치 {report['agree']:.3f} · κ {report['kappa']:.3f}")
            for task in sorted(report["by_task"]):
                r = report["by_task"][task]
                print(f"  {ce.TASKS[task]} {r['n']}건 — 일치 {r['agreement']:.3f} · κ {r['kappa']:.3f}")
            return 0
        if not a.out:
            raise ce.CheckError(["--out 이나 --answers 가 있어야 한다"])
        keys = pick(first_pass(a.gold, a.stage), a.count)
        pathlib.Path(a.out).write_text(sheet(a.workdir, keys), encoding="utf-8", newline="\n")
        counts = collections.Counter(k.split(":")[0] for k in keys)
        print(f"{len(keys)}건 → {a.out}")
        print("  " + " · ".join(f"{ce.TASKS[t]} {counts[t]}" for t in sorted(counts)))
    except ce.CheckError as e:
        for line in e.problems:
            print(line, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
