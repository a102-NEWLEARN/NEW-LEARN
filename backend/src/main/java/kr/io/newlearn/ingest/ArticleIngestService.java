package kr.io.newlearn.ingest;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import kr.io.newlearn.article.Article;
import kr.io.newlearn.article.ArticleRepository;
import kr.io.newlearn.article.ArticleSource;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryMapping;
import kr.io.newlearn.category.CategoryMappingId;
import kr.io.newlearn.category.CategoryMappingRepository;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.common.MappingSource;
import kr.io.newlearn.ingest.dto.ArticleIngestRequest;
import kr.io.newlearn.ingest.dto.ArticleIngestResponse;
import kr.io.newlearn.press.Press;
import kr.io.newlearn.press.PressMapping;
import kr.io.newlearn.press.PressMappingId;
import kr.io.newlearn.press.PressMappingRepository;
import kr.io.newlearn.press.PressRepository;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 기사 적재(B2) — 수집 배치가 받은 NewsData 기사 하나를 article 에 넣는다 (docs/api-internal.md 2절, Jira 153)
// 공개 시각(released_at)은 비운다. 배치가 이어서 B1 으로 분석을 걸고, EXTRACT 결과를 처음 저장할 때 공개된다
// 클래스 · 메서드에 @Transactional 을 두지 않는다 — 넣기를 TransactionTemplate 한 곳에 두고, 유일 키에 걸려 그 트랜잭션이
// 되돌아간 뒤 새로 읽어야 해서다. 바깥 트랜잭션이 있으면 템플릿이 거기에 합류해 실패 뒤 다시 읽기가 막힌다
@Service
public class ArticleIngestService {

    private static final Logger log = LoggerFactory.getLogger(ArticleIngestService.class);
    private static final String POLITICS = "politics";
    private static final String WORLD = "world";

    private final ArticleRepository articles;
    private final PressRepository presses;
    private final PressMappingRepository pressMappings;
    private final CategoryMappingRepository categoryMappings;
    private final CategoryRepository categories;
    private final TransactionTemplate transaction;

    public ArticleIngestService(
            ArticleRepository articles,
            PressRepository presses,
            PressMappingRepository pressMappings,
            CategoryMappingRepository categoryMappings,
            CategoryRepository categories,
            PlatformTransactionManager transactions) {
        this.articles = articles;
        this.presses = presses;
        this.pressMappings = pressMappings;
        this.categoryMappings = categoryMappings;
        this.categories = categories;
        this.transaction = new TransactionTemplate(transactions);
    }

    // 같은 URL 이 이미 있으면 넣지 않고 그 id 를 돌려준다(created false). 먼저 찾아 보는 것은 중복마다 저장 오류 로그를 내지 않으려는 것이고,
    // 같은 URL 이 동시에 들어오면 저장이 유일 키에 걸린다 — 되돌아간 뒤 다시 찾아 먼저 넣은 쪽의 id 를 준다.
    // 다시 찾아도 없으면 URL 이 아닌 까닭(기본 키 충돌 등)이라 원래 오류를 그대로 던진다(500). 같은 URL 로 잘못 읽지 않는다
    public ArticleIngestResponse ingest(ArticleIngestRequest request) {
        Optional<Long> existing = articles.findIdByUrl(request.url());
        if (existing.isPresent()) {
            return new ArticleIngestResponse(existing.get(), false);
        }
        try {
            Inserted inserted = Objects.requireNonNull(transaction.execute(status -> insert(request)));
            // 등록 로그는 커밋 뒤에 남긴다 — 같은 URL 충돌로 되돌아간 요청의 언론사는 실제로 생기지 않는다
            if (inserted.newPress()) {
                log.info("처음 보는 언론사를 등록했다: code={} name={}", request.pressSourceId(), request.pressName());
            }
            return new ArticleIngestResponse(inserted.articleId(), true);
        } catch (DataIntegrityViolationException e) {
            return articles.findIdByUrl(request.url())
                    .map(id -> new ArticleIngestResponse(id, false))
                    .orElseThrow(() -> e);
        }
    }

    private Inserted insert(ArticleIngestRequest request) {
        ChosenPress press = press(request.pressSourceId(), request.pressName());
        List<String> sourceCategories = request.sourceCategoriesOrEmpty();
        Article article = new Article(
                ArticleSource.NEWSDATA,
                request.url(),
                press.press(),
                request.title(),
                request.body(),
                request.publishedAt().toInstant(),
                sourceCategories);
        article.fillSourceDetails(
                request.reporterOrNull(), representative(sourceCategories, request.title()), request.sourceTags());
        return new Inserted(articles.saveAndFlush(article).getId(), press.created());
    }

    // 대응 행이 있으면 그 행의 언론사 — 사람이 같은 언론사로 묶어 둔 표기를 source_id 로 짐작하지 않는다.
    // 없으면 언론사(code = source_id)와 대응 행을 넣는다. 같은 코드의 언론사가 이미 있으면 이름을 바꾸지 않고 대응만 붙는다
    private ChosenPress press(String sourceId, String name) {
        Optional<PressMapping> mapping = pressMappings.findById(new PressMappingId(MappingSource.NEWSDATA, sourceId));
        if (mapping.isPresent()) {
            return new ChosenPress(mapping.get().getPress(), false);
        }
        boolean created = presses.insertIfAbsent(sourceId, name) == 1;
        String code = pressMappings.insertIfAbsent(MappingSource.NEWSDATA.name(), sourceId, sourceId);
        return new ChosenPress(presses.getReferenceById(code), created);
    }

    // 고른 언론사와, 이번 요청이 그 언론사를 처음 등록했는지
    private record ChosenPress(Press press, boolean created) {}

    // 넣은 기사 id 와, 이번에 언론사를 처음 등록했는지(커밋 뒤 로그용)
    private record Inserted(long articleId, boolean newPress) {}

    // 대응 표가 고른 대표. 정치로 골랐는데 제목이 해외 정치면 국제로 옮긴다 — NewsData 분류로는 나눌 수 없어서다(Jira 171)
    private @Nullable Category representative(List<String> sourceCategories, String title) {
        Category chosen = category(sourceCategories);
        if (chosen != null && POLITICS.equals(chosen.getCode()) && ForeignPoliticsTitleRule.matches(title)) {
            return categories.getReferenceById(WORLD);
        }
        return chosen;
    }

    // 원본 값이 모두 대응 표에 있으면 칸이 찬 행 중 priority 가 가장 작은 것(같으면 카테고리 순서). 표에 없는 값이 하나라도 있으면
    // 비우고 로그를 남긴다 — 아직 아무도 대응을 정하지 않은 값이라, 행을 더한 뒤 source_categories 로 다시 계산한다 (data-model.md 2절)
    private @Nullable Category category(List<String> sourceCategories) {
        List<CategoryMappingId> ids = sourceCategories.stream()
                .distinct()
                .map(value -> new CategoryMappingId(MappingSource.NEWSDATA, value))
                .toList();
        if (ids.isEmpty()) {
            return null;
        }
        List<CategoryMapping> rows = categoryMappings.findAllById(ids);
        if (rows.size() < ids.size()) {
            Set<String> known =
                    rows.stream().map(row -> row.getId().getSourceValue()).collect(Collectors.toSet());
            List<String> unknown = ids.stream()
                    .map(CategoryMappingId::getSourceValue)
                    .filter(value -> !known.contains(value))
                    .toList();
            log.info("대응 표에 없는 원본 분류라 대표 카테고리를 비운다: {}", unknown);
            return null;
        }
        Comparator<CategoryMapping> order =
                Comparator.comparingInt(CategoryMapping::getPriority).thenComparingInt(ArticleIngestService::sortOrder);
        CategoryMapping best = null;
        for (CategoryMapping row : rows) {
            if (row.getCategory() != null && (best == null || order.compare(row, best) < 0)) {
                best = row;
            }
        }
        return best == null ? null : best.getCategory();
    }

    // 칸이 찬 행만 견준다(위 반복문이 빈 행을 거른다)
    private static int sortOrder(CategoryMapping row) {
        return Objects.requireNonNull(row.getCategory()).getSortOrder();
    }
}
