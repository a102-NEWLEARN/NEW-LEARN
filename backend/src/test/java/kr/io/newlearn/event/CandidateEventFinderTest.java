package kr.io.newlearn.event;

import static org.assertj.core.api.Assertions.assertThat;

import org.assertj.core.data.Offset;
import org.junit.jupiter.api.Test;

// 후보 사건의 similarity = 1 − 코사인 거리, 0 ~ 1 로 자른다 (Jira 35, api-internal.md 4절)
// 가까운 사건 5개를 고르는 SQL 은 EventMatchIntegrationTest 가 실제 pgvector 로 본다
class CandidateEventFinderTest {

    @Test
    void similarityIsOneMinusDistanceClampedToZeroAndOne() {
        assertThat(CandidateEventFinder.similarity(0)).isEqualTo(1.0);
        assertThat(CandidateEventFinder.similarity(0.2)).isCloseTo(0.8, Offset.offset(1e-9));
        // 코사인 거리는 0 ~ 2 — 반대 방향 벡터는 음수가 되지 않게 0
        assertThat(CandidateEventFinder.similarity(1.5)).isZero();
        // 부동소수 오차로 거리가 0 아래로 조금 내려가도 1 을 넘지 않는다
        assertThat(CandidateEventFinder.similarity(-1e-12)).isEqualTo(1.0);
        // 영벡터는 pgvector 가 NaN 을 준다
        assertThat(CandidateEventFinder.similarity(Double.NaN)).isZero();
    }
}
