"""저장해 둔 기사 · 벡터를 API 요청 없이 다시 사건 · 이슈로 묶는다. 2주(10/21~11/3) · 19일(10/21~11/8) 결과를 이 코드로 만들었다.

기본값이 그 결과의 설정이다: 사건 거리 0.25 · 이슈 거리 0.40 · 기사 5건 이상인 묶음만 사건.
노트북(notebook_source.py) 설정과 다른 것은 사건 거리와 기사 수 조건 두 가지다.

- 입력 DB 는 regroup_input.py 로 만든다(데이터셋의 최종 선정 기사 + 벡터). 읽기 전용으로 열고, 저장된 벡터의 입력 글(제목 +
  줄바꿈 + 본문 앞 800자) 해시가 맞는지 확인한다. NewsData · GMS · 모델 다운로드 없이 CPU 로 돈다(72,402건에 약 40초)
- 묶기는 옆의 issue_grouping.py 를 그대로 쓴다(72시간 창 평균 연결 사건, 7일 순차 이슈, 사건 3개 이상)
- --min-event-articles N: 기사 N건 이상인 묶음만 사건으로 보고 이슈를 묶는다. 그보다 작은 묶음은 이슈에 들어가지 않는다
  (2026-11-02 팀 논의: 기사 5건이 모여야 사건 하나)
- --events 에 값을 여럿 주면 임계값별로 비교한다. 결과: sweep.csv(설정별 구조 지표), largest_events_<사건>.csv,
  merges_<낮은>_<높은>.csv(임계값을 올릴 때 새로 합쳐지는 사건 쌍 표본), <사건>_<이슈>/issues.csv · issue_events.csv ·
  issue_articles.csv, run.json
- --drop-shared-body · --drop-list 는 불량 본문 규칙(newsdata_dataset.py)이 생기기 전 실험용이다. 데이터셋 선정 기사를
  쓰면 필요 없다

numpy · scipy · pandas 가 있어야 한다(ai 환경에는 pandas 가 없다). ai/ 에서:
python experiments/issue_backfill/regroup.py --db <입력 DB> --out <결과 폴더>
"""

import argparse
import hashlib
import itertools
import json
import sqlite3
import time
from pathlib import Path

import issue_grouping as ig
import numpy as np
import pandas as pd

KEYS = (
    "article_id",
    "link",
    "title",
    "description",
    "content",
    "published",
    "source_name",
)


def load(db):
    """ig.load_articles 와 같은 순서(발행 시각, 기사ID)로 기사와 저장된 벡터를 읽는다."""
    with sqlite3.connect(f"file:{Path(db).as_posix()}?mode=ro", uri=True) as conn:
        rows = conn.execute(
            f"SELECT {', '.join(KEYS)} FROM articles ORDER BY published, article_id"
        ).fetchall()
        stored = {
            aid: (h, blob)
            for aid, h, blob in conn.execute(
                "SELECT article_id, text_hash, vector FROM vectors WHERE model=?",
                (ig.MODEL_ID,),
            )
        }
    articles = [dict(zip(KEYS, row, strict=True)) for row in rows]
    vectors = np.empty((len(articles), 1024), dtype=np.float32)
    stale = 0
    for i, a in enumerate(articles):
        h, blob = stored[a["article_id"]]
        stale += h != hashlib.sha1(ig.embedding_text(a).encode()).hexdigest()
        vectors[i] = np.frombuffer(blob, dtype=np.float32)
    if stale:
        raise ValueError(f"입력 글이 바뀐 기사 {stale}건: 벡터를 다시 만들어야 합니다.")
    return articles, vectors, ig.seconds_of([a["published"] for a in articles])


def shared_body(articles, head=200, min_titles=3):
    """본문 앞 head 자가 제목이 다른 기사 min_titles 건 이상과 같은 기사. 약관 · 다른 기사 본문이 본문 자리에 들어온 경우다."""
    titles = {}
    for a in articles:
        if a["content"]:
            titles.setdefault(a["content"][:head], set()).add(a["title"])
    return np.array(
        [
            bool(a["content"]) and len(titles[a["content"][:head]]) >= min_titles
            for a in articles
        ]
    )


def unit(v):
    return v / max(float(np.linalg.norm(v)), 1e-12)


def event_stats(articles, vectors, events, info):
    n = len(articles)
    sizes = np.array([e["articles"] for e in events])
    multi = [e for e in events if e["articles"] >= 2]
    span = np.array([(e["end"] - e["start"]) / 3600 for e in multi])
    coh = [
        float((vectors[e["members"]] @ unit(vectors[e["members"]].mean(0))).mean())
        for e in events
        if e["articles"] >= 5
    ]
    return {
        "events": len(events),
        "singleton_share": round(float((sizes == 1).sum() / n), 3),
        "articles_in_multi": round(float(sizes[sizes >= 2].sum() / n), 3),
        "events_2plus": len(multi),
        "events_10plus": int((sizes >= 10).sum()),
        "events_50plus": int((sizes >= 50).sum()),
        "largest_event": int(sizes.max()),
        "span_h_p50": round(float(np.median(span)), 1) if len(span) else np.nan,
        "span_h_p90": round(float(np.quantile(span, 0.9)), 1) if len(span) else np.nan,
        "multi_outlet_share": round(
            float(np.mean([e["outlets"] >= 2 for e in multi])), 3
        )
        if multi
        else np.nan,
        "cohesion_p10_5plus": round(float(np.quantile(coh, 0.1)), 3) if coh else np.nan,
        "largest_component": info["largest"],
        "split_components": info["split"],
    }


def issue_stats(articles, events, issue_of, issues):
    in_issue = sum(i["article_count"] for i in issues)
    ev = np.array([i["event_count"] for i in issues]) if issues else np.zeros(1)
    span = [(i["end"] - i["start"]) / 86400 for i in issues]
    return {
        "issue_candidates": int(issue_of.max()) + 1 if len(issue_of) else 0,
        "issues_3plus": len(issues),
        "events_in_issues": int(ev.sum()) if issues else 0,
        "articles_in_issues": in_issue,
        "articles_in_issues_share": round(in_issue / len(articles), 3),
        "largest_issue_events": int(ev.max()),
        "largest_issue_articles": max((i["article_count"] for i in issues), default=0),
        "issue_events_p50": float(np.median(ev)),
        "issue_span_d_p90": round(float(np.quantile(span, 0.9)), 1) if span else np.nan,
    }


def largest_events(articles, events, top=30, examples=6):
    rows = []
    for e in sorted(events, key=lambda e: -e["articles"])[:top]:
        m = sorted(e["members"], key=lambda i: articles[i]["published"])
        pick = [
            m[k]
            for k in np.unique(
                np.linspace(0, len(m) - 1, min(examples, len(m))).astype(int)
            )
        ]
        rows.append(
            {
                "event": e["event"],
                "articles": e["articles"],
                "outlets": e["outlets"],
                "start": ig.fmt(e["start"]),
                "span_h": round((e["end"] - e["start"]) / 3600, 1),
                "rep_title": e["title"],
                "titles": " | ".join(articles[i]["title"] for i in pick),
            }
        )
    return pd.DataFrame(rows)


def new_merges(articles, vectors, low, high, n=40, seed=0):
    """낮은 임계값에서 따로였다가 높은 임계값에서 한 사건이 된 두 사건(가장 큰 둘)을 뽑는다."""
    lo_labels, lo_events = low
    hi_labels, _ = high
    rng = np.random.default_rng(seed)
    parts = (
        pd.DataFrame({"hi": hi_labels, "lo": lo_labels}).groupby("hi")["lo"].unique()
    )
    merged = parts[parts.map(len) >= 2]
    rows = []
    for hi in rng.choice(merged.index.to_numpy(), min(n, len(merged)), replace=False):
        a, b = sorted(merged[hi], key=lambda k: -lo_events[k]["articles"])[:2]
        ea, eb = lo_events[a], lo_events[b]
        ca, cb = (
            unit(vectors[ea["members"]].mean(0)),
            unit(vectors[eb["members"]].mean(0)),
        )
        rows.append(
            {
                "hi_event": int(hi),
                "hi_size": int((hi_labels == hi).sum()),
                "parts": len(merged[hi]),
                "a_articles": ea["articles"],
                "a_start": ig.fmt(ea["start"]),
                "a_title": ea["title"],
                "b_articles": eb["articles"],
                "b_start": ig.fmt(eb["start"]),
                "b_title": eb["title"],
                "centroid_cos": round(float(ca @ cb), 3),
            }
        )
    return pd.DataFrame(rows), len(merged)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="regroup_input.py 로 만든 입력 DB")
    ap.add_argument("--out", required=True, help="결과 폴더")
    ap.add_argument("--events", type=float, nargs="+", default=[0.25])
    ap.add_argument("--issues", type=float, nargs="+", default=[0.40])
    ap.add_argument(
        "--write", nargs="*", default=["0.25/0.40"], help="CSV 를 쓸 사건/이슈 설정"
    )
    ap.add_argument(
        "--drop-shared-body",
        action="store_true",
        help="본문이 다른 제목 기사와 같은 기사를 빼고 묶는다",
    )
    ap.add_argument("--drop-list", help="뺄 기사 목록 CSV(기사ID · 사유코드 열)")
    ap.add_argument(
        "--min-event-articles",
        type=int,
        default=5,
        help="기사가 이 수 이상인 묶음만 사건으로 보고 이슈를 묶는다",
    )
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    articles, vectors, seconds = load(args.db)
    print(
        f"기사 {len(articles):,}건 · 벡터 {vectors.shape} · {articles[0]['published']} ~ {articles[-1]['published']} ({time.time() - t0:.0f}초)"
    )
    dropped = 0
    if args.drop_shared_body:
        keep = ~shared_body(articles)
        dropped = int((~keep).sum())
        articles, vectors, seconds = (
            [a for a, k in zip(articles, keep, strict=True) if k],
            vectors[keep],
            seconds[keep],
        )
        print(f"본문이 다른 제목 기사와 같은 {dropped:,}건 제외 → {len(articles):,}건")
    drop_list = None
    if args.drop_list:
        listed = pd.read_csv(args.drop_list, encoding="utf-8-sig", dtype=str)
        keep = ~np.isin(
            [a["article_id"] for a in articles], listed["기사ID"].to_numpy()
        )
        drop_list = {
            "path": str(args.drop_list),
            "count": int((~keep).sum()),
            "by_reason": {
                k: int(v) for k, v in listed["사유코드"].value_counts().items()
            },
        }
        articles, vectors, seconds = (
            [a for a, k in zip(articles, keep, strict=True) if k],
            vectors[keep],
            seconds[keep],
        )
        print(
            f"정리 목록의 {drop_list['count']:,}건 제외 {drop_list['by_reason']} → {len(articles):,}건"
        )
    write = {tuple(float(x) for x in w.split("/")) for w in args.write}
    rows, by_event = [], {}
    for e_t in sorted(args.events):
        t = time.time()
        labels, info = ig.cluster_events(
            vectors, seconds, distance=e_t, window_hours=72
        )
        events, sums = ig.summarize_events(articles, vectors, seconds, labels)
        by_event[e_t] = (labels, events)
        es = event_stats(articles, vectors, events, info)
        print(
            f"사건 {e_t:.2f}: {es['events']:,}개 · 단독 {es['singleton_share']:.1%} · 최대 {es['largest_event']} ({time.time() - t:.0f}초)"
        )
        largest_events(articles, events).to_csv(
            out / f"largest_events_{e_t:.2f}.csv", index=False, encoding="utf-8-sig"
        )
        big = [
            k for k, e in enumerate(events) if e["articles"] >= args.min_event_articles
        ]
        linkable, linkable_sums = [events[k] for k in big], sums[big]
        if args.min_event_articles > 1:
            print(
                f"  기사 {args.min_event_articles}건 이상 사건 {len(linkable):,}개만 이슈로 묶는다"
            )
        for i_t in sorted(args.issues):
            issue_of = ig.link_issues(linkable, linkable_sums, distance=i_t, gap_days=7)
            issues = ig.build_issues(linkable, issue_of, min_events=3)
            rows.append(
                {
                    "event_distance": e_t,
                    "issue_distance": i_t,
                    **es,
                    **issue_stats(articles, linkable, issue_of, issues),
                }
            )
            if (e_t, i_t) in write:
                paths = ig.write_csvs(
                    out / f"{e_t:.2f}_{i_t:.2f}", issues, {}, articles
                )
                print(f"  이슈 {i_t:.2f}: {len(issues):,}개 → {paths['issues'].parent}")
    sweep = pd.DataFrame(rows)
    sweep.to_csv(out / "sweep.csv", index=False, encoding="utf-8-sig")
    keys = sorted(by_event)
    merge_counts = {}
    for lo, hi in itertools.pairwise(keys):
        sample, count = new_merges(articles, vectors, by_event[lo], by_event[hi])
        sample.to_csv(
            out / f"merges_{lo:.2f}_{hi:.2f}.csv", index=False, encoding="utf-8-sig"
        )
        merge_counts[f"{lo:.2f}->{hi:.2f}"] = count
    (out / "run.json").write_text(
        json.dumps(
            {
                "db": str(args.db),
                "articles": len(articles),
                "dropped_shared_body": dropped,
                "dropped_list": drop_list,
                "first": articles[0]["published"],
                "last": articles[-1]["published"],
                "event_window_hours": 72,
                "issue_gap_days": 7,
                "min_events": 3,
                "min_event_articles": args.min_event_articles,
                "new_merges": merge_counts,
                "seconds": round(time.time() - t0),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"끝 ({time.time() - t0:.0f}초) → {out}")


if __name__ == "__main__":
    main()
