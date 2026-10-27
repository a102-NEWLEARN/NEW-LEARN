package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import kr.io.newlearn.analysis.AnalysisJob;
import kr.io.newlearn.analysis.AnalysisJobRepository;
import kr.io.newlearn.analysis.AnalysisJobStatus;
import kr.io.newlearn.analysis.AnalysisStage;
import kr.io.newlearn.analysis.RequestedBy;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSource;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryMapping;
import kr.io.newlearn.category.CategoryMappingId;
import kr.io.newlearn.category.CategoryMappingRepository;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.MappingSource;
import kr.io.newlearn.event.ArticleEvent;
import kr.io.newlearn.event.ArticleEventRepository;
import kr.io.newlearn.event.Event;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.event.OccurredAtBasis;
import kr.io.newlearn.ingest.IngestRun;
import kr.io.newlearn.ingest.IngestRunRepository;
import kr.io.newlearn.ingest.IngestRunStatus;
import kr.io.newlearn.ingest.IngestSource;
import kr.io.newlearn.issue.Issue;
import kr.io.newlearn.issue.IssueCategory;
import kr.io.newlearn.issue.IssueCategoryRepository;
import kr.io.newlearn.issue.IssueRepository;
import kr.io.newlearn.member.Member;
import kr.io.newlearn.member.MemberCategory;
import kr.io.newlearn.member.MemberCategoryId;
import kr.io.newlearn.member.MemberCategoryRepository;
import kr.io.newlearn.member.MemberRepository;
import kr.io.newlearn.mindmap.ArticleMindmap;
import kr.io.newlearn.mindmap.ArticleMindmapRepository;
import kr.io.newlearn.press.Press;
import kr.io.newlearn.press.PressMapping;
import kr.io.newlearn.press.PressMappingId;
import kr.io.newlearn.press.PressMappingRepository;
import kr.io.newlearn.press.PressRepository;
import org.hibernate.Hibernate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

// 엔티티가 V2 의 표와 맞게 저장되고 다시 읽히는지 본다 (Jira 101)
// 저장한 뒤 flush() 로 DB 에 보내고 clear() 로 JPA 의 기억을 비운 다음 읽어야, 메모리가 아니라 DB 에서 읽은 값을 본다
@Import(TestcontainersConfiguration.class)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CoreMappingTest {

    @Autowired
    EntityManager em;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    PressRepository pressRepository;

    @Autowired
    IngestRunRepository ingestRunRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    IssueRepository issueRepository;

    @Autowired
    EventRepository eventRepository;

    @Autowired
    ArticleRepository articleRepository;

    @Autowired
    CategoryMappingRepository categoryMappingRepository;

    @Autowired
    PressMappingRepository pressMappingRepository;

    @Autowired
    IssueCategoryRepository issueCategoryRepository;

    @Autowired
    MemberCategoryRepository memberCategoryRepository;

    @Autowired
    AnalysisJobRepository analysisJobRepository;

    @Autowired
    ArticleEventRepository articleEventRepository;

    @Autowired
    ArticleMindmapRepository articleMindmapRepository;

    // ① 코드 키

    @Test
    void categoryIsReadFromMigrationRows() {
        Category economy = categoryRepository.findById("economy").orElseThrow();

        assertThat(economy.getName()).isEqualTo("경제");
        assertThat(economy.getSortOrder()).isEqualTo((short) 2);
    }

    @Test
    void pressIsSavedAndReadBack() {
        pressRepository.save(new Press("garam", "가람일보"));
        em.flush();
        em.clear();

        Press found = pressRepository.findById("garam").orElseThrow();

        assertThat(found.getName()).isEqualTo("가람일보");
    }

    // ② 자동 증가 키 · enum · 다대일

    @Test
    void ingestRunGetsIdAndStoresEnumAsText() {
        Instant startedAt = Instant.parse("2026-10-06T15:00:00Z");
        Long id = ingestRunRepository
                .save(new IngestRun(IngestSource.NEWSDATA, startedAt))
                .getId();
        em.flush();
        em.clear();

        IngestRun found = ingestRunRepository.findById(id).orElseThrow();
        String storedStatus = jdbc.sql("select status from ingest_run where id = ?")
                .param(id)
                .query(String.class)
                .single();

        assertThat(id).isNotNull();
        assertThat(found.getSource()).isEqualTo(IngestSource.NEWSDATA);
        assertThat(found.getStatus()).isEqualTo(IngestRunStatus.RUNNING);
        assertThat(found.getStartedAt()).isEqualTo(startedAt);
        assertThat(storedStatus).isEqualTo("RUNNING");
    }

    // enum 밖의 값은 SQL 로 직접 넣어도 DB 의 CHECK 가 막는다 (묶음 SQL 적재 대비)
    @Test
    void checkConstraintRejectsUnknownStatus() {
        assertThatThrownBy(() -> jdbc.sql(
                                "insert into ingest_run (source, started_at, status) values ('NEWSDATA', now(), 'DONE')")
                        .update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void memberIsSavedWithCreatedAt() {
        Long id = memberRepository
                .save(new Member("newlearn01", "hash-only", "김뉴런"))
                .getId();
        em.flush();
        em.clear();

        Member found = memberRepository.findById(id).orElseThrow();

        assertThat(found.getLoginId()).isEqualTo("newlearn01");
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Test
    void duplicateLoginIdIsRejected() {
        memberRepository.saveAndFlush(new Member("newlearn01", "hash-only", "김뉴런"));

        assertThatThrownBy(() -> memberRepository.saveAndFlush(new Member("newlearn01", "hash-other", "이뉴런")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // 사건은 이슈 밖에서 생기고 ISSUE 단계가 나중에 이슈에 붙인다(Jira 40). 여기서는 SQL 로 붙여 다대일 매핑만 본다
    @Test
    void eventPointsToIssueLazily() {
        Long issueId = issueRepository.save(new Issue("한빛반도체 미국 공장 건설", null)).getId();
        Long eventId = eventRepository
                .save(new Event(
                        "한빛반도체 텍사스 공장 착공식",
                        "착공식",
                        null,
                        Instant.parse("2026-10-05T15:00:00Z"),
                        OccurredAtBasis.EXTRACTED))
                .getId();
        em.flush();
        jdbc.sql("update event set issue_id = ? where id = ?")
                .params(issueId, eventId)
                .update();
        em.clear();

        Event found = eventRepository.findById(eventId).orElseThrow();

        assertThat(Hibernate.isInitialized(found.getIssue())).isFalse();
        assertThat(found.getIssue().getTitle()).isEqualTo("한빛반도체 미국 공장 건설");
        assertThat(found.getOccurredAtBasis()).isEqualTo(OccurredAtBasis.EXTRACTED);
        assertThat(found.getCreatedAt()).isNotNull();
        assertThat(found.getUpdatedAt()).isNotNull();
    }

    // ③ 배열 칸

    @Test
    void sourceCategoriesAreStoredAsTextArray() {
        Long id = articleRepository
                .save(newArticle("https://example.com/news/1", List.of("business", "top")))
                .getId();
        em.flush();
        em.clear();

        Article found = articleRepository.findById(id).orElseThrow();
        String stored = jdbc.sql("select source_categories::text from article where id = ?")
                .param(id)
                .query(String.class)
                .single();

        assertThat(found.getSourceCategories()).containsExactly("business", "top");
        assertThat(stored).isEqualTo("{business,top}");
        assertThat(found.getPress().getCode()).isEqualTo("garam");
        assertThat(found.getCategory()).isNull();
        assertThat(found.getReleasedAt()).isNull();
    }

    @Test
    void emptySourceCategoriesAreStoredAsEmptyArray() {
        Long id = articleRepository
                .save(newArticle("https://example.com/news/2", List.of()))
                .getId();
        em.flush();
        em.clear();

        String stored = jdbc.sql("select source_categories::text from article where id = ?")
                .param(id)
                .query(String.class)
                .single();

        assertThat(articleRepository.findById(id).orElseThrow().getSourceCategories())
                .isEmpty();
        assertThat(stored).isEqualTo("{}");
    }

    // 대표 카테고리는 수집이 category_mapping 으로 고른다(Jira 34). 여기서는 SQL 로 넣어 코드 키로 이어지는지만 본다
    @Test
    void articleCategoryLinksByCode() {
        Long id = articleRepository
                .save(newArticle("https://example.com/news/3", List.of("business")))
                .getId();
        em.flush();
        jdbc.sql("update article set category_code = 'economy' where id = ?")
                .param(id)
                .update();
        em.clear();

        Article found = articleRepository.findById(id).orElseThrow();

        assertThat(found.getCategory().getName()).isEqualTo("경제");
    }

    @Test
    void duplicateUrlIsRejected() {
        articleRepository.saveAndFlush(newArticle("https://example.com/news/4", List.of()));

        assertThatThrownBy(() -> articleRepository.saveAndFlush(newArticle("https://example.com/news/4", List.of())))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ④ 복합 키

    // 카테고리 칸이 빈 대응 행은 「일부러 무시하는 원본 값」이다(NewsData 의 top 처럼 주제가 아닌 값)
    @Test
    void categoryMappingMayLeaveCategoryEmpty() {
        Category economy = categoryRepository.findById("economy").orElseThrow();
        categoryMappingRepository.save(
                new CategoryMapping(new CategoryMappingId(MappingSource.NEWSDATA, "business"), economy, (short) 1));
        categoryMappingRepository.save(
                new CategoryMapping(new CategoryMappingId(MappingSource.NEWSDATA, "top"), null, (short) 99));
        em.flush();
        em.clear();

        CategoryMapping business = categoryMappingRepository
                .findById(new CategoryMappingId(MappingSource.NEWSDATA, "business"))
                .orElseThrow();
        CategoryMapping top = categoryMappingRepository
                .findById(new CategoryMappingId(MappingSource.NEWSDATA, "top"))
                .orElseThrow();

        assertThat(business.getCategory().getCode()).isEqualTo("economy");
        assertThat(business.getPriority()).isEqualTo((short) 1);
        assertThat(top.getCategory()).isNull();
    }

    // 소스마다 다르게 적어 오는 언론사 표기를 한 언론사로 묶는다
    @Test
    void pressMappingsGroupSpellingsIntoOnePress() {
        Press garam = pressRepository.save(new Press("garam", "가람일보"));
        pressMappingRepository.save(new PressMapping(new PressMappingId(MappingSource.SSAFY, "가람일보"), garam));
        pressMappingRepository.save(new PressMapping(new PressMappingId(MappingSource.NEWSDATA, "garam-ilbo"), garam));
        em.flush();
        em.clear();

        PressMapping fromDataset = pressMappingRepository
                .findById(new PressMappingId(MappingSource.SSAFY, "가람일보"))
                .orElseThrow();
        PressMapping fromNewsData = pressMappingRepository
                .findById(new PressMappingId(MappingSource.NEWSDATA, "garam-ilbo"))
                .orElseThrow();

        assertThat(fromDataset.getPress().getCode()).isEqualTo("garam");
        assertThat(fromNewsData.getPress().getCode()).isEqualTo("garam");
    }

    @Test
    void issueCategoryLinksIssueAndCategory() {
        Issue issue = issueRepository.save(new Issue("한빛반도체 미국 공장 건설", null));
        Category economy = categoryRepository.findById("economy").orElseThrow();
        issueCategoryRepository.save(new IssueCategory(issue, economy));
        em.flush();
        em.clear();

        List<IssueCategory> found = issueCategoryRepository.findAll();

        assertThat(found).hasSize(1);
        assertThat(found.get(0).getIssue().getTitle()).isEqualTo("한빛반도체 미국 공장 건설");
        assertThat(found.get(0).getCategory().getName()).isEqualTo("경제");
    }

    // (회원, 카테고리) 를 합친 기본 키라 같은 관심 분야는 한 번만 들어간다
    @Test
    void memberCategoryKeepsEachCategoryOnce() {
        Member member = memberRepository.save(new Member("newlearn01", "hash-only", "김뉴런"));
        Category economy = categoryRepository.findById("economy").orElseThrow();
        Category world = categoryRepository.findById("world").orElseThrow();
        memberCategoryRepository.save(new MemberCategory(member, economy));
        memberCategoryRepository.save(new MemberCategory(member, world));
        em.flush();
        memberCategoryRepository.save(new MemberCategory(member, economy));
        em.flush();
        em.clear();

        Long rows = jdbc.sql("select count(*) from member_category where member_id = ?")
                .param(member.getId())
                .query(Long.class)
                .single();

        assertThat(rows).isEqualTo(2L);
        assertThat(memberCategoryRepository.findById(new MemberCategoryId(member.getId(), "world")))
                .isPresent();
    }

    // JPA 를 거치지 않고 SQL 로 같은 짝을 넣으면 DB 의 기본 키가 막는다
    @Test
    void duplicateMemberCategoryIsRejectedByPrimaryKey() {
        Member member = memberRepository.saveAndFlush(new Member("newlearn01", "hash-only", "김뉴런"));
        String insert = "insert into member_category (member_id, category_code) values (?, 'economy')";
        jdbc.sql(insert).param(member.getId()).update();

        assertThatThrownBy(() -> jdbc.sql(insert).param(member.getId()).update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ⑤ jsonb · 공유 키

    // jsonb 는 저장할 때 띄어쓰기 · 키 순서를 PostgreSQL 이 정리한다. 그래서 DB 에서는 jsonb 끼리 비교한다
    @Test
    void analysisJobStoresCandidatesAsJsonb() {
        Article article = articleRepository.save(newArticle("https://example.com/news/5", List.of()));
        Long id = analysisJobRepository
                .save(new AnalysisJob(article, AnalysisStage.MATCH_EVENT, RequestedBy.BATCH, "{\"eventIds\":[97,98]}"))
                .getId();
        em.flush();
        em.clear();

        AnalysisJob found = analysisJobRepository.findById(id).orElseThrow();
        Boolean sameJson = jdbc.sql(
                        "select candidates = '{\"eventIds\": [97, 98]}'::jsonb from analysis_job where id = ?")
                .param(id)
                .query(Boolean.class)
                .single();

        assertThat(sameJson).isTrue();
        assertThat(found.getCandidates()).isEqualTo("{\"eventIds\": [97, 98]}");
        assertThat(found.getStage()).isEqualTo(AnalysisStage.MATCH_EVENT);
        assertThat(found.getStatus()).isEqualTo(AnalysisJobStatus.QUEUED);
        assertThat(found.getAttempt()).isEqualTo(1);
    }

    // 기사 하나 · 단계 하나에 한 행이다. 다시 돌릴 때는 행을 더하지 않고 attempt 를 올린다
    @Test
    void sameStageForSameArticleIsRejected() {
        Article article = articleRepository.save(newArticle("https://example.com/news/6", List.of()));
        analysisJobRepository.saveAndFlush(new AnalysisJob(article, AnalysisStage.EXTRACT, RequestedBy.BATCH, null));

        assertThatThrownBy(() -> analysisJobRepository.saveAndFlush(
                        new AnalysisJob(article, AnalysisStage.EXTRACT, RequestedBy.BATCH, null)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // 기본 키가 기사 키라 기사 하나는 사건 하나에만 속한다
    @Test
    void articleEventSharesArticleKey() {
        Article article = articleRepository.save(newArticle("https://example.com/news/7", List.of()));
        Event event = eventRepository.save(new Event(
                "한빛반도체 텍사스 공장 착공식", "착공식", null, Instant.parse("2026-10-05T15:00:00Z"), OccurredAtBasis.EXTRACTED));
        articleEventRepository.save(new ArticleEvent(article, event));
        em.flush();
        em.clear();

        ArticleEvent found = articleEventRepository.findById(article.getId()).orElseThrow();

        assertThat(found.getArticleId()).isEqualTo(article.getId());
        assertThat(found.getEvent().getTitle()).isEqualTo("한빛반도체 텍사스 공장 착공식");
        assertThat(found.getLinkedAt()).isNotNull();
    }

    @Test
    void articleMindmapStoresContentAsJsonb() {
        Article article = articleRepository.save(newArticle("https://example.com/news/8", List.of()));
        String content = """
                {"title": null, "branches": [{"type": "CORE", "items": [{"text": "한빛반도체가 텍사스 공장 착공식을 열었다"}]}]}
                """;
        articleMindmapRepository.save(new ArticleMindmap(
                article,
                "한빛반도체가 텍사스 공장 착공식을 열었다.",
                content,
                0,
                Instant.parse("2026-10-05T15:00:00Z"),
                "mindmap-v1",
                "gpt-5-mini",
                "extract-v1",
                Instant.parse("2026-10-06T01:13:05Z")));
        em.flush();
        em.clear();

        ArticleMindmap found =
                articleMindmapRepository.findById(article.getId()).orElseThrow();
        String firstBranch = jdbc.sql(
                        "select content -> 'branches' -> 0 ->> 'type' from article_mindmap where article_id = ?")
                .param(article.getId())
                .query(String.class)
                .single();

        assertThat(firstBranch).isEqualTo("CORE");
        assertThat(found.getContent()).contains("한빛반도체가 텍사스 공장 착공식을 열었다");
        assertThat(found.getSchemaVersion()).isEqualTo("mindmap-v1");
        assertThat(found.getPrimaryCoreIndex()).isZero();
    }

    private Article newArticle(String url, List<String> sourceCategories) {
        Press garam = pressRepository.save(new Press("garam", "가람일보"));
        return new Article(
                ArticleSource.NEWSDATA,
                url,
                garam,
                "한빛반도체 텍사스 공장 첫 삽",
                "한빛반도체는 6일 텍사스 공장 착공식을 열었다.",
                Instant.parse("2026-10-06T00:30:00Z"),
                sourceCategories);
    }
}
