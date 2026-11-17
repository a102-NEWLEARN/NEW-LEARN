#!/usr/bin/env python3
"""분야 라벨 나누기 · 합치기 (Jira S15P31A102-180)

라벨 없는 공개 기사 목록(category-labels-export.sql)을 조수에게 줄 묶음으로 나누고,
조수가 쓴 결과를 검사해 운영에 넣을 라벨 파일(URL<탭>코드)로 합친다. 절차는 category-labels.md 3절.

    python -X utf8 -B infra/server/category_labels.py split <목록.jsonl> <묶음 폴더>
    python -X utf8 -B infra/server/category_labels.py merge <목록.jsonl> <묶음 폴더> <라벨 파일>

번호는 목록의 줄 번호다. 검사에 걸리면 종료 1 로 멈추고 라벨 파일을 쓰지 않는다. 제목은 출력하지 않는다 — 명령 기록에 남지 않게.
"""

import argparse
import json
import pathlib
import re
import sys
from collections import Counter

BATCH_SIZE = 2000
CODES = frozenset("PESWITC")

# 인코딩이 깨진 제목 — 조수의 값 대신 숨김 코드로 덮는다 (category-labels.md 1절)
HIDE_CODE = "X"
BROKEN_TITLE_RE = re.compile("[À-ɏ]")
BROKEN_TITLE_MIN_CHARS = 6

# COPY 텍스트 형식에서 뜻이 달라지는 글자
URL_FORBIDDEN_RE = re.compile(r"[\\\t\r\n]")


class CheckError(Exception):
    """검사에 걸렸다 — 까닭 목록을 들고 있다."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = problems


def read_export(path):
    """목록을 (URL, 제목) 줄로 읽는다. 줄 번호는 1부터다."""
    rows, problems, seen = [], [], set()
    with open(path, encoding="utf-8", newline="\n") as lines:
        for no, line in enumerate(lines, 1):
            try:
                row = json.loads(line)
                url, title = row["url"], row["title"]
            except (ValueError, KeyError, TypeError):
                problems.append(f"{no}번째 줄: 읽을 수 없음")
                continue
            if not isinstance(url, str) or not isinstance(title, str):
                problems.append(f"{no}번째 줄: url · title 이 글자가 아님")
                continue
            if not url or URL_FORBIDDEN_RE.search(url):
                problems.append(f"{no}번째 줄: URL 이 비었거나 역슬래시 · 탭 · 줄바꿈이 있음")
                continue
            if url in seen:
                problems.append(f"{no}번째 줄: 같은 URL 이 또 나옴")
                continue
            seen.add(url)
            rows.append((url, title))
    if problems:
        raise CheckError(problems)
    return rows


def one_line(title):
    """탭 · 줄바꿈을 빈칸으로 — 묶음 파일의 한 줄이 기사 하나다."""
    return " ".join(title.split())


def split(export, outdir, size):
    rows = read_export(export)
    outdir.mkdir(parents=True, exist_ok=True)
    if any(outdir.glob("b*.txt")) or any(outdir.glob("b*.tsv")):
        raise CheckError([f"{outdir}: 이미 묶음 파일이 있음 — 빈 폴더를 준다"])
    batches = 0
    for start in range(0, len(rows), size):
        batches += 1
        with open(outdir / f"b{batches:02d}.txt", "w", encoding="utf-8", newline="\n") as out:
            for no, (_, title) in enumerate(rows[start : start + size], start + 1):
                out.write(f"{no}\t{one_line(title)}\n")
    print(f"기사 {len(rows)}건, 묶음 {batches}개")


def read_batch(path):
    """묶음 하나를 [(번호, 제목)] 으로 읽는다."""
    with open(path, encoding="utf-8", newline="\n") as lines:
        return [tuple(line.rstrip("\n").split("\t", 1) + [""])[:2] for line in lines if line.strip()]


def read_result(path, want):
    """조수가 쓴 묶음 하나를 읽어 {번호: 코드} 와 까닭 목록을 돌려준다."""
    labels, problems, counts = {}, [], Counter()
    with open(path, encoding="utf-8", newline="\n") as lines:
        for line in lines:
            line = line.rstrip("\r\n")
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) != 2 or parts[1] not in CODES:
                problems.append("코드 · 칸이 틀린 줄")
                continue
            counts[parts[0]] += 1
            labels[parts[0]] = parts[1]
    wanted = set(want)
    missing = len(wanted - set(counts))
    extra = len(set(counts) - wanted)
    repeated = sum(1 for count in counts.values() if count > 1)
    if missing:
        problems.append(f"빠진 번호 {missing}개")
    if extra:
        problems.append(f"묶음에 없는 번호 {extra}개")
    if repeated:
        problems.append(f"두 번 쓴 번호 {repeated}개")
    return labels, problems


def is_broken_title(title):
    return len(BROKEN_TITLE_RE.findall(title)) >= BROKEN_TITLE_MIN_CHARS


def merge(export, outdir, output):
    if output.exists():
        raise CheckError([f"{output}: 이미 있음 — 덮지 않는다"])
    rows = read_export(export)
    titles = {str(no): one_line(title) for no, (_, title) in enumerate(rows, 1)}
    problems, labels, covered = [], {}, Counter()
    for batch in sorted(outdir.glob("b*.txt")):
        entries = read_batch(batch)
        want = [number for number, _ in entries]
        covered.update(want)
        # 나눈 뒤 목록을 다시 뽑으면 번호가 다른 기사를 가리킨다 — 줄 수가 같아도 여기서 잡는다
        changed = sum(1 for number, title in entries if number in titles and titles[number] != title)
        if changed:
            problems.append(f"{batch.stem}: 목록과 제목이 다른 줄 {changed}개 — 목록을 다시 뽑았으면 나누기부터")
        result = batch.with_suffix(".tsv")
        if not result.exists():
            problems.append(f"{batch.stem}: 결과 파일 없음")
            continue
        got, found = read_result(result, want)
        labels.update(got)
        problems.extend(f"{batch.stem}: {problem}" for problem in dict.fromkeys(found))
    numbers = {str(no) for no in range(1, len(rows) + 1)}
    if numbers - set(covered):
        problems.append(f"어느 묶음에도 없는 기사: 빠짐 {len(numbers - set(covered))}건")
    if set(covered) - numbers:
        problems.append(f"목록에 없는 번호 {len(set(covered) - numbers)}개")
    overlapped = sum(1 for count in covered.values() if count > 1)
    if overlapped:
        problems.append(f"묶음끼리 겹침 {overlapped}건")
    if problems:
        raise CheckError(problems)

    codes = Counter()
    with open(output, "w", encoding="utf-8", newline="\n") as out:
        for no, (url, title) in enumerate(rows, 1):
            code = HIDE_CODE if is_broken_title(title) else labels[str(no)]
            codes[code] += 1
            out.write(f"{url}\t{code}\n")
    print(f"라벨 {sum(codes.values())}줄, 코드별 {dict(sorted(codes.items()))}")


def positive(text):
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("1 이상")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description="분야 라벨 나누기 · 합치기")
    commands = parser.add_subparsers(dest="command", required=True)
    split_parser = commands.add_parser("split", help="목록을 묶음으로 나눈다")
    split_parser.add_argument("export", type=pathlib.Path)
    split_parser.add_argument("outdir", type=pathlib.Path)
    split_parser.add_argument("--size", type=positive, default=BATCH_SIZE)
    merge_parser = commands.add_parser("merge", help="결과를 검사해 라벨 파일로 합친다")
    merge_parser.add_argument("export", type=pathlib.Path)
    merge_parser.add_argument("outdir", type=pathlib.Path)
    merge_parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "split":
            split(args.export, args.outdir, args.size)
        else:
            merge(args.export, args.outdir, args.output)
    except CheckError as error:
        print(f"검사에 걸림 — {len(error.problems)}건, 아무것도 쓰지 않았다", file=sys.stderr)
        for problem in error.problems[:50]:
            print(f"  {problem}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"파일 오류 — {error.strerror}: {error.filename}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
