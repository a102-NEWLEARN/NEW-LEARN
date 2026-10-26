package kr.io.newlearn.common.security;

import java.io.Serializable;

// 로그인한 회원 — 세션에 넣어 두는 인증 주체 (Jira 62)
// 컨트롤러는 @AuthenticationPrincipal MemberPrincipal me 로 받는다(내 정보 · 스크랩 · 관심 이슈가 같이 쓴다)
// 세션은 Redis 에 자바 직렬화로 저장되므로 Serializable 이어야 한다. 비밀번호 해시는 넣지 않는다
public record MemberPrincipal(long id, String loginId, String name) implements Serializable {}
