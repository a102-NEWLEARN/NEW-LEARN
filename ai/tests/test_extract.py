import json

import pytest

from app.extract.occurred_at import resolve_occurred_at
from app.extract.postprocess import OutputInvalid, postprocess
from app.extract.preprocess import (
    build_user_message,
    is_analyzable,
    paragraphs_of,
    split_sentences,
)
from app.extract.prompt import PROMPT_VERSION, SYSTEM_PROMPT

PUB = "2026-10-16T11:32:00+09:00"


# ---------------------------------------------------------------- 전처리


def test_sentences_keep_paragraph_position_and_original_text():
    body = "기관은 16일 조사 결과를 발표했다. 업계는 우려했다.\n\n▶ 관련 기사 보기\n둘째 문단이다."
    sentences, dropped = split_sentences(body)

    assert [s["id"] for s in sentences] == ["s1", "s2", "s3"]
    assert [(s["paragraphIndex"], s["sentenceIndex"]) for s in sentences] == [
        (0, 0),
        (0, 1),
        (2, 0),  # 안내 문구 줄도 문단 번호에는 센다
    ]
    paras = paragraphs_of(body)
    assert all(s["text"] in paras[s["paragraphIndex"]] for s in sentences)
    assert dropped == ["▶ 관련 기사 보기"]


def test_inline_copyright_is_cut_from_one_line_body():
    sentences, _ = split_sentences("본문 문장이다. Copyright © 어느신문 무단전재 금지")
    assert [s["text"] for s in sentences] == ["본문 문장이다."]


def test_noise_only_body_is_not_analyzable():
    sentences, _ = split_sentences("ⓒ 어느신문\n▶ 영상 시청")
    assert not is_analyzable(sentences)


def test_user_message_numbers_sentences():
    sentences, _ = split_sentences("첫 문장이다. 둘째 문장이다.")
    message = build_user_message("제목", "언론사", PUB, sentences)
    assert "[s1] 첫 문장이다." in message and "[s2] 둘째 문장이다." in message


def test_content_line_starting_with_arrow_is_kept():
    # 방송 기사의 "▶ 인터뷰: …"는 내용이다. 첫 글자만 보고 버리지 않는다
    sentences, dropped = split_sentences(
        "▶ 인터뷰: 주민 A씨는 대피했다고 말했다.\n▶ 관련 기사 보기"
    )
    assert [s["text"] for s in sentences] == ["▶ 인터뷰: 주민 A씨는 대피했다고 말했다."]
    assert dropped == ["▶ 관련 기사 보기"]


def test_one_line_body_keeps_text_after_photo_credit():
    # 본문이 한 줄뿐인 데이터에서 앞머리 사진 출처 때문에 기사 전체가 사라지면 안 된다
    body = (
        "ⓒ뉴시스 러시아 빙상계가 빅토르 안을 상징으로 꼽았다. "
        + "그는 귀화 선수다. " * 10
    )
    sentences, dropped = split_sentences(body)
    assert sentences[0]["text"] == "러시아 빙상계가 빅토르 안을 상징으로 꼽았다."
    assert sentences[0]["text"] in paragraphs_of(body)[0]
    assert dropped == ["ⓒ뉴시스"]


def test_split_after_da_followed_by_digit_or_quote():
    sentences, _ = split_sentences(
        "평가했다.17일 발표했다.“좋다”고 말했다. 비율은 3.5%다."
    )
    assert [s["text"] for s in sentences] == [
        "평가했다.",
        "17일 발표했다.",
        "“좋다”고 말했다.",
        "비율은 3.5%다.",
    ]


def test_title_html_entities_are_restored_for_llm_only():
    sentences, _ = split_sentences("본문이다.")
    message = build_user_message(
        "권성동 quot;민주당amp;#91;단독amp;#93; #039;특검#039;",
        "언론사",
        PUB,
        sentences,
    )
    assert message.startswith("제목: 권성동 \"민주당[단독] '특검'")


# ---------------------------------------------------------------- 발생 시점


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("16일", "2026-10-16T00:00:00+09:00"),
        ("지난 6일", "2026-10-06T00:00:00+09:00"),
        ("14일 오후 2시 30분", "2026-10-14T14:30:00+09:00"),
        ("16일 오전 10시", "2026-10-16T10:00:00+09:00"),
        ("어제", "2026-10-15T00:00:00+09:00"),
        ("이날", "2026-10-16T00:00:00+09:00"),
        ("10월 6일", "2026-10-06T00:00:00+09:00"),
        ("현지시간 15일", "2026-10-15T00:00:00+09:00"),
        ("지난 28일", "2026-09-28T00:00:00+09:00"),  # 발행일보다 큰 날 → 지난달
        ("6~7일", "2026-10-06T00:00:00+09:00"),
        ("지난달", None),
        ("올해 초", None),
        ("지난주", None),
        ("다음 달 3일", None),  # 이미 일어난 일인데 발행일 뒤
        ("16일 오후 3시", None),  # 같은 날이지만 발행 시각(11:32)보다 뒤
        ("16일과 17일", None),  # 날짜가 둘
        (None, None),
        ("3시간 전", None),
    ],
)
def test_resolve_occurred_at(text, expected):
    assert resolve_occurred_at(text, PUB)[0] == expected


@pytest.mark.parametrize(
    "text",
    ["오는 11월 2일", "오는 28일", "11월 2일", "내일", "다음 주 월요일", "28일 예정"],
)
def test_future_expressions_are_not_turned_into_past_dates(text):
    # MR !272 리뷰: 10/27 기사의 '오는 11월 2일'이 2025-11-02, '오는 28일'이 9/28 로 계산됐다
    assert resolve_occurred_at(text, "2026-10-27T10:00:00+09:00")[0] is None


def test_occurred_at_year_rollover():
    jan = "2027-01-03T09:00:00+09:00"
    assert resolve_occurred_at("지난달 28일", jan)[0] == "2026-12-28T00:00:00+09:00"
    assert resolve_occurred_at("지난 30일", jan)[0] == "2026-12-30T00:00:00+09:00"
    assert resolve_occurred_at("12월 31일", jan)[0] == "2026-12-31T00:00:00+09:00"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "15일(현지시각) 오후 11시",
            "2026-10-15T00:00:00+09:00",
        ),  # 현지 시각은 버리고 날짜만
        ("15일(현지시각) 기준 전날", "2026-10-14T00:00:00+09:00"),
        ("오전 9시 47분", "2026-10-16T09:47:00+09:00"),  # 날짜 없이 시각만 → 발행일
        ("오후 2시", None),  # 발행 시각(11:32)보다 뒤
        ("다음날 오전 9시", None),  # 무엇의 다음날인지 모른다
        ("이튿날", None),
    ],
)
def test_local_time_anchor_and_time_only(text, expected):
    assert resolve_occurred_at(text, PUB)[0] == expected


def test_utc_published_at_is_read_in_korean_time():
    # NewsData 의 pubDate 는 UTC. 10/15 20:00 UTC = 10/16 05:00 KST 이므로 「오늘」은 16일이다
    assert (
        resolve_occurred_at("오늘", "2026-10-15T20:00:00+00:00")[0]
        == "2026-10-16T00:00:00+09:00"
    )


# ---------------------------------------------------------------- 결과 검사


SENTENCES = [
    {
        "id": "s1",
        "text": "기관은 16일 조사 결과를 발표했다.",
        "paragraphIndex": 0,
        "sentenceIndex": 0,
    },
    {"id": "s2", "text": "업계는 우려했다.", "paragraphIndex": 1, "sentenceIndex": 0},
]


def raw(**kw):
    base = {
        "summary": "요약",
        "branches": [],
        "primaryCoreIndex": None,
        "eventTimeText": None,
    }
    return json.dumps(base | kw, ensure_ascii=False)


def run(text):
    return postprocess(text, SENTENCES, PUB)


def test_orders_branches_dedupes_leaves_and_moves_primary_to_front():
    result, diag = run(
        raw(
            branches=[
                {
                    "type": "REACTION",
                    "items": [{"text": "업계: 우려", "evidence": ["[s2]"]}],
                },
                {
                    "type": "CORE",
                    "items": [
                        {"text": "중복 잎", "evidence": ["s1"]},
                        {"text": "중복  잎", "evidence": []},
                        {
                            "text": "10/16 기관, 조사 결과 발표",
                            "evidence": ["s1", "s9"],
                        },
                    ],
                },
                {"type": "OUTLOOK", "items": []},
            ],
            primaryCoreIndex=2,
            eventTimeText="16일",
        )
    )

    assert [b["type"] for b in result["mindmap"]["branches"]] == ["CORE", "REACTION"]
    core = result["mindmap"]["branches"][0]["items"]
    # 중복 잎을 지워 대표는 1번이 되고, B안대로 맨 앞으로 옮긴다
    assert [i["text"] for i in core] == ["10/16 기관, 조사 결과 발표", "중복 잎"]
    assert result["primaryCoreIndex"] == 0 and diag["primary_moved_from"] == 1
    assert core[0]["evidence"] == [
        {
            "text": "기관은 16일 조사 결과를 발표했다.",
            "paragraphIndex": 0,
            "sentenceIndex": 0,
        }
    ]
    assert diag["evidence_dropped"] == ["CORE: 's9'"]  # 없는 번호는 근거만 지운다
    assert result["occurredAt"] == "2026-10-16T00:00:00+09:00"
    assert result["schemaVersion"] == "mindmap-v1"


def test_primary_pointing_to_removed_duplicate_follows_survivor():
    result, _ = run(
        raw(
            branches=[
                {
                    "type": "CORE",
                    "items": [{"text": "A", "evidence": ["s1"]}, {"text": "A"}],
                }
            ],
            primaryCoreIndex=1,
        )
    )
    assert result["primaryCoreIndex"] == 0
    assert len(result["mindmap"]["branches"][0]["items"]) == 1


def test_null_primary_keeps_summary_and_drops_time():
    result, diag = run(
        raw(
            summary="  후임 후보 4명 거론  ",
            branches=[
                {"type": "CORE", "items": [{"text": "임명", "evidence": ["s1"]}]}
            ],
            eventTimeText="16일",
        )
    )
    assert result["summary"] == "후임 후보 4명 거론"
    assert result["primaryCoreIndex"] is None and result["occurredAt"] is None
    assert diag["warnings"]


def test_strips_star_marker_and_omits_empty_evidence():
    result, _ = run(
        raw(branches=[{"type": "CORE", "items": [{"text": "★ 10/16 발표"}]}])
    )
    leaf = result["mindmap"]["branches"][0]["items"][0]
    assert leaf == {"text": "10/16 발표"}


def test_merges_repeated_branch_type():
    result, _ = run(
        raw(
            branches=[
                {"type": "CORE", "items": [{"text": "A"}]},
                {"type": "CORE", "items": [{"text": "B"}]},
            ],
            primaryCoreIndex=1,
        )
    )
    assert len(result["mindmap"]["branches"]) == 1
    assert [i["text"] for i in result["mindmap"]["branches"][0]["items"]] == ["B", "A"]


@pytest.mark.parametrize(
    "bad",
    [
        "not json",
        raw(branches=[]),
        raw(branches=[{"type": "CORE", "items": [{"text": " "}]}]),
        raw(branches=[{"type": "WHO", "items": [{"text": "A"}]}]),
        raw(branches=[{"type": "CORE", "items": [{"text": "A"}]}], primaryCoreIndex=1),
        raw(
            branches=[{"type": "REACTION", "items": [{"text": "A"}]}],
            primaryCoreIndex=0,
        ),
    ],
)
def test_invalid_outputs_ask_for_one_more_call(bad):
    with pytest.raises(OutputInvalid):
        run(bad)


def test_duplicate_leaf_keeps_evidence_of_both():
    result, _ = run(
        raw(
            branches=[
                {
                    "type": "CORE",
                    "items": [
                        {"text": "같은 잎", "evidence": ["s1"]},
                        {"text": "같은  잎", "evidence": ["s2", "s1"]},
                    ],
                }
            ]
        )
    )
    items = result["mindmap"]["branches"][0]["items"]
    assert len(items) == 1 and len(items[0]["evidence"]) == 2


def test_repeated_reaction_speaker_is_warned_not_merged():
    result, diag = run(
        raw(
            branches=[
                {"type": "CORE", "items": [{"text": "A", "evidence": ["s1"]}]},
                {
                    "type": "REACTION",
                    "items": [
                        {"text": "홍길동: 비판", "evidence": ["s2"]},
                        {"text": "홍길동 : 우려", "evidence": ["s2"]},
                        {"text": "업계: 우려", "evidence": ["s2"]},
                    ],
                },
            ]
        )
    )
    assert len(result["mindmap"]["branches"][1]["items"]) == 3
    assert any("홍길동" in w for w in diag["warnings"])


# ---------------------------------------------------------------- 프롬프트


def test_prompt_carries_confirmed_rules():
    assert PROMPT_VERSION == "extract-v4.12-mindmap"
    for phrase in (
        "① 먼저 null 인 기사인지 본다",  # 판단 순서: null 기사 → 중심 완료 행위 → 시점
        "단순 모집 · 행사 · 이벤트 · 출시 · 공연",  # 예고 · 안내 기사는 null
        "새 정책 · 제도의 신설 · 변경 · 시행",
        "장 마감",
        "출처 기관의 발표로 바꾸지 않는다",
        "CORE 한 잎에 보존한다",
        "한 주체 한 잎",
        "이미 보도했어도 된다",
        "발생 · 신고 접수 · 발표 · 보도 시점을 구분",
        "취재 · 확인 서술",
    ):
        assert phrase in SYSTEM_PROMPT
    assert "★" not in SYSTEM_PROMPT.split("[예시")[1]
