package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// 공개 기사 · 사건-기사 짝 인덱스 둘 (V17, Jira S15P31A102-228). 사건마다 「공개 기사가 M건 있나」를 볼 때(PublicEventSql ·
// A3 머리 · A4 타임라인 · A13 검색) 연결 행과 기사 행을 표까지 가지 않고 인덱스 안에서 확인한다. 어느 질의가 얼마나 덜 읽나는 V17 머리 주석.
// 이름이 article_public_ 로 시작하면 ArticlePublicIndexSchemaTest(그 이름으로 정확히 두 줄)에 걸린다 — 그래서 article_released_.
// 운영에서 실제로 타는지는 실행 계획으로 본다(작은 시험 데이터에서는 플래너가 표를 그냥 읽는다)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class PublicLinkIndexSchemaTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void v17AddsPublicArticleAndEventArticleLookupIndexes() {
        assertThat(jdbc.sql("""
                                select indexdef from pg_indexes
                                where schemaname = current_schema()
                                  and indexname in ('article_event_event_article_idx', 'article_released_id_idx')
                                order by indexname
                                """).query(String.class).list())
                .containsExactly(
                        "CREATE INDEX article_event_event_article_idx ON public.article_event USING btree (event_id, article_id)",
                        "CREATE INDEX article_released_id_idx ON public.article USING btree (id) INCLUDE (press_code)"
                                + " WHERE (released_at IS NOT NULL)");
    }
}
