package kr.io.newlearn.category;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.jspecify.annotations.Nullable;

// 원본 분류 값을 카테고리 5개에 맞추는 행. 행은 실제 데이터를 본 뒤 채운다 (data-model.md 2절 · 5절 7번)
// 키가 연관을 가리키지 않아서 @MapsId 없이 키 칸과 카테고리 칸이 따로 있다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CategoryMapping {

    @EmbeddedId
    private CategoryMappingId id;

    // 비어 있으면 일부러 무시하는 원본 값이다. 대표 카테고리를 고를 때 건너뛴다
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_code")
    private @Nullable Category category;

    // 기사에 원본 값이 여럿일 때 대표를 고르는 순서. 작을수록 먼저
    private short priority;

    public CategoryMapping(CategoryMappingId id, @Nullable Category category, short priority) {
        this.id = id;
        this.category = category;
        this.priority = priority;
    }
}
