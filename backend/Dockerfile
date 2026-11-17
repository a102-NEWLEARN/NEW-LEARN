# 운영 이미지 — API 서버 (Jira S15P31A102-96). 굽는 곳은 CI 의 w4:backend(.gitlab-ci.yml), 정한 것은 SSOT.md 6절
# 로컬 개발은 이 파일을 쓰지 않는다 — compose.yaml 이 폴더를 연결해 bootRun 한다
# 이미지는 digest 로 고정한다. 태그는 사람이 읽으라고 남긴다

# 1단계 — 빌드. CI 의 w3:backend 와 같은 이미지다 (JDK 25.0.4, Gradle 9.8.1 = gradle-wrapper.properties 와 같은 판)
# 이미지에 든 gradle 을 바로 써서 래퍼가 Gradle 배포판을 다시 받지 않게 한다
FROM gradle:9.8.1-jdk25@sha256:4a80c8083135754f689c3e31bb858a22282c66f5625cafb09ed217814b363ee5 AS build
WORKDIR /src

# 의존성만 먼저 받아 층으로 남긴다 — build.gradle 이 그대로면 다음 빌드는 이 층을 다시 쓴다.
# 빈 main 클래스 하나로 bootJar 를 돌려야 실행 · 컴파일에 쓰는 jar 까지 받는다 (dependencies 작업은 목록만 받는다)
# 패키지 안에 둔다 — 기본 패키지면 Error Prone 경고(DefaultPackage)가 컴파일 실패가 된다 (build.gradle 「린트」)
COPY build.gradle settings.gradle ./
RUN mkdir -p src/main/java/deps \
 && echo 'package deps; class DepsOnly { public static void main(String[] a) {} }' > src/main/java/deps/DepsOnly.java \
 && gradle --no-daemon -q bootJar \
 && rm -rf src build

COPY src ./src
RUN gradle --no-daemon -q bootJar \
 && cp "$(find build/libs -name '*.jar' ! -name '*-plain.jar')" app.jar \
 && java -Djarmode=tools -jar app.jar extract --layers --launcher --destination extracted

# 2단계 — 실행. JRE 만 둔다 (Java 25.0.4.1)
FROM eclipse-temurin:25-jre@sha256:dbb43d81099eec91e0800226ed2296d03146ee7857165b95112372ad0d67e87f
WORKDIR /app
# 자주 바뀌는 것을 뒤에 둔다 — 코드만 바뀌면 마지막 층만 새로 올라간다
COPY --from=build /src/extracted/dependencies/ ./
COPY --from=build /src/extracted/spring-boot-loader/ ./
COPY --from=build /src/extracted/snapshot-dependencies/ ./
COPY --from=build /src/extracted/application/ ./
# root 가 아닌 사용자로 돈다 (쿠버네티스 runAsNonRoot 를 쓸 수 있게 숫자로)
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
