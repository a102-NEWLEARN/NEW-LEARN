# ai 워커 — 임베딩 모델 캐시 · GMS 키

ai 워커(`infra/k8s/services/ai/`)가 실제 모드(SSAFY GMS 호출 + 임베딩 BGE-m3-ko)로 돌 때 인프라가 갖추는 두 가지다. 왜 이렇게 두는지(이미지에 굽지 않는 까닭 · 자원 값 계산)는 `docs/plans/2026-10-26-ai-real-mode-infra.md`.

## 임베딩 모델 캐시

init 컨테이너 `model` 이 PVC `ai-model-cache`(`model-cache.yaml`)에 판(커밋)마다 폴더를 두고 한 번 받는다. 약 2.3GB, 첫 Pod 만 1분 안팎 더 걸린다. 앱은 고정 이름 링크 `/models/BGE-m3-ko` 로 읽고 허깅페이스에서 받지 않는다(`HF_HUB_OFFLINE=1`).

- 확인
  - `kubectl -n ai logs deploy/ai -c model` — 「받음: … (N초)」 또는 「있음: …」
  - `kubectl -n ai exec deploy/ai -c ai -- sh -c 'ls -l /models; du -sh /models/BGE-m3-ko/'`
- 판 바꾸기: `ai.yaml` 의 `MODEL_REVISION` 을 바꾸는 MR. 새 폴더에 받은 뒤 링크를 바꿔 끼운다. 옛 Pod 는 이미 읽은 모델로 돈다
- 옛 판 지우기: 링크가 새 판을 가리키는지 본 뒤 `kubectl -n ai exec deploy/ai -c ai -- rm -rf /models/BGE-m3-ko-<옛 커밋>`
- PVC 를 지우면 PV 와 워커 폴더가 남는다(Retain). 새 PVC 는 처음부터 다시 받는다. 남은 것은 `kubectl delete pv <이름>` 과 워커의 `/var/lib/newlearn/local-path/pvc-…_ai_ai-model-cache` 로 지운다

## GMS 키

실제 모드로 바꿀 때 한 번 (관리자 PC 에서 — 값을 묻는다). 스크립트가 클러스터의 ai Deployment 에서 GMS 주소(`GMS_BASE_URL`)를 읽고, 그 키로 `GET /models` 가 200 인지 본 뒤 `ai` 에 봉인한다. 그래서 `GMS_BASE_URL` 이 든 `ai.yaml` 이 반영된 뒤에 돌린다.

```bash
ssh -t ubuntu@<EC2 탄력적 IP> "bash infra/server/seal-secrets.sh gms"
ssh ubuntu@<EC2 탄력적 IP> 'cat ~/sealed/sealed-gms-api.yaml' > infra/k8s/services/ai/sealed-gms-api.yaml
```

그 MR 에서 `kustomization.yaml` 에 봉인 파일을 더하고, `ai.yaml` 에 `GMS_API_KEY`(`secretKeyRef` `gms-api` / `GMS_API_KEY`) · `LLM_MODE=gms` 를 넣는다. 키를 바꿀 때도 같다.
