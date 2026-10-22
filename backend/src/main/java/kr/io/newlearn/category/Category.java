package kr.io.newlearn.category;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 카테고리 5개. 행은 V2 마이그레이션이 넣고 화면에서 바꾸지 않아서, 행을 만드는 생성자를 두지 않는다 (data-model.md 2절)
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Category {

    @Id
    private String code;

    private String name;

    private short sortOrder;
}
