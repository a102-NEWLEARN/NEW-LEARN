package kr.io.newlearn;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.annotation.DirtiesContext;

// 뜰 때 Spring Security 가 기본 계정을 만들어 그 비밀번호를 로그에 찍지 않는다 — 찍히면 비밀값이 컨테이너 로그에 남는다 (Jira 144)
// 맥락이 뜨는 로그를 봐야 해서 속성 하나를 따로 둬 다른 시험과 맥락을 같이 쓰지 않는다(이 시험이 맥락을 새로 띄운다).
// 다른 시험이 쓰지 않는 맥락이라 끝나면 닫는다(@DirtiesContext) — 컨테이너 · DB 연결이 실행 끝까지 남지 않게
@SpringBootTest(properties = "newlearn.test.context=startup-log")
@Import(TestcontainersConfiguration.class)
@ExtendWith(OutputCaptureExtension.class)
@DirtiesContext
class StartupLogTest {

    @Autowired
    ApplicationContext context;

    @Test
    void noGeneratedPasswordOnStartup(CapturedOutput output) {
        // 맥락이 뜨는 로그를 잡았는지 먼저 본다 — 못 잡았으면 아래 확인은 아무것도 지키지 않는다
        assertThat(output.getAll()).contains("Starting StartupLogTest");
        assertThat(output.getAll()).doesNotContain("generated security password");
        assertThat(context.getBeanNamesForType(UserDetailsService.class)).isEmpty();
    }
}
