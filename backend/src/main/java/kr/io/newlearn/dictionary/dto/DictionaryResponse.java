package kr.io.newlearn.dictionary.dto;

import java.util.List;

// A19 응답 (docs/api-screen.md A19). query 는 앞뒤 공백을 지우고 NFC 로 맞춘 검색어다
public record DictionaryResponse(String query, List<DictionaryItem> items, String source) {

    // 사전 저작권 정책(CC BY-SA 2.0 KR)이 저작자 표시를 요구한다 — 저작자와 사전 이름을 같이 적는다(2026-10-29 사용자)
    public static final String SOURCE = "국립국어원 표준국어대사전";

    public static DictionaryResponse of(String query, List<DictionaryItem> items) {
        return new DictionaryResponse(query, items, SOURCE);
    }
}
