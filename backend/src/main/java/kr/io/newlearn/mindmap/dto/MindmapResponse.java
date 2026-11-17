package kr.io.newlearn.mindmap.dto;

import java.time.OffsetDateTime;
import java.util.List;
import kr.io.newlearn.mindmap.MindmapContent;
import kr.io.newlearn.mindmap.MindmapContent.BranchType;

// A9 기사 마인드맵 (docs/api-screen.md A9 · 3절). 저장한 content 에서 근거(evidence)를 뺀 모양이다
// 근거는 데이터로만 남기고 화면에 보내지 않는다(2026-10-21) — 노드 상세 창(F05)을 만들 때 다시 정한다
public record MindmapResponse(
        long articleId,
        String schemaVersion,
        OffsetDateTime generatedAt,
        boolean aiGenerated,
        String title,
        List<BranchResponse> branches) {

    public record BranchResponse(BranchType type, List<ItemResponse> items) {}

    public record ItemResponse(String text) {}

    // 가운데 글자는 AI 가 지은 제목이 있으면 그것, 없거나 비면 기사 제목. AI 생성 표시는 늘 켠다(PRD FR-7)
    public static MindmapResponse of(
            long articleId,
            String schemaVersion,
            OffsetDateTime generatedAt,
            String articleTitle,
            MindmapContent content) {
        var title = content.title();
        return new MindmapResponse(
                articleId,
                schemaVersion,
                generatedAt,
                true,
                title == null || title.isBlank() ? articleTitle : title,
                content.branches().stream()
                        .map(branch -> new BranchResponse(
                                branch.type(),
                                branch.items().stream()
                                        .map(item -> new ItemResponse(item.text()))
                                        .toList()))
                        .toList());
    }
}
