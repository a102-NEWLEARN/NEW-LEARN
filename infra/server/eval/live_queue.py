#!/usr/bin/env python3
"""실시간 판정 몫만 골라 `queue-live.jsonl` 로 (Jira S15P31A102-206).

적재분(오프라인 임베딩 묶기)과 **켠 뒤 판정기가 직접 만든 묶음**은 성적이 다를 수 있다.
둘을 갈라 재려면 판정할 일 가운데 실시간 몫만 고르면 된다 — `clustering_eval.py` 는
`queue-<단계>.jsonl` 이 있으면 그 키가 든 블록만 나눈다(`selected_blocks`).

실시간 몫의 뜻
- `M:<사건>:<기사>` — **기사**가 켠 뒤 사건에 붙은 것
- `P:<사건>:<사건>` — 둘 중 하나가 켠 뒤 생긴 사건
- `I:<이슈>:<사건>` · `O:<사건>:<이슈>` — **사건**이 켠 뒤 생긴 것
- `Q:<이슈>:<이슈>` — 둘 중 하나가 켠 뒤 생긴 이슈

쓰는 법

    python3 infra/server/eval/live_queue.py --workdir work \
      --articles live-articles.txt --events live-events.txt --issues live-issues.txt

표준 라이브러리만 쓴다.
"""

import argparse
import importlib.util
import io
import json
import pathlib
import sys

_spec = importlib.util.spec_from_file_location(
    "clustering_eval", pathlib.Path(__file__).resolve().parent / "clustering_eval.py"
)
ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ce)


def read_ids(path):
    if path is None:
        return set()
    out = set()
    with io.open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if line:
                out.add(int(line))
    return out


def is_live(key, articles, events, issues, tasks=None):
    task, a, b = ce.parse_key(key)
    if tasks is not None and task not in tasks:
        return False
    if task == "M":
        return b in articles
    if task == "P":
        return a in events or b in events
    if task == "I":
        return b in events
    if task == "O":
        return a in events
    if task == "Q":
        return a in issues or b in issues
    raise ValueError(f"모르는 일 종류: {key}")


def build(workdir, articles, events, issues, tasks=None):
    workdir = pathlib.Path(workdir)
    prep, issue_rows, event_rows, article_rows = ce.load_work(workdir)
    kinds = ce.build_blocks(prep, issue_rows, event_rows, article_rows)
    picked, counts = [], {}
    for blocks in kinds.values():
        for block in blocks:
            for key in block["keys"]:
                if is_live(key, articles, events, issues, tasks):
                    picked.append(key)
                    counts[key.split(":")[0]] = counts.get(key.split(":")[0], 0) + 1
    if not picked:
        raise ce.CheckError(["실시간 몫이 하나도 없다 — 번호 목록과 --tasks 를 확인한다"])
    path = workdir / "queue-live.jsonl"
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        for key in picked:
            f.write(json.dumps({"key": key}, ensure_ascii=False) + "\n")
    return {"path": str(path), "total": len(picked), "by_task": counts}


def main(argv=None):
    p = argparse.ArgumentParser(description="실시간 판정 몫만 골라 queue-live.jsonl")
    p.add_argument("--workdir", required=True)
    p.add_argument("--articles", required=True, help="켠 뒤 사건에 붙은 기사 번호(한 줄에 하나)")
    p.add_argument("--events", required=True, help="켠 뒤 생긴 사건 번호")
    p.add_argument("--issues", help="켠 뒤 생긴 이슈 번호")
    p.add_argument(
        "--tasks",
        help="고를 일 종류를 쉼표로 — M(기사-사건) P(사건 쌍) I(사건-이슈) O(이슈 밖 사건) Q(이슈 쌍). "
        "기본은 전부. 이슈 밖 사건(O)은 보정에서 사람과 LLM 의 κ 가 음수였다 — 전수로 돌릴 값이 아니다",
    )
    a = p.parse_args(argv)
    try:
        tasks = None
        if a.tasks:
            tasks = {t.strip().upper() for t in a.tasks.split(",") if t.strip()}
            unknown = tasks - set(ce.TASKS)
            if unknown:
                raise ce.CheckError([f"모르는 일 종류: {', '.join(sorted(unknown))}"])
        report = build(a.workdir, read_ids(a.articles), read_ids(a.events), read_ids(a.issues), tasks)
    except ce.CheckError as e:
        for line in e.problems:
            print(line, file=sys.stderr)
        return 1
    order = ["M", "P", "I", "O", "Q"]
    parts = " · ".join(f"{ce.TASKS[t]} {report['by_task'][t]}" for t in order if t in report["by_task"])
    print(f"실시간 몫 {report['total']}개 → {report['path']}")
    print(f"  {parts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
