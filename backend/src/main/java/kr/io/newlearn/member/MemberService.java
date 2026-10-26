package kr.io.newlearn.member;

import java.nio.charset.StandardCharsets;
import java.util.List;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.category.dto.CategoryRef;
import kr.io.newlearn.common.error.ApiException;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.FieldErrorItem;
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
        // 같은 코드가 두 번 오면 하나로 합친다. 하나라도 없는 코드면 요청 본문 값이라 400(404 아님)
        List<String> codes = request.categoryCodes().stream().distinct().toList();
        List<Category> chosen = categories.findAllById(codes);
        if (chosen.size() != codes.size()) {
            throw invalid("categoryCodes", "없는 관심 분야가 있어요");
        }
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

    static boolean tooLongForHash(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES;
    }

    private MemberResponse toResponse(Member member) {
        List<CategoryRef> refs = memberCategories.findCategoriesOfMember(member.getId()).stream()
                .map(category -> new CategoryRef(category.getCode(), category.getName()))
                .toList();
        return new MemberResponse(member.getId(), member.getLoginId(), member.getName(), refs);
    }

    private static ApiException invalid(String field, String reason) {
        return new ApiException(
                ErrorCode.VALIDATION_FAILED, field + ": " + reason, List.of(new FieldErrorItem(field, reason)));
    }
}
