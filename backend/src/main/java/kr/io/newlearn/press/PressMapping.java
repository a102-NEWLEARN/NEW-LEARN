package kr.io.newlearn.press;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 소스마다 다른 언론사 표기를 한 언론사로 묶는 행 (data-model.md 2절)
// 같은 언론사로 묶을 때는 press 를 바꾸는 메서드를 수집 티켓(Jira 34)이 더한다
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PressMapping {

    @EmbeddedId
    private PressMappingId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "press_code")
    private Press press;

    public PressMapping(PressMappingId id, Press press) {
        this.id = id;
        this.press = press;
    }
}
