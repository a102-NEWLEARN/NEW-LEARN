package kr.io.newlearn.press;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.io.Serial;
import java.io.Serializable;
import kr.io.newlearn.common.MappingSource;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

// press_mapping 의 기본 키 (source, source_value). 어느 소스가 언론사를 어떻게 적어 왔나
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EqualsAndHashCode
public class PressMappingId implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Enumerated(EnumType.STRING)
    private MappingSource source;

    private String sourceValue;

    public PressMappingId(MappingSource source, String sourceValue) {
        this.source = source;
        this.sourceValue = sourceValue;
    }
}
