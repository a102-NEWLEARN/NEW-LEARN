package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// 기사-사건 연결 · 사건 인덱스 둘 (V15, Jira S15P31A102-194). 사건 몇 개의 기사(event_id), 이슈 하나 · 몇 개의 사건(issue_id)을
// 표 전체 대신 이것으로 찾는다. 어느 화면 쿼리가 무엇을 덜 읽었나는 V15 머리 주석. 칸이 다르면 플래너가 다시 표 전체를 엮는다
// 운영에서 실제로 인덱스를 타는지는 infra/server/perf/explain-events.sql 로 본다(작은 시험 데이터에서는 플래너가 표를 그냥 읽는다)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class EventIssueIndexSchemaTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void v15AddsEventAndIssueLookupIndexes() {
        assertThat(jdbc.sql("""
                                select indexdef from pg_indexes
                                where schemaname = current_schema()
                                  and indexname in ('article_event_event_id_idx', 'event_issue_id_idx')
                                order by indexname
                                """).query(String.class).list())
                .containsExactly(
                        "CREATE INDEX article_event_event_id_idx ON public.article_event USING btree (event_id)",
                        "CREATE INDEX event_issue_id_idx ON public.event USING btree (issue_id)");
    }
}
