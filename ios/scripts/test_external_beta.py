"""Offline regressions for the external-only release boundary (no real API calls)."""

import argparse
import json
import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import asc_api
import external_beta


NOW = datetime(2026, 9, 8, 12, tzinfo=timezone.utc)


def build(number, *, version="1.0", state="IN_BETA_TESTING", **attributes):
    return {
        "id": str(number),
        "attributes": {
            "version": str(number), "processingState": "VALID", "expired": False,
            "buildAudienceType": "APP_STORE_ELIGIBLE", "minOsVersion": "17.0",
            "expirationDate": external_beta.timestamp(NOW + timedelta(days=30)), **attributes,
        },
        "testVersion": version, "testState": state,
    }


class FakeClient:
    def __init__(self, external=None, internal=None):
        self.groups = [
            {"id": "external", "attributes": {"isInternalGroup": False, "name": "Early Access"}},
            {"id": "internal", "attributes": {"isInternalGroup": True, "name": "Internal"}},
        ]
        self.group_builds = {"external": external or [], "internal": internal or []}
        self.pages = {}
        self.calls = []

    def app_id(self):
        return "app"

    def request(self, method, path, body=None):
        self.calls.append((method, path))
        if path in self.pages:
            return self.pages[path]
        if path == "/v1/apps/app/betaGroups?limit=200":
            return {"data": self.groups}
        if path.startswith("/v1/betaGroups/") and path.endswith("/builds?limit=200"):
            return {"data": self.group_builds[path.split("/")[3]]}
        if path.endswith("/preReleaseVersion"):
            item = self.find(path.split("/")[3])
            return {"data": {"attributes": {"version": item["testVersion"], "platform": "IOS"}}}
        if method == "POST":
            return {}
        raise AssertionError(f"Unexpected request {method} {path}")

    def find(self, build_id):
        return next(item for builds in self.group_builds.values() for item in builds if item["id"] == build_id)

    def beta_detail(self, build_id):
        return {"externalBuildState": self.find(build_id)["testState"]}

    def build(self, version, app_id=None):
        return self.find(version)

    def beta_group(self, name, app_id=None):
        return next(group for group in self.groups if group["attributes"]["name"] == name)


class ExternalBetaTests(unittest.TestCase):
    def manifest(self, client):
        result = external_beta.generate_manifest(client, now=NOW)
        self.assertEqual(result["channel"], "external")
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(external_beta.parse_date(result["validUntil"]), NOW + timedelta(hours=24))
        self.assertTrue(all(method == "GET" for method, _ in client.calls))
        return result

    def test_newer_internal_upload_never_advances_external_record(self):
        client = FakeClient([build(41)], [build(41), build(99)])
        self.assertEqual(self.manifest(client)["externalBuild"]["build"], "41")
        self.assertFalse(any("/betaGroups/internal/" in path for _, path in client.calls))

    def test_internal_only_with_no_external_build_publishes_no_update(self):
        self.assertIsNone(self.manifest(FakeClient(internal=[build(99)]))["externalBuild"])

    def test_review_ready_and_unknown_states_do_not_replace_available_build(self):
        for state in ("PROCESSING", "WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW", "BETA_REJECTED",
                      "READY_FOR_BETA_SUBMISSION", "READY_FOR_BETA_TESTING", "BETA_APPROVED",
                      "NOT_APPLICABLE", "EXPIRED", "future-unknown", None):
            with self.subTest(state=state):
                client = FakeClient([build(41), build(99, state=state)])
                self.assertEqual(self.manifest(client)["externalBuild"]["build"], "41")

    def test_only_valid_unexpired_external_eligible_builds_qualify(self):
        for override in ({"expired": True}, {"expired": None}, {"processingState": "PROCESSING"},
                         {"buildAudienceType": "INTERNAL_ONLY"}, {"buildAudienceType": None},
                         {"expirationDate": external_beta.timestamp(NOW)},
                         {"expirationDate": None}, {"expirationDate": "invalid"},
                         {"minOsVersion": None}, {"minOsVersion": "17.beta"}):
            with self.subTest(override=override):
                self.assertIsNone(self.manifest(FakeClient([build(99, **override)]))["externalBuild"])

    def test_numeric_version_and_build_ordering(self):
        client = FakeClient([build(9), build(10), build(2, version="1.1"), build(1, version="1.10")])
        self.assertEqual(self.manifest(client)["externalBuild"]["version"], "1.10")
        self.assertEqual(self.manifest(FakeClient([build(9), build(10)]))["externalBuild"]["build"], "10")

    def test_invalid_versions_fail_closed(self):
        for version in ("", "1.beta", "1.-2", "1.2.3.4", "1e3", " 42", "١", "1." ):
            with self.subTest(version=version):
                self.assertIsNone(external_beta.numeric_version(version))
                self.assertIsNone(self.manifest(FakeClient([build(99, version=version)]))["externalBuild"])

    def test_multiple_external_groups_require_common_available_build(self):
        client = FakeClient([build(41), build(99)])
        client.groups.append({"id": "second", "attributes": {"isInternalGroup": False}})
        client.group_builds["second"] = [build(41)]
        self.assertEqual(self.manifest(client)["externalBuild"]["build"], "41")
        client.group_builds["second"] = []
        self.assertIsNone(self.manifest(client)["externalBuild"])

    def test_group_classification_must_be_explicit(self):
        client = FakeClient([build(41)])
        del client.groups[0]["attributes"]["isInternalGroup"]
        with self.assertRaisesRegex(ValueError, "classification"):
            self.manifest(client)

    def test_no_external_groups_and_withdrawn_build_clear_update(self):
        client = FakeClient(internal=[build(99)])
        client.groups = client.groups[1:]
        self.assertIsNone(self.manifest(client)["externalBuild"])
        client = FakeClient([build(41)])
        self.assertIsNotNone(self.manifest(client)["externalBuild"])
        client.group_builds["external"] = []
        self.assertIsNone(self.manifest(client)["externalBuild"])

    def test_pagination_includes_later_groups_and_builds(self):
        client = FakeClient([build(41), build(99)])
        second = {"id": "second", "attributes": {"isInternalGroup": False}}
        client.pages["/v1/apps/app/betaGroups?limit=200"] = {
            "data": client.groups, "links": {"next": "https://api.appstoreconnect.apple.com/v1/groups-page-2"}}
        client.pages["https://api.appstoreconnect.apple.com/v1/groups-page-2"] = {"data": [second]}
        client.pages["/v1/betaGroups/second/builds?limit=200"] = {
            "data": [], "links": {"next": "/v1/builds-page-2"}}
        client.pages["/v1/builds-page-2"] = {"data": [build(41)]}
        self.assertEqual(self.manifest(client)["externalBuild"]["build"], "41")

    def test_partial_api_failure_does_not_publish(self):
        client = FakeClient([build(41)])
        client.pages["/v1/apps/app/betaGroups?limit=200"] = {"error": "incomplete"}
        with patch("external_beta.publish_manifest") as publish:
            with self.assertRaises(ValueError):
                asc_api.refresh_external_update(client, publish=True)
            publish.assert_not_called()

    def test_unsafe_pagination_never_receives_credentials(self):
        client = FakeClient([build(41)])
        client.pages["/v1/apps/app/betaGroups?limit=200"] = {
            "data": client.groups, "links": {"next": "https://example.com/capture"}}
        with self.assertRaisesRegex(ValueError, "pagination URL"):
            self.manifest(client)
        self.assertEqual(len(client.calls), 1)

    def test_internal_assignment_cannot_invoke_publisher(self):
        client = FakeClient(internal=[build(99)])
        args = argparse.Namespace(version="99", group="Internal", publish_update=True)
        with patch("asc_api.refresh_external_update") as refresh:
            self.assertEqual(asc_api.cmd_assign(client, args), 0)
            refresh.assert_not_called()

    def test_external_assignment_refreshes_distribution_not_uploaded_number(self):
        client = FakeClient([build(41), build(99, state="WAITING_FOR_BETA_REVIEW")])
        args = argparse.Namespace(version="99", group="Early Access", publish_update=True)
        with patch("asc_api.refresh_external_update") as refresh:
            self.assertEqual(asc_api.cmd_assign(client, args), 0)
            refresh.assert_called_once_with(client, publish=True)

    def test_publication_uses_separate_prerelease_and_fixed_asset(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            if args[1] == "api":
                return subprocess.CompletedProcess(args, 1, "", "gh: Not Found (HTTP 404)")
            if args[1:3] == ["release", "upload"]:
                asset = args[4]
                self.assertTrue(asset.endswith("latest.json"))
                with open(asset, encoding="utf-8") as stream:
                    self.assertEqual(json.load(stream)["externalBuild"]["build"], "41")
            return subprocess.CompletedProcess(args, 0, "", "")
        with patch("external_beta.subprocess.run", side_effect=run):
            external_beta.publish_manifest(self.manifest(FakeClient([build(41)])))
        create = calls[1]
        self.assertIn("--prerelease", create)
        self.assertIn("--latest=false", create)
        self.assertIn("ios-external-beta", create)

    def test_github_failure_is_not_mistaken_for_missing_release(self):
        failure = subprocess.CompletedProcess([], 1, "", "authentication failed (HTTP 401)")
        with patch("external_beta.subprocess.run", return_value=failure) as run:
            with self.assertRaisesRegex(ValueError, "publication failed"):
                external_beta.publish_manifest(self.manifest(FakeClient([build(41)])))
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
