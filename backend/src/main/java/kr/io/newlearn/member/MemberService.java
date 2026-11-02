package kr.io.newlearn.member;

import java.nio.charset.StandardCharsets;
import java.util.List;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.FieldErrorItem;
import kr.io.newlearn.common.web.QueryText;
import kr.io.newlearn.member.dto.ChangeCategoriesRequest;
import kr.io.newlearn.member.dto.MemberResponse;
import kr.io.newlearn.member.dto.SignUpRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 가입(A14)과 회원 정보 만들기. 세션을 여는 일은 컨트롤러가 auth.LoginSessions 로 한다 (Jira 62)
@Service
@Transactional(readOnly = true)
public class MemberService {

    // bcrypt 는 72바이트까지만 읽는다. 한글 비밀번호는 글자 수보다 바이트 수가 먼저 찬다
    static final int MAX_PASSWORD_BYTES = 72;

    private final MemberRepository members;
    private final MemberCategoryRepository memberCategories;
    private final CategoryRepository categories;
    private final PasswordEncoder passwordEncoder;

    public MemberService(
            MemberRepository members,
            MemberCategoryRepository memberCategories,
            CategoryRepository categories,
            PasswordEncoder passwordEncoder) {
        this.members = members;
        this.memberCategories = memberCategories;
        this.categories = categories;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public MemberResponse signUp(SignUpRequest request) {
        if (members.existsByLoginId(request.loginId())) {
            throw new ApiException(ErrorCode.LOGIN_ID_TAKEN, "이미 쓰는 아이디다: " + request.loginId());
        }
        if (tooLongForHash(request.password())) {
            throw invalid("password", "비밀번호가 너무 길어요");
        }
        List<Category> chosen = chosenCategories(request.categoryCodes());
        Member member;
        try {
            member = members.saveAndFlush(
                    new Member(request.loginId(), passwordEncoder.encode(request.password()), request.name()));
        } catch (DataIntegrityViolationException e) {
            // 같은 아이디로 두 요청이 동시에 들어와 위 검사를 함께 지나친 경우 — DB 의 유일 키가 막는다
            throw new ApiException(ErrorCode.LOGIN_ID_TAKEN, "이미 쓰는 아이디다: " + request.loginId());
        }
        chosen.forEach(category -> memberCategories.save(new MemberCategory(member, category)));
        return toResponse(member);
    }

    public MemberResponse profile(long memberId) {
        Member member = members.findById(memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "세션의 회원이 없다: " + memberId));
        return toResponse(member);
    }

    @Transactional
    public MemberResponse changeCategories(long memberId, ChangeCategoriesRequest request) {
        Member member = members.findForUpdateById(memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "세션의 회원이 없다: " + memberId));
        List<Category> chosen = chosenCategories(request.categoryCodes());
        memberCategories.deleteForMember(memberId);
        memberCategories.saveAllAndFlush(chosen.stream()
                .map(category -> new MemberCategory(member, category))
                .toList());
        return toResponse(member);
    }

    // 가입과 관심 분야 교체가 같은 코드 검증·한국어 필드 오류를 쓴다.
    private List<Category> chosenCategories(List<String> requested) {
        List<String> codes = requested.stream().distinct().toList();
        // 분야 수보다 많으면 없는 코드가 섞인 것이다. DB 에 묻기 전에 끊는다 — 수만 개를 그대로 넘기면
        // findAllById 가 PostgreSQL 매개변수 한도(65,535)를 넘어 500 이 된다 (Jira 65 리뷰)
        // U+0000 이 든 코드도 없는 코드다 — PostgreSQL 이 받지 못해 findAllById 가 500 이었다 (Jira 43 후속)
        if (codes.size() > categories.count() || codes.stream().anyMatch(QueryText::containsNul)) {
            throw invalid("categoryCodes", "없는 관심 분야가 있어요");
        }
        List<Category> chosen = categories.findAllById(codes);
        if (chosen.size() != codes.size()) {
            throw invalid("categoryCodes", "없는 관심 분야가 있어요");
        }
        return chosen;
    }

    public static boolean tooLongForHash(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES;
    }

    private MemberResponse toResponse(Member member) {
        List<CategoryRef> refs = memberCategories.findCategoriesOfMember(member.getId()).stream()
                .map(CategoryRef::from)
                .toList();
        return new MemberResponse(member.getId(), member.getLoginId(), member.getName(), refs);
    }

    private static ApiException invalid(String field, String reason) {
        return new ApiException(
                ErrorCode.VALIDATION_FAILED, field + ": " + reason, List.of(new FieldErrorItem(field, reason)));
    }
}
