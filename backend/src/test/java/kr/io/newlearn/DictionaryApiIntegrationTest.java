package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.text.Normalizer;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

// A19 용어사전 (docs/api-screen.md A19, docs/specs/F13-dictionary-api.md AC-1 ~ AC-5)
// 바깥 사전은 가짜로 바꾸고, 결과 저장은 실제 Redis 에서 본다. 모두 로그인 없이 부른다
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DictionaryApiIntegrationTest {

    static final String URL = "/api/v1/dictionary";

    @Autowired
    MockMvc mvc;

    @Autowired
    StringRedisTemplate redis;

    @MockitoBean
    DictionarySource source;

    @BeforeEach
    void clearSavedResults() {
        Set<String> keys = redis.keys("dict:*");
        if (!keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    ResultActions search(String q) throws Exception {
        return mvc.perform(get(URL).param("q", q));
    }

    // AC-1 — 품사가 없는 항목은 pos 를 빼지 않고 null 로 보낸다(docs/api.md 1절 「없는 값」)
    @Test
    void foundWordsComeBackWithQueryItemsAndSource() throws Exception {
        when(source.search("구원투수"))
                .thenReturn(List.of(
                        new DictionaryItem("구원^투수", "명사", "뜻풀이 하나"), new DictionaryItem("구원-투수", null, "뜻풀이 둘")));
        search("구원투수")
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.query").value("구원투수"))
                .andExpect(jsonPath("$.source").value("국립국어원 표준국어대사전"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].word").value("구원^투수"))
                .andExpect(jsonPath("$.items[0].pos").value("명사"))
                .andExpect(jsonPath("$.items[0].definition").value("뜻풀이 하나"))
                .andExpect(jsonPath("$.items[1].pos").hasJsonPath())
                .andExpect(jsonPath("$.items[1].pos").value(nullValue()));
    }

    // AC-2 · AC-5 — 결과 없음은 저장하지 않는다. 틀린 키도 사전이 같은 빈 본문을 줘서, 그것을 하루 동안 굳히지 않으려는 것이다(2026-10-29)
    @Test
    void noResultIsEmptyItemsAndIsNotSaved() throws Exception {
        when(source.search("없는말")).thenReturn(List.of());
        for (int i = 0; i < 2; i++) {
            search("없는말")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.query").value("없는말"))
                    .andExpect(jsonPath("$.items").isArray())
                    .andExpect(jsonPath("$.items").isEmpty())
                    .andExpect(jsonPath("$.source").value("국립국어원 표준국어대사전"));
        }
        assertThat(redis.hasKey("dict:없는말")).isFalse();
        verify(source, times(2)).search("없는말");
    }

    @Test
    void dictionaryFailureIs502() throws Exception {
        when(source.search("나무")).thenThrow(new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, "사전이 답하지 않았다"));
        search("나무")
                .andExpect(status().isBadGateway())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(502))
                .andExpect(jsonPath("$.code").value("DICTIONARY_UNAVAILABLE"));
    }

    // AC-3 — 없음 · 빈 문자열 · 공백뿐(전각 공백 포함)이면 사전을 부르지 않고 400
    @Test
    void missingOrBlankQueryIs400() throws Exception {
        mvc.perform(get(URL))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("q"))
                .andExpect(jsonPath("$.errors[0].reason").value("찾을 단어를 입력해 주세요"));
        for (String blank : new String[] {"", "   ", " \t　 "}) {
            search(blank)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors.length()").value(1))
                    .andExpect(jsonPath("$.errors[0].field").value("q"))
                    .andExpect(jsonPath("$.errors[0].reason").value("찾을 단어를 입력해 주세요"));
        }
        verifyNoInteractions(source);
    }

    // AC-3 — 앞뒤 공백을 지운 뒤 50자까지 받는다
    @Test
    void fiftyCharactersPassAndFiftyOneAre400() throws Exception {
        String fifty = "가".repeat(50);
        when(source.search(fifty)).thenReturn(List.of());
        search("  " + fifty + "  ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value(fifty));
        search(fifty + "가")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("q"))
                .andExpect(jsonPath("$.errors[0].reason").value("찾을 단어는 50자까지예요"));
        verify(source, times(1)).search(anyString());
    }

    // AC-3 — U+0000(NUL)이 든 검색어도 사전을 부르지 않고 400. 전에는 그대로 사전에 넘기고 query 에 NUL 을 돌려줬다
    @Test
    void nulCharacterIs400() throws Exception {
        for (String withNul : new String[] {"\u0000", "나\u0000무"}) {
            search(withNul)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.errors.length()").value(1))
                    .andExpect(jsonPath("$.errors[0].field").value("q"))
                    .andExpect(jsonPath("$.errors[0].reason").value("찾을 단어에 쓸 수 없는 글자가 들어 있어요"));
        }
        verifyNoInteractions(source);
    }

    // AC-5 — 공백 · 유니코드 조합만 다른 검색어는 같은 검색어다. 하루 안에 사전을 한 번만 부른다
    @Test
    void sameWordIsAskedOnceEvenWithSpacesOrDecomposedHangul() throws Exception {
        when(source.search("구원투수")).thenReturn(List.of(new DictionaryItem("구원^투수", "명사", "뜻풀이 하나")));
        String decomposed = Normalizer.normalize("구원투수", Normalizer.Form.NFD);
        assertThat(decomposed).isNotEqualTo("구원투수");
        for (String q : new String[] {"  구원투수 ", decomposed, "구원투수"}) {
            search(q)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.query").value("구원투수"))
                    .andExpect(jsonPath("$.items[0].word").value("구원^투수"));
        }
        verify(source, times(1)).search(anyString());
    }

    // AC-5 — 저장 키에는 꼭 만료가 있다(작업 큐와 같은 Redis, docs/api-screen.md A19)
    @Test
    void savedResultExpiresWithinADay() throws Exception {
        when(source.search("나무")).thenReturn(List.of(new DictionaryItem("나무", "명사", "뜻풀이 하나")));
        search("나무").andExpect(status().isOk());
        assertThat(redis.hasKey("dict:나무")).isTrue();
        assertThat(redis.getExpire("dict:나무", TimeUnit.SECONDS)).isBetween(1L, 86_400L);
    }

    // AC-5 — 실패는 저장하지 않아 다음 검색에서 바로 다시 부른다
    @Test
    void failureIsNotSaved() throws Exception {
        when(source.search("나무"))
                .thenThrow(new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, "사전이 답하지 않았다"))
                .thenReturn(List.of(new DictionaryItem("나무", "명사", "뜻풀이 하나")));
        search("나무").andExpect(status().isBadGateway());
        assertThat(redis.hasKey("dict:나무")).isFalse();
        search("나무")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].word").value("나무"));
        verify(source, times(2)).search("나무");
    }
}
