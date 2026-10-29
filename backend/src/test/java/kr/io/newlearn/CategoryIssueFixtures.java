package kr.io.newlearn;

import org.springframework.jdbc.core.simple.JdbcClient;

final class CategoryIssueFixtures {
    private CategoryIssueFixtures() {}

    static void insert(JdbcClient jdbc) {
        insert(jdbc, true);
    }

    // 사건 역할 칸(V8)이 생기기 전 스키마 — InterestIssueSchemaTest(V7). V10 부터 role 에 기본값이 없어 지금 스키마에는 꼭 넣는다
    static void insertBeforeEventRole(JdbcClient jdbc) {
        insert(jdbc, false);
    }

    private static void insert(JdbcClient jdbc, boolean eventRole) {
        jdbc.sql("insert into press(code,name) values ('fixture41','테스트 언론사'), ('hidden41','미투입 언론사')")
                .update();
        jdbc.sql("""
                insert into issue(id,title,summary,created_at,updated_at) values
                (4101,'첫 이슈','요약','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),
                (4102,'두 번째 이슈',null,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),
                (4103,'새 이슈','새 요약','2026-10-02T00:00:00Z','2026-10-02T00:00:00Z')
                """).update();
        jdbc.sql(
                        "insert into issue_category values (4101,'politics'),(4102,'economy'),(4102,'politics'),(4103,'world')")
                .update();
        String role = eventRole ? ",role" : "";
        String main = eventRole ? ",'MAIN'" : "";
        for (long issue = 4101; issue <= 4103; issue++) {
            for (int n = 1; n <= 3; n++) {
                long event = (issue - 4100) * 10 + 4100 + n;
                String day = issue == 4103 ? "19" : n == 1 ? "20" : "22";
                jdbc.sql("""
                        insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at%s)
                        values (:id,:issue,'사건','키워드',cast(:at as timestamptz),'EXTRACTED',now(),now()%s)
                        """.formatted(role, main))
                        .param("id", event)
                        .param("issue", issue)
                        .param("at", "2026-10-" + day + "T00:00:00Z")
                        .update();
            }
        }
        for (int n = 1; n <= 3; n++) {
            jdbc.sql("""
                    insert into article(id,source,url,press_code,title,body,published_at,category_code,released_at,created_at)
                    values (:id,'NEWSDATA',:url,:press,'기사','본문',now(),'politics',
                    case when :released then now() else null end,now())
                    """)
                    .param("id", 4100 + n)
                    .param("url", "https://fixture.invalid/41/" + n)
                    .param("press", n == 3 ? "hidden41" : "fixture41")
                    .param("released", n != 3)
                    .update();
            jdbc.sql("insert into article_event values (:article,:event,now())")
                    .param("article", 4100 + n)
                    .param("event", n == 2 ? 4121 : 4120 + n)
                    .update();
        }
    }
}
