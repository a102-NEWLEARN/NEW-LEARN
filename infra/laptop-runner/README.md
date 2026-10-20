# 노트북 러너 — 켜져 있을 때 더해지는 「큰 러너」

EC2 러너(관리 서버, 자리 1 · 잡 CPU 상한 1)가 늘 켜진 기본 러너이고, 이 러너는 노트북이 켜져 있을 때만 더해진다.
같은 `.gitlab-ci.yml` 잡이 두 러너 어디서든 돈다. 어느 러너가 받을지는 고를 수 없다 — 먼저 비는 쪽이 받는다.
왜 이렇게 두는지는 `SSOT.md` 6절 「CI 파이프라인」, 계획은 `docs/plans/2026-10-20-ci-pipeline.md`.

| | 값 |
|---|---|
| 실행 방식 | Docker Desktop 안의 `gitlab/gitlab-runner` 컨테이너 → 잡마다 Docker 컨테이너 (Docker executor) |
| 동시에 받는 잡 | 2 |
| 잡 하나 상한 | CPU 4 · 메모리 4g, 서비스(DB · Redis) 하나 CPU 1 · 메모리 1g |
| 잡 시간 상한 | 20분 (GitLab 러너 설정) |
| 지키는 것 | 권한 없는 컨테이너(`privileged = false`), 호스트 폴더를 잡에 붙이지 않음, Docker 엔진 연결(`docker.sock`)은 러너 컨테이너에만 |

## 처음 한 번 — 등록

1. **GitLab 화면에서 러너 만들기** (Maintainer) — Settings › CI/CD › Runners › Create project runner

   | 칸 | 값 |
   |---|---|
   | Tags | 비움 |
   | Run untagged jobs | 켬 |
   | Runner description | `newlearn-laptop` |
   | Lock to current projects | 켬 |
   | Maximum job timeout | `1200` — 노트북을 덮으면 도는 잡이 이 시간까지 남는다 |

   「Create runner」 뒤 화면의 `glrt-` 토큰을 복사한다. 그 화면의 명령은 치지 않는다.

2. **등록** (노트북, 저장소 루트에서, 사람이 친다) — 토큰을 물으면 붙여 넣는다. 토큰은 Docker 볼륨 안 `config.toml` 에만 남는다

   ```bash
   docker compose -f infra/laptop-runner/compose.yaml run --rm runner register --template-config /templates/config.template.toml --url https://lab.ssafy.com --executor docker --docker-image alpine:3.24.2 --description newlearn-laptop
   ```

3. **동시 2개로** — 등록 틀은 전역 값을 못 넣어서 한 줄로 바꾼다

   ```bash
   docker compose -f infra/laptop-runner/compose.yaml run --rm --entrypoint sh runner -c "sed -i 's/^concurrent = .*/concurrent = 2/' /etc/gitlab-runner/config.toml"
   ```

## 켜기 · 끄기

| 할 일 | 명령 |
|---|---|
| 켜기 | `docker compose -f infra/laptop-runner/compose.yaml up -d` |
| 끄기 · 덮기 전 | `docker compose -f infra/laptop-runner/compose.yaml stop` — 도는 잡이 끝날 때까지 기다린다(최대 20분) |
| 상태 | `docker compose -f infra/laptop-runner/compose.yaml logs --tail 20 runner` |

Docker Desktop 을 켜 두면 러너도 다시 뜬다(`restart: unless-stopped`). 껐다면 다시 켤 때까지 꺼진 채다.

## 확인

| 무엇을 | 어디서 | 기대 |
|---|---|---|
| 등록 | GitLab Settings › CI/CD › Runners | `newlearn-laptop` 이 Online, `newlearn-ec2-k8s` 와 둘 |
| 잡을 받는지 | MR 파이프라인의 잡 화면 오른쪽 | Runner 가 `newlearn-laptop` 인 잡이 초록 |
| 상한 | 잡 로그 끝의 `cpu.max` | `400000 100000` (CPU 4) |

## 되돌리기

`docker compose -f infra/laptop-runner/compose.yaml down -v` 로 컨테이너와 설정 볼륨(토큰 포함)을 지우고, GitLab 화면에서 러너를 지운다.
잡 캐시 볼륨은 러너가 만든 것이라 따로 지운다 — `docker volume rm newlearn-ci-cache`
