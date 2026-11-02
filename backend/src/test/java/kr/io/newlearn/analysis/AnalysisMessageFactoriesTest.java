package kr.io.newlearn.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import kr.io.newlearn.analysis.queue.AnalysisMessageFactory;
import org.junit.jupiter.api.Test;

// 단계 → 메시지 공장 묶음 — 네 단계에 공장이 하나씩 있어야 앱이 뜬다
class AnalysisMessageFactoriesTest {

    static AnalysisMessageFactory factory(AnalysisStage... stages) {
        AnalysisMessageFactory factory = mock(AnalysisMessageFactory.class);
        when(factory.stages()).thenReturn(Set.of(stages));
        return factory;
    }

    @Test
    void everyStageHasOneFactory() {
        var extractAndEmbed = factory(AnalysisStage.EXTRACT, AnalysisStage.EMBED);
        var factories = new AnalysisMessageFactories(
                List.of(extractAndEmbed, factory(AnalysisStage.MATCH_EVENT), factory(AnalysisStage.ISSUE)));

        assertThat(factories.forStage(AnalysisStage.EMBED)).isSameAs(extractAndEmbed);
        assertThat(factories.stages()).containsExactlyInAnyOrder(AnalysisStage.values());
        assertThatThrownBy(() -> factories.stages().remove(AnalysisStage.ISSUE))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void missingStageStopsStartup() {
        assertThatThrownBy(() -> new AnalysisMessageFactories(List.of(
                        factory(AnalysisStage.EXTRACT, AnalysisStage.EMBED), factory(AnalysisStage.MATCH_EVENT))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("이 단계의 메시지를 만드는 곳이 없다: ISSUE");
    }

    @Test
    void twoFactoriesForOneStageStopStartup() {
        assertThatThrownBy(() -> new AnalysisMessageFactories(List.of(
                        factory(AnalysisStage.EXTRACT, AnalysisStage.EMBED),
                        factory(AnalysisStage.MATCH_EVENT),
                        factory(AnalysisStage.ISSUE, AnalysisStage.EXTRACT))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("한 단계에 메시지를 만드는 곳이 둘이다: EXTRACT");
    }
}
