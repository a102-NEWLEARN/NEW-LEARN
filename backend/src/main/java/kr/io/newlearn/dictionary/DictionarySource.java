package kr.io.newlearn.dictionary;

import java.util.List;
import kr.io.newlearn.dictionary.dto.DictionaryItem;

// 바깥 사전. 실제는 표준국어대사전(StdictClient)이고, 시험은 가짜로 바꿔 끼운다
// 사전이 답하지 않거나 오류를 주면 ApiException(DICTIONARY_UNAVAILABLE) 을 던진다. 결과가 없으면 빈 목록이다
public interface DictionarySource {

    List<DictionaryItem> search(String query);
}
