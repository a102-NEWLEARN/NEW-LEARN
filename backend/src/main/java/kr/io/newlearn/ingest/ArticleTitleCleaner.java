package kr.io.newlearn.ingest;

import java.util.Map;
import java.util.regex.Pattern;

// NewsData 제목에 HTML 표기에서 & 가 빠진 조각(quot; · hellip; 등)이 그대로 온다. 정해진 표로만 글자로 되돌린다 (Jira 178, docs/data-model.md article)
// 표는 운영 전체 제목의 세미콜론 앞 낱말을 전수로 읽어 만들었다 — 표 밖의 낱말은 건드리지 않는다.
// V13 마이그레이션이 같은 표로 이미 들어온 제목을 고쳤다. 표를 바꾸면 새 마이그레이션으로 고치고 덤프를 만드는 쪽에 알린다 —
// 덤프 적재가 제목이 운영과 같은지 본다(infra/server/data-load.md 5절). 두 곳이 같은지는 ArticleTitleCleanerTest 가 본다
public final class ArticleTitleCleaner {

    static final Map<String, String> FRAGMENTS = Map.of(
            "quot;", "\"",
            "hellip;", "…",
            "middot;", "·",
            "lsquo;", "‘",
            "rsquo;", "’",
            "ldquo;", "“",
            "rdquo;", "”",
            "rarr;", "→",
            "uarr;", "↑",
            "ndash;", "–");

    // 영어 낱말 끝(result; · camp;)을 건드리지 않으려고 앞뒤 글자를 본다
    static final String LESS_THAN = "(?<![A-Za-z])lt;";
    static final String GREATER_THAN = "(?<![A-Za-z])gt;";
    static final String AMPERSAND = "(?<=[A-Z])amp;(?=[A-Z])";

    // 제목 앞에 붙어 오는 줄표 · 공백 (Jira 213). 「--코스피 또 폭락…」처럼 파싱이 덜 된 꼴로 보인다.
    // 2026-11-15 운영 전수에서 공개 기사 23,439건 중 1건이었다. 「-」 하나로 시작하거나 앞뒤에 공백이 있는
    // 제목은 0건이라 넓게 떼도 멀쩡한 제목을 건드리지 않는다. 「[속보]」 · 「"」 · 「<신화통신>」은 정상이라 둔다
    static final String LEADING_DASHES = "^[\\s\\-\\u2010-\\u2015]+";

    private static final Pattern LESS_THAN_PATTERN = Pattern.compile(LESS_THAN);
    private static final Pattern GREATER_THAN_PATTERN = Pattern.compile(GREATER_THAN);
    private static final Pattern AMPERSAND_PATTERN = Pattern.compile(AMPERSAND);
    private static final Pattern LEADING_DASHES_PATTERN = Pattern.compile(LEADING_DASHES);

    private ArticleTitleCleaner() {}

    public static String clean(String title) {
        String cleaned = title;
        for (Map.Entry<String, String> fragment : FRAGMENTS.entrySet()) {
            cleaned = cleaned.replace(fragment.getKey(), fragment.getValue());
        }
        cleaned = LESS_THAN_PATTERN.matcher(cleaned).replaceAll("<");
        cleaned = GREATER_THAN_PATTERN.matcher(cleaned).replaceAll(">");
        cleaned = AMPERSAND_PATTERN.matcher(cleaned).replaceAll("&");
        String trimmed = LEADING_DASHES_PATTERN.matcher(cleaned).replaceFirst("");
        // 줄표뿐인 제목은 떼면 빈 값이 된다 — B2 가 빈 제목을 400 으로 막으므로 그대로 둔다
        return trimmed.isBlank() ? cleaned : trimmed;
    }
}
