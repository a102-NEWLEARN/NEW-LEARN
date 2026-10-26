# F12 회원 · 관심 분야 — A14 · A15 · A16 (가입 · 로그인 · 로그아웃)

계약 원본은 [API 공통 규칙 · 인증](../api.md), [A14 ~ A16](../api-screen.md)이다. 이 문서는 Jira S15P31A102-62 의 검증 기준과 그 기준을 지키는 시험만 둔다. 내 정보 · 관심 분야 바꾸기(A17 · A18)는 Jira 65 에서 더한다.

- AC-1: A14 는 회원을 만들고 201 · `Location: /api/v1/members/me` · 회원 정보(같은 분야는 하나로, 카테고리 탭 순서)와 로그인된 세션을 준다. 비밀번호는 `{bcrypt}` 해시만 저장한다
  — `MemberAuthApiIntegrationTest.signUpCreatesMemberAndOpensSession`
- AC-2: A14 입력 규칙을 어기면 400 `VALIDATION_FAILED` 이고 `errors[]` 에 칸과 한국어 문장이 있다. 아이디는 `^[a-z0-9_]{4,20}$`, 비밀번호 8 ~ 64자 · 공백만은 안 됨 · UTF-8 72바이트까지, 이름 필수 · 20자까지, 관심 분야 1개 이상. 없는 분야 코드도 400 이고 회원을 만들지 않는다
  — `signUpRejectsBrokenInputWithKoreanReasons` · `signUpRejectsLongNameBlankPasswordAndPasswordOver72Bytes` · `loginIdAllowsOnlyLowercaseDigitsAndUnderscoreFrom4To20` · `signUpRejectsUnknownCategoryAsValidationError`
- AC-3: 이미 쓰는 아이디로 가입하면 409 `LOGIN_ID_TAKEN`
  — `signUpRejectsTakenLoginId`
- AC-4: A15 는 맞으면 200 과 회원 정보를 주고 세션 ID 를 새로 낸다(이미 세션이 있어도). 새 CSRF 번호표가 함께 온다
  — `loginReturnsMemberAndIssuesNewSessionId`
- AC-5: 틀린 비밀번호와 없는 아이디는 같은 401 `LOGIN_FAILED` 본문이다. 빈 칸은 400
  — `wrongPasswordAndUnknownIdLookTheSame` · `loginRejectsMissingFields`
- AC-6: 같은 아이디로 5번 연속 틀리면 1분 동안 429 `TOO_MANY_REQUESTS`(비밀번호가 맞아도). 없는 아이디도 똑같이 센다. 성공하면 센 횟수를 지운다. 한꺼번에 보내도 비밀번호를 맞춰 보는 것은 5번까지다
  — `fiveFailuresLockTheLoginIdForOneMinute` · `unknownIdIsCountedTooSoNothingLeaks` · `successResetsTheFailureCount` · `concurrentAttemptsStillCompareAtMostFiveTimes`
- AC-7: A16 은 세션을 끝내고 204 를 준다. 끝난 세션이나 세션 없이 부르면 401 `UNAUTHORIZED`
  — `logoutEndsTheSession` · `logoutWithoutSessionIsUnauthorized`
- AC-8: 세션은 Redis 에 있고 하루 뒤 만료된다. 세션 쿠키는 `HttpOnly` · `SameSite=Lax` · `Max-Age` 86400, 사이트에서는 `Secure`
  — `sessionLivesInRedisForOneDay` · `SessionCookieHttpTest.sessionAndCsrfCookiesCarryTheirAttributes`
- AC-9: 번호표 쿠키 `XSRF-TOKEN` 은 첫 POST 전에 아무 응답에서나 받고 화면이 읽을 수 있다(`HttpOnly` 아님). 그 값을 `X-XSRF-TOKEN` 헤더로 돌려보내야 POST 가 통과하고, 없거나 틀리면 403 `FORBIDDEN`. 가입 · 로그인 · 로그아웃 때 번호표가 바뀐다
  — `SecurityRulesTest.anyResponseHandsOutCsrfTokenCookie` · `csrfTokenCookieMustComeBackAsHeader` · `signupWithoutCsrfTokenIsForbidden` · `SessionCookieHttpTest.sessionAndCsrfCookiesCarryTheirAttributes`(가입) · `MemberAuthApiIntegrationTest.loginReturnsMemberAndIssuesNewSessionId`(로그인) · `logoutEndsTheSession`(로그아웃)
- AC-10: 둘러보기는 그대로 로그인 없이 열리고 내부 API 는 잠긴 채다
  — `SecurityRulesTest.browseApisAreOpenWithoutLogin` · `internalApisStayLocked` · `memberApisNeedLogin`
- AC-11: Swagger 에 「회원」 태그와 `[확정] A14 · A15 · A16`, 성공 응답과 오류 코드(Problem Details)가 보인다
  — `OpenApiDocsTest.memberApisAreConfirmedWithTheirResponses`
