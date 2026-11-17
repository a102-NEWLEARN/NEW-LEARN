package kr.io.newlearn.search.dto;

import java.util.List;
import kr.io.newlearn.issue.dto.IssueRef;

// A13 통합 검색 결과 (docs/api-screen.md A13). 유형마다 최신순 20개까지, 없으면 빈 배열
public record SearchResponse(List<IssueRef> issues, List<SearchEvent> events, List<SearchArticle> articles) {}
