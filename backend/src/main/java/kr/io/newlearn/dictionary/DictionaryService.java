package kr.io.newlearn.dictionary;

import java.util.List;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.web.QueryText;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import kr.io.newlearn.dictionary.dto.DictionaryResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

// A19 용어사전 (docs/api-screen.md A19, Jira 102) — 검색어 다듬기 → 저장해 둔 결과 → 없으면 사전을 불러 결과가 있을 때만 저장
// 실패(DICTIONARY_UNAVAILABLE)와 결과 없음은 저장하지 않아 다음 검색에서 다시 부른다. 누가 무엇을 찾았는지는 남기지 않는다
// 사전을 부르기 직전에 하루 한도를 본다 — 저장해 둔 결과는 세지 않는다(Jira 135)
@Service
public class DictionaryService {

    // 검색어 규칙(공백 · NFC · NUL · 50자)은 A13 통합 검색과 같이 쓴다(QueryText). 문구는 용어사전 창에 맞춘 것이다
    static final String BLANK = "찾을 단어를 입력해 주세요";
    static final String NUL = "찾을 단어에 쓸 수 없는 글자가 들어 있어요";
    static final String TOO_LONG = "찾을 단어는 50자까지예요";

    private final DictionarySource source;
    private final DictionaryCache cache;
    private final DictionaryQuota quota;

    DictionaryService(DictionarySource source, DictionaryCache cache, DictionaryQuota quota) {
        this.source = source;
        this.cache = cache;
        this.quota = quota;
    }

    public DictionaryResponse search(@Nullable String q) {
        String query = QueryText.normalize(q, BLANK, NUL, TOO_LONG);
        List<DictionaryItem> items = cache.get(query).orElseGet(() -> {
            if (!quota.tryTake()) {
                throw new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, "사전 하루 호출 한도를 넘었다");
            }
            List<DictionaryItem> found = source.search(query);
            // 결과 없음은 두지 않는다 — 틀린 키도 사전이 같은 빈 본문을 줘서, 그것을 하루 동안 굳히지 않게(2026-10-29 사용자)
            if (!found.isEmpty()) {
                cache.put(query, found);
            }
            return found;
        });
        return DictionaryResponse.of(query, items);
    }
}
