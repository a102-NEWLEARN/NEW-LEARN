package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.event.Event;
import kr.io.newlearn.event.EventRepository;
import kr.io.newlearn.event.OccurredAtBasis;
import kr.io.newlearn.ingest.IngestRun;
import kr.io.newlearn.ingest.IngestRunRepository;
import kr.io.newlearn.ingest.IngestRunStatus;
import kr.io.newlearn.ingest.IngestSource;
import kr.io.newlearn.issue.Issue;
import kr.io.newlearn.issue.IssueRepository;
import kr.io.newlearn.member.Member;
import kr.io.newlearn.member.MemberRepository;
import kr.io.newlearn.press.Press;
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
}
