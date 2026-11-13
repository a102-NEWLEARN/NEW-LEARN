#!/usr/bin/env python3
"""사건 · 이슈 묶기 정확도 평가 (Jira S15P31A102-206)

운영에서 읽기만으로 뽑은 목록(eval_export.sql)과 AI 팀 벡터 파일로 판정할 일을 만들고,
Sonnet · 사람 판정을 검사해 정답(gold/)으로 모은 뒤 운영 묶음과 견줘 지표를 낸다. 절차는 README.md.

    python -X utf8 -B infra/server/eval/clustering_eval.py prepare <목록.jsonl> <벡터.sqlite> <작업 폴더>
    python -X utf8 -B infra/server/eval/clustering_eval.py split   <작업 폴더>
    python -X utf8 -B infra/server/eval/clustering_eval.py merge   <작업 폴더> <정답 폴더>
    python -X utf8 -B infra/server/eval/clustering_eval.py sample  <작업 폴더> <정답 폴더> calib|verify
    python -X utf8 -B infra/server/eval/clustering_eval.py record  <정답 폴더> <일 키> 통과|불통과 [--stage …]
    python -X utf8 -B infra/server/eval/clustering_eval.py agree   <정답 폴더> [--stage …]
    python -X utf8 -B infra/server/eval/clustering_eval.py metrics <작업 폴더> <정답 폴더>

판정할 일(task) 다섯 가지 — 키는 「일:앞:뒤」, 정답 파일 한 줄이 일 하나다.
    M:<사건>:<기사>   이 기사가 이 사건에 맞나        Y · 0 · B ~ Z(같은 글자 = 사건 안의 다른 한 사건)
    P:<사건>:<사건>   두 사건이 같은 사건인가         same_event · same_issue · unrelated
    I:<이슈>:<사건>   이 사건이 이 이슈 흐름에 드나   Y · 0 · B ~ Z
    O:<사건>:<이슈>   이슈 밖 사건이 이 이슈에 드나   Y · N
    Q:<이슈>:<이슈>   두 이슈가 한 흐름인가           same_issue · unrelated

정답 폴더에는 번호와 판정만 둔다. 기사 글은 작업 폴더(저장소 밖)에만 있다. 제목은 출력하지 않는다 — 명령 기록에 남지 않게.
표준 라이브러리만 쓴다.
"""

import argparse
import datetime
import json
import math
import pathlib
import random
import re
import sqlite3
import sys
from array import array
from collections import Counter, defaultdict

KST = datetime.timezone(datetime.timedelta(hours=9))
DIM = 1024
WINDOW_DAYS = 3  # 놓친 합침 후보를 찾는 발생일 범위(±)
TOP_TITLE = 3  # 제목 글자 두 개씩 겹침 상위
TOP_VECTOR = 3  # 벡터 중심 코사인 상위
TOP_ISSUE = 3  # 이슈 밖 사건 · 이슈 쌍 후보
TITLE_FLOOR = 0.10  # 후보로 남길 제목 겹침 하한 — 이 아래이면서
VECTOR_FLOOR = 0.60  # 코사인도 이 아래인 후보는 뺀다(같은 날 무작위 쌍 코사인 중앙값 0.28, 11-13 잼)
RANDOM_SAME_DAY = 40  # 후보 밖 남은 놓침을 어림할 같은 날 사건 쌍
ANCHORS = 3  # 사건마다 보여 줄 대표 기사(중심에 가까운 순)
LOW_QUANTILE = 0.10  # 「중심에서 먼」 기사 · 사건 층(아래 10%)
LEAD_CHARS = 100
MEMBER_BATCH_ARTICLES = 600
# 본문 앞에 붙는 배포 안내문 — 판정에 쓸모없고 묶음만 키운다
BOILERPLATE_RE = re.compile(r"ⓒ\s*SBS & SBS i.*?재배포 금지\s*▲?")
PAIR_BATCH = 150
BOOTSTRAP = 1000
SEED = 20261113

TASKS = {
    "M": "member",
    "P": "pair",
    "I": "issue_member",
    "O": "issue_out",
    "Q": "issue_pair",
}
GROUP_VERDICTS = frozenset(["Y", "0"] + [chr(c) for c in range(ord("B"), ord("Z") + 1)])
VERDICTS = {
    "M": GROUP_VERDICTS,
    "P": frozenset({"same_event", "same_issue", "unrelated"}),
    "I": GROUP_VERDICTS,
    "O": frozenset({"Y", "N"}),
    "Q": frozenset({"same_issue", "unrelated"}),
}
HUMAN_WORDS = {"통과": "Y", "불통과": "N"}
GOLD_HEADER = "key\tverdict\tjudge\tstage\tat"


class CheckError(Exception):
    """검사에 걸렸다 — 까닭 목록을 들고 있다."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = problems


# ---------------------------------------------------------------- 읽기


def read_export(path):
    """목록을 이슈 · 사건 · 기사 사전으로 읽고 서로 맞는지 본다."""
    issues, events, articles, problems = {}, {}, {}, []
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                kind, key = row["kind"], row["id"]
            except (ValueError, KeyError, TypeError):
                problems.append(f"{no}번째 줄: 읽을 수 없음")
                continue
            table = {"issue": issues, "event": events, "article": articles}.get(kind)
            if table is None:
                problems.append(f"{no}번째 줄: 모르는 kind")
            elif key in table:
                problems.append(f"{no}번째 줄: 같은 {kind} 번호가 또 나옴")
            else:
                table[key] = row
    for event in events.values():
        if event.get("issue_id") is not None and event["issue_id"] not in issues:
            problems.append(f"사건 {event['id']}: 목록에 없는 이슈를 가리킴")
    for article in articles.values():
        if article.get("event_id") not in events:
            problems.append(f"기사 {article['id']}: 목록에 없는 사건을 가리킴")
    if problems:
        raise CheckError(problems)
    return issues, events, articles


def read_vectors(path, urls):
    """벡터 파일에서 목록에 있는 URL 의 벡터만 읽는다 — {URL: array('f')}."""
    connection = sqlite3.connect(f"file:{pathlib.Path(path).as_posix()}?mode=ro", uri=True)
    try:
        vectors = {}
        for url, blob in connection.execute("select url, vector from vectors"):
            if url in urls:
                vector = array("f")
                vector.frombytes(blob)
                if len(vector) != DIM:
                    raise CheckError([f"벡터 길이 {len(vector)} — {DIM} 이어야 함"])
                vectors[url] = vector
    finally:
        connection.close()
    missing = len(urls - vectors.keys())
    if missing:
        raise CheckError([f"벡터가 없는 기사 {missing}건"])
    return vectors


# ---------------------------------------------------------------- 벡터 · 후보


def dot(left, right):
    return math.fsum(a * b for a, b in zip(left, right))


def centroid(vectors):
    total = [0.0] * DIM
    for vector in vectors:
        for i, value in enumerate(vector):
            total[i] += value
    norm = math.sqrt(math.fsum(value * value for value in total)) or 1.0
    return [value / norm for value in total]


def kst_day(text):
    return datetime.datetime.fromisoformat(text).astimezone(KST).date()


def bigrams(text):
    squeezed = "".join(text.split())
    return {squeezed[i : i + 2] for i in range(len(squeezed) - 1)}


def jaccard(left, right):
    union = len(left | right)
    return len(left & right) / union if union else 0.0


def top(scores, count):
    """[(점수, 번호)] 에서 점수가 큰 순으로 count 개 번호 — 점수가 같으면 번호가 작은 쪽."""
    return [key for _, key in sorted(scores, key=lambda item: (-item[0], item[1]))[:count]]


def prepare(export, vectors_path, workdir):
    issues, events, articles = read_export(export)
    vectors = read_vectors(vectors_path, {a["url"] for a in articles.values()})
    members = defaultdict(list)
    for article in articles.values():
        members[article["event_id"]].append(article["id"])

    event_centroid, article_cos, anchors = {}, {}, {}
    for event_id, ids in members.items():
        center = centroid(vectors[articles[i]["url"]] for i in ids)
        event_centroid[event_id] = center
        for i in ids:
            article_cos[i] = dot(vectors[articles[i]["url"]], center)
        anchors[event_id] = top([(article_cos[i], i) for i in ids], ANCHORS)

    day = {e: kst_day(events[e]["occurred_at"]) for e in events}
    grams = {e: bigrams(f"{events[e]['title']} {events[e]['label']}") for e in events}
    ordered = sorted(events)
    pairs = set()
    for e in ordered:
        near = [o for o in ordered if o != e and abs((day[o] - day[e]).days) <= WINDOW_DAYS]
        title_sim = {o: jaccard(grams[e], grams[o]) for o in near}
        vector_sim = {o: dot(event_centroid[e], event_centroid[o]) for o in near}
        by_title = top([(v, o) for o, v in title_sim.items()], TOP_TITLE)
        by_vector = top([(v, o) for o, v in vector_sim.items()], TOP_VECTOR)
        for o in by_title + by_vector:
            if title_sim[o] >= TITLE_FLOOR or vector_sim[o] >= VECTOR_FLOOR:
                pairs.add((min(e, o), max(e, o)))
    same_day = [(a, b) for i, a in enumerate(ordered) for b in ordered[i + 1 :] if day[a] == day[b] and (a, b) not in pairs]
    rng = random.Random(SEED)
    random_pairs = sorted(rng.sample(same_day, min(RANDOM_SAME_DAY, len(same_day))))

    issue_events = defaultdict(list)
    for event in events.values():
        if event.get("issue_id") is not None:
            issue_events[event["issue_id"]].append(event["id"])
    issue_centroid = {i: centroid(event_centroid[e] for e in ids) for i, ids in issue_events.items()}
    event_issue_cos = {e: dot(event_centroid[e], issue_centroid[i]) for i, ids in issue_events.items() for e in ids}
    outside = sorted(e for e in events if events[e].get("issue_id") is None)
    out_candidates = {
        e: top([(dot(event_centroid[e], issue_centroid[i]), i) for i in issue_centroid], TOP_ISSUE) for e in outside
    }
    issue_pairs = set()
    for i in issue_centroid:
        for o in top([(dot(issue_centroid[i], issue_centroid[o]), o) for o in issue_centroid if o != i], TOP_ISSUE):
            issue_pairs.add((min(i, o), max(i, o)))

    workdir.mkdir(parents=True, exist_ok=True)
    prep = {
        "export": str(export),
        "anchors": {str(e): ids for e, ids in anchors.items()},
        "article_cos": {str(a): round(c, 6) for a, c in article_cos.items()},
        "event_issue_cos": {str(e): round(c, 6) for e, c in event_issue_cos.items()},
        "event_pairs": sorted(pairs),
        "random_pairs": random_pairs,
        # 후보 밖 같은 날 사건 쌍 수 — 무작위 쌍의 같은 사건 비율 × 이 수 = 후보가 놓친 합침 어림
        "same_day_outside": len(same_day),
        "out_candidates": {str(e): ids for e, ids in out_candidates.items()},
        "issue_pairs": sorted(issue_pairs),
    }
    (workdir / "prep.json").write_text(json.dumps(prep, ensure_ascii=False), encoding="utf-8")
    print(
        f"사건 {len(events)} · 기사 {len(articles)} · 사건 쌍 후보 {len(pairs)} + 같은 날 무작위 {len(random_pairs)}"
        f" · 이슈 밖 사건 {len(outside)} · 이슈 쌍 후보 {len(issue_pairs)}"
    )


def load_work(workdir):
    prep = json.loads((workdir / "prep.json").read_text(encoding="utf-8"))
    issues, events, articles = read_export(pathlib.Path(prep["export"]))
    return prep, issues, events, articles


# ---------------------------------------------------------------- Sonnet 묶음 나누기 · 모으기


def one_line(text, limit=None):
    text = " ".join(BOILERPLATE_RE.sub(" ", text or "").split())
    return text if limit is None or len(text) <= limit else text[:limit] + "…"


def event_head(event, articles, anchors):
    lines = [f"사건 {event['id']} | {kst_day(event['occurred_at'])} | {one_line(event['title'])} — {one_line(event['label'])}"]
    lines += [f"  대표 기사: {one_line(articles[a]['title'])}" for a in anchors]
    return lines


def build_blocks(prep, issues, events, articles):
    """판정할 일을 묶음 종류별 블록으로 — 블록은 {lines, keys, n}. 나누기와 모으기가 같은 블록을 쓴다."""
    anchors = {int(e): ids for e, ids in prep["anchors"].items()}
    members = defaultdict(list)
    for article in sorted(articles.values(), key=lambda a: (a["published_at"], a["id"])):
        members[article["event_id"]].append(article)
    kinds = {"members": [], "pairs": [], "issues": []}

    for e in sorted(members):
        lines, keys = ["### 일 M"] + event_head(events[e], articles, anchors[e]), []
        for a in members[e]:
            keys.append(f"M:{e}:{a['id']}")
            lines.append(f"{keys[-1]} | {kst_day(a['published_at'])} | {one_line(a['title'])} | {one_line(a['lead'], LEAD_CHARS)}")
        kinds["members"].append({"lines": lines, "keys": keys, "n": len(keys)})

    for a, b in prep["event_pairs"] + prep["random_pairs"]:
        key = f"P:{a}:{b}"
        lines = ["### 일 P", key] + event_head(events[a], articles, anchors[a][:2]) + event_head(events[b], articles, anchors[b][:2])
        kinds["pairs"].append({"lines": lines, "keys": [key], "n": 1})

    issue_events = defaultdict(list)
    for event in sorted(events.values(), key=lambda e: (e["occurred_at"], e["id"])):
        if event.get("issue_id") is not None:
            issue_events[event["issue_id"]].append(event)
    for i in sorted(issue_events):
        lines, keys = ["### 일 I", f"이슈 {i} | {one_line(issues[i]['title'])} | {one_line(issues[i].get('summary'), 300)}"], []
        for event in issue_events[i]:
            keys.append(f"I:{i}:{event['id']}")
            head = event_head(event, articles, [])[0]
            lines.append(f"{keys[-1]} | {head} | 대표 기사: {one_line(articles[anchors[event['id']][0]]['title'])}")
        kinds["issues"].append({"lines": lines, "keys": keys, "n": len(keys)})
    for e, candidates in sorted(prep["out_candidates"].items(), key=lambda item: int(item[0])):
        lines, keys = ["### 일 O"] + event_head(events[int(e)], articles, anchors[int(e)][:2]), []
        for i in candidates:
            keys.append(f"O:{e}:{i}")
            lines.append(f"{keys[-1]} | 이슈 {i} | {one_line(issues[i]['title'])} | {one_line(issues[i].get('summary'), 200)}")
        kinds["issues"].append({"lines": lines, "keys": keys, "n": len(keys)})
    for a, b in prep["issue_pairs"]:
        key = f"Q:{a}:{b}"
        lines = ["### 일 Q", key] + [f"이슈 {i} | {one_line(issues[i]['title'])} | {one_line(issues[i].get('summary'), 300)}" for i in (a, b)]
        kinds["issues"].append({"lines": lines, "keys": [key], "n": 1})
    return kinds


def queue_keys(workdir, stage):
    path = workdir / f"queue-{stage}.jsonl"
    if not path.exists():
        raise CheckError([f"{path.name} 이 없음 — sample 부터"])
    return {json.loads(line)["key"] for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


def selected_blocks(workdir, stage=None):
    """전수면 {종류: 블록}, 표본 단계면 표본 키가 든 블록만 {sonnet-<단계>: 블록}."""
    prep, issues, events, articles = load_work(workdir)
    kinds = build_blocks(prep, issues, events, articles)
    if stage is None:
        return kinds
    want = queue_keys(workdir, stage)
    picked = [block for blocks in kinds.values() for block in blocks if want & set(block["keys"])]
    return {f"sonnet-{stage}": picked}


def write_batches(outdir, blocks, limit):
    """블록을 n 합이 limit 를 넘지 않게 묶음 파일로 쓴다. 블록 하나는 쪼개지 않는다."""
    outdir.mkdir(parents=True, exist_ok=True)
    if any(outdir.glob("b*.txt")):
        raise CheckError([f"{outdir}: 이미 묶음 파일이 있음 — 빈 폴더를 준다"])
    batch, size, count = [], 0, 0
    for block in blocks:
        if batch and size + block["n"] > limit:
            count += 1
            (outdir / f"b{count:02d}.txt").write_text("\n".join(batch) + "\n", encoding="utf-8")
            batch, size = [], 0
        batch += block["lines"] + [""]
        size += block["n"]
    if batch:
        count += 1
        (outdir / f"b{count:02d}.txt").write_text("\n".join(batch) + "\n", encoding="utf-8")
    return count


def split(workdir, stage=None):
    kinds = selected_blocks(workdir, stage)
    limits = {"pairs": PAIR_BATCH}
    counts = {kind: write_batches(workdir / kind, blocks, limits.get(kind, MEMBER_BATCH_ARTICLES)) for kind, blocks in kinds.items()}
    total = sum(len(block["keys"]) for blocks in kinds.values() for block in blocks)
    print(f"판정할 일 {total}개 · 묶음 " + " · ".join(f"{k} {v}" for k, v in counts.items()))


def parse_key(key):
    parts = key.split(":")
    if len(parts) != 3 or parts[0] not in TASKS or not all(p.isdigit() for p in parts[1:]):
        raise ValueError(key)
    return parts[0], int(parts[1]), int(parts[2])


def read_answers(path):
    """조수 결과 파일 — 한 줄에 「키<탭>판정」. {키: 판정} 과 까닭 목록을 돌려준다."""
    answers, problems, counts = {}, [], Counter()
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            line = line.rstrip("\r\n")
            if not line.strip():
                continue
            parts = line.split("\t")
            try:
                task, _, _ = parse_key(parts[0])
            except ValueError:
                problems.append(f"{path.name} {no}번째 줄: 키가 틀림")
                continue
            if len(parts) != 2 or parts[1] not in VERDICTS[task]:
                problems.append(f"{path.name} {no}번째 줄: 판정 · 칸이 틀림")
                continue
            counts[parts[0]] += 1
            answers[parts[0]] = parts[1]
    problems += [f"{path.name}: 두 번 쓴 키 {key}" for key, count in counts.items() if count > 1]
    return answers, problems


def merge(workdir, golddir, stage=None):
    kinds = selected_blocks(workdir, stage)
    output = golddir / ("sonnet.tsv" if stage is None else f"sonnet-{stage}.tsv")
    if output.exists():
        raise CheckError([f"{output}: 이미 있음 — 덮지 않는다"])
    want = [key for blocks in kinds.values() for block in blocks for key in block["keys"]]
    answers, problems = {}, []
    for kind in kinds:
        for batch in sorted((workdir / kind).glob("b*.txt")):
            result = batch.with_suffix(".tsv")
            if not result.exists():
                problems.append(f"{kind}/{batch.stem}: 결과 파일 없음")
                continue
            got, found = read_answers(result)
            problems += found
            problems += [f"{kind}/{batch.stem}: 다른 묶음에도 있는 키 {key}" for key in sorted(answers.keys() & got.keys())]
            answers.update(got)
    missing = [key for key in want if key not in answers]
    extra = sorted(answers.keys() - set(want))
    if missing:
        problems.append(f"빠진 일 {len(missing)}개 (예: {', '.join(missing[:5])})")
    if extra:
        problems.append(f"묶음에 없는 키 {len(extra)}개 (예: {', '.join(extra[:5])})")
    if problems:
        raise CheckError(problems)
    golddir.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.now(KST).isoformat(timespec="seconds")
    with open(output, "w", encoding="utf-8", newline="\n") as out:
        out.write(GOLD_HEADER + "\n")
        for key in want:
            out.write(f"{key}\t{answers[key]}\tsonnet\t{stage or 'census'}\t{now}\n")
    tally = Counter(f"{key[0]}:{answers[key]}" for key in want)
    print(f"정답 {len(want)}줄 · " + " · ".join(f"{k} {v}" for k, v in sorted(tally.items())))


# ---------------------------------------------------------------- 정답 파일


def read_gold(path, stage=None):
    """정답 파일을 {키: (판정, 단계)} 로 — 같은 키가 또 나오면 뒤 줄이 이긴다(사람이 고쳐 쓴 판정)."""
    gold = {}
    if not path.exists():
        return gold
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            line = line.rstrip("\r\n")
            if no == 1 or not line.strip():
                if no == 1 and line != GOLD_HEADER:
                    raise CheckError([f"{path.name}: 첫 줄이 머리줄이 아님"])
                continue
            parts = line.split("\t")
            if len(parts) != 5:
                raise CheckError([f"{path.name} {no}번째 줄: 칸 수가 틀림"])
            if stage is None or parts[3] == stage:
                gold[parts[0]] = (parts[1], parts[3])
    return gold


def binary(key, verdict):
    """판정을 통과(1) · 불통과(0)로 — 사람 질문은 「이 사건에 맞나 · 같은 사건인가」."""
    task = key[0]
    if verdict in ("Y", "N"):
        return 1 if verdict == "Y" else 0
    if task in ("M", "I"):
        return 1 if verdict == "Y" else 0
    if task == "P":
        return 1 if verdict == "same_event" else 0
    return 1 if verdict == "same_issue" else 0


def record(golddir, key, word, stage, judge="human"):
    """판정 하나를 더한다. judge 는 실제로 판정한 쪽이다 — 사람이 하지 않은 것을 human 으로 적지 않는다."""
    parse_key(key)
    if word not in HUMAN_WORDS:
        raise CheckError([f"판정은 통과 · 불통과 중 하나: {word}"])
    golddir.mkdir(parents=True, exist_ok=True)
    path = golddir / ("human.tsv" if judge == "human" else f"{judge}.tsv")
    new = not path.exists()
    now = datetime.datetime.now(KST).isoformat(timespec="seconds")
    with open(path, "a", encoding="utf-8", newline="\n") as out:
        if new:
            out.write(GOLD_HEADER + "\n")
        out.write(f"{key}\t{HUMAN_WORDS[word]}\thuman\t{stage}\t{now}\n")
    print(f"기록 {len(read_gold(path))}건째")


# ---------------------------------------------------------------- 사람 표본


def sample(workdir, golddir, stage, seed=SEED):
    """사람이 판정할 일을 뽑아 작업 폴더에 queue-<단계>.jsonl 로 — 이미 사람이 한 키는 뺀다."""
    prep, issues, events, articles = load_work(workdir)
    done = set(read_gold(golddir / "human.tsv"))
    rng = random.Random(f"{seed}-{stage}")
    sonnet = {k: v for k, (v, _) in read_gold(golddir / "sonnet.tsv").items()}
    if stage == "verify" and not sonnet:
        raise CheckError(["verify 는 Sonnet 전수(sonnet.tsv) 뒤에 뽑는다"])
    pools = defaultdict(list)
    cos = {int(a): c for a, c in prep["article_cos"].items()}
    cut = sorted(cos.values())[int(len(cos) * LOW_QUANTILE)]
    for a, c in cos.items():
        key = f"M:{articles[a]['event_id']}:{a}"
        if stage == "verify":
            pools["M-sonnet-no" if sonnet[key] != "Y" else "M-sonnet-yes"].append(key)
        else:
            pools["M-low" if c <= cut else "M-rest"].append(key)
    for a, b in prep["event_pairs"]:
        key = f"P:{a}:{b}"
        pools["P-sonnet-" + ("yes" if binary(key, sonnet.get(key, "")) else "no") if stage == "verify" else "P-candidate"].append(key)
    icos = {int(e): c for e, c in prep["event_issue_cos"].items()}
    icut = sorted(icos.values())[int(len(icos) * LOW_QUANTILE)]
    for e, c in icos.items():
        key = f"I:{events[e]['issue_id']}:{e}"
        if stage == "verify":
            pools["I-sonnet-no" if sonnet[key] != "Y" else "I-sonnet-yes"].append(key)
        else:
            pools["I-low" if c <= icut else "I-rest"].append(key)
    if stage == "verify":
        for e, candidates in prep["out_candidates"].items():
            pools["O"] += [f"O:{e}:{i}" for i in candidates]
    plan = (
        {"M-low": 15, "M-rest": 15, "P-candidate": 10, "I-low": 5, "I-rest": 5}
        if stage == "calib"
        else {"M-sonnet-no": 40, "M-sonnet-yes": 50, "P-sonnet-yes": 15, "P-sonnet-no": 10, "I-sonnet-no": 10, "I-sonnet-yes": 15, "O": 10}
    )
    queue = []
    for stratum, want in plan.items():
        pool = sorted(k for k in pools[stratum] if k not in done)
        picked = rng.sample(pool, min(want, len(pool)))
        weight = len(pools[stratum]) / len(picked) if picked else 0
        queue += [{"key": k, "stratum": stratum, "population": len(pools[stratum]), "weight": weight} for k in picked]
    rng.shuffle(queue)
    anchors = {int(e): ids for e, ids in prep["anchors"].items()}
    for no, item in enumerate(queue, 1):
        item["no"] = no
        item["text"] = question(item["key"], issues, events, articles, anchors)
    path = workdir / f"queue-{stage}.jsonl"
    with open(path, "w", encoding="utf-8", newline="\n") as out:
        for item in queue:
            out.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"{stage} 표본 {len(queue)}건 · " + " · ".join(f"{s} {sum(1 for q in queue if q['stratum'] == s)}" for s in plan))


def question(key, issues, events, articles, anchors):
    """사람에게 보일 질문 글 — 판정할 대상만 보이고 Sonnet 답은 넣지 않는다."""
    task, a, b = parse_key(key)

    def event_text(e, n=3):
        head = f"사건 「{one_line(events[e]['title'])} — {one_line(events[e]['label'])}」({kst_day(events[e]['occurred_at'])})"
        return head + "".join(f"\n  · {one_line(articles[x]['title'], 70)}" for x in anchors[e][:n])

    if task == "M":
        art = articles[b]
        return f"{event_text(a)}\n이 기사: 「{one_line(art['title'])}」 {one_line(art['lead'], 140)}\n→ 이 기사가 이 사건에 맞나요?"
    if task == "P":
        return f"A {event_text(a, 2)}\nB {event_text(b, 2)}\n→ A 와 B 가 같은 사건인가요?"
    if task == "I":
        return f"이슈 「{one_line(issues[a]['title'])}」 {one_line(issues[a].get('summary'), 140)}\n{event_text(b, 2)}\n→ 이 사건이 이 이슈 흐름에 드나요?"
    if task == "O":
        return f"{event_text(a, 2)}\n이슈 「{one_line(issues[b]['title'])}」 {one_line(issues[b].get('summary'), 140)}\n→ 이 사건이 이 이슈 흐름에 드나요?"
    return (
        f"이슈 A 「{one_line(issues[a]['title'])}」 {one_line(issues[a].get('summary'), 120)}\n"
        f"이슈 B 「{one_line(issues[b]['title'])}」 {one_line(issues[b].get('summary'), 120)}\n→ A 와 B 가 한 흐름인가요?"
    )


# ---------------------------------------------------------------- 지표


def comb2(n):
    return n * (n - 1) // 2


def xlogx(n):
    return n * math.log(n) if n > 0 else 0.0


def components(system, gold):
    """시스템 묶음끼리 정답 묶음을 나눠 가지면 한 덩어리 — 덩어리 밖으로는 같은 쌍이 없다(부트스트랩 단위)."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    first = {}
    for item, g in gold.items():
        s = system[item]
        find(s)
        if g in first:
            parent[find(s)] = find(first[g])
        else:
            first[g] = s
    groups = defaultdict(list)
    for item in system:
        groups[find(system[item])].append(item)
    return list(groups.values())


def stats(items, system, gold):
    """덩어리 하나의 더할 수 있는 통계 — 합치면 전체 지표를 다시 셈할 수 있다."""
    cells = Counter((system[i], gold[i]) for i in items)
    sizes_s = Counter(system[i] for i in items)
    sizes_g = Counter(gold[i] for i in items)
    return (
        len(items),
        sum(comb2(n) for n in cells.values()),
        sum(comb2(n) for n in sizes_s.values()),
        sum(comb2(n) for n in sizes_g.values()),
        math.fsum(n * n / sizes_s[s] for (s, _), n in cells.items()),
        math.fsum(n * n / sizes_g[g] for (_, g), n in cells.items()),
        math.fsum(xlogx(n) for n in sizes_s.values()),
        math.fsum(xlogx(n) for n in sizes_g.values()),
        math.fsum(xlogx(n) for n in cells.values()),
    )


def scores_from(parts):
    """통계 묶음에서 쌍 · B³ · V · ARI. 같은 묶음 쌍이 없으면 정밀도(재현율)는 1 로 둔다 — 잘못 붙인 쌍이 없다."""
    n, tp, sp, gp, b3p, b3r, hs, hg, hsg = (math.fsum(p[k] for p in parts) for k in range(9))
    n, tp, sp, gp = int(n), int(tp), int(sp), int(gp)
    precision = tp / sp if sp else 1.0
    recall = tp / gp if gp else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    bp, br = b3p / n, b3r / n
    b3f = 2 * bp * br / (bp + br) if bp + br else 0.0
    ent_s = math.log(n) - hs / n
    ent_g = math.log(n) - hg / n
    ent_sg = math.log(n) - hsg / n
    homogeneity = 1.0 if ent_g <= 1e-12 else 1 - (ent_sg - ent_s) / ent_g
    completeness = 1.0 if ent_s <= 1e-12 else 1 - (ent_sg - ent_g) / ent_s
    v = 2 * homogeneity * completeness / (homogeneity + completeness) if homogeneity + completeness else 0.0
    expected = sp * gp / comb2(n) if n > 1 else 0.0
    top_ = (sp + gp) / 2
    ari = 1.0 if abs(top_ - expected) < 1e-12 else (tp - expected) / (top_ - expected)
    return {
        "n": n,
        "pair_precision": precision,
        "pair_recall": recall,
        "pair_f1": f1,
        "b3_precision": bp,
        "b3_recall": br,
        "b3_f1": b3f,
        "homogeneity": homogeneity,
        "completeness": completeness,
        "v_measure": v,
        "ari": ari,
    }


def scores(system, gold, items=None, bootstrap=0, seed=SEED):
    """시스템 · 정답 묶음({항목: 묶음}) 을 견준다. bootstrap > 0 이면 덩어리 단위로 다시 뽑아 95% 구간도."""
    if system.keys() != gold.keys():
        raise CheckError(["시스템과 정답의 항목이 다름"])
    keep = set(system if items is None else items)
    sys_ = {i: system[i] for i in keep}
    gold_ = {i: gold[i] for i in keep}
    parts = [stats(c, sys_, gold_) for c in components(sys_, gold_)]
    result = scores_from(parts)
    if bootstrap:
        rng = random.Random(seed)
        draws = defaultdict(list)
        for _ in range(bootstrap):
            for name, value in scores_from(rng.choices(parts, k=len(parts))).items():
                draws[name].append(value)
        low, high = int(bootstrap * 0.025), int(bootstrap * 0.975) - 1
        result["ci"] = {name: (sorted(v)[low], sorted(v)[high]) for name, v in draws.items() if name != "n"}
    return result


def wilson(successes, n, z=1.96):
    if n <= 0:
        return (0.0, 1.0)
    p = successes / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def kappa(pairs):
    """[(사람 0·1, Sonnet 0·1, 가중치)] 의 코언 κ · 일치율 · 유효 표본 수."""
    total = math.fsum(w for _, _, w in pairs)
    if not total:
        return {"n": 0, "agreement": None, "kappa": None, "n_eff": 0}
    agree = math.fsum(w for h, s, w in pairs if h == s) / total
    human_yes = math.fsum(w for h, _, w in pairs if h) / total
    sonnet_yes = math.fsum(w for _, s, w in pairs if s) / total
    chance = human_yes * sonnet_yes + (1 - human_yes) * (1 - sonnet_yes)
    k = 1.0 if abs(1 - chance) < 1e-12 else (agree - chance) / (1 - chance)
    n_eff = total * total / math.fsum(w * w for _, _, w in pairs)
    return {"n": len(pairs), "agreement": agree, "kappa": k, "n_eff": n_eff, "human_yes": human_yes, "sonnet_yes": sonnet_yes}


def agree(golddir, workdir=None, stage=None, sonnet_name="sonnet.tsv"):
    """사람 판정의 통과 비율(표본 가중치 반영 · Wilson 구간)과 Sonnet 과의 일치율 · κ 를 일 종류별로."""
    human = read_gold(golddir / "human.tsv", stage)
    sonnet = read_gold(golddir / sonnet_name)
    weights = {}
    if workdir is not None and stage is not None and (workdir / f"queue-{stage}.jsonl").exists():
        for line in (workdir / f"queue-{stage}.jsonl").read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            weights[item["key"]] = item["weight"]
    result = {"stage": stage, "sonnet": sonnet_name, "tasks": {}}
    for task in ["all"] + list(TASKS):
        keys = sorted(k for k in human if task == "all" or k[0] == task)
        if not keys:
            continue
        w = {k: weights.get(k, 1.0) for k in keys}
        total = math.fsum(w.values())
        n_eff = total * total / math.fsum(v * v for v in w.values())
        passed = math.fsum(w[k] for k in keys if binary(k, human[k][0])) / total
        entry = {"n": len(keys), "n_eff": round(n_eff, 1), "human_pass": passed, "human_pass_ci": wilson(passed * n_eff, n_eff)}
        both = [k for k in keys if k in sonnet]
        if both:
            entry["vs_sonnet"] = kappa([(binary(k, human[k][0]), binary(k, sonnet[k][0]), w[k]) for k in both])
        result["tasks"][task] = entry
    return result


def gold_partitions(events, articles, gold):
    """정답 판정으로 기사 → 정답 사건, 사건 → 정답 이슈 묶음을 만든다."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    def group_node(task, owner, key, member_node):
        verdict = gold.get(key)
        if verdict is None:
            raise CheckError([f"정답이 없는 일 {key}"])
        if verdict in ("Y",):
            return (task, owner)
        if verdict in ("0", "N"):
            return member_node
        return (task, owner, verdict)

    article_node = {}
    for article in articles.values():
        key = f"M:{article['event_id']}:{article['id']}"
        node = group_node("E", article["event_id"], key, ("A", article["id"]))
        article_node[article["id"]] = node
        find(node)
    same_event = [parse_key(k)[1:] for k, v in gold.items() if k[0] == "P" and v in ("same_event", "Y")]
    for a, b in same_event:
        union(("E", a), ("E", b))
    article_gold = {a: find(node) for a, node in article_node.items()}

    parent.clear()
    inside, outside, event_node = {}, [], {}
    for event in events.values():
        e = event["id"]
        if event.get("issue_id") is not None:
            inside[e] = group_node("I", event["issue_id"], f"I:{event['issue_id']}:{e}", ("V", e))
        else:
            outside.append(e)
    # 이슈 밖 사건은 **한 이슈에만** 붙인다. 여러 이슈에 걸치게 두면 그 사건이 다리가 되어 이슈가 줄줄이 이어진다
    # (11-13: 중간선거 이슈 다섯이 한 덩어리). 후보가 여럿이면 번호가 작은 이슈 하나만 고른다.
    joins = defaultdict(set)
    for k, v in gold.items():
        task, a, b = parse_key(k)
        if task == "O" and v == "Y":
            joins[a].add(b)
        if task == "P" and v in ("same_event", "same_issue"):
            for one, other in ((a, b), (b, a)):
                if one in inside and other not in inside and events[one].get("issue_id") is not None:
                    joins[other].add(events[one]["issue_id"])
    for e in outside:
        event_node[e] = ("I", min(joins[e])) if joins[e] else ("V", e)
    event_node.update(inside)
    for node in event_node.values():
        find(node)
    # 어느 이슈에도 붙지 않은 사건끼리 같은 사건 · 같은 흐름이면 묶어 새 이슈를 만든다.
    # 한쪽이라도 이슈에 들어간 쌍은 잇지 않는다 — 이으면 그 쌍이 이슈 사이의 다리가 된다.
    # 두 이슈 모두에 사건이 있는 쌍도 마찬가지다. 그 쌍의 성적은 사건 지표에서 센다
    for k, v in gold.items():
        task, a, b = parse_key(k)
        if task == "P" and v in ("same_event", "same_issue") and event_node[a][0] == "V" and event_node[b][0] == "V":
            union(event_node[a], event_node[b])
    for a, b in verified_issue_merges(gold):
        union(("I", a), ("I", b))
    event_gold = {e: find(node) for e, node in event_node.items()}
    return article_gold, event_gold


def verified_issue_merges(gold):
    """합쳐도 되는 이슈 쌍만 돌려준다.

    Q 를 그대로 이으면 A~B, B~C 를 타고 묶음이 통째로 붙는다. A~C 는 판정한 적이 없는데도 합쳐지므로
    거대 묶음이 생긴다(11-13: 묶음 하나가 운영 이슈 24개). 그래서 **묶음 안의 쌍이 모두 판정됐고 모두
    같은 흐름일 때만** 합친다. 그렇지 않은 묶음은 합치지 않고 `unverified_chains` 로 센다.
    """
    same = {(min(a, b), max(a, b)) for k, v in gold.items() if k[0] == "Q" and v in ("same_issue", "Y") for _, a, b in [parse_key(k)]}
    judged = {(min(a, b), max(a, b)) for k in gold if k[0] == "Q" for _, a, b in [parse_key(k)]}
    neighbours = defaultdict(set)
    for a, b in same:
        neighbours[a].add(b)
        neighbours[b].add(a)
    seen, accepted = set(), []
    for start in sorted(neighbours):
        if start in seen:
            continue
        group, stack = {start}, [start]
        while stack:
            for other in neighbours[stack.pop()]:
                if other not in group:
                    group.add(other)
                    stack.append(other)
        seen |= group
        members = sorted(group)
        pairs = [(members[i], members[j]) for i in range(len(members)) for j in range(i + 1, len(members))]
        if all(pair in judged and pair in same for pair in pairs):
            accepted += pairs
    return accepted


def issue_merge_report(gold):
    """Q 판정과 합침 결과를 센다 — 숫자 옆에 붙일 설명용."""
    same = {(min(a, b), max(a, b)) for k, v in gold.items() if k[0] == "Q" and v in ("same_issue", "Y") for _, a, b in [parse_key(k)]}
    accepted = set(verified_issue_merges(gold))
    groups = defaultdict(set)
    for a, b in same:
        groups[a].add(b)
        groups[b].add(a)
    return {
        "judged_pairs": sum(1 for k in gold if k[0] == "Q"),
        "same_issue_pairs": len(same),
        "applied_pairs": len(accepted),
        "unverified_pairs": len(same - accepted),
        "issues_in_unverified_chains": len({i for pair in same - accepted for i in pair}),
    }


def final_gold(golddir):
    """Sonnet 전수 위에 사람 판정을 덮는다. 사람 불통과(N)는 Sonnet 이 준 글자 묶음이 있으면 그대로 둔다."""
    gold = {k: v for k, (v, _) in read_gold(golddir / "sonnet.tsv").items()}
    for k, (v, _) in read_gold(golddir / "human.tsv").items():
        task = k[0]
        if task in ("M", "I"):
            if v == "Y":
                gold[k] = "Y"
            elif gold.get(k, "Y") == "Y":
                gold[k] = "N"
        elif task == "P":
            gold[k] = "same_event" if v == "Y" else ("same_issue" if gold.get(k) == "same_issue" else "unrelated")
        elif task == "Q":
            gold[k] = "same_issue" if v == "Y" else "unrelated"
        else:
            gold[k] = v
    return gold


def size_bucket(n):
    return "5-9" if n < 10 else "10-19" if n < 20 else "20-49" if n < 50 else "50+"


def metrics(workdir, golddir, bootstrap=BOOTSTRAP):
    prep, issues, events, articles = load_work(workdir)
    gold = final_gold(golddir)
    article_gold, event_gold = gold_partitions(events, articles, gold)
    system_article = {a: art["event_id"] for a, art in articles.items()}
    system_event = {e: (ev["issue_id"] if ev.get("issue_id") is not None else ("V", e)) for e, ev in events.items()}
    sizes = Counter(system_article.values())
    report = {
        "event": scores(system_article, article_gold, bootstrap=bootstrap),
        "issue": scores(system_event, event_gold, bootstrap=bootstrap),
        "by_category": {},
        "by_size": {},
    }
    for category in sorted({art.get("category") or "-" for art in articles.values()}):
        items = [a for a, art in articles.items() if (art.get("category") or "-") == category]
        report["by_category"][category] = scores(system_article, article_gold, items)
    for bucket in ("5-9", "10-19", "20-49", "50+"):
        items = [a for a, e in system_article.items() if size_bucket(sizes[e]) == bucket]
        if items:
            report["by_size"][bucket] = scores(system_article, article_gold, items)
    random_keys = [f"P:{a}:{b}" for a, b in prep["random_pairs"]]
    report["random_same_day"] = {
        "pairs": len(random_keys),
        "same_event": sum(1 for k in random_keys if gold.get(k) == "same_event"),
        "outside_candidates": prep["same_day_outside"],
    }
    report["gold_counts"] = dict(sorted(Counter(f"{k[0]}:{v}" for k, v in gold.items()).items()))
    # 이행으로 이은 합침 진단 — A~B, B~C 를 타고 묶음이 통째로 붙었는지. 정답 묶음 하나가 운영 이슈 여럿을 삼키면 지표가 그것에 끌려간다
    merged = defaultdict(set)
    for e, node in event_gold.items():
        if events[e].get("issue_id") is not None:
            merged[node].add(events[e]["issue_id"])
    sizes = sorted((len(v) for v in merged.values()), reverse=True)
    report["issue_merges"] = issue_merge_report(gold)
    report["issue_chaining"] = {
        "gold_clusters": len(set(event_gold.values())),
        "system_issues": len({e["issue_id"] for e in events.values() if e.get("issue_id") is not None}),
        "largest_merge_spans_issues": sizes[:5],
        "clusters_spanning_3plus": sum(1 for s in sizes if s >= 3),
    }
    path = golddir / "metrics.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for name in ("event", "issue"):
        r = report[name]
        ci = r.get("ci", {})
        print(
            f"{name}: 쌍 F1 {r['pair_f1']:.3f} {fmt_ci(ci.get('pair_f1'))} · 정밀 {r['pair_precision']:.3f} · 재현 {r['pair_recall']:.3f}"
            f" · B³ F1 {r['b3_f1']:.3f} {fmt_ci(ci.get('b3_f1'))} · V {r['v_measure']:.3f} · ARI {r['ari']:.3f} (항목 {r['n']})"
        )
    chain = report["issue_chaining"]
    merge = report["issue_merges"]
    print(
        f"이행 합침: 정답 이슈 묶음 {chain['gold_clusters']} (운영 {chain['system_issues']})"
        f" · 가장 많이 삼킨 묶음이 운영 이슈 {chain['largest_merge_spans_issues']}개"
        f" · 운영 이슈 3개 이상을 삼킨 묶음 {chain['clusters_spanning_3plus']}개"
    )
    print(
        f"이슈 합침: 판정한 쌍 {merge['judged_pairs']} 가운데 같은 흐름 {merge['same_issue_pairs']}"
        f" · 쌍이 모두 판정돼 합친 것 {merge['applied_pairs']}"
        f" · 판정 안 한 쌍을 타야 해서 안 합친 것 {merge['unverified_pairs']}(이슈 {merge['issues_in_unverified_chains']}개)"
    )
    if chain["largest_merge_spans_issues"] and chain["largest_merge_spans_issues"][0] >= 5:
        print("  ⚠ 이행으로 이은 합침이 크다 — 이슈 지표는 묶음 단위로 다시 확인하기 전까지 보고하지 않는다", file=sys.stderr)


def fmt_ci(ci):
    return f"[{ci[0]:.3f}, {ci[1]:.3f}]" if ci else ""


# ---------------------------------------------------------------- 명령


def main(argv=None):
    parser = argparse.ArgumentParser(description="사건 · 이슈 묶기 정확도 평가")
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("prepare", help="벡터로 대표 기사 · 후보 쌍을 만든다")
    p.add_argument("export", type=pathlib.Path)
    p.add_argument("vectors", type=pathlib.Path)
    p.add_argument("workdir", type=pathlib.Path)
    p = commands.add_parser("split", help="Sonnet 묶음 파일을 쓴다")
    p.add_argument("workdir", type=pathlib.Path)
    p.add_argument("--stage", help="표본 단계(calib · verify)의 키가 든 블록만")
    p = commands.add_parser("merge", help="Sonnet 결과를 검사해 정답 파일로 모은다")
    p.add_argument("workdir", type=pathlib.Path)
    p.add_argument("golddir", type=pathlib.Path)
    p.add_argument("--stage", help="split --stage 로 나눈 묶음을 sonnet-<단계>.tsv 로")
    p = commands.add_parser("sample", help="사람이 판정할 표본을 뽑는다")
    p.add_argument("workdir", type=pathlib.Path)
    p.add_argument("golddir", type=pathlib.Path)
    p.add_argument("stage", choices=["calib", "verify"])
    p = commands.add_parser("record", help="사람 판정 하나를 정답 파일에 더한다")
    p.add_argument("golddir", type=pathlib.Path)
    p.add_argument("key")
    p.add_argument("word")
    p.add_argument("--stage", default="calib")
    p = commands.add_parser("agree", help="사람과 Sonnet 일치율 · κ")
    p.add_argument("golddir", type=pathlib.Path)
    p.add_argument("--workdir", type=pathlib.Path)
    p.add_argument("--stage")
    p.add_argument("--sonnet", default="sonnet.tsv", help="견줄 Sonnet 정답 파일 이름(보정은 sonnet-calib.tsv)")
    p = commands.add_parser("metrics", help="운영 묶음을 정답과 견준다")
    p.add_argument("workdir", type=pathlib.Path)
    p.add_argument("golddir", type=pathlib.Path)
    p.add_argument("--bootstrap", type=int, default=BOOTSTRAP)
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            prepare(args.export, args.vectors, args.workdir)
        elif args.command == "split":
            split(args.workdir, args.stage)
        elif args.command == "merge":
            merge(args.workdir, args.golddir, args.stage)
        elif args.command == "sample":
            sample(args.workdir, args.golddir, args.stage)
        elif args.command == "record":
            record(args.golddir, args.key, args.word, args.stage)
        elif args.command == "agree":
            print(json.dumps(agree(args.golddir, args.workdir, args.stage, args.sonnet), ensure_ascii=False, indent=1))
        else:
            metrics(args.workdir, args.golddir, args.bootstrap)
    except CheckError as error:
        print(f"검사에 걸림 — {len(error.problems)}건, 아무것도 쓰지 않았다", file=sys.stderr)
        for problem in error.problems[:50]:
            print(f"  {problem}", file=sys.stderr)
        return 1
    except ValueError as error:
        print(f"값 오류 — {error}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"파일 오류 — {error.strerror}: {error.filename}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
