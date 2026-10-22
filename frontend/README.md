# frontend

NEW:LEARN 화면(React)이다. 쓰는 기술은 `.claude/stack.md` §2, 설치 · 개발 서버 · 포맷 · 린트 · 테스트 · 빌드 명령은 §3 에 있다.
화면이 어떻게 동작하는지는 EXPERIENCE.md, 어떻게 보이는지는 DESIGN.md 가 정한다 (`.claude/stack.md` §7 「화면 · 이동」 · 「디자인」).

## 폴더

| 폴더              | 무엇                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `src/pages/`      | 주소 하나에 화면 하나 (`HomePage.tsx`)                                                 |
| `src/components/` | 여러 화면이 같이 쓰는 컴포넌트 (셸 · 상태 · `Logo`)                                    |
| `src/api/`        | 클라이언트 · 오류 · 목록 타입, 엔드포인트마다 파일 하나 (호출 함수 · 타입 · query key) |
| `src/mocks/`      | 가짜 API(MSW) 핸들러 · 가짜 데이터                                                     |
| `src/stores/`     | Zustand. 서버 데이터는 넣지 않는다 (TanStack Query 몫)                                 |
| `src/test/`       | 테스트 설정 · 도우미                                                                   |
| `seed-design/ui/` | SEED CLI 가 내려받는 컴포넌트. 손대지 않는다                                           |

테스트는 대상 파일 옆에 `*.test.ts(x)` 로 둔다.

## import

`src/` 아래 파일은 `@/` 로 부른다 (`import { api } from "@/api/client"`). SEED CLI 컴포넌트는 `seed-design/ui/…` 다.
