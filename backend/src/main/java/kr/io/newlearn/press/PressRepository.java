package kr.io.newlearn.press;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PressRepository extends JpaRepository<Press, String> {
    // B2 적재 — 처음 보는 언론사를 넣는다. 같은 코드가 이미 있으면(덤프 · 먼저 들어온 요청) 그대로 두고 0 을 돌려준다 (Jira 153)
    @Modifying
    @Query(
            value = "insert into press(code, name) values (:code, :name) on conflict (code) do nothing",
            nativeQuery = true)
    int insertIfAbsent(String code, String name);
}
