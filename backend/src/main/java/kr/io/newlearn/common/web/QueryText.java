package kr.io.newlearn.common.web;

import java.text.Normalizer;
import java.util.List;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.FieldErrorItem;
import org.jspecify.annotations.Nullable;

// 사람이 친 글자 입력의 규칙 — A13 통합 검색 · A19 용어사전의 검색어 q 다듬기(normalize)와 (Jira 43 · 102)
// 공개 입력이 DB 에 닿기 전에 보는 U+0000 검사(containsNul — 카테고리 코드 · 로그인 아이디 · 관심 분야 코드)
// 검색어 규칙은 같고 오류 이유 문구는 화면마다 다르게 넘긴다(검색창 「이슈, 사건, 기사 검색」 · 용어사전 「모르는 용어」)
public final class QueryText {

    // 50자는 우리 제안이다 — 용어사전 Open API 안내에도 검색어 길이 제한이 없다(2026-10-29 확인)
    public static final int MAX_LENGTH = 50;

    private QueryText() {}

    // 앞뒤 공백을 지우고 NFC 로 맞춘다 — 자모로 나뉘어(NFD) 온 한글도 같은 검색어가 된다. 길이는 글자(코드포인트) 수다
    // 비었거나 U+0000(NUL)이 들었거나 50자를 넘으면 400 VALIDATION_FAILED 와 errors[q]
    // NUL 은 PostgreSQL 이 글자로 받지 못해 A13 은 500 이 났고, A19 는 사전에 그대로 넘겼다(2026-10-30)
    public static String normalize(@Nullable String q, String blankReason, String nulReason, String tooLongReason) {
        String query = q == null ? "" : Normalizer.normalize(q.strip(), Normalizer.Form.NFC);
        if (query.isEmpty()) {
            throw invalid(blankReason);
        }
        if (containsNul(query)) {
            throw invalid(nulReason);
        }
        if (query.codePointCount(0, query.length()) > MAX_LENGTH) {
            throw invalid(tooLongReason);
        }
        return query;
    }

    // U+0000(NUL) — PostgreSQL 이 글자로 받지 못해 SQL 에 닿으면 500 이 난다. 공개 입력이 DB 에 묻기 전에 본다 (Jira 43 후속)
    public static boolean containsNul(String text) {
        return text.indexOf('\u0000') >= 0;
    }

    private static ApiException invalid(String reason) {
        return new ApiException(ErrorCode.VALIDATION_FAILED, "q: " + reason, List.of(new FieldErrorItem("q", reason)));
    }
}
