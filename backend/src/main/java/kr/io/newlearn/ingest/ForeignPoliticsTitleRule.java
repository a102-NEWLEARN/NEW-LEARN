package kr.io.newlearn.ingest;

import java.util.regex.Pattern;

// 대표를 정치로 고른 NewsData 기사 가운데 해외 정치를 제목 낱말로 가린다 (Jira 171, docs/data-model.md category_mapping)
// NewsData 분류로는 나눌 수 없다 — politics 와 world 가 같이 붙은 기사가 없다
// 외국 나라 · 인물 · 기구가 있고, 국내 정치 주체와 정치가 아닌 말이 없으면 해외 정치로 본다. 북한만 나오면 정치에 남는다(2026-11-05 사용자)
// V12 마이그레이션이 같은 정규식으로 이미 들어온 기사를 고쳤다. 낱말만 | 로 이어 Java 와 PostgreSQL 의 뜻이 같다.
// 규칙을 바꾸면 새 마이그레이션으로 다시 계산한다(ForeignPoliticsTitleRuleTest 가 두 곳이 같은지 본다)
final class ForeignPoliticsTitleRule {

    static final String FOREIGN = String.join(
            "|", "트럼프", "바이든", "오바마", "백악관", "중간선거", "공화당", "루비오", "헤그세스", "시진핑", "리창", "왕후닝", "푸틴", "젤렌스키", "네타냐후",
            "하마스", "헤즈볼라", "후티", "다카이치", "이시바", "마크롱", "메르츠", "이란", "이스라엘", "우크라", "러시아", "가자지구", "유엔", "나토", "NATO",
            "미국", "美", "중국", "中", "일본", "日", "대만", "프랑스", "독일", "영국", "유럽", "EU", "쿼드", "호르무즈", "시리아", "사우디", "튀르키예",
            "베네수엘라");

    static final String DOMESTIC = String.join(
            "|", "국민의힘", "국힘", "與", "野", "여당", "야당", "국회", "의원", "정청래", "장동혁", "진성준", "지방선거", "도지사", "시장", "군수", "구청장",
            "시의회", "도의회", "교육감", "교육청", "대구", "부산", "광주", "전남", "전북", "경남", "경북", "충남", "충북", "강원", "제주", "서울시", "경기도");

    static final String NOT_POLITICS = String.join(
            "|", "증시", "시황", "코스피", "코스닥", "환율", "유가", "주가", "비철", "매출", "영업이익", "실적", "수출", "간담회", "선원", "유학", "입학",
            "데뷔", "배우", "가수", "中企", "쿼드메디슨");

    private static final Pattern FOREIGN_PATTERN = Pattern.compile(FOREIGN);
    private static final Pattern DOMESTIC_PATTERN = Pattern.compile(DOMESTIC);
    private static final Pattern NOT_POLITICS_PATTERN = Pattern.compile(NOT_POLITICS);

    private ForeignPoliticsTitleRule() {}

    static boolean matches(String title) {
        return FOREIGN_PATTERN.matcher(title).find()
                && !DOMESTIC_PATTERN.matcher(title).find()
                && !NOT_POLITICS_PATTERN.matcher(title).find();
    }
}
