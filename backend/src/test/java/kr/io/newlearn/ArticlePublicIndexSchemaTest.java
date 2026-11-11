package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

// 공개 기사 인덱스 둘 (V14, Jira S15P31A102-190). 기사 목록 · 개수 · 분야 수 · 검색 · 이슈 카드가 기사 표 전체 대신 이것을 읽는다.
// 칸 순서 · 정렬 방향 · 부분 조건이 쿼리(ArticleService 의 published_at desc, id desc · released_at is not null)와 어긋나면
// 플래너가 인덱스를 못 쓰고 다시 표 전체를 읽는다. press_code 는 A2 이슈 카드의 언론사 수를 표 없이 세려고 담는다
// 운영에서 실제로 인덱스를 타는지는 infra/server/perf/explain.sql 로 본다(작은 시험 데이터에서는 플래너가 표를 그냥 읽는다)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class ArticlePublicIndexSchemaTest {
    @Autowired
    JdbcClient jdbc;

    @Test
    void v14AddsPublicArticleIndexesInListOrder() {
        assertThat(jdbc.sql("""
                                select indexdef from pg_indexes
                                where schemaname = current_schema() and tablename = 'article' and indexname like 'article\\_public\\_%'
                                order by indexname
                                """).query(String.class).list())
                .containsExactly(
                        "CREATE INDEX article_public_category_published_idx ON public.article USING btree"
                                + " (category_code, published_at DESC, id DESC) WHERE (released_at IS NOT NULL)",
                        "CREATE INDEX article_public_published_idx ON public.article USING btree"
                                + " (published_at DESC, id DESC) INCLUDE (press_code) WHERE (released_at IS NOT NULL)");
    }
}
