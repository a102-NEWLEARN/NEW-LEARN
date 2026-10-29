# 102번 용어사전 키를 사이트에 봉인 — infra

2026-10-29 사용자 승인. 브랜치 `feat/infra/S15P31A102-102-stdict-secret`(`origin/infra` f71e0bc 에서).

## 무엇을 / 왜

A19 용어사전(MR !359)은 env `STDICT_API_KEY` 로 표준국어대사전 키를 받는다. 사이트 backend 에는 그 env 가 없어 늘 502 다. 다른 비밀값(출입증 · GMS 키)과 같은 방식으로 EC2 에서 봉인해 넣는다. 틀린 키도 사전이 결과 없음과 같은 빈 본문을 주므로(2026-10-29 확인) 앱은 틀린 키를 못 가린다. 그래서 봉인 스크립트가 봉인 전에 그 키로 「나무」를 찾아보고, 결과가 없으면 봉인하지 않는다.

## 바꿀 파일

- `infra/server/seal-secrets.sh` — `stdict` 종류 하나. `gms` 와 같은 모양이다
  - TTY 확인 → 키를 `read -rs` 로 묻는다(화면에 안 보임) → 공백 지우기 → 16진수 32자리인지 본다(공식 안내의 키 모양)
  - 봉인 전에 `curl -K -`(설정을 표준 입력으로 넘겨 키가 `ps` 에 안 보임)로 `search.do?key=…&q=나무&req_type=json` 을 부른다. HTTP 200 이고 본문에 `"word"` 가 있어야 통과한다. 아니면 봉인하지 않고 끝낸다(본문은 찍지 않고 길이만)
  - `printf '%s' "$key" | seal stdict-api app STDICT_API_KEY "$OUT/sealed-stdict-api.yaml"` → 가져올 자리와 `rollout restart` 안내를 찍는다
  - 머리 주석 목록에 한 줄을 더한다. `usage()` 가 읽는 줄 범위(`5,13p`)도 함께 고친다
- `infra/k8s/services/app/backend.yaml` — env `STDICT_API_KEY` = `secretKeyRef` `stdict-api` / `STDICT_API_KEY`, `optional: true`. 봉인 전에는 비어서 지금처럼 502 다(출입증과 같은 「닫힌 채로 시작」)
- `infra/server/README.md` — 14줄 목록에 `stdict` 를 더하고, 봉인 · 가져오기 · 다시 띄우기 세 명령을 짧은 절로 적는다
- 이 계획 파일

봉인 파일(`infra/k8s/services/app/sealed-stdict-api.yaml`)과 `kustomization.yaml` 의 `resources` 한 줄은 사용자가 EC2 에서 봉인한 뒤에 더한다. MR 이 머지되기 전이면 같은 MR 에, 뒤면 새 MR 에 넣는다. 파일 없이 `resources` 에 먼저 넣으면 kustomize 가 실패하기 때문이다.

## 작업 순서

- [ ] 스크립트 · `backend.yaml` · README 를 고친 뒤 infra 검사(`.claude/stack.md` §3 infra 의 포맷 · 린트 · 테스트, 셸 문법 `bash -n`)
- [ ] 커밋 · push → MR(→ infra) → 파이프라인 통과
- [ ] 사용자가 한다(값을 물어 TTY 가 필요하다): ① 새 스크립트를 EC2 로 보내기 ② `ssh -t … "bash infra/server/seal-secrets.sh stdict"` ③ 봉인 파일 가져오기. 명령은 한 줄씩, 어디서 돌리는지와 끝 표시까지 안내한다
- [ ] 봉인 파일 + `resources` 한 줄을 커밋 → 파이프라인 → (머지 · 배포 뒤) `kubectl -n app rollout restart deploy/backend` 는 사용자가 한다

## 안 바꿀 것

- backend 코드 · MR !359(용어사전 기능), 다른 Secret · 다른 Deployment, NetworkPolicy(backend 는 나가는 길 정책이 없어 막히지 않는다), Envoy 길
- `.env`, 키 값 — 저장소 · 대화 · 로그 어디에도 적지 않는다
- 머지 · 배포 · 클러스터 명령은 사용자 지시 뒤, 사용자가 돌린다

## 리스크

- 확인 요청이 사전 하루 한도(50,000건)에서 1건을 쓴다 — 무시할 만하다
- 사이트 backend 이미지에 A19 가 아직 없으면(MR !359 머지 · 배포 전) env 가 들어가도 아무 일이 없다. 해롭지 않다
- EC2 에서 바깥(stdict.korean.go.kr)으로 나가는 HTTPS 가 막혀 있으면 확인 단계에서 끝난다 — 그때 원인을 보고 다시 묻는다. `gms` 가 같은 방식으로 EC2 에서 바깥을 불렀다
- 봉인은 Secret 이름 · 네임스페이스(`stdict-api` · `app`)에 묶인다 — `backend.yaml` 의 이름과 같아야 한다. 시험 대신 문자열을 맞춰 본다

## 어떻게 검증하나

- infra 포맷 · 린트(셸 `bash -n` 포함) · 테스트 통과 — 숫자로 보고
- 스크립트의 확인 단계는 가짜 키(0 32자)로 EC2 밖에서도 돌려 볼 수 있다: 확인 함수 부분만 떼어 관리자 PC 에서 돌리면 「봉인하지 않음」으로 끝나야 한다. 진짜 키 확인은 사용자가 EC2 에서 돌릴 때 「키 확인 — 「나무」 결과를 받았다」가 찍히는지로 본다
- 배포 뒤: `kubectl -n app get secret stdict-api`(읽기, Claude) · 사이트 `GET /api/v1/dictionary?q=나무` 가 200 과 `items` 를 주는지(GET 만). A19 가 배포된 뒤에만 확인할 수 있다
- MR 파이프라인 통과

## 되돌리는 법

- 이 MR 을 revert 한다. `optional: true` 라 Secret 이 없어도 backend 는 뜬다
- 키를 바꾸거나 끊으려면: 사전 사이트에서 키를 「삭제」 → 새로 받기 → 다시 봉인. 봉인 파일만 바꿔 커밋하고 backend 를 다시 띄운다
