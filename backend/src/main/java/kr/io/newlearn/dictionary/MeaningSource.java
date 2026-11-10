package kr.io.newlearn.dictionary;

// 문맥 뜻을 내는 곳. 실제는 SSAFY GMS(GmsMeaningClient)이고, 시험은 가짜로 바꿔 끼운다
// 부르지 못했거나 답이 깨졌으면 ApiException(DICTIONARY_UNAVAILABLE) 을 던진다. 풀이 불가는 Meaning.NONE 이다
public interface MeaningSource {

    Meaning explain(MeaningPrompt prompt);
}
