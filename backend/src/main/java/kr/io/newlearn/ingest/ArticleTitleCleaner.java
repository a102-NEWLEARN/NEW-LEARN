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

    private static final Pattern LESS_THAN_PATTERN = Pattern.compile(LESS_THAN);
    private static final Pattern GREATER_THAN_PATTERN = Pattern.compile(GREATER_THAN);
    private static final Pattern AMPERSAND_PATTERN = Pattern.compile(AMPERSAND);

    private ArticleTitleCleaner() {}

    public static String clean(String title) {
        String cleaned = title;
        for (Map.Entry<String, String> fragment : FRAGMENTS.entrySet()) {
            cleaned = cleaned.replace(fragment.getKey(), fragment.getValue());
        }
        cleaned = LESS_THAN_PATTERN.matcher(cleaned).replaceAll("<");
        cleaned = GREATER_THAN_PATTERN.matcher(cleaned).replaceAll(">");
        return AMPERSAND_PATTERN.matcher(cleaned).replaceAll("&");
    }
}
