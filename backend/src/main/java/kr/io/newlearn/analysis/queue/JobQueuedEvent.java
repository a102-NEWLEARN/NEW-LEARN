package kr.io.newlearn.analysis.queue;

import java.util.List;

// 「이 메시지를 커밋 뒤에 큐에 넣어라」 — 작업 행을 저장한 트랜잭션 안에서 남기고, 커밋된 뒤 JobQueuedListener 가 넣는다
// jobs 는 이 메시지에 실린 작업(투입 메시지는 EXTRACT · EMBED 둘). 넣은 뒤 각 작업에 published_at 을 적는다
public record JobQueuedEvent(String stream, String payload, List<JobRef> jobs) {

    public record JobRef(long id, int attempt) {}
}
