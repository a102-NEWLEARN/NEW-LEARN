package kr.io.newlearn.common;

// 원본 값을 우리 값에 맞추는 대응 표(category_mapping · press_mapping)의 소스. 두 표가 같이 쓴다 (data-model.md 2절)
public enum MappingSource {
    // SSAFY 뉴스 데이터셋 (검증용)
    SSAFY,
    // NewsData.io (서비스 화면의 기사)
    NEWSDATA
}
