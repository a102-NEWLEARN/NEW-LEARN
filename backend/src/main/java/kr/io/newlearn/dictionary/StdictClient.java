package kr.io.newlearn.dictionary;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 국립국어원 표준국어대사전 Open API 의 사전 검색(search.do)을 부른다 (docs/api-screen.md A19, Jira 102)
// 요청 · 응답 모양은 공식 안내(stdict.korean.go.kr/openapi/openApiInfo.do)를 따랐다. 실제 키로 본 응답이 아니라서 키를 받으면 다시 맞춘다
// 인증 키가 주소에 실린다 — RestClient 예외 설명에 주소가 그대로 들어가서, 예외는 로그에 넘기지 않고 종류만 적는다. 검색어도 적지 않는다
class StdictClient implements DictionarySource {

    private static final Logger log = LoggerFactory.getLogger(StdictClient.class);

    static final String BASE_URL = "https://stdict.korean.go.kr";
    // 작은 창이 기다리는 시간이다. 넘으면 기다리지 않고 502 를 준다
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    private final RestClient restClient;
    private final String key;
    private final JsonMapper jsonMapper;

    StdictClient(RestClient.Builder builder, String key, JsonMapper jsonMapper) {
        this.restClient = builder.build();
        this.key = key.strip();
        this.jsonMapper = jsonMapper;
    }

    static StdictClient create(String baseUrl, String key, JsonMapper jsonMapper) {
        HttpClient httpClient =
                HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return new StdictClient(RestClient.builder().baseUrl(baseUrl).requestFactory(requestFactory), key, jsonMapper);
    }

    @Override
    public List<DictionaryItem> search(String query) {
        // 사이트에 봉인 Secret 을 넣기 전 — 틀린 키로 부르면 어차피 빈 본문이 온다(2026-10-29 확인)
        if (key.isEmpty()) {
            log.warn("표준국어대사전 인증 키(STDICT_API_KEY)가 없어 사전을 부르지 않았다");
            throw unavailable("인증 키가 없어 표준국어대사전을 부르지 않았다");
        }
        String body;
        try {
            // 값은 주소 변수로 넣는다 — 검색어의 & · + 까지 그대로 보내려면 값 자리를 모두 인코딩해야 한다
            body = restClient
                    .get()
                    .uri(uri -> uri.path("/api/search.do")
                            .queryParam("key", "{key}")
                            .queryParam("q", "{q}")
                            .queryParam("req_type", "json")
                            .build(key, query))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException e) {
            log.warn("표준국어대사전을 부르지 못했다: {}", e.getClass().getSimpleName());
            throw unavailable("표준국어대사전이 답하지 않았다");
        }
        // 키가 없거나 틀리면 오류 JSON 이 아니라 200 + 빈 본문이 온다. 결과 없음과 가를 수 없어 실패로 본다(2026-10-29 사용자)
        if (body == null || body.isBlank()) {
            log.warn("표준국어대사전이 빈 본문을 돌려줬다 — 인증 키 · 하루 한도를 확인한다");
            throw unavailable("표준국어대사전이 빈 본문을 돌려줬다");
        }
        return read(body);
    }

    // 공식 예시: channel.item[] 에 표제어마다 word · pos 와 뜻풀이 sense. 응답 종류가 text/json 이라 본문을 문자열로 받아 직접 읽는다
    private List<DictionaryItem> read(String body) {
        JsonNode root;
        try {
            root = jsonMapper.readTree(body);
        } catch (JacksonException e) {
            log.warn("표준국어대사전 응답을 JSON 으로 읽지 못했다");
            throw unavailable("표준국어대사전 응답이 JSON 이 아니다");
        }
        JsonNode error = root.path("error");
        if (error.isObject()) {
            // 사전의 message 는 적지 않는다 — 바깥 글자가 키 · 검색어를 되풀이하는지 모른다
            log.warn("표준국어대사전이 오류를 돌려줬다: error_code={}", error.path("error_code"));
            throw unavailable("표준국어대사전이 오류를 돌려줬다");
        }
        JsonNode channel = root.path("channel");
        if (!channel.isObject()) {
            log.warn("표준국어대사전 응답에 channel 이 없다");
            throw unavailable("표준국어대사전 응답의 모양이 다르다");
        }
        List<JsonNode> entries = each(channel.path("item"));
        List<DictionaryItem> items = new ArrayList<>();
        for (JsonNode entry : entries) {
            String word = text(entry.path("word"));
            if (word == null) {
                continue;
            }
            String pos = text(entry.path("pos"));
            // 뜻풀이가 여럿이면 sense 가 배열로 올 수 있다 — 뜻풀이 하나를 항목 하나로 옮긴다
            for (JsonNode sense : each(entry.path("sense"))) {
                String definition = text(sense.path("definition"));
                if (definition != null) {
                    items.add(new DictionaryItem(word, pos, definition));
                }
            }
        }
        // 항목이 왔는데 하나도 못 읽었으면 모양이 다른 것이다 — 「결과 없음」으로 하루 저장되지 않게 실패로 본다
        if (!entries.isEmpty() && items.isEmpty()) {
            log.warn("표준국어대사전 응답의 item 을 하나도 읽지 못했다 — 응답 모양을 확인한다");
            throw unavailable("표준국어대사전 응답의 모양이 다르다");
        }
        return List.copyOf(items);
    }

    // 배열이면 그 칸들, 객체 하나면 그것 하나. 하나뿐일 때 배열이 아니라 객체로 오는 응답도 받는다
    private static List<JsonNode> each(JsonNode node) {
        if (node.isArray()) {
            return List.copyOf(node.values());
        }
        return node.isObject() ? List.of(node) : List.of();
    }

    private static @Nullable String text(JsonNode node) {
        if (!node.isString() || node.stringValue().isBlank()) {
            return null;
        }
        return node.stringValue().strip();
    }

    private static ApiException unavailable(String detail) {
        return new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, detail);
    }
}
