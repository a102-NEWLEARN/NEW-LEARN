package kr.io.newlearn.category;

import kr.io.newlearn.category.dto.CategoryListResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CategoryController {
    private final CategoryService service;

    public CategoryController(CategoryService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/categories")
    public CategoryListResponse list() {
        return service.list();
    }
}
