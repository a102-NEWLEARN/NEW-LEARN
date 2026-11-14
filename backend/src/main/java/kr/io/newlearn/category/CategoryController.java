package kr.io.newlearn.category;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.io.newlearn.category.dto.CategoryListResponse;
import kr.io.newlearn.common.web.OpenApiConfig;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = OpenApiConfig.TAG_CATEGORY)
@RestController
public class CategoryController {
    private final CategoryService service;

    public CategoryController(CategoryService service) {
        this.service = service;
    }

    @Operation(
            summary = "[확정] A1 카테고리 목록",
            description = "카테고리 5개를 탭 순서대로 줍니다. 인자는 없습니다. issueCount 는 A2 이슈 목록과 같은 기준으로 세서"
                    + " 두 수가 늘 맞습니다 — 보이는 사건이 문턱(`QUERY_MIN_PUBLIC_EVENTS`)보다 적은 이슈는 여기서도 빠집니다.")
    @GetMapping("/api/v1/categories")
    public CategoryListResponse list() {
        return service.list();
    }
}
