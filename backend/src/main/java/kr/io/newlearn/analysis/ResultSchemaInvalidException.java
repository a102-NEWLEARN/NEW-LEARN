package kr.io.newlearn.analysis;

// 워커가 보낸 결과가 약속한 모양이 아니다 — 가지가 없는 마인드맵, 후보에 없는 eventId 등 (docs/api-internal.md 5절)
// 처리기(AnalysisResultHandler)가 던지면 처리기가 쓴 것은 되돌리고, 작업은 RESULT_SCHEMA_INVALID 로 실패를 남긴 뒤 W1 은 400 이다
public class ResultSchemaInvalidException extends RuntimeException {

    public ResultSchemaInvalidException(String detail) {
        super(detail);
    }
}
