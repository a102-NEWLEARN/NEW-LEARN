package kr.io.newlearn.dictionary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

// 표준국어대사전 Open API 부르기 (docs/specs/F13-dictionary-api.md AC-4 · AC-7)
// 응답 모양은 공식 안내(stdict.korean.go.kr/openapi/openApiInfo.do)의 예시와 같다 — 2026-10-29 실제 키로 다섯 낱말을 불러 확인했다
// 응답 종류는 text/json, 표제어마다 첫 뜻풀이 하나(sense 객체), 결과 없음은 200 + 빈 본문이다
@ExtendWith(OutputCaptureExtension.class)
class StdictClientTest {

    // 시험용 가짜 키 — 실제 키는 env STDICT_API_KEY 로만 받는다
    static final String KEY = "test-stdict-key";
    static final MediaType TEXT_JSON = MediaType.parseMediaType("text/json;charset=UTF-8");
    static final JsonMapper JSON = JsonMapper.builder().build();

    // 공식 안내의 JSON 예시(나무). 안내 원문의 link 칸은 JSON 이 아니라 문자열로 고쳤다
    static final String OFFICIAL_EXAMPLE = """
            {
              "channel": {
                "title": "표준 국어 대사전 개발 지원(Open API) - 사전 검색 ",
                "link": "https://stdict.korean.go.kr",
                "description": "표준 국어 대사전 개발 지원(Open API) – 사전 검색 결과",
                "lastbuilddate": "20190115141020",
                "total": 5, "start": 1, "num": 10,
                "item": [
                  {
                    "target_code": 404765, "word": "나무", "sup_no": 1, "pos": "명사",
                    "sense": {
                      "definition": "줄기나 가지가 목질로 된 여러해살이 식물.",
                      "link": "https://stdict.korean.go.kr/search/searchView.do?word_no=404765&searchKeywordTo=3",
                      "type": "일반어"
                    }
                  },
                  {
                    "target_code": 57033, "word": "나무", "sup_no": 2, "pos": "명사",
                    "sense": {
                      "definition": "소 장수들의 은어로, 팔백 냥을 이르던 말.",
                      "link": "https://stdict.korean.go.kr/search/searchView.do?word_no=57033&searchKeywordTo=3",
                      "type": "일반어"
                    }
                  }
                ]
              }
            }
            """;

    // 실제 키로 받은 「구원투수」 응답 그대로(2026-10-29). 구 표제어라 품사가 「품사 없음」 글자로 온다
    static final String REAL_PHRASE = """
            {"channel": {"total": 1, "num": 10, "title": "표준 국어 대사전 개발 지원(Open API) - 사전  검색", "start": 1,
              "description": "표준 국어 대사전 개발 지원(Open API) – 사전 검색 결과",
              "item": [{"sup_no": "0", "origin": "救援投手", "word": "구원^투수", "target_code": "37461",
                "sense": {"definition": "야구에서, 앞서 던지던 투수를 대신하여 경기 중간에 나가서 던지는 투수.",
                  "link": "https://stdict.korean.go.kr/search/searchView.do?word_no=37461&searchKeywordTo=3", "type": "일반어"},
                "pos": "품사 없음"}],
              "link": "https://stdict.korean.go.kr", "lastbuilddate": "20261029083708"}}
            """;

    // 사전 하나에 가짜 서버 하나 — 응답 하나를 정해 두고 한 번 부른다
    record Fixture(MockRestServiceServer server, StdictClient client) {
        static Fixture of(String key) {
            RestClient.Builder builder = RestClient.builder().baseUrl(StdictClient.BASE_URL);
            MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
            return new Fixture(server, new StdictClient(builder, key, JSON));
        }
    }

    static String searchUrl(String encodedQuery) {
        return StdictClient.BASE_URL + "/api/search.do?key=" + KEY + "&q=" + encodedQuery + "&req_type=json";
    }

    static List<DictionaryItem> answer(String body) {
        Fixture f = Fixture.of(KEY);
        f.server().expect(requestTo(searchUrl("%EB%82%98%EB%AC%B4"))).andRespond(withSuccess(body, TEXT_JSON));
        List<DictionaryItem> items = f.client().search("나무");
        f.server().verify();
        return items;
    }

    // 사전이 이렇게 답하면 502 다. 예외 설명에는 키가 없다
    static ApiException failure(ResponseCreator response) {
        Fixture f = Fixture.of(KEY);
        f.server().expect(requestTo(searchUrl("%EB%82%98%EB%AC%B4"))).andRespond(response);
        ApiException ex =
                catchThrowableOfType(ApiException.class, () -> f.client().search("나무"));
        assertThat(ex).as("502 로 바꿔야 한다").isNotNull();
        assertThat(ex.errorCode()).isEqualTo(ErrorCode.DICTIONARY_UNAVAILABLE);
        assertThat(ex.getMessage()).doesNotContain(KEY);
        return ex;
    }

    @Test
    void sendsKeyQueryAndJsonTypeWithQueryEncoded() {
        Fixture f = Fixture.of(KEY);
        f.server()
                .expect(requestTo(searchUrl("a%26b%2Bc%20%EB%82%98%EB%AC%B4")))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(OFFICIAL_EXAMPLE, TEXT_JSON));
        f.client().search("a&b+c 나무");
        f.server().verify();
    }

    @Test
    void officialExampleBecomesOneItemPerDefinition() {
        assertThat(answer(OFFICIAL_EXAMPLE))
                .containsExactly(
                        new DictionaryItem("나무", "명사", "줄기나 가지가 목질로 된 여러해살이 식물."),
                        new DictionaryItem("나무", "명사", "소 장수들의 은어로, 팔백 냥을 이르던 말."));
    }

    // 「품사 없음」은 품사가 아니다 — 화면에 품사처럼 찍히지 않게 null 로 보낸다
    @Test
    void realPhraseResponseHasNoPos() {
        assertThat(answer(REAL_PHRASE))
                .containsExactly(new DictionaryItem("구원^투수", null, "야구에서, 앞서 던지던 투수를 대신하여 경기 중간에 나가서 던지는 투수."));
    }

    // 실제 응답에서는 sense 가 늘 객체 하나였다. 배열로 와도 하나씩 항목으로 옮긴다
    @Test
    void senseArrayBecomesSeveralItems() {
        String body = """
                {"channel": {"total": 1, "item": [
                  {"word": "구원^투수", "pos": "명사", "sense": [{"definition": "첫째 뜻"}, {"definition": "둘째 뜻"}]}
                ]}}
                """;
        assertThat(answer(body))
                .containsExactly(new DictionaryItem("구원^투수", "명사", "첫째 뜻"), new DictionaryItem("구원^투수", "명사", "둘째 뜻"));
    }

    // 항목이 하나면 배열이 아니라 객체 하나로 올 수 있다(XML 을 JSON 으로 옮긴 응답에서 흔하다)
    @Test
    void singleItemObjectIsRead() {
        String body = """
                {"channel": {"total": 1, "item": {"word": "나무", "pos": "명사", "sense": {"definition": "뜻"}}}}
                """;
        assertThat(answer(body)).containsExactly(new DictionaryItem("나무", "명사", "뜻"));
    }

    @Test
    void blankPosIsNullAndEntriesWithoutWordOrDefinitionAreSkipped() {
        String body = """
                {"channel": {"total": 3, "item": [
                  {"word": "나무", "pos": " ", "sense": {"definition": "뜻"}},
                  {"word": "나무", "pos": "명사", "sense": {"definition": ""}},
                  {"pos": "명사", "sense": {"definition": "표제어 없음"}}
                ]}}
                """;
        assertThat(answer(body)).containsExactly(new DictionaryItem("나무", null, "뜻"));
    }

    @Test
    void channelWithoutItemsIsEmpty() {
        assertThat(answer("{\"channel\": {\"total\": 0, \"start\": 1, \"num\": 10}}"))
                .isEmpty();
    }

    // 결과가 없으면 사전이 200 + 빈 본문을 준다(2026-10-29 실제 키로 「뷁뷁뷁」). 틀린 키도 같은 빈 본문이라 둘을 가를 수 없다 — 결과 없음으로 본다
    @Test
    void emptyBodyIsNoResult() {
        assertThat(answer("")).isEmpty();
    }

    @Test
    void errorJsonIs502WhetherCodeIsTextOrNumber() {
        failure(withSuccess("{\"error\": {\"error_code\": \"020\", \"message\": \"Unregistered key\"}}", TEXT_JSON));
        failure(withSuccess("{\"error\": {\"error_code\": 20, \"message\": \"Unregistered key \"}}", TEXT_JSON));
    }

    @Test
    void serverErrorIs502() {
        failure(withServerError());
    }

    @Test
    void connectionFailureIs502() {
        failure(withException(new SocketTimeoutException("Read timed out")));
    }

    @Test
    void notJsonIs502() {
        failure(withSuccess("<html>점검 중입니다</html>", MediaType.TEXT_HTML));
        failure(withSuccess("{\"channel\": \"이상한 모양\"}", TEXT_JSON));
        failure(withSuccess("{}", TEXT_JSON));
    }

    // 항목이 왔는데 하나도 못 읽으면 모양이 다른 것이다 — 「결과 없음」으로 하루 저장되지 않게 502
    @Test
    void itemsThatCannotBeReadAre502() {
        failure(withSuccess(
                "{\"channel\": {\"total\": 2, \"item\": [{\"title\": \"나무\"}, {\"word\": \"나무\", \"sense\": {}}]}}",
                TEXT_JSON));
    }

    // AC-7 — 실패를 로그에 남기되 키 · 검색어는 적지 않는다. 예외 객체를 로그에 넘기면 키가 든 주소가 다음 줄들에 찍힌다 — 출력 전체를 본다
    @Test
    void failureLogHasNeitherKeyNorQuery(CapturedOutput output) {
        failure(withException(new IOException("I/O error on GET request for " + searchUrl("%EB%82%98%EB%AC%B4"))));
        failure(withServerError());
        failure(withSuccess(
                "{\"error\": {\"error_code\": \"020\", \"message\": \"key=" + KEY + " q=나무\"}}", TEXT_JSON));
        List<String> ours = output.getAll()
                .lines()
                .filter(line -> line.contains("StdictClient"))
                .toList();
        assertThat(ours).hasSize(3).noneMatch(line -> line.contains("나무"));
        assertThat(output.getAll()).doesNotContain(KEY);
    }

    // 키를 넣기 전(사이트에 봉인 Secret 이 없을 때)에는 사전을 부르지 않는다
    @Test
    void blankKeyIs502WithoutCalling() {
        for (String blank : new String[] {"", "  "}) {
            Fixture f = Fixture.of(blank);
            ApiException ex =
                    catchThrowableOfType(ApiException.class, () -> f.client().search("나무"));
            assertThat(ex).isNotNull();
            assertThat(ex.errorCode()).isEqualTo(ErrorCode.DICTIONARY_UNAVAILABLE);
            f.server().verify();
        }
    }

    // 실제 설정(create)의 읽기 시간 초과 — 3초 넘게 답하지 않으면 기다리지 않고 502
    @Test
    void slowDictionaryTimesOut() throws IOException {
        HttpServer slow = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        ExecutorService threads = Executors.newSingleThreadExecutor(task -> {
            Thread thread = new Thread(task);
            thread.setDaemon(true);
            return thread;
        });
        slow.setExecutor(threads);
        slow.createContext("/api/search.do", exchange -> {
            try {
                Thread.sleep(6_000);
                exchange.sendResponseHeaders(200, -1);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        slow.start();
        try {
            String baseUrl = "http://" + InetAddress.getLoopbackAddress().getHostAddress() + ":"
                    + slow.getAddress().getPort();
            StdictClient client = StdictClient.create(baseUrl, KEY, JSON);
            long started = System.nanoTime();
            ApiException ex = catchThrowableOfType(ApiException.class, () -> client.search("나무"));
            long seconds = (System.nanoTime() - started) / 1_000_000_000;
            assertThat(ex).isNotNull();
            assertThat(ex.errorCode()).isEqualTo(ErrorCode.DICTIONARY_UNAVAILABLE);
            assertThat(seconds).isLessThan(5);
        } finally {
            slow.stop(0);
            threads.shutdownNow();
        }
    }
}
