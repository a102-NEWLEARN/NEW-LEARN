"""배포 태그 MR — dev 파이프라인에서 이미지를 GHCR 에 올린 영역만 배포 설정의 태그를 바꾸는 MR 을 연다 (Jira S15P31A102-105)

.gitlab-ci.yml 의 w5:deploy-mr 잡이 부른다. 머지는 사람이 하고, 머지되면 Argo CD 가 사이트에 반영한다 (SSOT.md 6절 「배포 흐름」)

- 무엇을 바꾸나: infra/k8s/services/<app|ai>/kustomization.yaml 의 images[].newTag 한 줄
- 어디로: kustomization 마다 고정 브랜치(deploy/app · deploy/ai)를 dev 위에 새로 덮어쓰고, 열린 MR 이 있으면 그 MR 을 갱신한다
  — 같은 파일을 바꾸는 MR 이 여러 개 쌓여 서로 부딪히지 않게
- 덮어써도 잃지 않는 것: 열린 MR 브랜치에서 아직 dev 에 안 들어간 태그는 이어 받는다. 영역 둘이 브랜치 하나를 같이 써서,
  뒤에 온 파이프라인이 먼저 대기하던 영역의 태그를 지웠다 (2026-11-05 태그 MR !677, Jira S15P31A102-174). 닫은 MR 의 태그는 잇지 않는다
- 무엇을 믿나: w4 굽기 잡이 「올리기에 성공한 영역」만 dotenv 로 DEPLOY_TAG_<영역>=<짧은 SHA> 를 남긴다. 실패한 잡은 남기지 않는다
- 늦게 끝난 옛 파이프라인이 새 태그를 덮지 않게, dev 의 태그나 대기 중인 태그가 이 커밋보다 새것이면 건너뛴다

표준 라이브러리만 쓴다 — 잡 이미지는 python slim 이다
"""

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# 영역 → (배포 설정 폴더, 이미지 이름 끝). 폴더 하나에 영역이 여럿이면 MR 하나로 묶는다
AREAS = {
    "backend": "app",
    "frontend": "app",
    "ai": "ai",
}
KUSTOMIZATION = "infra/k8s/services/{group}/kustomization.yaml"


def env(name, required=True):
    value = os.environ.get(name, "")
    if required and not value:
        sys.exit(f"❌ {name} 가 없다")
    return value


API = env("CI_API_V4_URL")
PROJECT = env("CI_PROJECT_ID")
DEFAULT_BRANCH = env("CI_DEFAULT_BRANCH")
COMMIT_SHA = env("CI_COMMIT_SHA")
PIPELINE_URL = env("CI_PIPELINE_URL")
IMAGE_PREFIX = env("IMAGE_PREFIX")  # ghcr.io/<주인>/newlearn


def request(method, url, *, headers=None, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read()
            return res.status, raw
    except urllib.error.HTTPError as err:
        # 4xx · 5xx 도 상태 코드로 돌려주고 판단은 부른 쪽에서
        return err.code, err.read()


def gitlab(method, path, data=None):
    status, raw = request(
        method,
        f"{API}/projects/{PROJECT}{path}",
        headers={"PRIVATE-TOKEN": env("DEPLOY_MR_TOKEN")},
        data=data,
    )
    if status not in (200, 201):
        # 토큰 값은 찍지 않는다 — 응답 본문만
        sys.exit(f"❌ GitLab {method} {path} → {status} {raw[:300]!r}")
    return json.loads(raw) if raw else None


def ghcr_has(image, tag):
    """GHCR 에 그 태그가 정말 있는지 — w4 가 성공했어도 확인한다 (2026-10-22 MR 파이프라인 태그를 적었다가 ImagePullBackOff)"""
    repo = image.removeprefix("ghcr.io/")
    basic = base64.b64encode(f"{env('GHCR_USER')}:{env('GHCR_TOKEN')}".encode()).decode()
    query = urllib.parse.urlencode({"scope": f"repository:{repo}:pull", "service": "ghcr.io"})
    status, raw = request("GET", f"https://ghcr.io/token?{query}", headers={"Authorization": f"Basic {basic}"})
    if status != 200:
        sys.exit(f"❌ GHCR 토큰을 못 받았다 → {status}")
    token = json.loads(raw)["token"]
    accept = ", ".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    status, _ = request(
        "HEAD",
        f"https://ghcr.io/v2/{repo}/manifests/{tag}",
        headers={"Authorization": f"Bearer {token}", "Accept": accept},
    )
    return status == 200


def read_file(path, ref):
    quoted = urllib.parse.quote(path, safe="")
    status, raw = request(
        "GET",
        f"{API}/projects/{PROJECT}/repository/files/{quoted}/raw?ref={urllib.parse.quote(ref, safe='')}",
        headers={"PRIVATE-TOKEN": env("DEPLOY_MR_TOKEN")},
    )
    if status != 200:
        sys.exit(f"❌ {path} 를 {ref} 에서 못 읽었다 → {status}")
    return raw.decode()


def areas_in(group):
    return [area for area, area_group in AREAS.items() if area_group == group]


def tag_pattern(image):
    # 따옴표가 있든 없든 읽는다 — 따옴표를 쓰기 전에 만든 파일도 읽게
    return re.compile(r"(- name: " + re.escape(image) + r'\n\s+newTag: )"?([0-9a-f]+)"?')


def read_tag(content, image):
    """kustomization 에서 그 이미지의 지금 태그. 없으면 None"""
    found = tag_pattern(image).search(content)
    return found.group(2) if found else None


def write_tag(content, image, tag):
    """그 이미지의 태그 한 줄만 바꾼다. 늘 따옴표로 — 커밋 번호가 숫자로만 되면(19187037) YAML 이 숫자로 읽어
    kustomize 가 실패한다 (2026-10-24 태그 MR !126, Jira S15P31A102-108)"""
    return tag_pattern(image).sub(lambda m: m.group(1) + f'"{tag}"', content, count=1)


def is_newer_or_same(current, new):
    """배포 태그 current(짧은 SHA)가 new(짧은 SHA · 전체 SHA 다 된다)와 같거나 그 뒤의 커밋이면 True. 비교를 못 하면 False — new 를 새것으로 본다"""
    q = urllib.parse.urlencode([("refs[]", current), ("refs[]", new)])
    status, raw = request(
        "GET",
        f"{API}/projects/{PROJECT}/repository/merge_base?{q}",
        headers={"PRIVATE-TOKEN": env("DEPLOY_MR_TOKEN")},
    )
    if status != 200:
        print(f"  ⚠️ {current} 와 {new} 의 공통 조상을 못 찾았다({status}) — {new} 를 새것으로 본다")
        return False
    # new 가 current 의 조상이면 current 가 더 새것이다. 답은 전체 SHA 라 앞자리로 맞춘다
    return json.loads(raw)["id"].startswith(new)


def waiting_tags(group, on_dev, on_branch):
    """열린 MR 브랜치의 태그 가운데 아직 dev 에 안 들어간 것. 비교를 못 하면 대기로 둔다 — 조용히 사라지지 않게"""
    waiting = {}
    for area in areas_in(group):
        image = f"{IMAGE_PREFIX}-{area}"
        dev_tag = read_tag(on_dev, image)
        tag = read_tag(on_branch, image)
        if dev_tag and tag and tag != dev_tag and not is_newer_or_same(dev_tag, tag):
            waiting[area] = tag
    return waiting


def main():
    built = {area: os.environ.get(f"DEPLOY_TAG_{area}", "") for area in AREAS}
    built = {area: tag for area, tag in built.items() if tag}
    if not built:
        print("이 파이프라인에서 GHCR 에 올린 영역이 없다 — 할 일 없음")
        return
    print("올린 영역:", ", ".join(f"{a} {t}" for a, t in built.items()))

    for area, tag in built.items():
        image = f"{IMAGE_PREFIX}-{area}"
        if not ghcr_has(image, tag):
            sys.exit(f"❌ {image}:{tag} 가 GHCR 에 없다 — 태그 MR 을 열지 않는다")
        print(f"  GHCR 에 있음: {image}:{tag}")

    head = gitlab("GET", f"/repository/branches/{urllib.parse.quote(DEFAULT_BRANCH, safe='')}")["commit"]["id"]

    for group in sorted(set(AREAS[a] for a in built)):
        path = KUSTOMIZATION.format(group=group)
        branch = f"deploy/{group}"
        content = read_file(path, head)
        opened = gitlab(
            "GET",
            "/merge_requests?state=opened&source_branch="
            + urllib.parse.quote(branch, safe="")
            + "&target_branch="
            + urllib.parse.quote(DEFAULT_BRANCH, safe=""),
        )
        # 닫힌 MR 의 브랜치는 읽지 않는다 — 사람이 버린 태그다
        waiting = waiting_tags(group, content, read_file(path, branch)) if opened else {}
        changes = []
        fresh = []  # 이번 파이프라인이 구운 태그 가운데 새로 들어가는 영역
        for area in areas_in(group):
            image = f"{IMAGE_PREFIX}-{area}"
            current = read_tag(content, image)
            new = waiting.get(area)
            tag = built.get(area)
            if tag:
                if current is None:
                    sys.exit(f"❌ {path} 에 {image} 의 newTag 가 없다")
                if current == tag or is_newer_or_same(current, COMMIT_SHA):
                    print(f"  {area}: 지금 {current} 가 같거나 더 새것 — 건너뜀")
                elif new and is_newer_or_same(new, COMMIT_SHA):
                    print(f"  {area}: 열린 MR 의 {new} 가 같거나 더 새것 — 건너뜀")
                else:
                    new = tag
                    fresh.append(area)
            if new is None:
                continue
            content = write_tag(content, image, new)
            changes.append((area, current, new))
        if not changes:
            print(f"{group}: 바꿀 것 없음")
            continue

        summary = ", ".join(f"{a} {old} → {new}" for a, old, new in changes)
        title = f"chore(infra): {group} 배포 — " + ", ".join(f"{a} {new}" for a, _, new in changes)
        description = "\n".join(
            [
                "## 🔗 관련 이슈",
                "",
                "- Jira: 없음 — CI 가 연 배포 태그 MR (`w5:deploy-mr`, Jira S15P31A102-105 에서 만듦)",
                "",
                "## 📝 작업 내용",
                "",
                f"dev 에서 구워 GHCR 에 올린 이미지로 `{path}` 의 태그를 바꿉니다. 머지하면 Argo CD 가 사이트에 반영합니다.",
                "",
                *[
                    f"- {a}: `{old}` → `{new}`" + ("" if new == built.get(a) else " — 앞선 파이프라인에서 구움")
                    for a, old, new in changes
                ],
                "",
                f"이번에 구운 파이프라인: {PIPELINE_URL}",
                "",
                "## 🧪 테스트 방법",
                "",
                "- GHCR 에 태그가 있는 것을 그 태그를 올린 파이프라인의 이 잡이 확인했습니다",
                "- 머지 뒤: `https://newlearn.io.kr/actuator/health` 가 UP, Argo CD 앱이 Synced · Healthy",
                "",
                "## 👀 리뷰 포인트",
                "",
                "- 위 영역은 같이 반영됩니다. 한 영역을 빼려면 이 MR 을 닫습니다 — 닫은 MR 의 태그는 이어 받지 않고, 다음 굽기가 새로 엽니다",
                "- 되돌리는 법: 이 MR 의 병합 커밋 Revert — Argo CD 가 위 영역을 함께 이전 이미지로 돌린다",
                "- 이 브랜치는 다음 dev 굽기 때 CI 가 다시 덮어씁니다. 머지하지 않은 태그는 이어 받습니다. 손으로 커밋하지 않습니다",
            ]
        )
        if fresh:
            # 고정 브랜치를 지금 dev 위에 새로 덮어쓴다 — 옛 태그 커밋은 버린다. 대기 태그는 content 에 이어 받았다
            gitlab(
                "POST",
                "/repository/commits",
                {
                    "branch": branch,
                    "start_branch": DEFAULT_BRANCH,
                    "force": True,
                    "commit_message": f"chore(infra): {group} 배포 태그 — {summary}",
                    "actions": [{"action": "update", "file_path": path, "content": content}],
                },
            )
        elif opened[0]["title"] == title:
            # changes 가 모두 이어 받은 것이라 열린 MR 이 있다. 제목이 다르면 앞선 잡이 커밋 뒤에 죽은 것 — 아래에서 바로잡는다
            print(f"{group}: 새로 넣을 태그 없음 — 열린 MR !{opened[0]['iid']} 그대로")
            continue
        if opened:
            iid = opened[0]["iid"]
            gitlab("PUT", f"/merge_requests/{iid}", {"title": title, "description": description})
            print(f"{group}: 열린 MR !{iid} 를 갱신 — {summary}")
        else:
            mr = gitlab(
                "POST",
                "/merge_requests",
                {
                    "source_branch": branch,
                    "target_branch": DEFAULT_BRANCH,
                    "title": title,
                    "description": description,
                    "remove_source_branch": True,
                },
            )
            print(f"{group}: MR !{mr['iid']} 를 열었다 — {summary} — {mr['web_url']}")


if __name__ == "__main__":
    main()
