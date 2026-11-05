"""deploy_mr.py 의 태그 읽기 · 쓰기 (Jira S15P31A102-108) · 열린 MR 브랜치에서 이어 받기 (Jira S15P31A102-174)

커밋 번호가 숫자로만 되면(예: 19187037) 따옴표 없이 쓴 newTag 를 YAML 이 숫자로 읽어
kustomize 가 실패한다(2026-10-24, 태그 MR !126). 태그는 늘 따옴표로 쓰고, 옛 파일처럼
따옴표가 없어도 읽어야 한다.

영역 둘이 브랜치 하나(deploy/app)를 같이 쓴다. 뒤에 온 파이프라인이 덮어써도 먼저 대기하던 영역의
태그가 사라지면 안 된다(2026-11-05, 태그 MR !677 에서 frontend 태그가 사라졌다).

표준 라이브러리만 쓴다: python3 -m unittest discover -s infra/ci
"""

import contextlib
import io
import json
import os
import unittest
import urllib.parse
from unittest import mock

# deploy_mr 는 불러올 때 CI 변수를 읽는다 — 시험에서는 가짜 값으로
for name in ("CI_API_V4_URL", "CI_PROJECT_ID", "CI_DEFAULT_BRANCH", "CI_COMMIT_SHA", "CI_PIPELINE_URL", "IMAGE_PREFIX"):
    os.environ.setdefault(name, "test")

import deploy_mr

IMAGE_PREFIX = "ghcr.io/kimzoo5676-del/newlearn"
BACKEND = f"{IMAGE_PREFIX}-backend"
FRONTEND = f"{IMAGE_PREFIX}-frontend"
AI = f"{IMAGE_PREFIX}-ai"


def kustomization(backend_tag, frontend_tag):
    return f"""images:
  - name: {BACKEND}
    newTag: {backend_tag}
  - name: {FRONTEND}
    newTag: {frontend_tag}
"""


class ReadTag(unittest.TestCase):
    def test_reads_tag_without_quotes(self):
        content = kustomization("6977dbb7", "3f262b3f")
        self.assertEqual(deploy_mr.read_tag(content, BACKEND), "6977dbb7")

    def test_reads_tag_in_quotes(self):
        content = kustomization('"19187037"', '"3f262b3f"')
        self.assertEqual(deploy_mr.read_tag(content, BACKEND), "19187037")
        self.assertEqual(deploy_mr.read_tag(content, FRONTEND), "3f262b3f")

    def test_missing_image_reads_none(self):
        content = kustomization("6977dbb7", "3f262b3f")
        self.assertIsNone(deploy_mr.read_tag(content, "ghcr.io/kimzoo5676-del/newlearn-ai"))


class WriteTag(unittest.TestCase):
    def test_writes_tag_in_quotes(self):
        content = kustomization("6977dbb7", "3f262b3f")
        written = deploy_mr.write_tag(content, BACKEND, "19187037")
        self.assertIn(f'- name: {BACKEND}\n    newTag: "19187037"\n', written)

    def test_replaces_quoted_tag_without_doubling_quotes(self):
        content = kustomization('"19187037"', '"3f262b3f"')
        written = deploy_mr.write_tag(content, BACKEND, "4c90ab87")
        self.assertIn(f'- name: {BACKEND}\n    newTag: "4c90ab87"\n', written)
        self.assertNotIn('""', written)

    def test_leaves_other_image_alone(self):
        content = kustomization("6977dbb7", "3f262b3f")
        written = deploy_mr.write_tag(content, BACKEND, "19187037")
        self.assertIn(f"- name: {FRONTEND}\n    newTag: 3f262b3f\n", written)


# 이력은 한 줄이다 — 앞이 옛 커밋. 태그는 커밋 번호 앞 8자
B0, F0, F1, B1, F2, B2, BOTH, A0, A1 = (
    "b0b0b0b0",
    "f0f0f0f0",
    "f1f1f1f1",
    "b1b1b1b1",
    "f2f2f2f2",
    "b2b2b2b2",
    "c3c3c3c3",
    "a0a0a0a0",
    "a1a1a1a1",
)
HISTORY = [B0, F0, A0, F1, B1, F2, B2, BOTH, A1]


def full(tag):
    return tag + "0" * 32


def title_of(*pairs):
    return "chore(infra): app 배포 — " + ", ".join(f"{area} {tag}" for area, tag in pairs)


class FakeGitLab:
    """main 이 부르는 GitLab API 만 흉내 낸다. 태그 커밋은 HISTORY 한 줄이라 공통 조상은 앞선 쪽이다"""

    def __init__(self, dev_file, branch_file=None, open_title=None, merge_base_broken=False, branch="deploy/app"):
        self.files = {"head": dev_file, branch: branch_file}
        self.opened = {branch: [{"iid": 7, "title": open_title}]} if open_title else {}
        self.merge_base_broken = merge_base_broken
        self.read_refs = []
        self.commits = []
        self.updates = []
        self.created = []

    def __call__(self, method, url, *, headers=None, data=None):
        parts = urllib.parse.urlsplit(url)
        query = urllib.parse.parse_qs(parts.query)
        path = parts.path
        if path.endswith("/repository/merge_base"):
            return self.merge_base(query["refs[]"])
        if "/repository/branches/" in path:
            return 200, json.dumps({"commit": {"id": "head"}}).encode()
        if "/repository/files/" in path:
            ref = query["ref"][0]
            self.read_refs.append(ref)
            content = self.files.get(ref)
            return (200, content.encode()) if content is not None else (404, b"{}")
        if path.endswith("/repository/commits"):
            self.commits.append(data)
            return 201, b"{}"
        if path.endswith("/merge_requests") and method == "GET":
            return 200, json.dumps(self.opened.get(query["source_branch"][0], [])).encode()
        if path.endswith("/merge_requests") and method == "POST":
            self.created.append(data)
            return 201, json.dumps({"iid": 8, "web_url": "https://gitlab.test/8"}).encode()
        if "/merge_requests/" in path and method == "PUT":
            self.updates.append(data)
            return 200, b"{}"
        raise AssertionError(f"흉내 내지 않은 호출: {method} {url}")

    def merge_base(self, refs):
        if self.merge_base_broken:
            return 400, b"{}"
        found = [tag for tag in HISTORY for ref in refs if full(tag).startswith(ref)]
        if len(found) != len(refs):
            return 400, b"{}"
        return 200, json.dumps({"id": full(found[0])}).encode()


class DeployMrCase(unittest.TestCase):
    def setUp(self):
        # CI 의 w12:infra 잡에서는 CI_* 가 실제 값이고 IMAGE_PREFIX 만 가짜다 — 모듈 상수를 여기서 고정한다
        constants = mock.patch.multiple(
            deploy_mr,
            API="https://gitlab.test/api/v4",
            PROJECT="1",
            DEFAULT_BRANCH="dev",
            PIPELINE_URL="https://gitlab.test/pipelines/1",
            IMAGE_PREFIX=IMAGE_PREFIX,
            ghcr_has=lambda image, tag: True,
        )
        constants.start()
        self.addCleanup(constants.stop)
        token = mock.patch.dict(os.environ, {"DEPLOY_MR_TOKEN": "test"})
        token.start()
        self.addCleanup(token.stop)

    def run_main(self, gitlab, commit, **built):
        """commit 을 구운 파이프라인의 w5:deploy-mr 잡. built 는 영역=태그. 출력은 받아 둔다 — 이 PC 파이프는 cp949 라 경고 기호에서 죽는다"""
        tags = {f"DEPLOY_TAG_{area}": built.get(area, "") for area in deploy_mr.AREAS}
        with (
            mock.patch.multiple(deploy_mr, COMMIT_SHA=full(commit), request=gitlab),
            mock.patch.dict(os.environ, tags),
            contextlib.redirect_stdout(io.StringIO()) as out,
        ):
            deploy_mr.main()
        return out.getvalue()

    def written(self, gitlab):
        self.assertEqual(len(gitlab.commits), 1)
        return gitlab.commits[0]["actions"][0]["content"]


class KeepWaitingTag(DeployMrCase):
    def waiting_frontend(self, **kwargs):
        """!677 과 같은 판: 열린 MR 에 frontend 가 대기 중"""
        return FakeGitLab(
            kustomization(B0, F0),
            kustomization(B0, F1),
            open_title=title_of(("frontend", F1)),
            **kwargs,
        )

    def test_backend_pipeline_keeps_waiting_frontend_tag(self):
        gitlab = self.waiting_frontend()
        self.run_main(gitlab, B1, backend=B1)
        content = self.written(gitlab)
        self.assertEqual(deploy_mr.read_tag(content, BACKEND), B1)
        self.assertEqual(deploy_mr.read_tag(content, FRONTEND), F1)

    def test_title_body_and_commit_message_name_every_area(self):
        gitlab = self.waiting_frontend()
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(len(gitlab.updates), 1)
        update = gitlab.updates[0]
        self.assertEqual(update["title"], title_of(("backend", B1), ("frontend", F1)))
        self.assertIn(f"- backend: `{B0}` → `{B1}`\n", update["description"])
        self.assertIn(f"- frontend: `{F0}` → `{F1}` — 앞선 파이프라인에서 구움\n", update["description"])
        message = gitlab.commits[0]["commit_message"]
        self.assertIn(f"backend {B0} → {B1}", message)
        self.assertIn(f"frontend {F0} → {F1}", message)

    def test_keeps_waiting_tag_when_cannot_compare(self):
        gitlab = self.waiting_frontend(merge_base_broken=True)
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), FRONTEND), F1)

    def test_stops_before_overwriting_when_branch_cannot_be_read(self):
        gitlab = FakeGitLab(kustomization(B0, F0), None, open_title=title_of(("frontend", F1)))
        with self.assertRaises(SystemExit):
            self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(gitlab.commits, [])

    def test_late_old_pipeline_does_not_replace_newer_waiting_tag(self):
        gitlab = FakeGitLab(
            kustomization(B0, F0),
            kustomization(B0, F2),
            open_title=title_of(("frontend", F2)),
        )
        self.run_main(gitlab, F1, frontend=F1)
        self.assertEqual(gitlab.commits, [])
        self.assertEqual(gitlab.updates, [])

    def test_rerunning_the_job_changes_nothing(self):
        gitlab = FakeGitLab(
            kustomization(B0, F0),
            kustomization(B1, F1),
            open_title=title_of(("backend", B1), ("frontend", F1)),
        )
        self.run_main(gitlab, F1, frontend=F1)
        self.assertEqual(gitlab.commits, [])
        self.assertEqual(gitlab.updates, [])

    def test_rerun_fixes_title_when_earlier_job_died_after_commit(self):
        gitlab = FakeGitLab(
            kustomization(B0, F0),
            kustomization(B1, F1),
            open_title=title_of(("frontend", F1)),
        )
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(gitlab.commits, [])
        self.assertEqual(len(gitlab.updates), 1)
        self.assertEqual(gitlab.updates[0]["title"], title_of(("backend", B1), ("frontend", F1)))


class DoesNotKeepTag(DeployMrCase):
    def test_closed_mr_branch_is_not_read(self):
        gitlab = FakeGitLab(kustomization(B0, F0), kustomization(B0, F1))
        self.run_main(gitlab, B1, backend=B1)
        self.assertNotIn("deploy/app", gitlab.read_refs)
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), FRONTEND), F0)
        self.assertEqual(gitlab.created[0]["title"], title_of(("backend", B1)))

    def test_drops_waiting_tag_when_dev_is_newer(self):
        gitlab = FakeGitLab(
            kustomization(B0, F2),
            kustomization(B0, F1),
            open_title=title_of(("frontend", F1)),
        )
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), FRONTEND), F2)
        self.assertEqual(gitlab.updates[0]["title"], title_of(("backend", B1)))

    def test_drops_waiting_tag_that_dev_already_has(self):
        gitlab = FakeGitLab(
            kustomization(B0, F1),
            kustomization(B0, F1),
            open_title=title_of(("frontend", F1)),
        )
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(gitlab.updates[0]["title"], title_of(("backend", B1)))

    def test_newer_pipeline_replaces_waiting_tag_of_same_area(self):
        gitlab = FakeGitLab(
            kustomization(B0, F0),
            kustomization(B0, F1),
            open_title=title_of(("frontend", F1)),
        )
        self.run_main(gitlab, F2, frontend=F2)
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), FRONTEND), F2)
        self.assertIn(f"- frontend: `{F0}` → `{F2}`\n", gitlab.updates[0]["description"])

    def test_no_waiting_tag_when_image_is_missing_from_branch_file(self):
        only_backend = f"images:\n  - name: {BACKEND}\n    newTag: {B0}\n"
        gitlab = FakeGitLab(kustomization(B0, F0), only_backend, open_title=title_of(("backend", B0)))
        self.run_main(gitlab, B1, backend=B1)
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), FRONTEND), F0)
        self.assertEqual(gitlab.updates[0]["title"], title_of(("backend", B1)))

    def test_no_waiting_tag_when_image_is_missing_from_dev_file(self):
        only_backend = f"images:\n  - name: {BACKEND}\n    newTag: {B0}\n"
        gitlab = FakeGitLab(only_backend, kustomization(B0, F1), open_title=title_of(("frontend", F1)))
        self.run_main(gitlab, B1, backend=B1)
        self.assertIsNone(deploy_mr.read_tag(self.written(gitlab), FRONTEND))
        self.assertEqual(gitlab.updates[0]["title"], title_of(("backend", B1)))

    def test_built_tag_older_than_dev_is_not_written(self):
        gitlab = FakeGitLab(kustomization(B0, F2))
        self.run_main(gitlab, F1, frontend=F1)
        self.assertEqual(gitlab.commits, [])
        self.assertEqual(gitlab.created, [])


class WithoutWaitingTag(DeployMrCase):
    def test_first_mr_title_and_commit_message_keep_their_shape(self):
        gitlab = FakeGitLab(kustomization(B0, F0))
        self.run_main(gitlab, B1, backend=B1)
        commit = gitlab.commits[0]
        self.assertEqual(commit["commit_message"], f"chore(infra): app 배포 태그 — backend {B0} → {B1}")
        self.assertEqual(commit["branch"], "deploy/app")
        self.assertEqual(commit["start_branch"], "dev")
        self.assertTrue(commit["force"])
        self.assertEqual(gitlab.created[0]["title"], title_of(("backend", B1)))
        self.assertEqual(gitlab.created[0]["source_branch"], "deploy/app")
        self.assertNotIn("앞선 파이프라인에서 구움", gitlab.created[0]["description"])

    def test_two_areas_built_together(self):
        gitlab = FakeGitLab(
            kustomization(B0, F0),
            kustomization(B0, F1),
            open_title=title_of(("frontend", F1)),
        )
        self.run_main(gitlab, BOTH, backend=BOTH, frontend=BOTH)
        content = self.written(gitlab)
        self.assertEqual(deploy_mr.read_tag(content, BACKEND), BOTH)
        self.assertEqual(deploy_mr.read_tag(content, FRONTEND), BOTH)
        self.assertNotIn("앞선 파이프라인에서 구움", gitlab.updates[0]["description"])

    def test_ai_goes_alone_on_its_own_branch(self):
        ai_file = f"images:\n  - name: {AI}\n    newTag: {A0}\n"
        gitlab = FakeGitLab(ai_file, branch="deploy/ai")
        self.run_main(gitlab, A1, ai=A1)
        self.assertEqual(gitlab.commits[0]["branch"], "deploy/ai")
        self.assertEqual(deploy_mr.read_tag(self.written(gitlab), AI), A1)
        self.assertEqual(gitlab.created[0]["title"], f"chore(infra): ai 배포 — ai {A1}")


class IsNewerOrSame(DeployMrCase):
    def compare(self, current, new):
        with mock.patch.object(deploy_mr, "request", FakeGitLab("")), contextlib.redirect_stdout(io.StringIO()):
            return deploy_mr.is_newer_or_same(current, new)

    def test_accepts_short_sha(self):
        self.assertTrue(self.compare(F1, F0))
        self.assertFalse(self.compare(F0, F1))
        self.assertTrue(self.compare(F1, F1))

    def test_accepts_full_sha(self):
        self.assertTrue(self.compare(F1, full(F0)))
        self.assertFalse(self.compare(F0, full(F1)))


if __name__ == "__main__":
    unittest.main()
