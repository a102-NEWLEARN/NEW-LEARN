import html
import re
from typing import TypedDict


class Sentence(TypedDict):
    id: str  # LLM 에 보이는 번호 s1, s2, …
    text: str  # 원문 문단의 부분 문자열 — API 가 근거를 글자 그대로 대조한다
    paragraphIndex: int
    sentenceIndex: int


# 줄 전체가 안내 문구인 경우. 첫 글자만 보고 버리지 않고, 확실히 안내 문구인 짧은 줄만 통째로 버린다.
# 방송 기사의 "▶ 인터뷰: …"처럼 ▶ 로 시작하는 내용 줄은 남긴다
NOTICE_LINE_MAX = 120
NOTICE_LINE = re.compile(
    r"\*?이 기사는 AI.*"
    r"|(?:ⓒ|©|Copyright|저작권자).{0,40}"  # 짧은 출처 · 저작권 줄
    r"|(?:ⓒ|©|Copyright|저작권자).*(?:무단|재배포|All rights).*"
    r"|무단\s*전재.*"
    r"|\S+@\S+\.\S+"  # 기자 이메일만 있는 줄
    r"|[▶☞]\s*(?:관련\s*기사|이\s*기사|기사\s*원문|영상\s*(?:보기|시청)|구독|제보|바로\s*가기|많이\s*본).{0,60}"
    r"|관련\s*기사.{0,60}"
)
# 본문이 한 줄뿐인 데이터(SSAFY · NewsData)는 "ⓒ뉴시스 러시아 빙상계가 …"처럼 사진 출처로 시작해도
# 본문 전체가 그 줄이다 — 앞머리 출처만 뗀다
PHOTO_CREDIT = re.compile(r"^ⓒ\s*\S+\s+")
# 줄바꿈 없이 한 줄로 오는 본문(NewsData)에서는 안내 문구가 본문과 같은 줄에 붙어 온다.
# 줄을 버리지 않고 이 구간만 잘라 낸다
INLINE_NOISE = re.compile(
    r"ⓒ\s*SBS & SBS i\s*/\s*RSS 피드는.*?무단복제 및 재배포 금지"  # SBS 앞머리
    r"|Copyright\s*[©ⓒ].*$"  # 끝에 붙은 저작권 문구
    r"|▶\s*이 기사의 전체 내용 확인하기"
    r"|▶\s*영상 시청"
)
BYLINE_PREFIX = re.compile(r"^\[[^\]]{0,30}=[^\]]{0,20}기자\]\s*")
# 마침표 뒤 공백이 있거나, '다.' 바로 뒤에 한글 · 숫자 · 따옴표 · 괄호가 붙어 있으면(한 줄 본문의 편집 오류,
# "평가했다.17일 …") 나눈다. 소수점("3.5")은 '다.' 뒤가 아니라 그대로 둔다
SENT_SPLIT = re.compile(
    r"(?<=[.!?])\s+(?=[\"“‘'(\[A-Za-z0-9가-힣])|(?<=다\.)(?=[가-힣0-9\"“‘'(\[])"
)
# SSAFY 데이터 제목에 '&'가 빠진 채 남은 HTML 기호(quot; · #039; · amp;#91;)
_AMP_BEFORE_NUM = re.compile(r"(?<!&)amp;(?=#)")
_BARE_ENTITY = re.compile(r"(?<!&)(quot|amp|lt|gt|apos|nbsp);")
_BARE_NUM_ENTITY = re.compile(r"(?<![&\d])#(\d{2,5});")


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
            if len(piece) <= NOTICE_LINE_MAX and NOTICE_LINE.fullmatch(piece):
                dropped.append(piece)
                continue
            if m := PHOTO_CREDIT.match(piece):
                dropped.append(m.group(0).strip())
                piece = piece[m.end() :]
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


def clean_title(title: str) -> str:
    """'&'가 빠진 HTML 기호를 되살린다. LLM 에 넣는 제목에만 쓴다 — 본문은 근거 원문 대조 때문에 건드리지 않는다."""
    s = _AMP_BEFORE_NUM.sub("&", title)  # 'amp;#91;' = '&#91;'를 한 번 더 감싼 것
    s = _BARE_NUM_ENTITY.sub(r"&#\1;", _BARE_ENTITY.sub(r"&\1;", s))
    return html.unescape(s)


def build_user_message(
    title: str, source: str, published_at: str, sentences: list[Sentence]
) -> str:
    numbered = "\n".join(f"[{s['id']}] {s['text']}" for s in sentences)
    return f"제목: {clean_title(title)}\n언론사: {source}\n발행: {published_at}\n본문:\n{numbered}"
