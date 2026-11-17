package kr.io.newlearn.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 값이 1 보다 작으면 SQL 의 offset (N - 1) 이 음수가 돼 첫 요청에서야 깨진다. 뜨지 못하게 막는 대신 1(끔)로 올린다 —
// 급해서 0 으로 끄려던 실수에 Pod 가 안 뜨면 되돌림이 막히기 때문이다. 대신 경고를 남긴다(PublicEventThreshold)
class PublicEventThresholdTest {

    @Test
    void keepsAValueOfOneOrMore() {
        assertThat(new PublicEventThreshold(1, 1, 0).minArticles()).isEqualTo(1);
        assertThat(new PublicEventThreshold(3, 1, 0).minArticles()).isEqualTo(3);
        assertThat(new PublicEventThreshold(1, 3, 0).minEvents()).isEqualTo(3);
    }

    @Test
    void raisesZeroAndNegativeValuesToOne() {
        assertThat(new PublicEventThreshold(0, 0, 0).minArticles()).isEqualTo(1);
        assertThat(new PublicEventThreshold(-1, -1, 0).minArticles()).isEqualTo(1);
        assertThat(new PublicEventThreshold(0, 0, 0).minEvents()).isEqualTo(1);
        assertThat(new PublicEventThreshold(-1, -1, 0).minEvents()).isEqualTo(1);
    }

    @Test
    void skipIsOneLessThanTheThresholdAndOffIsOne() {
        assertThat(new PublicEventThreshold(1, 1, 0).skip()).isEqualTo(0);
        assertThat(new PublicEventThreshold(3, 1, 0).skip()).isEqualTo(2);
        assertThat(new PublicEventThreshold(1, 1, 0).isOff()).isTrue();
        assertThat(new PublicEventThreshold(2, 1, 0).isOff()).isFalse();
    }

    // 사건 쪽 자리는 기사 쪽과 따로 움직인다 — 한쪽 값을 다른 쪽 파라미터에 묶으면 조용히 틀린 결과가 나온다
    @Test
    void eventSkipIsOneLessThanTheEventThresholdAndIsIndependent() {
        assertThat(new PublicEventThreshold(1, 1, 0).eventSkip()).isEqualTo(0);
        assertThat(new PublicEventThreshold(1, 3, 0).eventSkip()).isEqualTo(2);
        var mixed = new PublicEventThreshold(3, 5, 0);
        assertThat(mixed.skip()).isEqualTo(2);
        assertThat(mixed.eventSkip()).isEqualTo(4);
    }

    // 메인 흐름 문턱은 바닥이 0(끔)이다 — 다른 두 값(바닥 1)과 다르다. skip 이 음수가 되면 offset -1 로 첫 요청에서 깨진다.
    // PostgreSQL 은 OR 안의 평가 순서를 보장하지 않아 「:minMainEvents = 0 or …」 만으로는 막히지 않는다 (Jira 224)
    @Test
    void mainEventThresholdFloorsAtZeroAndItsSkipNeverGoesNegative() {
        assertThat(new PublicEventThreshold(1, 1, 0).minMainEvents()).isZero();
        assertThat(new PublicEventThreshold(1, 1, 0).mainEventSkip()).isZero();
        assertThat(new PublicEventThreshold(1, 1, -1).minMainEvents()).isZero();
        assertThat(new PublicEventThreshold(1, 1, -1).mainEventSkip()).isZero();
        assertThat(new PublicEventThreshold(1, 1, 1).minMainEvents()).isEqualTo(1);
        assertThat(new PublicEventThreshold(1, 1, 1).mainEventSkip()).isZero();
        assertThat(new PublicEventThreshold(1, 1, 3).mainEventSkip()).isEqualTo(2);
    }

    // 메인 흐름 문턱은 기사 · 사건 문턱과 따로 움직인다
    @Test
    void mainEventThresholdIsIndependentOfTheOtherTwo() {
        var mixed = new PublicEventThreshold(3, 5, 2);
        assertThat(mixed.skip()).isEqualTo(2);
        assertThat(mixed.eventSkip()).isEqualTo(4);
        assertThat(mixed.mainEventSkip()).isEqualTo(1);
    }
}
