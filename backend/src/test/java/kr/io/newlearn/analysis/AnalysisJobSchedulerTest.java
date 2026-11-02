package kr.io.newlearn.analysis;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

// 1분 스케줄러 — 한 일이 실패해도 나머지는 돈다. 통합 시험은 스케줄러를 꺼서(newlearn.analysis.scheduler.enabled=false) 여기서 본다
class AnalysisJobSchedulerTest {

    @Test
    void oneFailureDoesNotStopTheOthers() {
        AnalysisJobService service = mock(AnalysisJobService.class);
        when(service.retryDue(any())).thenThrow(new IllegalStateException("다시 걸기 실패"));
        doThrow(new IllegalStateException("판정 고르기 실패")).when(service).dispatchMatch();

        new AnalysisJobScheduler(service).tick();

        verify(service).retryDue(any());
        verify(service).publishUnpublished(any());
        verify(service).dispatchMatch();
        verify(service).dispatchIssue();
    }
}
