package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSummaryAssembler;
import kr.io.newlearn.article.dto.ArticleSummaryResponse;
import kr.io.newlearn.event.ArticleEventRepository;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.simple.JdbcClient;

@DataJpaTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, ArticleSummaryAssembler.class})
class ArticleRepositoryTest {
    @Autowired
    JdbcClient jdbc;

    @Autowired
    ArticleRepository articles;

    @Autowired
    ArticleSummaryAssembler assembler;

    @Autowired
    ArticleEventRepository links;

    @Autowired
    EntityManager em;

    @Autowired
    EntityManagerFactory emf;

    private final Sort sort = Sort.by(Sort.Direction.DESC, "publishedAt", "id");

    @BeforeEach
    void fixtures() {
        ArticleApiFixtures.insert(jdbc);
        em.flush();
        em.clear();
    }

    @Test
    void publicationOrderFilteringAndHiddenArticles() {
        var page = articles.findByReleasedAtIsNotNull(PageRequest.of(0, 2, sort));
        assertThat(page.getTotalElements()).isEqualTo(10);
        assertThat(page.getContent()).extracting(a -> a.getId()).containsExactly(4201L, 4209L);
        var politics = articles.findByReleasedAtIsNotNullAndCategory_Code("politics", PageRequest.of(0, 20, sort));
        assertThat(politics.getContent()).extracting(a -> a.getId()).containsExactly(4202L);
        assertThat(articles.findByIdAndReleasedAtIsNotNull(4210L)).isEmpty();
        assertThat(articles.findByIdAndReleasedAtIsNotNull(999999L)).isEmpty();
        var beyond = articles.findByReleasedAtIsNotNull(PageRequest.of(20, 2, sort));
        assertThat(beyond).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(10);
    }

    @Test
    void summaryAssemblyUsesFixedQueryCountAsPageGrows() {
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        for (int size : new int[] {2, 9}) {
            em.clear();
            statistics.clear();
            var page = articles.findByReleasedAtIsNotNull(PageRequest.of(0, size, sort));
            var summaries = assembler.assemble(page.getContent(), null);
            assertThat(summaries).hasSize(size);
            assertThat(summaries.getFirst().summary()).isEqualTo("우리 요약");
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(4);
        }
    }

    @Test
    void nullCategoryAndOptionalEventIssueArePreserved() {
        var article = articles.findByIdAndReleasedAtIsNotNull(4203L).orElseThrow();
        assertThat(assembler.assemble(java.util.List.of(article), null))
                .extracting(ArticleSummaryResponse::category)
                .containsExactly((kr.io.newlearn.category.dto.CategoryRef) null);
        assertThat(links.findByArticleId(4203L)).isEmpty();
        assertThat(links.findByArticleId(4201L)
                        .orElseThrow()
                        .getEvent()
                        .getIssue()
                        .getId())
                .isEqualTo(4200);
        assertThat(links.findByArticleId(4206L).orElseThrow().getEvent().getIssue())
                .isNull();
    }
}
