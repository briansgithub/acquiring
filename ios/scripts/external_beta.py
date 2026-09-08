"""Public update metadata derived only from active external TestFlight distribution.

Apple credentials remain in the release environment. The app downloads only the
small, expiring JSON document published as a GitHub release asset.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse


REPOSITORY = "briansgithub/acquiring"
RELEASE_TAG = "ios-external-beta"
ASSET_NAME = "latest.json"
MANIFEST_LIFETIME = timedelta(hours=24)


def numeric_version(value: object) -> tuple[int, int, int] | None:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,9}(\.[0-9]{1,9}){0,2}", value):
        return None
    parts = [int(part) for part in value.split(".")]
    return tuple(parts + [0] * (3 - len(parts)))


def parse_date(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return date.astimezone(timezone.utc) if date.tzinfo is not None else None
    except ValueError:
        return None


def timestamp(date: datetime) -> str:
    return date.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def all_records(client, path: str) -> list[dict]:
    """Follow every page; incomplete group membership must never imply eligibility."""
    records = []
    seen = set()
    while path:
        parsed = urlparse(path)
        if not (path.startswith("/v1/") or (
            parsed.scheme == "https" and parsed.netloc == "api.appstoreconnect.apple.com"
        )):
            raise ValueError("Unexpected App Store Connect pagination URL.")
        if path in seen:
            raise ValueError("Repeated App Store Connect pagination URL.")
        seen.add(path)
        response = client.request("GET", path)
        data = response.get("data")
        if not isinstance(data, list):
            raise ValueError("Incomplete App Store Connect collection response.")
        records.extend(data)
        path = response.get("links", {}).get("next")
    return records


def available_build(client, build: dict, now: datetime) -> dict | None:
    attrs = build.get("attributes", {})
    expiry = parse_date(attrs.get("expirationDate"))
    if (attrs.get("processingState") != "VALID"
            or attrs.get("buildAudienceType") != "APP_STORE_ELIGIBLE"
            or attrs.get("expired") is not False
            or expiry is None or expiry <= now
            or numeric_version(attrs.get("version")) is None
            or numeric_version(attrs.get("minOsVersion")) is None):
        return None
    # READY_FOR_BETA_TESTING / BETA_APPROVED are deliberately insufficient:
    # the developer may still need to start testing or notify external testers.
    if client.beta_detail(build["id"]).get("externalBuildState") != "IN_BETA_TESTING":
        return None
    prerelease = client.request("GET", f"/v1/builds/{build['id']}/preReleaseVersion")
    version = prerelease.get("data", {}).get("attributes", {})
    if version.get("platform") != "IOS" or numeric_version(version.get("version")) is None:
        return None
    return {
        "version": version["version"],
        "build": attrs["version"],
        "minimumOSVersion": attrs["minOsVersion"],
        "expiresAt": timestamp(expiry),
    }


def generate_manifest(client, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    app_id = client.app_id()
    groups = all_records(client, f"/v1/apps/{app_id}/betaGroups?limit=200")
    if any(type(group.get("attributes", {}).get("isInternalGroup")) is not bool for group in groups):
        raise ValueError("A beta group's internal/external classification is missing.")
    external_groups = [group for group in groups if not group["attributes"]["isInternalGroup"]]
    common_builds = None
    builds_by_id = {}
    for group in external_groups:
        builds = all_records(client, f"/v1/betaGroups/{group['id']}/builds?limit=200")
        ids = {build["id"] for build in builds}
        common_builds = ids if common_builds is None else common_builds & ids
        builds_by_id.update((build["id"], build) for build in builds)
    candidates = []
    for build_id in sorted(common_builds or ()):
        candidate = available_build(client, builds_by_id[build_id], now)
        if candidate is not None:
            candidates.append(candidate)
    newest = max(candidates, key=lambda build: (
        numeric_version(build["version"]), numeric_version(build["build"])
    ), default=None)
    return {
        "schemaVersion": 1,
        "channel": "external",
        "generatedAt": timestamp(now),
        "validUntil": timestamp(now + MANIFEST_LIFETIME),
        "externalBuild": newest,
    }


def write_manifest(manifest: dict, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def publish_manifest(manifest: dict) -> None:
    """Publish metadata only; never assign testers, upload an app, or request review."""
    def gh(*args: str, allow_missing: bool = False) -> subprocess.CompletedProcess:
        result = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
        if result.returncode and not (allow_missing and "HTTP 404" in result.stderr):
            raise ValueError(f"GitHub metadata publication failed: {result.stderr.strip()}")
        return result

    with tempfile.TemporaryDirectory(prefix="acquiring-external-beta-") as directory:
        asset = Path(directory) / ASSET_NAME
        write_manifest(manifest, asset)
        release = gh("api", f"repos/{REPOSITORY}/releases/tags/{RELEASE_TAG}", allow_missing=True)
        if release.returncode:
            notes = Path(directory) / "notes.md"
            notes.write_text(
                "Update metadata for Acquiring's external TestFlight testers.\n"
                "This release contains no app binary or catalog database.\n",
                encoding="utf-8",
            )
            gh("release", "create", RELEASE_TAG, "--repo", REPOSITORY,
               "--target", "main", "--title", "External iOS beta update metadata",
               "--notes-file", str(notes), "--prerelease", "--latest=false")
        else:
            metadata = json.loads(release.stdout)
            if metadata.get("draft") or not metadata.get("prerelease"):
                raise ValueError("The external beta metadata release must be public and marked prerelease.")
        gh("release", "upload", RELEASE_TAG, str(asset), "--repo", REPOSITORY, "--clobber")
