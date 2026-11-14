"""셀 원본(*_source.py)과 모듈을 묶어 서버에 올릴 노트북 하나를 만든다.

python build_notebook.py [issue_backfill|newsdata_collect] [출력 경로]
  — 기본은 issue_backfill, 출력은 이 폴더의 <이름>.ipynb (저장소에는 올리지 않는다)
"""

import ast
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULES = ("newsdata_fetch.py", "issue_grouping.py", "issue_summary.py")
NOTEBOOKS = {
    "issue_backfill": ("notebook_source.py", MODULES),
    "newsdata_collect": (
        "collect_source.py",
        # issue_grouping: 받은 날 선정 기사의 벡터를 같은 노트북에서 만든다(묶기와 같은 입력 글 · 해시)
        (
            "newsdata_fetch.py",
            "newsdata_daily.py",
            "newsdata_dataset.py",
            "issue_grouping.py",
        ),
    ),
}
OLDEST_KERNEL = (3, 10)

BOOTSTRAP = """# 모듈을 노트북 옆 _issue_backfill_modules/ 에 풀어 import 한다. 서버에는 이 노트북 하나만 올리면 된다
import importlib
import sys
from pathlib import Path

MODULE_DIR = Path.cwd() / "_issue_backfill_modules"
MODULE_DIR.mkdir(exist_ok=True)
for name, source in BUNDLED.items():
    target = MODULE_DIR / name
    if not target.exists() or target.read_text(encoding="utf-8") != source:
        target.write_text(source, encoding="utf-8")
    sys.modules.pop(name[:-3], None)
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))
importlib.invalidate_caches()
print("모듈 준비:", ", ".join(BUNDLED))
"""


def cells_from(source):
    cells, kind, lines = [], None, []

    def flush():
        body = list(lines)
        while body and not body[-1].strip():
            body.pop()
        while body and not body[0].strip():
            body.pop(0)
        if kind is None or not body:
            return
        if kind == "markdown":
            body = [re.sub(r"^# ?", "", line) for line in body]
        cell = {
            "cell_type": kind,
            "id": f"c{len(cells):02d}",
            "metadata": {},
            "source": "\n".join(body).splitlines(keepends=True),
        }
        if kind == "code":
            cell.update(execution_count=None, outputs=[])
        cells.append(cell)

    for line in source.splitlines():
        if line.startswith("# %%"):
            flush()
            kind, lines = ("markdown" if "[markdown]" in line else "code"), []
        elif kind is not None:
            lines.append(line)
    flush()
    return cells


def build(out=None, *, name="issue_backfill"):
    source, modules = NOTEBOOKS[name]
    cells = cells_from((HERE / source).read_text(encoding="utf-8"))
    bundled = {
        module: (HERE / module).read_text(encoding="utf-8") for module in modules
    }
    bootstrap = "BUNDLED = " + repr(bundled) + "\n" + BOOTSTRAP
    cells.insert(
        1,
        {
            "cell_type": "code",
            "id": "modules",
            "metadata": {},
            "execution_count": None,
            "outputs": [],
            "source": bootstrap.splitlines(keepends=True),
        },
    )
    # 서버 커널은 저장소(3.14)보다 낮다. 3.10 문법으로 읽히는지 본다(ruff format 이 3.14 문법으로 바꿀 수 있다)
    for module, text in bundled.items():
        ast.parse(text, module, feature_version=OLDEST_KERNEL)
    for cell in cells:
        if cell["cell_type"] == "code":
            ast.parse(
                "".join(cell["source"]), cell["id"], feature_version=OLDEST_KERNEL
            )
    notebook = {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python (new_minjun)",
                "language": "python",
                "name": "new_minjun",
            },
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    out = Path(out) if out else HERE / f"{name}.ipynb"
    out.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    which = args.pop(0) if args and args[0] in NOTEBOOKS else "issue_backfill"
    print(build(args[0] if args else None, name=which))
