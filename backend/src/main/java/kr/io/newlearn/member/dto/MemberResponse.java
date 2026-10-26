package kr.io.newlearn.member.dto;

import java.util.List;
import kr.io.newlearn.category.dto.CategoryRef;

// 회원 정보 — A14 · A15 · A17 · A18 의 응답 (docs/api-screen.md 1절 「회원 정보」). 비밀번호 해시는 내보내지 않는다
// categories 는 카테고리 탭 순서(sort_order)
public record MemberResponse(long id, String loginId, String name, List<CategoryRef> categories) {}
