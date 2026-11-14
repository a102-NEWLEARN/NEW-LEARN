"""기사 → 사건 → 이슈. BGE-m3-ko 벡터와 평균 연결 코사인 거리로 묶는다.

사건 — 72시간 안의 기사끼리만 평균 연결(거리 0.20 이하)
  - 72시간보다 먼 쌍은 최대 거리(2)로 둔다. 그래서 날마다 나오는 같은 꼴 기사(날씨 · 시황)가 한 사건이 되지 않는다
  - 거리 0.20 이하 쌍으로 이은 덩어리마다 따로 계산한다. 덩어리가 다른 두 묶음은 모든 쌍이 0.20 보다 멀어 평균도
    멀므로, 전체를 한 번에 계산한 결과와 같다. 3일 · 3,000건 구간으로 자르던 때처럼 경계에서 사건이 갈리지 않는다
이슈 — 사건을 처음 기사 시각 순으로 하나씩 본다
  - 최근 gap_days 안에 사건이 있던 이슈마다, 새 사건 기사 × 그 이슈 최근 기사의 평균 거리를 잰다
  - 가장 가까운 이슈가 0.40 이하면 붙이고, 아니면 새 이슈를 연다. gap_days 넘게 사건이 없던 이슈에는 붙지 않는다
  - 실시간 사이트가 새 사건을 기존 이슈에 붙이는 순서와 같다. 다만 한 번 갈린 이슈를 나중에 합치지는 않는다
"""

import hashlib
import sqlite3
from datetime import datetime, timedelta

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial.distance import squareform

MODEL_ID = "dragonkue/BGE-m3-ko"
TIME_FORMAT = "%Y-%m-%d %H:%M:%S"
DAY = 86400


def load_articles(db_path, start, end=None):
    """start ≤ 발행 < end (한국 시간 문자열) 기사를 시각순으로."""
    query = (
        "SELECT article_id, link, title, description, content, published, source_name "
        "FROM articles WHERE published>=?"
        + (" AND published<?" if end else "")
        + " ORDER BY published, article_id"
    )
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(query, (start, end) if end else (start,)).fetchall()
    keys = (
        "article_id",
        "link",
        "title",
        "description",
        "content",
        "published",
        "source_name",
    )
    return [dict(zip(keys, row, strict=True)) for row in rows]


def seconds_of(published):
    epoch = datetime(1970, 1, 1)
    return np.array(
        [
            (datetime.strptime(p, TIME_FORMAT) - epoch).total_seconds()
            for p in published
        ],
        dtype=np.int64,
    )


def embedding_text(article, lead_chars=800):
    """팀 파이프라인과 같은 모양: 제목 + 줄바꿈 + 본문 앞 800자. 본문이 없으면(요금제) 설명을 쓴다."""
    body = article.get("content") or article.get("description") or ""
    return article["title"] + "\n" + body[:lead_chars]


def bge_encoder(device="cuda", batch_size=64):
    import torch
    from sentence_transformers import SentenceTransformer

    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(
            "GPU 커널이 아닙니다. CPU 로 돌리려면 DEVICE='cpu' 로 바꾸세요(매우 느림)."
        )
    dtype = torch.float32 if device == "cpu" else torch.float16
    model = SentenceTransformer(
        MODEL_ID, device=device, model_kwargs={"torch_dtype": dtype}
    )

    def encode(texts):
        return model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

    return encode


def embed_articles(
    db_path,
    articles,
    encode,
    *,
    model_key=MODEL_ID,
    lead_chars=800,
    chunk=2048,
    log=print,
):
    """벡터를 같은 SQLite 의 vectors 표에 저장해 두고 없는 것만 만든다. 입력 글이 바뀌면 다시 만든다."""
    texts = [embedding_text(a, lead_chars) for a in articles]
    hashes = [hashlib.sha1(t.encode()).hexdigest() for t in texts]
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS vectors(model TEXT NOT NULL, article_id TEXT NOT NULL, "
            "text_hash TEXT NOT NULL, vector BLOB NOT NULL, PRIMARY KEY(model, article_id))"
        )
        stored = {
            aid: (h, blob)
            for aid, h, blob in conn.execute(
                "SELECT article_id, text_hash, vector FROM vectors WHERE model=?",
                (model_key,),
            )
        }
        vectors, missing = [None] * len(articles), []
        for i, article in enumerate(articles):
            hit = stored.get(article["article_id"])
            if hit and hit[0] == hashes[i]:
                vectors[i] = np.frombuffer(hit[1], dtype=np.float32)
            else:
                missing.append(i)
        log(
            f"임베딩: 저장된 것 {len(articles) - len(missing):,}건, 새로 만들 것 {len(missing):,}건"
        )
        for start in range(0, len(missing), chunk):
            part = missing[start : start + chunk]
            made = np.asarray(encode([texts[i] for i in part]), dtype=np.float32)
            if made.shape[0] != len(part) or not np.isfinite(made).all():
                raise ValueError("임베딩 결과의 행 수가 다르거나 NaN/Inf 가 있습니다.")
            made /= np.linalg.norm(made, axis=1, keepdims=True)
            conn.executemany(
                "INSERT OR REPLACE INTO vectors VALUES(?,?,?,?)",
                [
                    (model_key, articles[i]["article_id"], hashes[i], made[k].tobytes())
                    for k, i in enumerate(part)
                ],
            )
            conn.commit()
            for k, i in enumerate(part):
                vectors[i] = made[k]
            log(f"  {min(start + chunk, len(missing)):,}/{len(missing):,}")
    if not articles:
        return np.zeros((0, 0), dtype=np.float32)
    return np.vstack(vectors).astype(np.float32)


def gated_pairs(vectors, seconds, max_distance, window_seconds, block=2048):
    """시각순 벡터에서 window 안 · 거리 ≤ max_distance 쌍(i<j). 경계 반올림 차이를 덮게 1e-6 넉넉히 잡는다."""
    rows, cols = [], []
    for start in range(0, len(vectors), block):
        stop = min(len(vectors), start + block)
        end = int(
            np.searchsorted(seconds, seconds[stop - 1] + window_seconds, side="right")
        )
        sims = vectors[start:stop] @ vectors[start:end].T
        i, j = np.nonzero(sims >= 1.0 - max_distance - 1e-6)
        i, j = i + start, j + start
        keep = (j > i) & (seconds[j] - seconds[i] <= window_seconds)
        rows.append(i[keep])
        cols.append(j[keep])
    if not rows:
        return np.zeros(0, dtype=np.int64), np.zeros(0, dtype=np.int64)
    return np.concatenate(rows), np.concatenate(cols)


def gated_average_labels(vectors, seconds, distance, window_seconds):
    """한 덩어리 안 평균 연결. window 밖 쌍은 거리 2."""
    if len(vectors) == 1:
        return np.zeros(1, dtype=np.int64)
    values = np.asarray(vectors, dtype=np.float64)
    dist = np.clip(1.0 - values @ values.T, 0.0, 2.0)
    dist[np.abs(seconds[:, None] - seconds[None, :]) > window_seconds] = 2.0
    dist = (dist + dist.T) / 2
    np.fill_diagonal(dist, 0.0)
    tree = linkage(squareform(dist, checks=False), method="average")
    return fcluster(tree, t=distance, criterion="distance") - 1


def cluster_events(
    vectors, seconds, *, distance=0.20, window_hours=72, max_component=12000, log=print
):
    """기사별 사건 번호(0부터, 첫 기사 시각순)와 진단 값."""
    n = len(vectors)
    if n == 0:
        return np.zeros(0, dtype=np.int64), {
            "pairs": 0,
            "components": 0,
            "largest": 0,
            "split": 0,
        }
    if np.any(np.diff(seconds) < 0):
        raise ValueError("기사가 시각순이 아닙니다.")
    window = window_hours * 3600
    rows, cols = gated_pairs(vectors, seconds, distance, window)
    graph = coo_matrix((np.ones(len(rows), dtype=np.int8), (rows, cols)), shape=(n, n))
    count, component = connected_components(graph, directed=False)
    order = np.argsort(component, kind="stable")
    bounds = np.flatnonzero(np.diff(component[order])) + 1
    labels = np.full(n, -1, dtype=np.int64)
    next_label, largest, split = 0, 0, 0
    for members in np.split(order, bounds):
        largest = max(largest, len(members))
        parts = [members]
        if len(members) > max_component:
            split += 1
            parts = [
                members[k : k + max_component]
                for k in range(0, len(members), max_component)
            ]
            log(
                f"경고: 기사 {len(members):,}건이 한 덩어리라 {max_component:,}건씩 시각순으로 나눠 계산합니다."
            )
        for part in parts:
            local = gated_average_labels(vectors[part], seconds[part], distance, window)
            labels[part] = local + next_label
            next_label += int(local.max()) + 1
    first = np.full(next_label, n, dtype=np.int64)
    np.minimum.at(first, labels, np.arange(n))
    rank = np.empty(next_label, dtype=np.int64)
    rank[np.argsort(first, kind="stable")] = np.arange(next_label)
    return rank[labels], {
        "pairs": len(rows),
        "components": int(count),
        "largest": int(largest),
        "split": split,
    }


def summarize_events(articles, vectors, seconds, labels):
    """사건마다 첫 · 끝 시각, 기사 수, 대표 기사(사건 평균에 가장 가까운 기사)와 기사 벡터 합."""
    k = int(labels.max()) + 1 if len(labels) else 0
    sums = np.zeros((k, vectors.shape[1] if len(vectors) else 0), dtype=np.float64)
    np.add.at(sums, labels, vectors)
    order = np.argsort(labels, kind="stable")
    bounds = np.flatnonzero(np.diff(labels[order])) + 1
    events = []
    for event, members in enumerate(np.split(order, bounds) if k else []):
        scores = vectors[members] @ (sums[event] / len(members))
        rep = articles[members[int(np.argmax(scores))]]
        events.append(
            {
                "event": event,
                "members": members,
                "start": int(seconds[members].min()),
                "end": int(seconds[members].max()),
                "articles": len(members),
                "outlets": len({articles[i]["source_name"] for i in members}),
                "title": rep["title"],
                "lead": rep["description"] or rep["content"],
                "link": rep["link"],
            }
        )
    return events, sums


def link_issues(events, sums, *, distance=0.40, gap_days=7):
    """사건별 이슈 번호. 위 모듈 설명의 순서대로 하나씩 붙인다(같은 입력이면 같은 결과)."""
    k = len(events)
    issue_of = np.full(k, -1, dtype=np.int64)
    if k == 0:
        return issue_of
    starts = np.array([e["start"] for e in events], dtype=np.int64)
    ends = np.array([e["end"] for e in events], dtype=np.int64)
    counts = np.array([e["articles"] for e in events], dtype=np.float64)
    dim = sums.shape[1]
    rows = np.zeros((64, dim))
    weights = np.zeros(64)
    row_issue = np.zeros(64, dtype=np.int64)
    active, issues, today = 0, 0, None
    for e in np.lexsort((np.arange(k), starts)):
        day = starts[e] // DAY
        if day != today:
            today = day
            recent = np.flatnonzero(
                (issue_of >= 0) & (ends >= day * DAY - gap_days * DAY)
            )
            ids, slot = np.unique(issue_of[recent], return_inverse=True)
            active = len(ids)
            if active > len(rows):
                rows, weights, row_issue = _grow(rows, weights, row_issue, active)
            rows[:active] = 0.0
            weights[:active] = 0.0
            np.add.at(rows, slot, sums[recent])
            np.add.at(weights, slot, counts[recent])
            row_issue[:active] = ids
        best = -1
        if active:
            mean_sim = (rows[:active] @ sums[e]) / (weights[:active] * counts[e])
            best = int(np.argmax(mean_sim))
            if 1.0 - mean_sim[best] > distance:
                best = -1
        if best < 0:
            if active == len(rows):
                rows, weights, row_issue = _grow(rows, weights, row_issue, active + 1)
            best, row_issue[active] = active, issues
            rows[best], weights[best] = 0.0, 0.0
            active, issues = active + 1, issues + 1
        issue_of[e] = row_issue[best]
        rows[best] += sums[e]
        weights[best] += counts[e]
    return issue_of


def _grow(rows, weights, row_issue, need):
    size = max(need, 2 * len(rows))
    grown = np.zeros((size, rows.shape[1]))
    grown[: len(rows)] = rows
    w = np.zeros(size)
    w[: len(weights)] = weights
    r = np.zeros(size, dtype=np.int64)
    r[: len(row_issue)] = row_issue
    return grown, w, r


def build_issues(events, issue_of, *, min_events=3):
    """사건 min_events 개 이상인 이슈만, 사건 수 → 기사 수가 많은 순. 같으면 먼저 시작한 이슈."""
    grouped = {}
    for event, issue in zip(events, issue_of, strict=True):
        grouped.setdefault(int(issue), []).append(event)
    issues = []
    for members in grouped.values():
        if len(members) < min_events:
            continue
        members = sorted(members, key=lambda e: (e["start"], e["event"]))
        issues.append(
            {
                "events": members,
                "event_count": len(members),
                "article_count": sum(e["articles"] for e in members),
                "start": members[0]["start"],
                "end": max(e["end"] for e in members),
            }
        )
    issues.sort(key=lambda x: (-x["event_count"], -x["article_count"], x["start"]))
    for rank, issue in enumerate(issues, 1):
        issue["issue_id"] = f"I{rank:04d}"
    return issues


ISSUE_COLUMNS = [
    "이슈제목",
    "요약",
    "사건",
    "사건수",
    "기사수",
    "시작",
    "끝",
    "이슈판정",
    "판정근거",
    "이슈ID",
]


def write_csvs(out_dir, issues, summaries, articles):
    """issues.csv(이슈 한 줄) · issue_events.csv(사건 한 줄) · issue_articles.csv(기사 한 줄). 엑셀용 UTF-8 BOM."""
    import csv
    from pathlib import Path

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        name: out_dir / f"{name}.csv"
        for name in ("issues", "issue_events", "issue_articles")
    }
    with (
        paths["issues"].open("w", encoding="utf-8-sig", newline="") as issue_file,
        paths["issue_events"].open("w", encoding="utf-8-sig", newline="") as event_file,
        paths["issue_articles"].open(
            "w", encoding="utf-8-sig", newline=""
        ) as article_file,
    ):
        issue_rows, event_rows, article_rows = (
            csv.writer(issue_file),
            csv.writer(event_file),
            csv.writer(article_file),
        )
        issue_rows.writerow(ISSUE_COLUMNS)
        event_rows.writerow(
            [
                "이슈ID",
                "순서",
                "사건ID",
                "시작",
                "끝",
                "기사수",
                "언론사수",
                "대표기사제목",
                "대표기사링크",
            ]
        )
        article_rows.writerow(
            ["이슈ID", "사건ID", "기사ID", "발행", "언론사", "제목", "링크"]
        )
        for issue in issues:
            summary = summaries.get(issue["issue_id"], {})
            verdict = (
                ""
                if "is_issue" not in summary
                else ("이슈" if summary["is_issue"] else "주제 모음")
            )
            lines = [
                f"{fmt(e['start'], '%Y-%m-%d')} {e['title']} ({e['articles']}건)"
                for e in issue["events"]
            ]
            issue_rows.writerow(
                [
                    summary.get("title", ""),
                    summary.get("summary", ""),
                    "\n".join(lines),
                    issue["event_count"],
                    issue["article_count"],
                    fmt(issue["start"]),
                    fmt(issue["end"]),
                    verdict,
                    summary.get("reason", summary.get("error", "")),
                    issue["issue_id"],
                ]
            )
            for order, event in enumerate(issue["events"], 1):
                event_id = f"E{event['event']:06d}"
                event_rows.writerow(
                    [
                        issue["issue_id"],
                        order,
                        event_id,
                        fmt(event["start"]),
                        fmt(event["end"]),
                        event["articles"],
                        event["outlets"],
                        event["title"],
                        event["link"],
                    ]
                )
                for i in event["members"]:
                    a = articles[i]
                    article_rows.writerow(
                        [
                            issue["issue_id"],
                            event_id,
                            a["article_id"],
                            a["published"],
                            a["source_name"],
                            a["title"],
                            a["link"],
                        ]
                    )
    return paths


def fmt(seconds, pattern="%Y-%m-%d %H:%M"):
    """seconds_of 의 값(한국 시간 벽시계 기준 초) → 문자열."""
    return (datetime(1970, 1, 1) + timedelta(seconds=int(seconds))).strftime(pattern)
