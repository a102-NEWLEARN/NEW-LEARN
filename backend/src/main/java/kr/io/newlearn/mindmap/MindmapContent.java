package kr.io.newlearn.mindmap;

import java.util.List;
import java.util.Objects;
import org.jspecify.annotations.Nullable;

// article_mindmap.content 의 모양 — schemaVersion mindmap-v1 (docs/api-screen.md 3절, Jira 56)
// 저장(W1 EXTRACT)과 조회(A9)가 같이 쓴다. JSON 칸 이름이 record 칸 이름 그대로다
public record MindmapContent(@Nullable String title, List<Branch> branches) {

    // 옛 행 · 손으로 넣은 행에 칸이 없으면 Jackson 이 null 을 넣는다 — 빈 목록으로 받는다
    public MindmapContent {
        branches = Objects.requireNonNullElse(branches, List.of());
    }

    // 가지 종류. 선언 순서가 표 순서다 — 저장할 때 이 순서로 줄 세운다
    public enum BranchType {
        CORE,
        CAUSE,
        REACTION,
        OUTLOOK
    }

    public record Branch(BranchType type, List<Item> items) {
        public Branch {
            items = Objects.requireNonNullElse(items, List.of());
        }
    }

    // evidence 는 저장만 하고 A9 로는 내보내지 않는다
    public record Item(String text, List<Evidence> evidence) {
        public Item {
            evidence = Objects.requireNonNullElse(evidence, List.of());
        }
    }

    public record Evidence(String text, int paragraphIndex, int sentenceIndex) {}

    // CORE 가지의 index 번째 잎 — 대표 사건(primary_core_index). 없으면 null (Jira 35, 판정 메시지)
    public @Nullable Item core(int index) {
        for (Branch branch : branches) {
            if (branch.type() == BranchType.CORE
                    && index >= 0
                    && index < branch.items().size()) {
                return branch.items().get(index);
            }
        }
        return null;
    }

    // 본문과 맞지 않는 근거만 지운다. 잎은 근거가 없어도 남긴다(2026-10-23 AI 동의)
    MindmapContent retainEvidence(EvidenceChecker checker) {
        return new MindmapContent(
                title,
                branches.stream()
                        .map(branch -> new Branch(
                                branch.type(),
                                branch.items().stream()
                                        .map(item -> new Item(
                                                item.text(),
                                                item.evidence().stream()
                                                        .filter(e -> checker.matches(e.paragraphIndex(), e.text()))
                                                        .toList()))
                                        .toList()))
                        .toList());
    }

    int evidenceCount() {
        return branches.stream()
                .flatMap(branch -> branch.items().stream())
                .mapToInt(item -> item.evidence().size())
                .sum();
    }
}
