# 변경 사항

## 2026-10-15 — NEW:LEARN v2

- **브랜드 컬러**: 민트 #28CDAA(그래픽), 청록 #087F72(CTA·브랜드 글자), 눌림 #066B61, 연한 민트 #E7FAF5, 라임 #C7F36C, 차콜 텍스트 #222B30/#66717A, 배경 #FFFFFF/#FAFBFC, 테두리 #E7ECEF로 교체. 어두운 네이비와 SEED 녹색 눌림 상태를 브랜드 역할에서 제거. 새 역할 `fg-brand-accent`, `bg-brand-accent`, `bg-accent-lime`.
- **로고**: 형태는 유지하고 플랫한 2색 SVG로 다시 그림(입체 면·그라디언트 제거, 워드마크 차콜 + 민트 콜론). PNG는 4배·1024px로 함께 제공.
- **패턴 가이드**: IssueCard, ArticleList, CategoryTabs, EventDetailPanel, Timeline, ChangeCard — `components/<이름>/README.md`, `preview.html`, `preview.png`, 클래스는 `components/bundle.css`의 `.nl-*`. 한 번에 보기: `examples/newlearn-patterns.html`.
- **라이트 테마 고정**: `tokens.css`는 Light 기본, Dark 값은 참고용(자동 전환 없음). 모든 예시는 Light.
- 폴더 구조와 SEED Foundations 문서는 그대로 유지.
