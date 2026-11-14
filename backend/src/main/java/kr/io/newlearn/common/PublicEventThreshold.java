package kr.io.newlearn.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 화면에 보일 사건의 최소 공개 기사 수. 기본 1 은 지금까지와 같다 — 공개 기사가 하나라도 있으면 보인다(Jira 179).
 *
 * <p>2026-11-14 측정(Jira S15P31A102-206): 사건마다 공개 기사 3건 이상만 보이게 하면 이슈 쌍 정밀도가 0.930 → 0.976,
 * F1 0.841 → 0.874 로 오른다. 언론사 2곳인 사건의 오류율이 11.2% 로 가장 나빠(1곳 4.7% · 3곳 이상 1.0%) 자는 3 이다.
 * 기준은 사건 단위다 — 「공개 기사 N건 이상인 사건」만 보이고, 그런 사건이 하나도 없는 이슈가 사라진다.
 *
 * <p>값은 {@code QUERY_MIN_PUBLIC_ARTICLES} 로 바꾼다. 되돌릴 때는 이름을 지우지 말고 값을 1 로 되돌린다.
 */
@Component
public class PublicEventThreshold {

    private final int minArticles;

    public PublicEventThreshold(@Value("${newlearn.query.min-public-articles:1}") int minArticles) {
        this.minArticles = Math.max(1, minArticles);
    }

    public int minArticles() {
        return minArticles;
    }

    /** {@code exists (… offset :publicArticleSkip limit 1)} 에 넣을 값 — N번째 행이 있는지만 본다. */
    public int skip() {
        return minArticles - 1;
    }

    /** 문턱이 1 이면 지금과 같은 조회다. 질의 모양을 가르는 데 쓴다(이슈 목록 A2). */
    public boolean isOff() {
        return minArticles <= 1;
    }
}
