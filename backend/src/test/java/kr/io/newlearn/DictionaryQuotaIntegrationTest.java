package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import kr.io.newlearn.dictionary.DictionarySource;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

// A19 용어사전 하루 한도 (docs/api-screen.md A19, docs/specs/F13-dictionary-api.md AC-9, Jira 135)
// 표준국어대사전 Open API 는 하루 50,000건까지다. 앱이 실제로 부른 수를 한국 날짜 단위로 세고 한도(사이트 45,000)를 넘으면
// 부르지 않고 502 다. 여기서는 한도를 2 로 줄여 본다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "newlearn.dictionary.daily-limit=2")
class DictionaryQuotaIntegrationTest {

    static final String URL = "/api/v1/dictionary";

    @Autowired
    MockMvc mvc;

    @Autowired
    StringRedisTemplate redis;

    @MockitoBean
    DictionarySource source;

    @BeforeEach
    void clearSavedResultsAndCounts() {
        for (String pattern : new String[] {"dict:*", "dictquota:*"}) {
            Set<String> keys = redis.keys(pattern);
            if (!keys.isEmpty()) {
                redis.delete(keys);
            }
        }
    }

    ResultActions search(String q) throws Exception {
        return mvc.perform(get(URL).param("q", q));
    }

    static String todayKey() {
        return "dictquota:" + LocalDate.now(ZoneId.of("Asia/Seoul"));
    }

    // 결과 없음은 저장하지 않아 매번 사전을 부른다 — 세 번째 부름은 한도를 넘어 사전을 부르지 않는다
    @Test
    void overTheDailyLimitIs502WithoutCallingTheDictionary() throws Exception {
        when(source.search(anyString())).thenReturn(List.of());

        search("하나").andExpect(status().isOk());
        search("둘").andExpect(status().isOk());
        search("셋")
                .andExpect(status().isBadGateway())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("DICTIONARY_UNAVAILABLE"));

        verify(source, never()).search("셋");
        verify(source, times(2)).search(anyString());
    }

    // 저장해 둔 결과를 돌려줄 때는 사전을 부르지 않아 세지 않는다
    @Test
    void savedResultsDoNotCount() throws Exception {
        when(source.search("나무")).thenReturn(List.of(new DictionaryItem("나무", "명사", "뜻풀이 하나")));

        for (int n = 0; n < 5; n++) {
            search("나무").andExpect(status().isOk());
        }

        verify(source, times(1)).search("나무");
        assertThat(redis.opsForValue().get(todayKey())).isEqualTo("1");
    }

    // 세는 키는 한국 날짜 하나에 하나이고 꼭 만료가 있다(작업 큐와 같은 Redis). 검색어 키(dict:)와 섞이지 않는다
    @Test
    void theCountIsKeptPerKoreanDateAndExpires() throws Exception {
        when(source.search("나무")).thenReturn(List.of());

        search("나무").andExpect(status().isOk());

        assertThat(redis.opsForValue().get(todayKey())).isEqualTo("1");
        assertThat(redis.getExpire(todayKey(), TimeUnit.SECONDS))
                .isBetween(Duration.ofDays(1).toSeconds(), Duration.ofDays(2).toSeconds());
        assertThat(redis.keys("dict:*")).isEmpty();
    }
}
