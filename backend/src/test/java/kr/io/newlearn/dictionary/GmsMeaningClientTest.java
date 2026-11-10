package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.twice;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.net.ConnectException;
import java.util.concurrent.atomic.AtomicLong;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

// SSAFY GMS(OpenAI 호환 chat/completions)로 문맥 뜻 하나를 받는다 (docs/specs/F13-dictionary-api.md AC-16 · AC-17)
// 요청 모양은 AI 워커(ai/app/gms.py)와 같다 — 2026-10-23 AI 실험에서 GMS 가 그대로 받는 것을 확인했다(SSOT 10절)
@ExtendWith(OutputCaptureExtension.class)
class GmsMeaningClientTest {

    static final String BASE = "https://gms.example/v1";
    // 시험용 가짜 키 — 실제 키는 env GMS_API_KEY 로만 받는다
    static final String KEY = "test-gms-key";
    static final String MODEL = "gpt-6-luna";
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final MeaningPrompt PROMPT = new MeaningPrompt("이자를", "동결하며 이자를 올렸다", "금리 동결에 이자 부담", "시중은행은 예금 이자를 내렸다");

    // 가짜 시계 — 다시 부를지 가르는 「빨리 실패했나」를 시험이 정한다
    final AtomicLong now = new AtomicLong();

    record Fixture(MockRestServiceServer server, GmsMeaningClient client) {}

    Fixture fixture(String key) {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(server, new GmsMeaningClient(builder, key, MODEL, JSON, now::get));
    }

    // OpenAI 모양의 답 — content 는 모델이 낸 JSON 글
    static String completion(String content) {
        return JSON.writeValueAsString(java.util.Map.of(
                "choices",
                java.util.List.of(java.util.Map.of(
                        "message", java.util.Map.of("role", "assistant", "content", content), "finish_reason", "stop")),
                "usage",
                java.util.Map.of("prompt_tokens", 120, "completion_tokens", 40)));
    }

    static final String FOUND =
            "{\"found\":true,\"word\":\"이자\",\"pos\":\"명사\",\"definition\":\"남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈.\"}";

    @Test
    void sendsTheChatRequestAndReadsOneMeaning() {
        Fixture f = fixture(KEY);
        f.server()
                .expect(once(), requestTo(BASE + "/chat/completions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + KEY))
                .andExpect(jsonPath("$.model").value(MODEL))
                .andExpect(jsonPath("$.response_format.type").value("json_object"))
                .andExpect(jsonPath("$.messages[0].role").value("system"))
                .andExpect(jsonPath("$.messages[1].role").value("user"))
                .andRespond(withSuccess(completion(FOUND), MediaType.APPLICATION_JSON));

        Meaning meaning = f.client().explain(PROMPT);

        assertThat(meaning).isEqualTo(new Meaning(true, "이자", "명사", "남에게 돈을 빌려 쓴 대가로 치르는 일정 비율의 돈."));
        f.server().verify();
    }

    // 입력은 JSON 으로 감싸 넘긴다 — 글 안의 지시를 지시로 읽지 않게(시스템 문구도 그렇게 이른다)
    @Test
    void userMessageCarriesTheInputsAsJsonData() {
        Fixture f = fixture(KEY);
        f.server()
                .expect(once(), requestTo(BASE + "/chat/completions"))
                .andExpect(request -> {
                    var body = JSON.readTree(
                            ((org.springframework.mock.http.client.MockClientHttpRequest) request).getBodyAsString());
                    var user = JSON.readTree(
                            body.path("messages").path(1).path("content").stringValue());
                    assertThat(user.path("term").stringValue()).isEqualTo("이자를");
                    assertThat(user.path("around").stringValue()).isEqualTo("동결하며 이자를 올렸다");
                    assertThat(user.path("title").stringValue()).isEqualTo("금리 동결에 이자 부담");
                    assertThat(user.path("context").stringValue()).isEqualTo("시중은행은 예금 이자를 내렸다");
                })
                .andRespond(withSuccess(completion(FOUND), MediaType.APPLICATION_JSON));
        f.client().explain(PROMPT);
        f.server().verify();
    }

    @Test
    void notFoundRefusalAndContentFilterAreNotExplainable() {
        Fixture f = fixture(KEY);
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withSuccess(completion("{\"found\":false}"), MediaType.APPLICATION_JSON));
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withSuccess(
                        "{\"choices\":[{\"message\":{\"content\":null,\"refusal\":\"거절\"},\"finish_reason\":\"stop\"}]}",
                        MediaType.APPLICATION_JSON));
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withSuccess(
                        "{\"choices\":[{\"message\":{\"content\":\"\"},\"finish_reason\":\"content_filter\"}]}",
                        MediaType.APPLICATION_JSON));
        for (int i = 0; i < 3; i++) {
            assertThat(f.client().explain(PROMPT)).isEqualTo(Meaning.NONE);
        }
        f.server().verify();
    }

    // 품사는 길면(10자 넘음) 버린다. 표제어 · 뜻풀이는 꼭 있어야 하고 길면(50 · 200자) 실패다
    @Test
    void longPartOfSpeechIsDroppedButBrokenAnswersFail() {
        Fixture f = fixture(KEY);
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withSuccess(
                        completion("{\"found\":true,\"word\":\"이자\",\"pos\":\"" + "가".repeat(11)
                                + "\",\"definition\":\"돈.\"}"),
                        MediaType.APPLICATION_JSON));
        assertThat(f.client().explain(PROMPT).pos()).isNull();

        String[] broken = {
            "이것은 JSON 이 아니다",
            "{\"word\":\"이자\",\"definition\":\"돈.\"}",
            "{\"found\":true,\"word\":\" \",\"definition\":\"돈.\"}",
            "{\"found\":true,\"word\":\"이자\"}",
            "{\"found\":true,\"word\":\"" + "가".repeat(51) + "\",\"definition\":\"돈.\"}",
            "{\"found\":true,\"word\":\"이자\",\"definition\":\"" + "가".repeat(201) + "\"}",
        };
        for (String content : broken) {
            Fixture each = fixture(KEY);
            each.server()
                    .expect(requestTo(BASE + "/chat/completions"))
                    .andRespond(withSuccess(completion(content), MediaType.APPLICATION_JSON));
            assertUnavailable(each.client());
        }
    }

    // 키가 틀림 · 상한 · 잘못된 요청은 다시 불러도 같다 — 한 번만 부르고 502
    @Test
    void clientErrorsAreNotRetried() {
        for (HttpStatus status :
                new HttpStatus[] {HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS, HttpStatus.BAD_REQUEST}) {
            Fixture f = fixture(KEY);
            f.server().expect(once(), requestTo(BASE + "/chat/completions")).andRespond(withStatus(status));
            assertUnavailable(f.client());
            f.server().verify();
        }
    }

    // GMS 는 502 · 연결 끊김이 가끔 있고 다시 부르면 이어졌다(SSOT 10절). 빨리(2초 안) 실패했을 때만 한 번 다시 부른다
    @Test
    void fastServerErrorOrConnectFailureIsRetriedOnce() {
        Fixture f = fixture(KEY);
        f.server().expect(requestTo(BASE + "/chat/completions")).andRespond(withServerError());
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withSuccess(completion(FOUND), MediaType.APPLICATION_JSON));
        assertThat(f.client().explain(PROMPT).found()).isTrue();
        f.server().verify();

        Fixture g = fixture(KEY);
        g.server()
                .expect(twice(), requestTo(BASE + "/chat/completions"))
                .andRespond(withException(new ConnectException("연결 거부")));
        assertUnavailable(g.client());
        g.server().verify();
    }

    // 늦게(2초 넘어) 실패하면 다시 부르지 않는다 — 다시 부르면 입구 시간 제한(20초)을 넘길 수 있다
    @Test
    void slowFailureIsNotRetried() {
        Fixture f = fixture(KEY);
        f.server().expect(once(), requestTo(BASE + "/chat/completions")).andRespond(request -> {
            now.addAndGet(3_000_000_000L);
            throw new IOException("읽기 시간 초과 흉내");
        });
        assertUnavailable(f.client());
        f.server().verify();
    }

    // 키는 있는데 주소가 비었다 — 로컬 PC 에 GMS_API_KEY 환경변수만 있는 경우. 2026-11-10 실제 실행에서 500 이 났다
    @Test
    void missingBaseUrlIs502NotInternalError(CapturedOutput output) {
        GmsMeaningClient client = GmsMeaningClient.create("  ", KEY, MODEL, JSON);
        assertUnavailable(client);
        assertThat(output).contains("GMS_BASE_URL").doesNotContain(KEY);
    }

    @Test
    void missingKeyFailsWithoutCalling(CapturedOutput output) {
        Fixture f = fixture("  ");
        assertUnavailable(f.client());
        f.server().verify();
        assertThat(output).contains("GMS_API_KEY");
    }

    // 키 · 고른 말 · 문맥 · GMS 답은 로그에 남기지 않는다 — 실패해도
    @Test
    void logsDoNotCarryKeyOrText(CapturedOutput output) {
        Fixture f = fixture(KEY);
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":{\"message\":\"이자를 포함한 오류 문구\",\"code\":\"bad\"}}"));
        f.server()
                .expect(requestTo(BASE + "/chat/completions"))
                .andRespond(
                        withSuccess(completion("{\"found\":true,\"word\":\"이자를 반복\"}"), MediaType.APPLICATION_JSON));
        assertUnavailable(f.client());
        assertUnavailable(f.client());
        f.server().verify();
        assertThat(output).doesNotContain(KEY).doesNotContain("이자").doesNotContain("예금");
    }

    private static void assertUnavailable(GmsMeaningClient client) {
        ApiException e = catchThrowableOfType(ApiException.class, () -> client.explain(PROMPT));
        assertThat(e).isNotNull();
        assertThat(e.errorCode()).isEqualTo(ErrorCode.DICTIONARY_UNAVAILABLE);
    }
}
