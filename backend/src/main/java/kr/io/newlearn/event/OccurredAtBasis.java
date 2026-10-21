package kr.io.newlearn.event;

// 사건 발생 시점을 어디서 얻었나. FIRST_PUBLISHED 면 화면이 날짜 옆에 「추정」을 붙일 수 있다 (docs/api-screen.md A4)
public enum OccurredAtBasis {
    // 기사 본문에서 뽑았다
    EXTRACTED,
    // 본문에서 못 뽑아 그 사건 기사 중 가장 이른 발행 시각으로 채웠다
    FIRST_PUBLISHED
}
