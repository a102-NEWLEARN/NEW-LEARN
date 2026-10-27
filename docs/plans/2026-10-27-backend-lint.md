# Jira 124 — 백엔드 린트: javac 경고 · Error Prone · NullAway 를 컴파일에 붙이기

## 무엇을 / 왜

지금 백엔드 검사는 Spotless 포맷과 컴파일뿐이다(`.claude/stack.md` §3 `backend_LINT=""`, `SSOT.md` 8절). 2026-10-27 후보 여섯 개를 지금 코드에 돌려 보고 사용자가 **javac 경고 + Error Prone 기본 검사 + NullAway** 를 골랐다. 셋 다 컴파일 안에서 돌아 따로 태스크가 없고, 잰 시간은 +8초다. 경고는 컴파일 실패로 막는다. 지금 코드에서 나온 것은 이 MR 에서 다 고친다.

## 정한 것

| 항목 | 정한 것 | 까닭 |
|---|---|---|
| 도구 · 판 | Gradle 플러그인 `net.ltgt.errorprone` 5.1.1, `error_prone_core` 2.51.0, `nullaway` 0.14.3 | 10-27 기준 최신. Error Prone 2.43+ 는 JDK 21 이상에서 돈다(공식 문서) — 툴체인 JDK 25 · CI 이미지 JDK 25 |
| javac 경고 | `-Xlint:all,-processing -Werror` | `processing` 은 Lombok 같은 주석 처리기가 안 받은 주석 목록일 뿐이라 끈다. `serial` 은 켜 두고 8곳을 고친다(사용자 선택) |
| Error Prone | 기본 검사 그대로. 경고도 `-Werror` 로 실패 | 지금 1건 |
| NullAway 범위 | main 의 `kr.io.newlearn` 아래 전부(`AnnotatedPackages=kr.io.newlearn`). 테스트 컴파일에서는 끈다 | 사용자 선택 「전체」. 접두어라 **새 패키지도 저절로 검사된다** — 그래서 「새 패키지에 `package-info.java` `@NullMarked`」 규칙(사용자 선택)을 파일로 강제하는 대신 설정으로 지킨다. 테스트는 일부러 null 을 넘기는 곳이 많다(75건 중 대부분) |
| NullAway 옵션 | `CustomContractAnnotations=org.springframework.lang.Contract`(Spring 문서 권장). `ExcludedFieldAnnotations=jakarta.persistence.Id,org.hibernate.annotations.CreationTimestamp,org.hibernate.annotations.UpdateTimestamp` | DB 가 채우는 칸은 저장 전에만 null 이다. `@Nullable` 을 달면 Lombok 이 getter 에도 옮겨(`HandlerUtil.BASE_COPYABLE_ANNOTATIONS`) `getId()` 를 부르는 곳마다 null 확인이 번진다 |
| null 표시 | `org.jspecify.annotations.Nullable` — 정말 비는 칸 · 인자 · 반환에만 | spring-core 가 jspecify 1.0.0 을 컴파일 범위로 끌어와 의존성을 더하지 않는다 |
| JPA 기본 생성자 · 도우미 (구현 중 더함) | `ExternalInitAnnotations=jakarta.persistence.Entity,jakarta.persistence.Embeddable` — 인자 없는 생성자만 초기화 검사에서 뺀다. `ApiTime.toKst` 에 `@Contract("!null -> !null")` + `CheckContracts`. `IssueQueryRepository` 는 JDBC 값을 비는 칸(`nullableInstant`) · not null 칸(`instant`)으로 나눠 읽는다(리뷰 뒤 — 약속이 JDBC 의 null 을 가렸다) | Lombok `@NoArgsConstructor` 로 만든 JPA 생성자가 복합 키에서 걸렸다. 「null 이면 null」 도우미에 `@Nullable` 만 달면 부르는 곳 수십 곳으로 번진다 |
| 게이트 명령 | `backend_LINT="./gradlew compileJava compileTestJava"` | 다음 단계 `./gradlew test` 가 컴파일 결과를 그대로 쓴다. CI 잡 `w3:backend` 는 같은 명령을 돈다(`.gitlab-ci.yml` 은 안 바뀐다) |

잰 값(이 PC, `--rerun-tasks`, 데몬 데운 뒤 번갈아 3번 평균): 기준 17.3초, Error Prone 기본 +8.0초, NullAway 만 ±0, javac 경고 +0.9초. 지금 경고: javac 11(serial 8 · processing 1 · 테스트 unchecked 2), Error Prone 1, NullAway main 54(21파일).

## 바꿀 파일

- `backend/build.gradle` — 플러그인 · `errorprone` 의존성 두 줄, `JavaCompile` 에 위 옵션, `compileTestJava` 는 NullAway 끔. 왜를 주석으로
- 기존 경고 고치기 (동작은 안 바꾼다 — 표시 · 명시만)
  - serial 8곳 — `ApiException` · `NotFoundException` · `ResultSchemaInvalidException` 에 `serialVersionUID`, `ApiException.errors` 는 직렬화 가능한 목록으로 받거나 `transient`(구현 때 짧은 쪽), 복합 키 `MemberCategoryId` · `CategoryMappingId` · `IssueCategoryId` · `PressMappingId` 에 `serialVersionUID`
  - unchecked 2곳 — `AnalysisJobQueueIntegrationTest:569` · `ArticleSummaryAssemblerTest:52` (메서드에 `@SuppressWarnings("unchecked")` + 까닭 한 줄, 또는 varargs 를 안 쓰게)
  - Error Prone 1곳 — `common/security/InternalKeyFilter` 의 `record Pass(String, byte[])`. equals 로 견주지 않으니(`MessageDigest.isEqual`) `@SuppressWarnings("ArrayRecordComponent")` + 까닭. 🔴 인증 코드 — 사람이 최종 확인
  - NullAway main 54건 · 21파일 — 엔티티의 정말 비는 칸에 `@Nullable`(예: `Article.reporter` · `category` · `releasedAt`, `AnalysisJob.result` · `errorCode` · `finishedAt` …), 서비스 · 처리기에서 null 을 넘기거나 돌려주는 자리의 인자 · 반환에 `@Nullable`, Spring 이 `@Nullable` 로 준 값(`e.getMessage()` · `super.handle…` 결과)을 받는 자리. 대표 파일: `analysis/AnalysisJob` · `analysis/AnalysisJobService` · `common/error/GlobalExceptionHandler` · `article/ArticleSummaryAssembler` · `event/EventService`. `InternalKeyFilter` 도 2건 — 🔴 사람 확인
- `.claude/stack.md` §3 `backend_LINT` — 위 명령과 한 줄 설명 (고치면 확인 창이 뜬다)
- `docs/backend-convention.md` — 새 절 「9. null · 컴파일 경고」: 모든 main 패키지를 NullAway 가 본다(새 패키지도) · 비는 곳에 jspecify `@Nullable` · DB 가 채우는 칸은 안 단다 · 테스트는 안 본다 · 경고는 실패라 끄려면 `@SuppressWarnings("<검사 이름>")` 에 까닭 한 줄 · `Serializable` 은 `serialVersionUID`
- `SSOT.md` — 8절 「Java 린트 도구」 줄을 지우고, 7절에 정한 것 한 줄(무엇 · 왜 · 명령은 stack.md, 쓰는 법은 backend-convention.md), 10절에 잰 값 한 줄(위 숫자와 잰 방법)
- `docs/plans/2026-10-27-backend-lint.md` — 승인한 계획 사본(이 파일 이름을 바꾼다)
- 리뷰(2026-10-27, reviewer 조수) 뒤 더한 것 — DB 에서 비는 엔티티 칸 다섯(`Issue.summary` · `Event.summary` · `ArticleMindmap.summary` · `occurredAt` · `CategoryMapping.category`)과 그 값이 나가는 응답 칸(`IssueCardResponse` · `IssueHeaderResponse` 의 summary · firstEventAt · lastEventAt, `EventPanelResponse.summary`)에 `@Nullable`. `AnalysisJobService` 의 끄기를 람다 한 줄로 좁힘(본문은 `markAndBuild` 로)
- `backend/Dockerfile` (구현 중 더함, 2026-10-27 사용자 승인) — 1단계 `DepsOnly` 를 패키지 `deps` 안에 둔다. 기본 패키지면 Error Prone `DefaultPackage` 경고가 `-Werror` 로 굽기를 깬다(임시 폴더에서 흉내 내 확인). Dockerfile 이 바뀌어 MR 파이프라인이 이미지를 실제로 굽는다

## 작업 순서

- [x] Jira 작업 만들기(`[BE] 백엔드 린트 — javac 경고 · Error Prone · NullAway 를 컴파일에 붙이기`, 상위 27, 라벨 `be` · `newlearn-mvp` · `pair`, 스토리 포인트 3, 담당 사용자, 설명 첫 줄 공동 담당) → 진행 중. 브랜치 `feat/backend/S15P31A102-124-lint` ← `origin/backend`
- [x] 커밋 1 「도구 붙이기 + 기존 경고 고치기」 — 먼저 `build.gradle` 만 바꿔 컴파일이 **실패하는 것**(경고 수가 위와 같음)을 본다 → 고친다 → `compileJava compileTestJava` 경고 0 · `spotlessCheck` · `test` 통과
- [ ] 커밋 2 「게이트 · 문서」 — stack.md · backend-convention · SSOT · 계획 사본. 커밋 게이트가 「린트」 단계를 도는지 출력으로 본다
- [ ] reviewer 조수 → push 로 MR(대상 `backend`) → 파이프라인 → 머지(머지 직전 원격 `backend` · 열린 MR 다시 보기) → `backend` → `dev`(소스 삭제 끔, 다른 세션 MR 이 먼저 들어갔으면 반영 뒤) → infra · frontend · ai 를 dev 에 하나씩 맞춤(파일 차이 0 이면 안 만듦)
- [ ] 머지 뒤 BE 팀원 티켓 63 · 64 · 65 설명에 한 줄 — 「backend 는 NullAway · Error Prone 경고가 컴파일 실패다, 쓰는 법은 `docs/backend-convention.md` 9절」(새 메시지 대신 티켓) → Jira 124 완료

## 안 바꿀 것

- `.gitlab-ci.yml` · 커밋 게이트 스크립트(`.claude/hooks/`) — 이미 stack.md §3 명령을 그대로 돈다. `backend/Dockerfile` 은 위 한 줄만
- Spotless 설정 · 판, Checkstyle · PMD · SpotBugs(이번엔 안 붙인다)
- 코드 동작 — null 표시와 명시만 더한다. null 처리 로직을 새로 짜야 하는 곳이 나오면 멈추고 묻는다
- NullAway JSpecify 모드(제네릭 · 배열까지 보는 모드) — Spring 문서도 기본 설정이 0건이 된 뒤 두 번째 단계로 권한다
- 이미 적용된 DB 마이그레이션, 엔티티 칸 구조
- 다른 영역(frontend · ai · infra)

## 리스크

- **NullAway 고칠 곳이 54건보다 늘 수 있다** — 엔티티 칸에 `@Nullable` 을 달면 Lombok 이 getter 로 옮겨 부르는 곳이 새로 걸린다. 파일이 30개를 넘거나 로직을 바꿔야 하면 멈추고 범위를 다시 정한다
- **BE 팀원 작업과 겹침** — 63 · 64 · 65 는 「해야 할 일」이고 원격 `feat/backend/*` 는 모두 `backend` 에 들어가 있다(10-27 `git log` · `git branch -r`). 팀원이 로컬에서 먼저 시작했다면 article · issue · member 에서 충돌한다 → 오늘 안에 머지하고 티켓에 알린다. 머지 뒤 팀원 코드도 NullAway 를 통과해야 커밋된다
- **CI 메모리** — Error Prone 은 JDK 16+ 에서 컴파일러를 따로 띄운다(플러그인 문서). `w3:backend` 상한 2Gi → MR 파이프라인에서 성공 · OOM 없음을 본다. 넘치면 `forkOptions.memoryMaximumSize` 로 묶는다
- **로컬 개발이 빡빡해진다** — 안 쓰는 변수 같은 Error Prone 경고도 `bootRun` 을 막는다. Spring · Lombok 판을 올려 생긴 deprecation 경고도 빌드를 막는다(일부러). 막히면 고치거나 그 검사만 까닭과 함께 끈다
- **운영 이미지 굽기(w4)** — Dockerfile 이 같은 `build.gradle` 로 `bootJar` 를 돌아 굽기에도 검사가 붙는다(+8초 정도). 의존성만 받는 `DepsOnly` 단계가 경고로 깨지지 않는지 본다
- 인증 코드(`InternalKeyFilter`)를 건드린다 → 사람 최종 확인

## 어떻게 검증하나

- **고치기 전 실패**: `build.gradle` 만 바꾼 상태에서 `./gradlew compileJava compileTestJava` 가 실패하고 경고 수가 위 잰 값과 같다
- **고친 뒤**: 같은 명령 경고 0 · 성공, `./gradlew spotlessCheck` 통과, `./gradlew test` 전부 통과(개수 전 · 뒤 같음)
- **검사가 실제로 잡는지**: 임시 파일에 심은 위반 셋 — null 반환(NullAway) · `String.format("%d", "x")`(Error Prone FormatString) · raw type(javac rawtypes) — 이 각각 컴파일 실패로 잡힌다. 확인 뒤 지우고 `git status` 깨끗
- **시간**: 고친 뒤 설정으로 `compileJava compileTestJava --rerun-tasks` 3번 평균을 같은 PC 기준과 비교
- **커밋 게이트**: 커밋 출력에 `[backend] → 린트` 단계가 돌고 통과
- **굽기 첫 단계**: 임시 폴더에 `build.gradle` · `settings.gradle` · `DepsOnly.java` 만 두고 `bootJar` 가 통과(Dockerfile 1단계 흉내)
- **CI**: MR 파이프라인 `w3:backend` 성공, 잡 시간을 최근 backend MR 잡과 비교, OOM 없음. dev 머지 뒤 `w4:backend` 굽기 성공
- reviewer 조수: 바꾼 `@Nullable` 이 실제로 비는 곳인지, 동작이 바뀐 곳이 없는지, 인증 코드 변경

## 되돌리는 법

- MR Revert(또는 `build.gradle` 의 플러그인 · 옵션 줄만 지움) → 검사 전 상태. `@Nullable` · `serialVersionUID` · `@SuppressWarnings` 는 남아도 동작에 영향이 없다. 데이터 · 설정 변화가 없어 되돌릴 수 없는 것은 없다
- 한 검사만 문제면 `build.gradle` 에서 그 검사만 끈다(`options.errorprone.disable("<이름>")`)
