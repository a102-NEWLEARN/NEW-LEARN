package kr.io.newlearn.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 정치로 고른 기사 가운데 해외 정치만 국제로 옮기는 제목 규칙 (Jira 171, 제목은 시험용으로 지은 것)
class ForeignPoliticsTitleRuleTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "트럼프, 이란 추가 공습 시사",
                "美 중간선거 사전투표 역대 최대",
                "시진핑, 브라질 대통령에 축전",
                "정부, 독일과 전략 대화 강화",
                "유엔총회 결의안 채택",
                "우크라 드론 공격에 러시아 반발",
                "EU, 브뤼셀서 회의",
                "NATO 정상회의 개막",
                "김정은, 中 총리 만나", // 북한이 나와도 외국이 같이 나오면 국제
                "트럼프 \"北과 대화할 것\"",
            })
    void foreignPoliticsMoves(String title) {
        assertThat(ForeignPoliticsTitleRule.matches(title)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "與, 美 대사 발언에 반발", // 국내 정치 주체
                "국민의힘 \"트럼프 관세 대책 내놔라\"",
                "진성준, 미국 방문",
                "부산시, 일본 자매도시 방문",
                "경기도교육청, 영국 연수 논란",
                "뉴욕증시, 美 중간선거에 약세", // 정치가 아닌 말
                "中企 지원 대책 발표",
                "쿼드메디슨 신제품 출시",
                "배우 홍길동, 美 진출",
                "김여정 담화 발표", // 북한만
                "北, 단거리 탄도미사일 발사",
                "북한 대남 확성기 가동",
                "법무장관 후보 압축", // 낱말 없음
            })
    void staysWhenRuleDoesNotApply(String title) {
        assertThat(ForeignPoliticsTitleRule.matches(title)).isFalse();
    }

    // 규칙이 Java · V12 두 곳에 있다. 다르면 어제 넣은 기사와 오늘 넣은 기사의 분야 기준이 달라진다
    // 규칙을 바꾸면 그 낱말로 다시 계산하는 새 마이그레이션을 만들고, 여기가 최신 판 파일을 보게 옮긴다
    @Test
    void migrationUsesTheSameRegularExpressions() throws IOException {
        String migration;
        try (InputStream in = Objects.requireNonNull(getClass()
                .getClassLoader()
                .getResourceAsStream("db/migration/V12__category_foreign_politics_title.sql"))) {
            migration = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(migration)
                .contains("title ~ '" + ForeignPoliticsTitleRule.FOREIGN + "'")
                .contains("title !~ '" + ForeignPoliticsTitleRule.DOMESTIC + "'")
                .contains("title !~ '" + ForeignPoliticsTitleRule.NOT_POLITICS + "'");
    }
}
