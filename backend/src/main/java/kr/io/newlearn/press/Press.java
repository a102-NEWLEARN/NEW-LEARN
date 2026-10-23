package kr.io.newlearn.press;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 언론사 명부. 처음 보는 언론사는 수집할 때 행을 새로 만든다 (data-model.md 2절, 코드 짓는 규칙은 5절 15번)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Press {

    @Id
    private String code;

    private String name;

    public Press(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
