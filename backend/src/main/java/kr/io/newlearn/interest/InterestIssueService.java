package kr.io.newlearn.interest;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import kr.io.newlearn.common.error.ErrorCode;
import kr.io.newlearn.common.error.NotFoundException;
import kr.io.newlearn.common.web.ApiTime;
import kr.io.newlearn.interest.dto.InterestIssueListResponse;
import kr.io.newlearn.interest.dto.InterestIssueStateResponse;
import kr.io.newlearn.issue.IssueCardAssembler;
import kr.io.newlearn.issue.IssueQueryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class InterestIssueService {
    private final InterestIssueRepository interests;
    private final IssueQueryRepository queries;
    private final IssueCardAssembler cards;

    public InterestIssueService(
            InterestIssueRepository interests, IssueQueryRepository queries, IssueCardAssembler cards) {
        this.interests = interests;
        this.queries = queries;
        this.cards = cards;
    }

    @Transactional
    public InterestIssueStateResponse add(long memberId, long issueId) {
        // 넣기와 저장 시각 읽기를 한 문장으로 — 돌려받은 행이 없으면 없는 이슈다(InterestIssueRepository.add)
        var saved = interests
                .add(memberId, issueId)
                .orElseThrow(() -> new NotFoundException(ErrorCode.ISSUE_NOT_FOUND, "이슈를 찾을 수 없다: " + issueId));
        return new InterestIssueStateResponse(issueId, true, ApiTime.toKst(saved.getCreatedAt()));
    }

    @Transactional
    public InterestIssueStateResponse remove(long memberId, long issueId) {
        interests.remove(memberId, issueId);
        return new InterestIssueStateResponse(issueId, false, null);
    }

    public InterestIssueListResponse list(long memberId) {
        var saved = interests.findSavedByMemberId(memberId);
        if (saved.isEmpty()) {
            return new InterestIssueListResponse(List.of());
        }
        var ids = saved.stream().map(i -> i.getId().getIssueId()).toList();
        var byId = cards.assemble(queries.findCardsByIds(ids), Set.copyOf(ids)).stream()
                .collect(Collectors.toMap(c -> c.id(), c -> c));
        var items = new ArrayList<InterestIssueListResponse.InterestIssueItem>(saved.size());
        // IN 조회의 순서가 아니라 저장 행의 시각·ID 순서로 조립한다.
        for (var row : saved) {
            var card = byId.get(row.getId().getIssueId());
            // 여러 조회 사이에 삭제된 이슈는 FK cascade와 같은 의미로 목록에서 제외한다.
            // 공개 기사가 없는 이슈도 카드가 없어 여기서 빠진다 — 저장 행은 남아 기사가 다시 공개되면 돌아온다(Jira 179).
            if (card != null) {
                items.add(new InterestIssueListResponse.InterestIssueItem(card, ApiTime.toKst(row.getCreatedAt())));
            }
        }
        return new InterestIssueListResponse(items);
    }
}
