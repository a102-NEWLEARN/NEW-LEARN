package kr.io.newlearn.dictionary;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

// 바깥 사전 — 표준국어대사전 Open API. 인증 키는 env STDICT_API_KEY 로만 받는다(application.yaml). 시험은 DictionarySource 를 가짜로 바꾼다
@Configuration
class DictionaryConfig {

    @Bean
    DictionarySource dictionarySource(@Value("${newlearn.dictionary.stdict-key:}") String key, JsonMapper jsonMapper) {
        return StdictClient.create(StdictClient.BASE_URL, key, jsonMapper);
    }
}
