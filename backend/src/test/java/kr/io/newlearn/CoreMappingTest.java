package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import kr.io.newlearn.category.Category;
import kr.io.newlearn.category.CategoryRepository;
import kr.io.newlearn.press.Press;
import kr.io.newlearn.press.PressRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

// 엔티티가 V2 의 표와 맞게 저장되고 다시 읽히는지 본다 (Jira 101)
// 저장한 뒤 flush() 로 DB 에 보내고 clear() 로 JPA 의 기억을 비운 다음 읽어야, 메모리가 아니라 DB 에서 읽은 값을 본다
@Import(TestcontainersConfiguration.class)
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CoreMappingTest {

    @Autowired
    EntityManager em;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    PressRepository pressRepository;

    // ① 코드 키

    @Test
    void categoryIsReadFromMigrationRows() {
        Category economy = categoryRepository.findById("economy").orElseThrow();

        assertThat(economy.getName()).isEqualTo("경제");
        assertThat(economy.getSortOrder()).isEqualTo((short) 2);
    }

    @Test
    void pressIsSavedAndReadBack() {
        pressRepository.save(new Press("garam", "가람일보"));
        em.flush();
        em.clear();

        Press found = pressRepository.findById("garam").orElseThrow();

        assertThat(found.getName()).isEqualTo("가람일보");
    }
}
