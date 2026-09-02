import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import android_beta as beta


class SourceGuardTests(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40

    def test_non_main_and_other_repository(self):
        for ref, repo in [("refs/heads/feature", beta.REPO), ("refs/tags/main", beta.REPO), ("refs/heads/main", "someone/fork")]:
            with self.assertRaises(ValueError):
                beta.guard(self.sha, ref, repo)

    def test_rejects_shell_input_short_and_missing_sha(self):
        for sha in ("", "main", "abc123", "a" * 40 + "; echo bad"):
            with self.assertRaises(ValueError):
                beta.guard(sha, "refs/heads/main", beta.REPO)

    def test_unreachable_commit(self):
        with patch.object(beta, "run", side_effect=["", ValueError("not on main")]):
            with self.assertRaises(ValueError):
                beta.guard(self.sha, "refs/heads/main", beta.REPO)

    def test_wrong_checkout(self):
        with patch.object(beta, "run", side_effect=["", "", "b" * 40]):
            with self.assertRaises(ValueError):
                beta.guard(self.sha, "refs/heads/main", beta.REPO)

    def test_exact_reachable_source(self):
        with patch.object(beta, "run", side_effect=["", "", self.sha]):
            beta.guard(self.sha, "refs/heads/main", beta.REPO)

    def test_workflow_gates_signing_on_tests_and_no_public_artifacts(self):
        workflow = (beta.ROOT / ".github/workflows/android-beta.yml").read_text()
        self.assertIn("needs: test", workflow)
        self.assertIn("testDebugUnitTest compileDebugAndroidTestKotlin", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertNotIn("upload-artifact", workflow)
        self.assertNotIn("pull_request_target", workflow)
        self.assertNotIn("schedule:", workflow)
        self.assertNotIn("push:", workflow)
        self.assertEqual(1, workflow.count("bundle exec fastlane android build"))
        test_job = workflow.split("  test:", 1)[1].split("  release:", 1)[0]
        self.assertNotIn("secrets.", test_job)
        self.assertNotIn("id-token: write", test_job)


if __name__ == "__main__":
    unittest.main()
