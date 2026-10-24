package kr.io.newlearn;

import org.springframework.jdbc.core.simple.JdbcClient;

final class ArticleApiFixtures {
    private ArticleApiFixtures() {}

    static void insert(JdbcClient jdbc) {
        jdbc.sql("insert into press values ('article42', '테스트신문')").update();
        for (int n = 1; n <= 11; n++) {
            jdbc.sql("""
                    insert into article(id,source,url,press_code,title,reporter,body,published_at,
                        category_code,source_summary,released_at,created_at)
                    values (:id,'NEWSDATA',:url,'article42',:title,:reporter,'노출하면 안 되는 본문',
                        cast(:published as timestamptz),:category,:summary,
                        case when :released then now() else null end,now())
                    """)
                    .param("id", 4200 + n)
                    .param("url", "https://fixture.invalid/article42/" + n)
                    .param("title", "기사 " + n)
                    .param("reporter", n == 1 ? "기자" : null)
                    .param(
                            "published",
                            n == 1 ? "2026-10-23T00:00:00Z" : n == 11 ? "2026-10-01T00:00:00Z" : "2026-10-22T00:00:00Z")
                    .param("category", n == 3 || n == 11 ? null : n == 2 ? "politics" : "economy")
                    .param("summary", n == 1 || n == 2 || n == 4 ? "NewsData 요약" : n == 5 ? "  " : null)
                    .param("released", n != 10)
                    .update();
        }
        for (int n : new int[] {1, 2, 4, 6, 7, 8}) {
            jdbc.sql("""
                    insert into article_mindmap(article_id,summary,content,schema_version,model,prompt_version,generated_at)
                    values (:id,:summary,'{}','mindmap-v1','fixture','v1',now())
                    """)
                    .param("id", 4200 + n)
                    .param("summary", n == 1 ? "우리 요약" : n == 4 ? " \t\n " : null)
                    .update();
        }
        job(jdbc, 4201, "EXTRACT", "SUCCEEDED");
        job(jdbc, 4201, "MATCH_EVENT", "SUCCEEDED");
        job(jdbc, 4202, "EXTRACT", "QUEUED");
        job(jdbc, 4202, "MATCH_EVENT", "QUEUED");
        job(jdbc, 4205, "EXTRACT", "FAILED");
        job(jdbc, 4205, "MATCH_EVENT", "FAILED");
        job(jdbc, 4207, "EXTRACT", "QUEUED");
        job(jdbc, 4208, "EXTRACT", "FAILED");
        job(jdbc, 4209, "EXTRACT", "SUCCEEDED");
        job(jdbc, 4211, "EXTRACT", "QUEUED");
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (4200,'이슈',now(),now())")
                .update();
        jdbc.sql("""
                insert into event(id,issue_id,title,label,occurred_at,occurred_at_basis,created_at,updated_at)
                values (4200,4200,'사건','키워드','2026-10-20T00:00:00Z','EXTRACTED',now(),now()),
                       (4201,null,'이슈 밖 사건','독립','2026-10-20T00:00:00Z','EXTRACTED',now(),now())
                """).update();
        jdbc.sql("insert into article_event values (4201,4200,now()),(4206,4201,now())")
                .update();
    }

    private static void job(JdbcClient jdbc, long articleId, String stage, String status) {
        jdbc.sql("""
                insert into analysis_job(article_id,stage,status,requested_by,attempt,created_at)
                values (:id,:stage,:status,'BATCH',1,now())
                """)
                .param("id", articleId)
                .param("stage", stage)
                .param("status", status)
                .update();
    }
}
