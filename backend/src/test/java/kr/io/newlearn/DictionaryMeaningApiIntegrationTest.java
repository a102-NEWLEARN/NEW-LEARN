package kr.io.newlearn;

import static kr.io.newlearn.MemberAuthApiIntegrationTest.sessionCookie;
import static kr.io.newlearn.MemberAuthApiIntegrationTest.signUpBody;
import static kr.io.newlearn.common.security.TestCsrf.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.dictionary.Meaning;
import kr.io.newlearn.dictionary.MeaningPrompt;
import kr.io.newlearn.dictionary.MeaningSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// A26 드래그한 말의 문맥 뜻 (docs/api-screen.md A26, docs/specs/F13-dictionary-api.md AC-10 ~ AC-16, Jira 187)
// GMS 는 가짜(MeaningSource)로 바꾸고, 문맥은 실제 DB · 저장과 하루 한도는 실제 Redis 에서 본다. 한도는 3 으로 줄인다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "newlearn.dictionary.meaning.daily-limit=3")
@Transactional
class DictionaryMeaningApiIntegrationTest {

    static final String URL = "/api/v1/dictionary/meaning";
    static final JsonMapper JSON = JsonMapper.builder().build();

    // 4201 기사의 마인드맵 잎 — 화면의 흐름지도 · 마인드맵 보기가 보이는 글이다
    static final String LEAF = "한국은행이 기준금리를 동결하며 이자 부담이 커졌다";
    static final String LEAF_TWO = "가계 대출의 금리 인상 압력이 이어진다";
    // 기사 본문은 화면에 없다 — 모델에 주는 문맥으로만 쓰고 드래그 대상 글로는 보지 않는다
    static final String BODY = "본문 앞부분. 시중은행은 예금 이자를 내리고 대출 이자는 그대로 두었다. 본문 끝부분.";

    static final Meaning INTEREST = new Meaning(true, "이자", "명사", "남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈.");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    StringRedisTemplate redis;

    @MockitoBean
    MeaningSource source;

    Cookie session;

    @BeforeEach
    void fixtures() throws Exception {
        for (String pattern : new String[] {"meaning:*", "meaningquota:*"}) {
            Set<String> keys = redis.keys(pattern);
            if (!keys.isEmpty()) {
                redis.delete(keys);
            }
        }
        EventApiFixtures.insert(jdbc);
        String content = """
                {"title":null,"branches":[
                  {"type":"CORE","items":[{"text":"%s","evidence":[]}]},
                  {"type":"OUTLOOK","items":[{"text":"%s","evidence":[]}]}]}""".formatted(LEAF, LEAF_TWO);
        jdbc.sql("update article_mindmap set content = cast(:content as jsonb) where article_id = 4201")
                .param("content", content)
                .update();
        jdbc.sql("update article set title = '금리 동결에 이자 부담', body = :body where id = 4201")
                .param("body", BODY)
                .update();
        jdbc.sql("update issue set summary = '기준금리 동결 뒤 대출 이자 부담이 커진 흐름' where id = 4900")
                .update();
        session = sessionCookie(mvc.perform(post("/api/v1/members")
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signUpBody("meaning187", "password1", "독자", "economy")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse());
    }

    static String body(String term, String around, String type, Object id) {
        return JSON.writeValueAsString(
                java.util.Map.of("term", term, "around", around, "contextType", type, "contextId", id));
    }

    ResultActions ask(String json) throws Exception {
        return mvc.perform(post(URL)
                .cookie(session)
                .with(csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    ResultActions ask(String term, String around, String type, long id) throws Exception {
        return ask(body(term, around, type, id));
    }

    static String todayQuotaKey() {
        return "meaningquota:" + LocalDate.now(ZoneId.of("Asia/Seoul"));
    }

    // AC-10 — 손님은 부르지 못한다(GMS 비용, 화면도 회원 전용). 로그인은 해도 번호표가 없으면 403
    @Test
    void guestsAndRequestsWithoutCsrfTokenAreRefused() throws Exception {
        mvc.perform(post(URL)
                        .with(csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("이자", LEAF, "ARTICLE", 4201)))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(URL)
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("이자", LEAF, "ARTICLE", 4201)))
                .andExpect(status().isForbidden());
        verifyNoInteractions(source);
    }

    // AC-11 — 뜻 하나를 사전 모양으로. 모델에는 고른 말 · 주변 조각 · 제목 · 본문의 그 말 근처를 준다
    @Test
    void meaningComesBackLikeADictionaryEntryWithTheArticleContext() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        ask("이자", "동결하며 이자 부담이", "ARTICLE", 4201)
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.query").value("이자"))
                .andExpect(jsonPath("$.word").value("이자"))
                .andExpect(jsonPath("$.pos").value("명사"))
                .andExpect(jsonPath("$.definition").value("남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈."));
        ArgumentCaptor<MeaningPrompt> prompt = ArgumentCaptor.forClass(MeaningPrompt.class);
        verify(source).explain(prompt.capture());
        assertThat(prompt.getValue().term()).isEqualTo("이자");
        assertThat(prompt.getValue().around()).isEqualTo("동결하며 이자 부담이");
        assertThat(prompt.getValue().title()).isEqualTo("금리 동결에 이자 부담");
        assertThat(prompt.getValue().context()).contains("예금 이자를 내리고");
    }

    // AC-11 — 뜻 단위가 아니거나 문맥으로도 모르면 200 에 세 칸이 null 이다(결과 없음과 같은 자리)
    @Test
    void notExplainableIsNullFieldsWith200() throws Exception {
        when(source.explain(any())).thenReturn(Meaning.NONE);
        ask("은행이", LEAF, "ARTICLE", 4201)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("은행이"))
                .andExpect(jsonPath("$.word").hasJsonPath())
                .andExpect(jsonPath("$.word").value(nullValue()))
                .andExpect(jsonPath("$.pos").value(nullValue()))
                .andExpect(jsonPath("$.definition").value(nullValue()));
    }

    // AC-12 — 고른 말 · 조각 · 대상이 규칙에 맞지 않으면 GMS 를 부르지 않고 400 과 그 칸의 이유
    @Test
    void invalidInputIs400WithTheFieldAndNoCall() throws Exception {
        String[][] cases = {
            {"", LEAF, "ARTICLE", "4201", "term"},
            {"   ", LEAF, "ARTICLE", "4201", "term"},
            {".", LEAF, "ARTICLE", "4201", "term"},
            {"2026", LEAF, "ARTICLE", "4201", "term"},
            {"가".repeat(51), "가".repeat(51), "ARTICLE", "4201", "term"},
            {"이\u0000자", LEAF, "ARTICLE", "4201", "term"},
            {"이자", "", "ARTICLE", "4201", "around"},
            {"이자", "가".repeat(121), "ARTICLE", "4201", "around"},
            {"이자", LEAF, "NEWS", "4201", "contextType"},
        };
        for (String[] c : cases) {
            ask(body(c[0], c[1], c[2], Long.parseLong(c[3])))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors[0].field").value(c[4]));
        }
        ask("{\"term\":\"이자\",\"around\":\"이자 부담\",\"contextType\":\"ARTICLE\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("contextId"));
        verifyNoInteractions(source);
    }

    // AC-12 — 고른 말은 조각 안에, 조각은 그 대상의 화면 글(제목 · 잎) 안에 있어야 한다. 본문은 화면에 없어 드래그 대상이 아니다
    @Test
    void termAndAroundMustBeInTheTargetText() throws Exception {
        ask("환율", LEAF, "ARTICLE", 4201)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("term"));
        ask("이자", "아무 글이나 이자를 넣은 조각", "ARTICLE", 4201)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("around"));
        ask("이자", "예금 이자를 내리고", "ARTICLE", 4201)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("around"));
        verifyNoInteractions(source);
    }

    // AC-12 — 비교는 공백을 뺀 NFC 다. 마인드맵 보기는 잎을 줄로 나누며 줄 사이 공백을 버린다(wrapText)
    @Test
    void comparisonIgnoresSpacesAndUnicodeComposition() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        String decomposed = java.text.Normalizer.normalize("기준금리를동결하며이자", java.text.Normalizer.Form.NFD);
        ask("이자", decomposed, "ARTICLE", 4201).andExpect(status().isOk());
        ask("금리 인상", "대출의 금리 인상 압력", "ARTICLE", 4201).andExpect(status().isOk());
    }

    // AC-13 — 이슈는 제목 · 요약, 사건은 제목 · 이름 · 요약에서 고른다
    @Test
    void issueAndEventTextsAreTargets() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        ask("이자", "대출 이자 부담이 커진", "ISSUE", 4900).andExpect(status().isOk());
        ask("사건", "가운데 사건", "EVENT", 4902).andExpect(status().isOk());
        ask("요약", "저장된 사건 요약", "EVENT", 4902).andExpect(status().isOk());
        ArgumentCaptor<MeaningPrompt> prompt = ArgumentCaptor.forClass(MeaningPrompt.class);
        verify(source, times(3)).explain(prompt.capture());
        assertThat(prompt.getAllValues().get(0).title()).isEqualTo("사건 패널 이슈");
        assertThat(prompt.getAllValues().get(1).title()).isEqualTo("가운데 사건");
    }

    // AC-13 — 가로 타임라인은 사건 이름(label)을 보인다. 마인드맵 가운데 제목(content.title)도 화면 글이다.
    // 잎 글이 빈 옛 행이 섞여도 그 잎만 빼고 고를 수 있다(500 이 아니다)
    @Test
    void eventLabelMindmapTitleAndBrokenLeavesAreHandled() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        ask("둘째", "둘째", "EVENT", 4902).andExpect(status().isOk());
        jdbc.sql("""
                        update article_mindmap set content = cast(:content as jsonb) where article_id = 4201""").param("content", """
                        {"title":"AI 가 지은 제목 금리 동결","branches":[
                          {"type":"CORE","items":[{"text":null,"evidence":[]},{"text":" ","evidence":[]},{"text":"%s","evidence":[]}]}]}""".formatted(LEAF)).update();
        ask("금리", "AI 가 지은 제목 금리 동결", "ARTICLE", 4201).andExpect(status().isOk());
        ask("이자", "동결하며 이자 부담이", "ARTICLE", 4201).andExpect(status().isOk());
    }

    // AC-13 — 마인드맵이 아직 없는 기사도 제목은 고를 수 있다
    @Test
    void articleTitleWorksWithoutMindmap() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        ask("기사", "기사 3", "ARTICLE", 4203).andExpect(status().isOk());
    }

    // AC-13 — 없거나 숨긴 대상은 각 화면의 404 와 같다
    @Test
    void missingOrHiddenTargetsAre404() throws Exception {
        ask("기사", "기사 10", "ARTICLE", 4210)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ARTICLE_NOT_FOUND"));
        ask("사건", "미투입 기사만 있는 사건", "EVENT", 4906)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (4999,'빈 이슈',now(),now())")
                .update();
        ask("이슈", "빈 이슈", "ISSUE", 4999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ISSUE_NOT_FOUND"));
        verifyNoInteractions(source);
    }

    // AC-14 — 같은 대상의 같은 말(공백만 다른 것 포함)은 하루 한 번 부르고, 대상이 다르면 따로 부른다. 키에는 만료가 있다
    @Test
    void sameTermOnSameTargetIsAskedOncePerDay() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        ask("금리 인상", "가계 대출의 금리 인상 압력", "ARTICLE", 4201).andExpect(status().isOk());
        ask("금리인상", "가계 대출의 금리 인상 압력", "ARTICLE", 4201)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("금리인상"))
                .andExpect(jsonPath("$.word").value("이자"));
        verify(source, times(1)).explain(any());
        assertThat(redis.getExpire("meaning:ARTICLE:4201:금리인상", TimeUnit.SECONDS))
                .isBetween(1L, 86_400L);
        ask("이자", "대출 이자 부담이", "ISSUE", 4900).andExpect(status().isOk());
        verify(source, times(2)).explain(any());
    }

    // AC-14 — 풀이 불가는 저장하고, 실패는 저장하지 않아 다음에 다시 부른다
    @Test
    void notExplainableIsSavedButFailureIsNot() throws Exception {
        when(source.explain(any()))
                .thenThrow(new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, "GMS 가 답하지 않았다"))
                .thenReturn(Meaning.NONE);
        ask("은행이", LEAF, "ARTICLE", 4201)
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("DICTIONARY_UNAVAILABLE"));
        assertThat(redis.hasKey("meaning:ARTICLE:4201:은행이")).isFalse();
        ask("은행이", LEAF, "ARTICLE", 4201).andExpect(status().isOk());
        ask("은행이", LEAF, "ARTICLE", 4201).andExpect(status().isOk());
        verify(source, times(2)).explain(any());
    }

    // AC-15 — 하루 한도(시험 3)를 넘으면 GMS 를 부르지 않고 502. 저장본은 세지 않는다. 세는 키에는 만료가 있다
    @Test
    void overTheDailyLimitIs502AndSavedAnswersDoNotCount() throws Exception {
        when(source.explain(any())).thenReturn(INTEREST);
        String[] terms = {"한국은행", "기준금리", "부담"};
        for (String term : terms) {
            ask(term, LEAF, "ARTICLE", 4201).andExpect(status().isOk());
        }
        ask("한국은행", LEAF, "ARTICLE", 4201).andExpect(status().isOk());
        ask("동결", LEAF, "ARTICLE", 4201)
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("DICTIONARY_UNAVAILABLE"));
        verify(source, times(3)).explain(any());
        verify(source, never())
                .explain(org.mockito.ArgumentMatchers.argThat(p -> p.term().equals("동결")));
        assertThat(redis.getExpire(todayQuotaKey(), TimeUnit.SECONDS)).isBetween(86_400L, 172_800L);
    }
}
