package kr.io.newlearn.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// 값이 1 보다 작으면 SQL 의 offset (N - 1) 이 음수가 돼 첫 요청에서야 깨진다. 뜨지 못하게 막는 대신 1(끔)로 올린다 —
// 급해서 0 으로 끄려던 실수에 Pod 가 안 뜨면 되돌림이 막히기 때문이다. 대신 경고를 남긴다(PublicEventThreshold)
class PublicEventThresholdTest {

    @Test
    void keepsAValueOfOneOrMore() {
        assertThat(new PublicEventThreshold(1).minArticles()).isEqualTo(1);
        assertThat(new PublicEventThreshold(3).minArticles()).isEqualTo(3);
    }

    @Test
    void raisesZeroAndNegativeValuesToOne() {
        assertThat(new PublicEventThreshold(0).minArticles()).isEqualTo(1);
        assertThat(new PublicEventThreshold(-1).minArticles()).isEqualTo(1);
    }

    @Test
    void skipIsOneLessThanTheThresholdAndOffIsOne() {
        assertThat(new PublicEventThreshold(1).skip()).isEqualTo(0);
        assertThat(new PublicEventThreshold(3).skip()).isEqualTo(2);
        assertThat(new PublicEventThreshold(1).isOff()).isTrue();
        assertThat(new PublicEventThreshold(2).isOff()).isFalse();
    }
}
