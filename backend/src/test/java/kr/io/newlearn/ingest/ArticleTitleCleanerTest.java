package kr.io.newlearn.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

// 제목의 HTML 조각을 정해진 표로만 되돌린다 (Jira 178, 제목은 시험용으로 지어냈다)
class ArticleTitleCleanerTest {

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '\u0000',
            value = {
                "홍길동 quot;대표 나설 생각 있다quot;hellip;임꺽정 | 홍길동 \"대표 나설 생각 있다\"…임꺽정",
                "AImiddot;드론 인재 키운다 | AI·드론 인재 키운다",
                "5middot;18 기념식 | 5·18 기념식",
                "2026rsquo;s 전망 lsquo;맑음rsquo; | 2026’s 전망 ‘맑음’",
                "ldquo;지역 안전 지킬 것rdquo; | “지역 안전 지킬 것”",
                "하이힐rarr;샌들 | 하이힐→샌들",
                "신고 2.8배 uarr; | 신고 2.8배 ↑",
                "취업ndash;정주 | 취업–정주",
                "건설 활성화 한계 lt;하gt; | 건설 활성화 한계 <하>",
                "글로벌 Ramp;D 협력 | 글로벌 R&D 협력",
                "Mamp;A 시장 | M&A 시장",
                "quot;lt;특집gt;quot; | \"<특집>\"",
            })
    void restoresFragments(String title, String expected) {
        assertThat(ArticleTitleCleaner.clean(title)).isEqualTo(expected);
    }

    // 제목 앞에 붙어 오는 줄표 · 공백을 뗀다 (Jira 213). 2026-11-15 운영 전수(공개 · 숨김 합쳐 165,255건)에서
    // 앞이 줄표 · 공백인 제목은 2건 — 「--코스피 또 폭락…」(뗀다)과 「-4% 급락하더니…」(음수 부호라 둔다)
    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            quoteCharacter = '\u0000',
            value = {
                "--코스피 또 폭락 | 코스피 또 폭락",
                "- 단독 보도 | 단독 보도",
                "—코스피 급락 | 코스피 급락",
                "–환율 상승 | 환율 상승",
                "---세 개 | 세 개",
                "[속보] 코스피 급락 | [속보] 코스피 급락",
                "A-B 협력 발표 | A-B 협력 발표",
                "<신화통신> 보도 | <신화통신> 보도",
                "코스피 하락-마감 | 코스피 하락-마감",
                "- 4% 상승 | 4% 상승",
            })
    void stripsLeadingDashes(String title, String expected) {
        assertThat(ArticleTitleCleaner.clean(title)).isEqualTo(expected);
    }

    // 줄표뿐이면 떼고 나서 빈 값이 된다 — B2 가 빈 제목을 400 으로 막으므로 그대로 둔다
    @Test
    void keepsATitleThatIsOnlyDashes() {
        assertThat(ArticleTitleCleaner.clean("---")).isEqualTo("---");
        assertThat(ArticleTitleCleaner.clean(" - ")).isEqualTo(" - ");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "R&D 협력 강화", // 이미 글자
                "홍길동 \"대표 나설 생각\"…임꺽정",
                "검사 result; 확인", // 영어 낱말 끝
                "여름 camp; 개막",
                "시장 salt; 논란",
                "market bigt; 상승",
                "물가 5%; 상승", // 낱말이 아님
                "표 밖 apos; nbsp; 그대로", // 표 밖은 건드리지 않는다
                "-4% 급락하더니 돌연 ‘빨간불’…하이닉스", // 숫자 앞의 - 는 음수 부호다 (기사 11556)
                "-0.5%p 내린 기준금리",
            })
    void leavesEverythingElse(String title) {
        assertThat(ArticleTitleCleaner.clean(title)).isEqualTo(title);
    }

    @Test
    void cleaningTwiceChangesNothing() {
        String once = ArticleTitleCleaner.clean("quot;AImiddot;드론quot;hellip; Ramp;D lt;상gt;");
        assertThat(ArticleTitleCleaner.clean(once)).isEqualTo(once);
    }

    // 표가 Java · V13 두 곳에 있다. 다르면 어제 넣은 제목과 오늘 넣은 제목이 달라지고, 덤프 적재의 제목 대조가 멈춘다.
    // 표를 바꾸면 새 마이그레이션을 만들고, 여기가 최신 판 파일을 보게 고친다
    @Test
    void migrationUsesTheSameTable() throws IOException {
        String migration;
        try (InputStream in = Objects.requireNonNull(getClass()
                .getClassLoader()
                .getResourceAsStream("db/migration/V13__article_title_html_fragments.sql"))) {
            migration = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        ArticleTitleCleaner.FRAGMENTS.forEach(
                (fragment, letter) -> assertThat(migration).contains("'" + fragment + "', '" + letter + "')"));
        assertThat(migration)
                .contains("'" + ArticleTitleCleaner.LESS_THAN + "', '<', 'g')")
                .contains("'" + ArticleTitleCleaner.GREATER_THAN + "', '>', 'g')")
                .contains("'" + ArticleTitleCleaner.AMPERSAND + "', '&', 'g')");
        // 표에 없는 조각을 V13 이 고치지 않는다 — replace 수가 표의 크기와 같다
        assertThat(migration.split("replace\\(", -1).length - 1 - 3).isEqualTo(ArticleTitleCleaner.FRAGMENTS.size());
    }
}
