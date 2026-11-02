package kr.io.newlearn.category;

import java.util.List;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.QueryText;
import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, String> {
    List<Category> findAllByOrderBySortOrderAsc();

    // 기사 · 이슈 목록의 카테고리 필터 — 보내지 않았으면(null) 그냥 지나가고, 없는 코드면 404.
    // U+0000 이 든 코드는 있을 수 없는 코드다 — DB 에 묻지 않고 없는 코드와 같은 404 (PostgreSQL 이 받지 못해 500 이었다)
    default void checkFilter(@Nullable String code) {
        if (code != null && (QueryText.containsNul(code) || !existsById(code))) {
            throw new NotFoundException(ErrorCode.CATEGORY_NOT_FOUND, "카테고리를 찾을 수 없다: " + code);
        }
    }
}
