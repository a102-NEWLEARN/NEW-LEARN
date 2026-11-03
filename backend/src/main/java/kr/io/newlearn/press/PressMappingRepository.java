package kr.io.newlearn.press;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PressMappingRepository extends JpaRepository<PressMapping, PressMappingId> {
    // B2 적재 — 대응 행을 넣고 그 행이 가리키는 언론사 코드를 받는다(한 문장, Jira 153)
    // 다른 요청이 먼저 넣었으면 그 행을 바꾸지 않고 그 코드를 받는다. do update 는 충돌한 행을 돌려받으려는 것이다
    @Query(value = """
            insert into press_mapping(source, source_value, press_code) values (:source, :sourceValue, :pressCode)
            on conflict (source, source_value) do update set press_code = press_mapping.press_code
            returning press_code
            """, nativeQuery = true)
    String insertIfAbsent(String source, String sourceValue, String pressCode);
}
