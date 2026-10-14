# 리서치 요약 (2026-10-14)

PRD 작성을 위해 웹 조사한 결과다. [미확인]은 검색으로 확인하지 못하고 배경지식에 기댄 항목이다.

## 1. 비교 서비스와 빈틈

| 서비스 | 하는 일 | 뉴런 대비 빈틈 |
| --- | --- | --- |
| Particle | 기사 100여 개를 한 스토리로 묶어 AI 요약, Q&A, 타임라인, 반대 관점 보기 제공 | 개체·사건 마인드맵 없음, 주장 단위 변화 판정·근거 문장 없음, 영어 전용 |
| Google News Full Coverage | 장기 이슈의 헤드라인, 해설, FAQ, 타임라인 | 기사를 모으고 정렬만 함. 주장 비교·근거 연결 없음 |
| Ground News / AllSides | 언론사별 정치 성향 비교 (일부 [미확인]) | 성향 비교 중심, 시간에 따른 사실 변화 추적 없음, 한국 언론 거의 없음 |
| Perplexity Discover | 출처를 단 AI 스토리 페이지 [미확인] | 사건 구조, 이슈 변화 추적 없음 |
| 네이버 요약봇·AI 브리핑 | 기사 3줄 요약, 검색 결과 AI 브리핑 (2025-03) | 품질, 언론사 표기 누락 비판. 이슈 타임라인 현황 [미확인] |
| 빅카인즈 분석 | 인물·장소·기관 관계도, 인용문, 키워드 트렌드, 연관어 | 같이 등장한 빈도로 만든 관계도라 사건 단위가 아님. 사건 타임라인, 주장 근거, 주장 비교 없음 |

가장 가까운 국내 비교 대상은 빅카인즈다. 한국어 뉴스 마인드맵·타임라인 스타트업은 찾지 못했다. "없다"가 아니라 "찾지 못했다"로 표현한다.

## 2. 빅카인즈 API

- 검색 화면은 저작권 때문에 **본문을 앞 200자까지만** 보여 준다. 다운로드는 최대 2만 건이다.
- 2023년 말 기준 분석 API는 공공기관·연구기관 약 48곳에 제공됐다. 주로 기관 대상으로 보인다.
- 빅카인즈 공모전에서는 API 가이드를 제공하고 크롤링을 금지한다.
- 개인·학생 키 발급 여부, 호출 제한, 본문 전체 제공 여부는 **확인하지 못했다**.
- **핵심 리스크**: 근거 문장 기능에는 본문 전체가 필요한데, API가 200자만 줄 수도 있다. 한국언론진흥재단에 먼저 문의해야 한다.

## 3. 법·라이선스

- 크롤링 자체가 곧 불법은 아니다(대법원 2021도1533, 형사 무죄). 다만 민사에서는 부정경쟁이 인정됐다.
- 뉴스 기사는 저작물이고, 공정이용(저작권법 제35조의5)은 사안별로 판단한다.
- 언론계는 허락 없는 AI 학습·활용을 침해로 본다. 2026년 지상파 3사와 네이버 사이에 AI 저작권 분쟁이 진행 중이다.
- 권장 사항:
  - 근거 문장은 짧게 인용하고 언론사명과 원문 링크를 함께 표시한다.
  - 본문 전체를 저장하거나 다시 보여 주지 않는다.
  - robots.txt를 지킨다.
  - SSAFY 데이터셋은 비상업적 학습·평가에만 쓴다.

## 4. 기술 리스크

- **동일 사건 클러스터링**: 여러 기사에 걸친 사건 연결용 한국어 데이터셋은 찾지 못했다. 평가용 데이터를 직접 라벨링해야 한다.
- **주장 변화·상충 판정**: 기존 연구는 영어 NLI 모델을 쓴다. KLUE-NLI는 일반 문장이라 뉴스 주장에 바로 맞지 않는다. 다음 상황에서 오판하기 쉬워서 "판단 불가" 라벨이 필요하다.
  - 수치가 갱신된 것을 상충으로 판단
  - 인용문과 언론사 자체 주장을 구분하지 못함
  - 같은 주장을 다르게 표현하면 반복인지 새 정보인지 구분이 어려움
- **환각 방지**:
  - 자유 서술 대신 구조화된 추출(개체, 관계, 문장 ID)을 쓴다.
  - 근거 문장이 원문에 그대로 있는지 문자열로 대조한다.
  - 요약 문장과 근거 사이의 함의를 검사한다.
  - 확신이 낮으면 판정을 보류한다.
- **한국어 개체명 정규화**: 같은 인물·기관이 다른 이름으로 나오면 노드가 쪼개진다.

## 출처

- Particle: https://twipemobile.com/particle-a-user-focused-ai-news-experience , https://rightstech.com/2024/11/particle-is-a-new-app-using-ai-to-organize-and-summarize-the-news/
- Google Full Coverage: https://blog.google/products/news/new-google-news-ai-meets-human-intelligence/ , https://blog.google/products/news/get-full-news-story-full-coverage-search/
- Ground News: https://wrdw.com/2026/03/27/what-tech-what-is-finsta
- 네이버 요약봇·AI 브리핑: https://www.journalist.or.kr/m/m_article.html?no=43159 , https://www.journalist.or.kr/news/article.html?no=57172
- 빅카인즈 분석: https://www.bigkinds.or.kr/v2/intro/index.do , https://www.gov.kr/portal/service/serviceInfo/B55264800033
- 빅카인즈 본문 200자 제한: https://www.bigkinds.or.kr/v2/intro/news.do
- 빅카인즈 API 기관 제공 현황: https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=15348
- 빅카인즈 공모전 조건: https://thinkyou.co.kr/extAct/66352/
- BIGKINDS-LAB: https://github.com/KPF-bigkinds/BIGKINDS-LAB
- 크롤링 판례: https://www.shinkim.com/kor/media/newsletter/1843 , https://v.daum.net/v/Fi3RbZBWW5
- 언론계 AI 저작권: https://www.ajunews.com/view/20230822135121600 , https://news.mtn.co.kr/news-detail/2026040915330140911
- 다국어 사건 상호참조(MCECR): https://preview.aclanthology.org/dashboard/2024.findings-naacl.245
- 뉴스 주장 비교 연구: https://arxiv.org/pdf/2310.04592 , https://arxiv.org/pdf/2112.08544
