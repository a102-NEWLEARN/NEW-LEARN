package kr.io.newlearn.dictionary;

// 모델에 넘기는 자료 — 고른 말 · 그 주변 조각(화면 글) · 대상의 제목 · 문맥(기사는 본문의 그 말 근처) (docs/api-screen.md A26)
public record MeaningPrompt(String term, String around, String title, String context) {}
