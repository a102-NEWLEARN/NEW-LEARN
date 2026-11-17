package kr.io.newlearn.mindmap;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import kr.io.newlearn.mindmap.MindmapContent.Branch;
import kr.io.newlearn.mindmap.MindmapContent.BranchType;
import kr.io.newlearn.mindmap.MindmapContent.Evidence;
import kr.io.newlearn.mindmap.MindmapContent.Item;
import org.junit.jupiter.api.Test;

// 본문과 맞지 않는 근거만 지우고 잎은 남긴다 — docs/api-screen.md 3절 (Jira 56)
class MindmapContentTest {

    @Test
    void retainEvidenceKeepsOnlyEvidenceFoundInTheBodyAndKeepsEveryLeaf() {
        var checker = new EvidenceChecker("한빛반도체가 6일 착공식을 열었다.\n2028년 양산은 그대로다.");
        var content = new MindmapContent(
                null,
                List.of(new Branch(
                        BranchType.CORE,
                        List.of(
                                new Item(
                                        "착공식을 열었다",
                                        List.of(
                                                new Evidence("6일 착공식을 열었다", 0, 0),
                                                new Evidence("7일 착공식을 열었다", 0, 0),
                                                new Evidence("2028년 양산은 그대로다.", 5, 0))),
                                new Item("근거가 모두 틀린 잎", List.of(new Evidence("없는 문장", 1, 0)))))));

        var kept = content.retainEvidence(checker);

        var items = kept.branches().getFirst().items();
        assertThat(items).extracting(Item::text).containsExactly("착공식을 열었다", "근거가 모두 틀린 잎");
        assertThat(items.getFirst().evidence()).containsExactly(new Evidence("6일 착공식을 열었다", 0, 0));
        assertThat(items.get(1).evidence()).isEmpty();
        assertThat(content.evidenceCount()).isEqualTo(4);
        assertThat(kept.evidenceCount()).isEqualTo(1);
    }

    // 대표 사건 = CORE 가지의 primary_core_index 번째 잎 — 판정 메시지가 꺼낸다 (Jira 35, api-internal.md 4절)
    @Test
    void coreReturnsTheCoreLeafAtTheIndexOrNull() {
        var first = new Item("착공식을 열었다", List.of());
        var second = new Item("2028년 양산", List.of());
        var content = new MindmapContent(
                null,
                List.of(
                        new Branch(BranchType.CAUSE, List.of(new Item("원인 잎", List.of()))),
                        new Branch(BranchType.CORE, List.of(first, second))));

        assertThat(content.core(0)).isEqualTo(first);
        assertThat(content.core(1)).isEqualTo(second);
        assertThat(content.core(2)).isNull();
        assertThat(content.core(-1)).isNull();
        assertThat(new MindmapContent(null, List.of()).core(0)).isNull();
    }
}
