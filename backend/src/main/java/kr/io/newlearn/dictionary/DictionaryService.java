package kr.io.newlearn.dictionary;

import java.text.Normalizer;
import java.util.List;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.FieldErrorItem;
import kr.io.newlearn.dictionary.dto.DictionaryItem;
import kr.io.newlearn.dictionary.dto.DictionaryResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

// A19 용어사전 (docs/api-screen.md A19, Jira 102) — 검색어 다듬기 → 저장해 둔 결과 → 없으면 사전을 불러 결과가 있을 때만 저장
// 실패(DICTIONARY_UNAVAILABLE)와 결과 없음은 저장하지 않아 다음 검색에서 다시 부른다. 누가 무엇을 찾았는지는 남기지 않는다
@Service
public class DictionaryService {

    // 50자는 우리 제안이다 — Open API 안내에 검색어 길이 제한이 없다(2026-10-29 확인)
    static final int MAX_LENGTH = 50;
    static final String BLANK = "찾을 단어를 입력해 주세요";
    static final String TOO_LONG = "찾을 단어는 50자까지예요";

    private final DictionarySource source;
    private final DictionaryCache cache;

    public DictionaryService(DictionarySource source, DictionaryCache cache) {
        this.source = source;
        this.cache = cache;
    }

    public DictionaryResponse search(@Nullable String q) {
        String query = normalize(q);
        List<DictionaryItem> items = cache.get(query).orElseGet(() -> {
            List<DictionaryItem> found = source.search(query);
            // 결과 없음은 두지 않는다 — 틀린 키도 사전이 같은 빈 본문을 줘서, 그것을 하루 동안 굳히지 않게(2026-10-29 사용자)
            if (!found.isEmpty()) {
                cache.put(query, found);
            }
            return found;
        });
        return DictionaryResponse.of(query, items);
    }

    // 앞뒤 공백을 지우고 NFC 로 맞춘다 — 자모로 나뉘어(NFD) 온 한글도 같은 검색어가 된다. 길이는 글자(코드포인트) 수다
    static String normalize(@Nullable String q) {
        String query = q == null ? "" : Normalizer.normalize(q.strip(), Normalizer.Form.NFC);
        if (query.isEmpty()) {
            throw invalid(BLANK);
        }
        if (query.codePointCount(0, query.length()) > MAX_LENGTH) {
            throw invalid(TOO_LONG);
        }
        return query;
    }

    private static ApiException invalid(String reason) {
        return new ApiException(ErrorCode.VALIDATION_FAILED, "q: " + reason, List.of(new FieldErrorItem("q", reason)));
    }
}
