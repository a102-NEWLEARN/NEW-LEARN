package kr.io.newlearn.category;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.io.Serializable;
import kr.io.newlearn.common.MappingSource;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

// category_mapping 의 기본 키 (source, source_value). 어느 소스의 어떤 원본 분류 값인가
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class CategoryMappingId implements Serializable {

    @Enumerated(EnumType.STRING)
    private MappingSource source;

    private String sourceValue;

    public CategoryMappingId(MappingSource source, String sourceValue) {
        this.source = source;
        this.sourceValue = sourceValue;
    }
}
