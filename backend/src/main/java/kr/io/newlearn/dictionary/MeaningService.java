package kr.io.newlearn.dictionary;

import java.text.Normalizer;
import java.util.regex.Pattern;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.web.QueryText;
import kr.io.newlearn.dictionary.dto.MeaningRequest;
import kr.io.newlearn.dictionary.dto.MeaningResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;

// A26 드래그한 말의 문맥 뜻 (docs/api-screen.md A26, docs/specs/F13-dictionary-api.md, Jira 187)
// 입력 검사 → 고른 말 ⊂ 조각 → 문맥 읽기(짧은 읽기 트랜잭션) → 조각 ⊂ 그 대상의 화면 글 → 저장해 둔 답 → 하루 한도 → GMS.
// 두 포함 검사로 아무 글이나 넣어 GMS 를 쓰는 길을 막는다. 이 클래스는 트랜잭션을 열지 않는다 — GMS 를 부르는 동안 DB 연결을 잡지 않게.
// 누가 무엇을 찾았는지는 남기지 않는다
@Service
public class MeaningService {

    static final int AROUND_MAX = 120;
    // 모델에 주는 본문 — 고른 말 앞뒤 500자, 본문에 그 말이 없으면 앞 1,000자
    static final int CONTEXT_HALF = 500;
    static final int CONTEXT_HEAD = 1_000;

    static final String TERM_BLANK = "뜻을 찾을 말을 골라 주세요";
    static final String TERM_NUL = "고른 말에 쓸 수 없는 글자가 들어 있어요";
    static final String TERM_TOO_LONG = "고른 말은 50자까지예요";
    static final String TERM_NO_LETTER = "뜻을 찾을 글자가 없어요";
    static final String TERM_OUTSIDE = "고른 말이 글 조각에 없어요";
    static final String AROUND_BLANK = "고른 말 주변 글이 필요해요";
    static final String AROUND_TOO_LONG = "고른 말 주변 글은 120자까지예요";
    static final String AROUND_NUL = "고른 말 주변 글에 쓸 수 없는 글자가 들어 있어요";
    static final String AROUND_OUTSIDE = "고른 글이 이 화면의 글에 없어요";
    static final String TYPE_INVALID = "contextType 은 ARTICLE · ISSUE · EVENT 가운데 하나예요";
    static final String ID_INVALID = "contextId 가 필요해요";

    // 화면(JS)과 같은 공백 — 줄 바꿈 · NBSP · 전각 공백 · BOM
    private static final Pattern SPACE = Pattern.compile("[\\s\\p{Z}\\uFEFF]+");
    private static final Pattern LETTER = Pattern.compile("\\p{L}");

    private final MeaningContextLoader contexts;
    private final MeaningCache cache;
    private final MeaningQuota quota;
    private final MeaningSource source;

    MeaningService(MeaningContextLoader contexts, MeaningCache cache, MeaningQuota quota, MeaningSource source) {
        this.contexts = contexts;
        this.cache = cache;
        this.quota = quota;
        this.source = source;
    }

    public MeaningResponse explain(MeaningRequest request) {
        String term = QueryText.normalize(request.term(), "term", TERM_BLANK, TERM_NUL, TERM_TOO_LONG);
        if (!LETTER.matcher(term).find()) {
            throw QueryText.invalid("term", TERM_NO_LETTER);
        }
        String around = around(request.around());
        MeaningTarget target = MeaningTarget.parse(request.contextType() == null ? "" : request.contextType())
                .orElseThrow(() -> QueryText.invalid("contextType", TYPE_INVALID));
        Long id = request.contextId();
        if (id == null || id < 1) {
            throw QueryText.invalid("contextId", ID_INVALID);
        }
        String compactTerm = compact(term);
        String compactAround = compact(around);
        if (!compactAround.contains(compactTerm)) {
            throw QueryText.invalid("term", TERM_OUTSIDE);
        }

        MeaningContextLoader.Context context = contexts.load(target, id);
        if (context.screenTexts().stream().map(MeaningService::compact).noneMatch(t -> t.contains(compactAround))) {
            throw QueryText.invalid("around", AROUND_OUTSIDE);
        }

        String key = MeaningCache.key(target, id, compactTerm);
        Meaning meaning = cache.get(key).orElse(null);
        if (meaning == null) {
            if (!quota.tryTake()) {
                throw new ApiException(ErrorCode.DICTIONARY_UNAVAILABLE, "문맥 뜻 하루 호출 한도를 넘었거나 셀 수 없다");
            }
            meaning = source.explain(
                    new MeaningPrompt(term, around, context.title(), excerpt(context.background(), term)));
            cache.put(key, meaning);
        }
        return MeaningResponse.of(term, meaning);
    }

    private static String around(@Nullable String raw) {
        String around = raw == null ? "" : Normalizer.normalize(raw.strip(), Normalizer.Form.NFC);
        if (around.isEmpty()) {
            throw QueryText.invalid("around", AROUND_BLANK);
        }
        if (QueryText.containsNul(around)) {
            throw QueryText.invalid("around", AROUND_NUL);
        }
        if (around.codePointCount(0, around.length()) > AROUND_MAX) {
            throw QueryText.invalid("around", AROUND_TOO_LONG);
        }
        return around;
    }

    // 공백을 모두 뺀 NFC — 비교 · 저장 키에 쓴다
    static String compact(String text) {
        return SPACE.matcher(Normalizer.normalize(text, Normalizer.Form.NFC)).replaceAll("");
    }

    // 본문에서 고른 말 근처만 — 긴 본문을 통째로 보내면 비용만 든다. 공백은 보지 않고 찾는다
    // (마인드맵 보기가 줄을 나누며 공백을 버려 「금리인상」으로 골라도 본문의 「금리 인상」을 찾게). 못 찾으면 앞 1,000자
    static String excerpt(String background, String term) {
        String compactTerm = compact(term);
        StringBuilder pattern = new StringBuilder();
        compactTerm.codePoints().forEach(c -> {
            if (!pattern.isEmpty()) {
                // 글자 사이에 공백이 없어도 · 여럿 있어도 맞게 — SPACE 의 「하나 이상」을 「없거나 여럿」으로
                pattern.append(SPACE.pattern().replace("]+", "]*"));
            }
            pattern.append(Pattern.quote(new String(Character.toChars(c))));
        });
        var found = Pattern.compile(pattern.toString()).matcher(background);
        if (compactTerm.isEmpty() || !found.find()) {
            return background.substring(0, Math.min(background.length(), CONTEXT_HEAD));
        }
        int from = Math.max(0, found.start() - CONTEXT_HALF);
        int to = Math.min(background.length(), found.end() + CONTEXT_HALF);
        return background.substring(from, to);
    }
}
