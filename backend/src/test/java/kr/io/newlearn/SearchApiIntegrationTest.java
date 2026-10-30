package kr.io.newlearn;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.text.Normalizer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

// A13 통합 검색 (docs/specs/F02-search-api.md, Jira 43). 로그인하지 않은 손님으로 부른다
// 응답은 jsonPath 로만 본다 — 검색 코드를 빼면 컴파일 오류가 아니라 단언(404)에서 갈리게(되돌림 확인)
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@Transactional
class SearchApiIntegrationTest {
    static final String URL = "/api/v1/search";

    @Autowired
    MockMvc mvc;

    // AC-7 — 유형마다 SQL 하나인지 센다(IssueTimelineQueryTest 와 같은 방법)
    @MockitoSpyBean
    JdbcClient jdbc;

    @BeforeEach
    void fixtures() {
        jdbc.sql("insert into press values ('search43', '검색신문')").update();
        issue(4301, "예산안 처리 갈등", null, "2026-10-20T00:00:00Z");
        issue(4302, "AI 규제 법안", null, "2026-10-21T00:00:00Z");
        // 요약에만 「예산」이 있다 — 제목만 찾으므로 나오지 않아야 한다(AC-2)
        issue(4303, "전혀 다른 이슈", "예산 이야기가 요약에만 있다", "2026-10-22T00:00:00Z");
        event(4301, 4301L, "여야 예산 협의 재개", "2026-10-21T00:00:00Z");
        // 이슈 밖 사건 — 화면이 이슈로 옮겨 갈 수 없어 빼야 한다(AC-5)
        event(4302, null, "예산 관련 단독 사건", "2026-10-22T00:00:00Z");
        event(4303, 4302L, "찬성 100% 대 50_50 c:\\temp", "2026-10-23T00:00:00Z");
        article(4301, "내년 예산 656조", true, "2026-10-22T00:00:00Z");
        // 공개 전 기사 — 모든 조회 · 검색에서 없는 기사다(AC-5, docs/api.md 1절)
        article(4302, "예산 공개 전 기사", false, "2026-10-23T00:00:00Z");
        article(4303, "다른 기사", true, "2026-10-24T00:00:00Z");
    }

    // AC-1 — 세 배열과 항목 칸. 사건은 옮겨 갈 이슈 번호를 같이 준다
    @Test
    void findsTitleMatchesOfEachKindWithoutLogin() throws Exception {
        search("예산")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(1)))
                .andExpect(jsonPath("$.issues[0].id").value(4301))
                .andExpect(jsonPath("$.issues[0].title").value("예산안 처리 갈등"))
                .andExpect(jsonPath("$.events", hasSize(1)))
                .andExpect(jsonPath("$.events[0].id").value(4301))
                .andExpect(jsonPath("$.events[0].title").value("여야 예산 협의 재개"))
                .andExpect(jsonPath("$.events[0].issueId").value(4301))
                .andExpect(jsonPath("$.articles", hasSize(1)))
                .andExpect(jsonPath("$.articles[0].id").value(4301))
                .andExpect(jsonPath("$.articles[0].title").value("내년 예산 656조"));
    }

    // AC-1 — 결과가 없으면 200 과 빈 배열 셋
    @Test
    void noMatchGivesThreeEmptyArrays() throws Exception {
        search("어디에도없는말")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues", hasSize(0)))
                .andExpect(jsonPath("$.events", hasSize(0)))
                .andExpect(jsonPath("$.articles", hasSize(0)));
    }

    // AC-2 — 제목 가운데 들어 있어도 맞고, 영문은 대소문자를 가리지 않는다(제목 쪽 · 검색어 쪽 둘 다)
    // 요약 · 사건 키워드(label) · 기사 본문에만 있는 낱말로는 안 나온다
    @Test
    void matchesInsideTitleIgnoringCaseButNotSummaryLabelOrBody() throws Exception {
        search("ai").andExpect(status().isOk()).andExpect(jsonPath("$.issues[*].id", contains(4302)));
        search("Ai").andExpect(status().isOk()).andExpect(jsonPath("$.issues[*].id", contains(4302)));
        search("처리").andExpect(jsonPath("$.issues[*].id", contains(4301)));
        search("이야기").andExpect(status().isOk()).andExpect(jsonPath("$.issues", hasSize(0)));
        search("키워드").andExpect(status().isOk()).andExpect(jsonPath("$.events", hasSize(0)));
        search("본문").andExpect(status().isOk()).andExpect(jsonPath("$.articles", hasSize(0)));
    }

    // AC-4 — 없음 · 빈 문자열 · 공백뿐(전각 공백 포함)이면 400 과 검색 문구
    @Test
    void missingOrBlankQueryIs400() throws Exception {
        mvc.perform(get(URL))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("q"))
                .andExpect(jsonPath("$.errors[0].reason").value("검색어를 입력해 주세요"));
        for (String blank : new String[] {"", "   ", " \t　 "}) {
            search(blank)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors.length()").value(1))
                    .andExpect(jsonPath("$.errors[0].field").value("q"))
                    .andExpect(jsonPath("$.errors[0].reason").value("검색어를 입력해 주세요"));
        }
    }

    // AC-4 — 앞뒤 공백을 지운 뒤 50자까지 받는다
    @Test
    void fiftyCharactersPassAndFiftyOneAre400() throws Exception {
        String fifty = "가".repeat(50);
        search("  " + fifty + "  ").andExpect(status().isOk());
        search(fifty + "가")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("q"))
                .andExpect(jsonPath("$.errors[0].reason").value("검색어는 50자까지예요"));
    }

    // AC-4 — U+0000(NUL)이 든 검색어는 400. PostgreSQL 이 이 글자를 받지 못해 전에는 500 이었다
    @Test
    void nulCharacterIs400() throws Exception {
        for (String withNul : new String[] {"\u0000", "예\u0000산"}) {
            search(withNul)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors.length()").value(1))
                    .andExpect(jsonPath("$.errors[0].field").value("q"))
                    .andExpect(jsonPath("$.errors[0].reason").value("검색어에 쓸 수 없는 글자가 들어 있어요"));
        }
    }

    // AC-4 — 자모로 나뉘어(NFD) 온 한글도 NFC 제목을 찾는다
    @Test
    void decomposedHangulFindsComposedTitle() throws Exception {
        String nfd = Normalizer.normalize("예산", Normalizer.Form.NFD);
        search(nfd).andExpect(status().isOk()).andExpect(jsonPath("$.issues[*].id", contains(4301)));
    }

    // AC-5 — 이슈에 묶이지 않은 사건과 공개 전 기사는 나오지 않는다
    @Test
    void eventsOutsideIssuesAndUnreleasedArticlesAreLeftOut() throws Exception {
        search("예산")
                .andExpect(jsonPath("$.events[*].id", contains(4301)))
                .andExpect(jsonPath("$.articles[*].id", contains(4301)));
        search("단독").andExpect(jsonPath("$.events", hasSize(0)));
        search("공개 전").andExpect(jsonPath("$.articles", hasSize(0)));
    }

    // AC-6 — 유형마다 최신순 20개. 시각이 같으면 id 가 큰 것 먼저
    // 정렬 기준을 잘못 바꾸면 갈리게 둔다
    // - id 가 가장 작은 1 이 가장 늦다 — 정렬을 id 로 바꾸면 [0] 에서 갈린다(reviewer 지적)
    // - 이슈의 updated_at 은 id 순서대로 늘어 created_at 순서와 다르다 — 이슈 정렬을 updated_at 으로 바꾸면 갈린다
    // - 12 ~ 21 열 개가 같은 시각이고 넣는 순서를 섞었다 — 같은 시각의 id desc 를 빼면 id 순서가 아닌 순서가 드러난다
    @Test
    void eachKindIsLatestFirstAndCappedAtTwenty() throws Exception {
        for (int n : new int[] {14, 2, 19, 7, 12, 21, 1, 16, 9, 13, 4, 20, 11, 17, 5, 15, 3, 18, 8, 10, 6}) {
            // 1 은 9월 25일(가장 늦음), 2 ~ 11 은 9월 2 ~ 11일, 12 ~ 21 은 모두 9월 20일
            String at = n == 1
                    ? "2026-09-25T00:00:00Z"
                    : n <= 11 ? "2026-09-%02dT00:00:00Z".formatted(n) : "2026-09-20T00:00:00Z";
            issue(4400 + n, "한도 이슈 " + n, null, at, "2026-10-%02dT00:00:00Z".formatted(n));
            event(4400 + n, 4301L, "한도 사건 " + n, at);
            article(4400 + n, "한도 기사 " + n, true, at);
        }
        // 가장 늦은 4401, 같은 9월 20일인 4421 ~ 4412, 9월 11일부터 거꾸로 4411 ~ 4403. 가장 이른 4402 가 빠져 20개다
        Integer[] latestFirst = {
            4401, 4421, 4420, 4419, 4418, 4417, 4416, 4415, 4414, 4413, 4412, 4411, 4410, 4409, 4408, 4407, 4406, 4405,
            4404, 4403
        };
        search("한도")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues[*].id", contains(latestFirst)))
                .andExpect(jsonPath("$.events[*].id", contains(latestFirst)))
                .andExpect(jsonPath("$.articles[*].id", contains(latestFirst)));
    }

    // AC-7 — 한 번 부르면 SQL 은 유형마다 하나, 셋이다
    @Test
    void oneQueryPerKind() throws Exception {
        clearInvocations(jdbc);
        search("예산").andExpect(status().isOk());
        verify(jdbc, times(3)).sql(anyString());
    }

    // 기준은 아니다(옛 AC-3 자리) — 위치 찾기라 %, _, \ 도 그 글자로만 찾고 500 이 나지 않는다
    @Test
    void patternCharactersAreJustCharacters() throws Exception {
        for (String q : new String[] {"%", "_", "\\"}) {
            search(q)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.issues", hasSize(0)))
                    .andExpect(jsonPath("$.events[*].id", contains(4303)))
                    .andExpect(jsonPath("$.articles", hasSize(0)));
        }
    }

    private ResultActions search(String q) throws Exception {
        return mvc.perform(get(URL).param("q", q));
    }

    private void issue(long id, String title, String summary, String createdAt) {
        issue(id, title, summary, createdAt, createdAt);
    }

    private void issue(long id, String title, String summary, String createdAt, String updatedAt) {
        jdbc.sql("""
                insert into issue(id,title,summary,created_at,updated_at)
                values (:id,:title,:summary,cast(:created as timestamptz),cast(:updated as timestamptz))
                """)
                .param("id", id)
                .param("title", title)
                .param("summary", summary)
                .param("created", createdAt)
                .param("updated", updatedAt)
                .update();
    }

    private void event(long id, Long issueId, String title, String occurredAt) {
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (:id,:issue,:title,'키워드',cast(:at as timestamptz),'EXTRACTED',now(),now(),'MAIN')
                """)
                .param("id", id)
                .param("issue", issueId)
                .param("title", title)
                .param("at", occurredAt)
                .update();
    }

    private void article(long id, String title, boolean released, String publishedAt) {
        jdbc.sql("""
                insert into article(id,source,url,press_code,title,body,published_at,released_at,created_at)
                values (:id,'NEWSDATA',:url,'search43',:title,'본문',cast(:at as timestamptz),
                    case when :released then now() else null end,now())
                """)
                .param("id", id)
                .param("url", "https://fixture.invalid/search43/" + id)
                .param("title", title)
                .param("at", publishedAt)
                .param("released", released)
                .update();
    }
}
