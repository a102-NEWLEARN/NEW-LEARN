"""기사 마인드맵 추출(EXTRACT) — 전처리 · 프롬프트 · 결과 검사 · 발생 시점 계산.

흐름(api-internal.md 5절): 본문 → 문장 번호 붙이기 → LLM 1번 → 결과 검사 → W1 EXTRACT 결과.
LLM 중간 출력(문장 번호 근거 · eventTimeText)은 워커 안에서만 쓰고, W1 에는 근거 위치 객체와
occurredAt 을 보낸다. 작업 큐 소비 · W1 전송 연결은 이 모듈 밖의 일이다.
"""
