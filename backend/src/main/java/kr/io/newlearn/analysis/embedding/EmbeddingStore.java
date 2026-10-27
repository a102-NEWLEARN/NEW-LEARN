package kr.io.newlearn.analysis.embedding;

import java.util.List;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// article_embedding 을 SQL 로 다룬다 (Jira 35). 벡터 칸은 엔티티로 매핑하지 않는다 —
// Hibernate 벡터 의존성 없이 pgvector 글자 표기('[0.1,0.2,…]')와 cast 로 넣고, 비교도 SQL(<=>)로 한다
@Repository
public class EmbeddingStore {

    private final JdbcClient jdbc;

    public EmbeddingStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 기사 하나에 벡터 하나 — 다시 임베딩하면 덮어쓴다
    public void save(long articleId, String model, List<Double> vector) {
        jdbc.sql("""
                insert into article_embedding(article_id, model, embedding, created_at)
                values (:articleId, :model, cast(:vector as vector), now())
                on conflict (article_id) do update
                    set model = excluded.model, embedding = excluded.embedding, created_at = excluded.created_at
                """)
                .param("articleId", articleId)
                .param("model", model)
                .param("vector", literal(vector))
                .update();
    }

    // pgvector 의 글자 표기 — '[0.0,0.001,…]'
    static String literal(List<Double> vector) {
        return vector.stream().map(String::valueOf).collect(Collectors.joining(",", "[", "]"));
    }
}
