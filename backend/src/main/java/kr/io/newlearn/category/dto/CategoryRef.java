package kr.io.newlearn.category.dto;

import kr.io.newlearn.category.Category;

public record CategoryRef(String code, String name) {

    public static CategoryRef from(Category category) {
        return new CategoryRef(category.getCode(), category.getName());
    }
}
