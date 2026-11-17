package kr.io.newlearn;

import org.springframework.jdbc.core.simple.JdbcClient;

final class EventApiFixtures {
    private EventApiFixtures() {}

    static void insert(JdbcClient jdbc) {
        ArticleApiFixtures.insert(jdbc);
        jdbc.sql("insert into press values ('event49a','가신문'),('event49z','나신문')")
                .update();
        jdbc.sql("update article set press_code='event49z' where id in (4201,4202)")
                .update();
        jdbc.sql("update article set press_code='event49a' where id=4203").update();
        jdbc.sql("insert into issue(id,title,created_at,updated_at) values (4900,'사건 패널 이슈',now(),now())")
                .update();
        jdbc.sql("""
                insert into event(id,issue_id,title,label,summary,occurred_at,occurred_at_basis,created_at,updated_at,role)
                values (4901,4900,'첫 사건','첫째',null,'2026-10-20T00:00:00Z','EXTRACTED',now(),now(),'MAIN'),
                       (4902,4900,'가운데 사건','둘째','저장된 사건 요약','2026-10-20T00:00:00Z','FIRST_PUBLISHED',now(),now(),'MAIN'),
                       (4903,4900,'같은 시각 다음 사건','셋째',null,'2026-10-20T00:00:00Z','EXTRACTED',now(),now(),'MAIN'),
                       (4904,4900,'마지막 사건','끝',null,'2026-10-21T00:00:00Z','EXTRACTED',now(),now(),'MAIN'),
                       (4905,null,'이슈 밖 사건','독립',null,'2026-10-20T00:00:00Z','EXTRACTED',now(),now(),'MAIN'),
                       (4906,4200,'미투입 기사만 있는 사건','숨김',null,'2026-10-20T00:00:00Z','EXTRACTED',now(),now(),'MAIN')
                """).update();
        jdbc.sql("delete from article_event").update();
        jdbc.sql("insert into article_event select id,4902,now() from article where id between 4201 and 4211")
                .update();
    }
}
