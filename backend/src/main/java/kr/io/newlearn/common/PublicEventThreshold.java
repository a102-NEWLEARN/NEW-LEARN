package kr.io.newlearn.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 *
 * <p>여기에 더해 <b>이슈에 보이는 사건이 몇 개 이상이어야 목록에 나오는지</b>도 정한다({@code QUERY_MIN_PUBLIC_EVENTS},
 * 기본 1 은 끔). 이슈는 사건 3개 이상일 때만 만들어지는데(AI 워커의 {@code CREATE_MIN_EVENTS}) 만든 뒤 사건이 빠지면
 * 1 ~ 2개만 남아, 타임라인에 점이 하나뿐인 이슈가 목록에 섞인다(2026-11-15 운영 225개 중 26개, Jira S15P31A102-208).
 * 기사 문턱과 달리 <b>목록에서만</b> 뺀다 — 이슈 페이지(A3 · A4)와 이슈로 가는 링크(A5 · A8), 관심 이슈는 그대로다.
 *
 * <p>셋째로 <b>보이는 사건 중 메인 흐름(MAIN) 사건이 몇 개 이상이어야 목록에 나오는지</b>({@code QUERY_MIN_MAIN_EVENTS},
 * 기본 0 은 끔, Jira S15P31A102-224). 서브 흐름(반응 · 평가 · 여론)만 있는 이슈는 「무슨 일이 있었나」가 없어 흐름이 서지 않는다
 * (2026-11-16 운영 보이는 이슈 201개 중 10개). 사건 수 문턱과 같은 자리에서 목록에서만 뺀다. 다른 두 값과 달리 바닥이 0 이다.
 */
@Component
public class PublicEventThreshold {

    private static final Logger log = LoggerFactory.getLogger(PublicEventThreshold.class);

    private final int minArticles;
    private final int minEvents;
    private final int minMainEvents;

    public PublicEventThreshold(
            @Value("${newlearn.query.min-public-articles:1}") int minArticles,
            @Value("${newlearn.query.min-public-events:1}") int minEvents,
            @Value("${newlearn.query.min-main-events:0}") int minMainEvents) {
        // 0 이나 음수는 SQL 의 offset (N - 1) 을 음수로 만들어 첫 요청에서야 깨진다. 그렇다고 뜨지 못하게 막으면
        // 「급해서 0 으로 끄려던」 실수에 Pod 가 안 떠 되돌림이 막힌다 — 1(끔)로 올리고 경고를 남긴다
        if (minArticles < 1) {
            log.warn("newlearn.query.min-public-articles={} 는 1 보다 작다 — 1(끔)로 올린다", minArticles);
        }
        if (minEvents < 1) {
            log.warn("newlearn.query.min-public-events={} 는 1 보다 작다 — 1(끔)로 올린다", minEvents);
        }
        if (minMainEvents < 0) {
            log.warn("newlearn.query.min-main-events={} 는 0 보다 작다 — 0(끔)으로 올린다", minMainEvents);
        }
        this.minArticles = Math.max(1, minArticles);
        this.minEvents = Math.max(1, minEvents);
        this.minMainEvents = Math.max(0, minMainEvents);
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

    /** 이슈가 목록에 나오려면 보이는 사건이 몇 개 있어야 하는가. */
    public int minEvents() {
        return minEvents;
    }

    /** {@code exists (… offset :publicEventSkip limit 1)} 에 넣을 값 — N번째 <b>사건</b>이 있는지만 본다. */
    public int eventSkip() {
        return minEvents - 1;
    }

    /** 이슈가 목록에 나오려면 보이는 메인 흐름 사건이 몇 개 있어야 하는가. 0 이면 끔. */
    public int minMainEvents() {
        return minMainEvents;
    }

    /**
     * {@code exists (… offset :mainEventSkip limit 1)} 에 넣을 값. 끔(0)이어도 0 아래로 내려가지 않는다 —
     * 조각 앞의 {@code :minMainEvents = 0 or} 가 먼저 걸러 줄 것 같지만 PostgreSQL 은 OR 안의 평가 순서를 보장하지 않아,
     * {@code offset -1} 이 평가되면 첫 요청에서 깨진다.
     */
    public int mainEventSkip() {
        return Math.max(0, minMainEvents - 1);
    }
}
