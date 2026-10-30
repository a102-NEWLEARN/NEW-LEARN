package kr.io.newlearn.search;

import kr.io.newlearn.common.web.QueryText;
import kr.io.newlearn.search.dto.SearchResponse;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// A13 통합 검색 (docs/api-screen.md A13, docs/specs/F02-search-api.md, Jira 43)
// 검색어 다듬기 → 이슈 · 사건 · 기사 제목을 따로 찾는다. 검색어는 남기지 않는다
@Service
@Transactional(readOnly = true)
public class SearchService {

    // 규칙은 용어사전과 같고(QueryText) 문구는 검색창(「이슈, 사건, 기사 검색」)에 맞춘다(2026-10-30 사용자)
    static final String BLANK = "검색어를 입력해 주세요";
    static final String TOO_LONG = "검색어는 50자까지예요";

    private final SearchQueryRepository queries;

    SearchService(SearchQueryRepository queries) {
        this.queries = queries;
    }

    public SearchResponse search(@Nullable String q) {
        String query = QueryText.normalize(q, BLANK, TOO_LONG);
        return new SearchResponse(queries.issues(query), queries.events(query), queries.articles(query));
    }
}
