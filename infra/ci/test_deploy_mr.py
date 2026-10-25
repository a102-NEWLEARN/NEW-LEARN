"""deploy_mr.py 의 태그 읽기 · 쓰기 (Jira S15P31A102-108)

커밋 번호가 숫자로만 되면(예: 19187037) 따옴표 없이 쓴 newTag 를 YAML 이 숫자로 읽어
kustomize 가 실패한다(2026-10-24, 태그 MR !126). 태그는 늘 따옴표로 쓰고, 옛 파일처럼
따옴표가 없어도 읽어야 한다.

표준 라이브러리만 쓴다: python3 -m unittest discover -s infra/ci
"""

import os
import unittest

# deploy_mr 는 불러올 때 CI 변수를 읽는다 — 시험에서는 가짜 값으로
for name in ("CI_API_V4_URL", "CI_PROJECT_ID", "CI_DEFAULT_BRANCH", "CI_COMMIT_SHA", "CI_PIPELINE_URL", "IMAGE_PREFIX"):
    os.environ.setdefault(name, "test")

import deploy_mr

BACKEND = "ghcr.io/kimzoo5676-del/newlearn-backend"
FRONTEND = "ghcr.io/kimzoo5676-del/newlearn-frontend"


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


if __name__ == "__main__":
    unittest.main()
