# Git 규칙

NEW:LEARN(S15P31A102) 팀의 브랜치 전략과 커밋·MR 규칙입니다. 저장소에 코드를 올리기 전에 한 번 읽어 주세요.

> **핵심 흐름:** Jira 티켓 생성 → 작업 브랜치에서 개발·커밋 → 분야별 브랜치로 MR → `dev`에서 통합·검증 → 프로젝트 마지막에 `master`로 병합

```mermaid
flowchart LR
    T["Jira 티켓"] --> W["작업 브랜치<br/>feat/ai/JIRA-123-..."]
    W -- "MR · 리뷰 1명 이상" --> F["분야별 브랜치<br/>ai · server · frontend"]
    F -- "MR · 통합 가능할 때" --> D["dev<br/>통합 · 검증"]
    D -- "MR · 프로젝트 마지막" --> M["master<br/>최종 결과물"]
    D -. "주기적으로 반영" .-> F
```

---

## 1. 브랜치 전략

### 기본 구조

```
master ← dev ← 분야별 브랜치 ← Jira 티켓별 작업 브랜치
```

| 브랜치 | 역할 | 병합 대상 |
| --- | --- | --- |
| `master` | 프로젝트 최종 결과물 보관 | 프로젝트 마지막에 `dev` 병합 |
| `dev` | 분야별 기능을 모아 통합·검증 | `master` |
| 분야별 브랜치 | 담당 영역의 작업을 모아 검증 | `dev` |
| 작업 브랜치 | Jira 티켓 하나를 처리 | 해당 분야별 브랜치 |

분야별 브랜치는 프로젝트에 필요한 영역만 만듭니다. `master`, `dev`, 분야별 브랜치는 유지하고, **작업 브랜치는 병합 후 삭제**합니다.

**NEW:LEARN의 분야별 브랜치**

| 브랜치 | 담당 |
| --- | --- |
| `ai` | AI (사건 묶기, 핵심 정보 추출, 주장 판정) |
| `server` | BE (기사 적재, API, DB) |
| `frontend` | FE (화면) |

인프라 작업을 `infra` 브랜치로 따로 둘지, `server`에서 할지는 팀에서 정합니다.

### 작업 흐름

1. Jira 티켓을 생성하고 담당 분야를 정합니다.
2. 해당 **분야별 브랜치에서 작업 브랜치**를 생성합니다.
3. 작업 브랜치에서 개발하고 커밋한 뒤 GitLab에 푸시합니다.
4. **작업 브랜치 → 분야별 브랜치**로 Merge Request(MR)를 열어 리뷰 후 병합합니다.
5. 분야별 기능이 통합 가능한 상태가 되면 **분야별 브랜치 → `dev`**로 MR을 엽니다.
6. `dev`에서 전체 기능을 통합·검증합니다. `dev`의 변경 사항은 **`dev` → 분야별 브랜치** MR로 분야별 브랜치에도 주기적으로 반영합니다.
7. 프로젝트 마지막에 **`dev` → `master`**로 MR을 열어 최종 결과물을 확정합니다.

### 작업 브랜치 이름

```
type/분야/Jira티켓번호-작업내용
```

```
feat/ai/JIRA-123-event-clustering
feat/frontend/JIRA-124-issue-timeline
fix/server/JIRA-125-duplicate-article
docs/common/JIRA-126-setup-guide
```

- `JIRA-123`은 실제 Jira 티켓 번호로 바꿉니다.
- 작업 내용은 짧은 영문 소문자와 하이픈으로 작성합니다.
- 한 Jira 티켓당 작업 브랜치 하나를 기본으로 합니다.
- 브랜치 이름에 작성자 이름을 넣지 않습니다.
- `type`은 아래 커밋 메시지의 Type과 같은 것을 씁니다.

### MR 규칙

- `master`, `dev`, 분야별 브랜치에는 직접 푸시하지 않고 MR로 병합합니다.
- MR의 **대상 브랜치**가 위 작업 흐름과 맞는지 확인합니다.
- MR 제목은 커밋과 같은 `type(scope): 작업 내용` 형식으로 씁니다.
- MR 설명에 관련 **Jira 티켓 링크**, 변경 내용, 확인한 테스트를 적습니다.
- 관련 없는 변경을 한 MR에 섞지 않습니다.
- 팀원 1명 이상이 변경 내용을 리뷰한 뒤 병합합니다.
- 병합 후 작업 브랜치를 삭제합니다.
- 예외적인 병합 경로가 필요하면 팀에 먼저 공유하고 MR에 이유를 남깁니다.

**MR 설명 양식** (복사해서 쓰세요)

```markdown
## Jira
- JIRA-123 (티켓 링크)

## 변경 내용
- 

## 확인한 테스트
- 
```

---

## 2. 커밋 메시지 규칙

### 기본 형식

```
type(scope): 작업 내용
```

- `type`: 작업 종류
- `scope`: 작업한 영역
- `작업 내용`: 실제로 변경한 내용을 구체적으로 작성

### Type 종류

| Type | 사용 상황 |
| --- | --- |
| `feat` | 새로운 기능 추가 |
| `fix` | 오류 또는 버그 수정 |
| `refactor` | 기능 변화 없이 코드 구조 개선 |
| `docs` | README, 기획서 등 문서 수정 |
| `test` | 테스트 코드 작성 및 수정 |
| `style` | 들여쓰기, 공백, 주석 등 코드 형식 수정 |
| `chore` | 설정, 패키지, 폴더 구조 등 기타 작업 |
| `perf` | 성능 개선 |
| `merge` | 브랜치 병합 |

### Scope

```
ai
server
frontend
database
docs
common
```

프로젝트에 필요한 항목만 사용합니다. 문서 작업처럼 대상을 더 구체적으로 표현하는 편이 좋다면 `plan`, `readme` 등을 scope로 사용할 수 있습니다.

### 작성 규칙

- 커밋 메시지는 **한국어로 통일**합니다.
- 한 커밋에는 하나의 작업만 포함합니다.
- 작성자 이름은 넣지 않습니다.
- `수정`, `업데이트`처럼 모호하게 쓰지 않고 변경 내용을 구체적으로 적습니다.
- 메시지 끝에 마침표를 붙이지 않습니다.
- MR 제목도 `type(scope): 작업 내용` 형식으로 작성합니다.
- GitLab에서 병합 커밋을 만들 때도 메시지를 확인하고, 필요하면 `merge(scope): 병합 내용` 형식으로 작성합니다.

### 올바른 예시

```
feat(ai): 같은 사건을 다룬 기사 묶기 모델 추가
feat(frontend): 이슈 타임라인 화면 구현
fix(server): 같은 원문 링크 기사가 두 번 저장되는 문제 수정
refactor(ai): 기사 본문 전처리 코드 분리
docs(plan): PRD에 팀 논의 사항 추가
docs(readme): 로컬 실행 방법 추가
chore(common): 프로젝트 폴더 구조 정리
merge(ai): 사건 묶기 기능을 ai 브랜치에 병합
```

### 잘못된 예시

```
강하린_코드수정
하린_업데이트
feat: 수정
작업 완료
최종 수정
진짜 최종 수정
```

---

## 3. 자주 쓰는 명령어

### 작업 시작부터 MR까지

```bash
# 1. 분야별 브랜치를 최신으로 받기
git switch ai
git pull origin ai

# 2. 작업 브랜치 만들기
git switch -c feat/ai/JIRA-123-event-clustering

# 3. 작업 후 커밋
git add <바꾼 파일>
git commit -m "feat(ai): 같은 사건을 다룬 기사 묶기 모델 추가"

# 4. 푸시하면서 ai 브랜치로 가는 MR 만들기 (병합 후 작업 브랜치 자동 삭제)
git push -u origin feat/ai/JIRA-123-event-clustering \
  -o merge_request.create \
  -o merge_request.target=ai \
  -o merge_request.remove_source_branch
```

4번의 `-o` 옵션 없이 푸시하고 GitLab 화면에서 MR을 만들어도 됩니다. MR을 만든 뒤 제목과 설명 양식을 채웁니다.

### 작업 중에 분야별 브랜치가 바뀌었을 때

```bash
git switch ai
git pull origin ai
git switch feat/ai/JIRA-123-event-clustering
git merge ai
```

### 병합이 끝난 뒤 정리

```bash
git switch ai
git pull origin ai
git branch -d feat/ai/JIRA-123-event-clustering
```

---

## 4. 처음 한 번만 (저장소 관리자)

### 브랜치 만들기

```bash
git switch master
git pull origin master
git switch -c dev
git push -u origin dev

# 분야별 브랜치는 dev에서 만든다
git switch -c ai dev && git push -u origin ai
git switch -c server dev && git push -u origin server
git switch -c frontend dev && git push -u origin frontend
```

### GitLab 설정

- **Settings → Repository → Protected branches**: `master`, `dev`, `ai`, `server`, `frontend`를 보호 브랜치로 등록합니다. *Allowed to push*는 `No one`, *Allowed to merge*는 `Developers + Maintainers`로 둡니다. 직접 푸시를 막아 MR로만 병합되게 합니다.
- **Settings → Merge requests**: *Enable "Delete source branch" option by default*를 켭니다. 병합 후 작업 브랜치가 자동으로 지워집니다.
- **Settings → Merge requests → Merge request approvals**: 승인 1명 이상을 병합 조건으로 겁니다. GitLab 유료 기능이라 이 메뉴가 없으면 "리뷰 1명 이상" 규칙을 팀이 직접 지킵니다.
