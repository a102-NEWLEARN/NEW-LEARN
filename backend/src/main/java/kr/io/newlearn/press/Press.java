package kr.io.newlearn.press;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 언론사 명부. 처음 보는 언론사는 B2 적재가 행을 새로 만든다 — 코드는 NewsData source_id (data-model.md 2절, Jira 153)
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
