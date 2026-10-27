import re
from typing import TypedDict


class Sentence(TypedDict):
    id: str  # LLM 에 보이는 번호 s1, s2, …
    text: str  # 원문 문단의 부분 문자열 — API 가 근거를 글자 그대로 대조한다
    paragraphIndex: int
    sentenceIndex: int


# 줄 전체가 안내 문구인 경우
NOISE_LINE = re.compile(
    r"^(\*?이 기사는 AI|ⓒ|저작권자|무단\s*전재|\S+@\S+\.\S+$|▶|☞|관련\s*기사)"
)
# 줄바꿈 없이 한 줄로 오는 본문(NewsData)에서는 안내 문구가 본문과 같은 줄에 붙어 온다.
# 줄을 버리지 않고 이 구간만 잘라 낸다
INLINE_NOISE = re.compile(
    r"ⓒ\s*SBS & SBS i\s*/\s*RSS 피드는.*?무단복제 및 재배포 금지"  # SBS 앞머리
    r"|Copyright\s*[©ⓒ].*$"  # 끝에 붙은 저작권 문구
    r"|▶\s*이 기사의 전체 내용 확인하기"
    r"|▶\s*영상 시청"
)
BYLINE_PREFIX = re.compile(r"^\[[^\]]{0,30}=[^\]]{0,20}기자\]\s*")
# 마침표 뒤 공백이 있거나, '다.' 바로 뒤에 한글이 붙어 있으면(편집 오류) 나눈다
SENT_SPLIT = re.compile(
    r"(?<=[.!?])\s+(?=[\"“‘'(\[A-Za-z0-9가-힣])|(?<=다\.)(?=[가-힣])"
)


def paragraphs_of(body: str) -> list[str]:
    """api-screen.md 3절의 문단 — 줄바꿈으로 나누고 빈 줄을 뺀 순서. API(Java)와 같은 규칙."""
    return [line for line in body.splitlines() if line.strip()]


def split_sentences(body: str) -> tuple[list[Sentence], list[str]]:
    """문장마다 LLM 용 번호와 원문 위치를 붙인다. 돌려주는 두 번째 값은 지운 안내 문구(로그용).

    안내 문구 줄도 문단 번호에는 센다 — 화면의 「N번째 문단」이 원문과 맞아야 한다.
    제목 표시([영상] · [포토])만으로는 거르지 않는다(api-internal.md 5절).
    """
    sentences: list[Sentence] = []
    dropped: list[str] = []
    for p_idx, line in enumerate(paragraphs_of(body)):
        stripped = line.strip()
        dropped += [m.group(0) for m in INLINE_NOISE.finditer(stripped)]
        s_idx = 0
        for piece in INLINE_NOISE.split(stripped):
            piece = piece.strip()
            if not piece:
                continue
            if NOISE_LINE.search(piece):
                dropped.append(piece)
                continue
            for part in SENT_SPLIT.split(BYLINE_PREFIX.sub("", piece)):
                part = part.strip()
                if part:
                    sentences.append(
                        {
                            "id": f"s{len(sentences) + 1}",
                            "text": part,
                            "paragraphIndex": p_idx,
                            "sentenceIndex": s_idx,
                        }
                    )
                    s_idx += 1
    return sentences, dropped


def is_analyzable(sentences: list[Sentence]) -> bool:
    """안내 문구를 뺀 뒤 문장이 없으면 GMS 를 부르지 않고 INPUT_NOT_ANALYZABLE 로 끝낸다.
    문장 수 · 길이 기준값은 데이터를 더 보고 정한다(api-internal.md 5절)."""
    return bool(sentences)


def normalize_id(raw: str) -> str:
    """LLM 이 문장 번호를 '[s1]' · 'S1 ' 처럼 적는 표기 차이만 맞춘다. 번호 자체는 바꾸지 않는다."""
    return raw.strip().strip("[]").strip().lower()


def build_user_message(
    title: str, source: str, published_at: str, sentences: list[Sentence]
) -> str:
    numbered = "\n".join(f"[{s['id']}] {s['text']}" for s in sentences)
    return f"제목: {title}\n언론사: {source}\n발행: {published_at}\n본문:\n{numbered}"
