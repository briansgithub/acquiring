#!/usr/bin/env python3
"""App Store Connect API client for unattended TestFlight releases.

Everything up to submission can run without a human: upload (via xcodebuild's
own -authenticationKey* flags), then the metadata steps here — waiting for
processing, setting What to Test notes, and assigning a build to a beta group.

Deliberately dependency-free. This Mac has an old pip bound to Xcode's Python
3.9 while `python3` is 3.12, and an agent release path should not depend on
resolving that. ES256 signing is done by shelling out to openssl and converting
its DER signature to the raw r||s form JWT requires.

Credentials are never read from the repository. The private key lives at
~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8 — the location xcodebuild and
altool already search — and the two ids come from the environment or
~/.appstoreconnect/acquiring-asc.json.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "com.acquiring.ios"
CONFIG_PATH = Path.home() / ".appstoreconnect" / "acquiring-asc.json"
KEY_DIR = Path.home() / ".appstoreconnect" / "private_keys"

# Apple rejects tokens whose lifetime exceeds 20 minutes.
TOKEN_LIFETIME_SECONDS = 15 * 60


class AscError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def ssl_context() -> ssl.SSLContext:
    """A verifying TLS context that works on this Mac's python.org build.

    That build does not consult the system keychain, so the stock default
    context fails Apple's API with CERTIFICATE_VERIFY_FAILED even though the
    certificates are present. Find a real CA bundle rather than disabling
    verification — this connection carries a signed credential, and an
    unverified one would be worth strictly less than no automation at all.
    """
    candidates = [os.environ.get("SSL_CERT_FILE")]
    try:
        import certifi

        candidates.append(certifi.where())
    except ImportError:
        pass
    candidates.append("/etc/ssl/cert.pem")

    for path in candidates:
        if path and Path(path).exists():
            try:
                return ssl.create_default_context(cafile=path)
            except (ssl.SSLError, OSError):
                continue
    # Nothing found; the default still verifies, it just may not trust anything.
    return ssl.create_default_context()


# --------------------------------------------------------------------------
# Credentials
# --------------------------------------------------------------------------


def load_credentials() -> tuple[str, str, Path]:
    """Resolve key id, issuer id and private key path.

    Environment wins so CI can inject values; otherwise fall back to the
    gitignored JSON file outside the repo.
    """
    key_id = os.environ.get("ASC_KEY_ID")
    issuer_id = os.environ.get("ASC_ISSUER_ID")
    key_path = os.environ.get("ASC_KEY_PATH")

    if not (key_id and issuer_id):
        if not CONFIG_PATH.exists():
            raise AscError(
                f"No App Store Connect credentials found.\n"
                f"Set ASC_KEY_ID and ASC_ISSUER_ID, or create {CONFIG_PATH} with:\n"
                f'  {{"key_id": "ABC123XYZ", "issuer_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}}\n'
                f"See ios/scripts/README-asc-api.md for how to obtain them."
            )
        try:
            config = json.loads(CONFIG_PATH.read_text())
        except json.JSONDecodeError as exc:
            raise AscError(f"{CONFIG_PATH} is not valid JSON: {exc}") from exc
        key_id = key_id or config.get("key_id")
        issuer_id = issuer_id or config.get("issuer_id")
        key_path = key_path or config.get("key_path")

    if not key_id or not issuer_id:
        raise AscError(f"key_id and issuer_id must both be set (checked env and {CONFIG_PATH}).")

    resolved = Path(key_path).expanduser() if key_path else KEY_DIR / f"AuthKey_{key_id}.p8"
    if not resolved.exists():
        raise AscError(
            f"Private key not found at {resolved}.\n"
            f"App Store Connect lets you download the .p8 exactly once. If it is lost, "
            f"revoke that key and generate a new one."
        )

    mode = resolved.stat().st_mode & 0o777
    if mode & 0o077:
        print(
            f"warning: {resolved} is mode {mode:o}; tightening to 600.",
            file=sys.stderr,
        )
        resolved.chmod(0o600)

    return key_id, issuer_id, resolved


# --------------------------------------------------------------------------
# JWT (ES256, via openssl)
# --------------------------------------------------------------------------


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _der_to_raw_signature(der: bytes) -> bytes:
    """Convert an ECDSA DER signature to the fixed-width r||s JWT expects.

    openssl emits SEQUENCE { INTEGER r, INTEGER s } with minimal-length,
    sign-extended integers. JOSE wants each value left-padded to exactly 32
    bytes for P-256.
    """
    if not der or der[0] != 0x30:
        raise AscError("openssl did not return a DER SEQUENCE signature.")

    index = 2
    # A signature over P-256 is short enough that the length is single-byte,
    # but tolerate the long form rather than silently misparsing.
    if der[1] & 0x80:
        index = 2 + (der[1] & 0x7F)

    values = []
    for _ in range(2):
        if der[index] != 0x02:
            raise AscError("Malformed DER signature: expected INTEGER.")
        length = der[index + 1]
        start = index + 2
        value = der[start : start + length]
        # Strip the leading zero DER adds to keep the integer positive.
        value = value.lstrip(b"\x00")
        if len(value) > 32:
            raise AscError("DER integer too large for P-256.")
        values.append(value.rjust(32, b"\x00"))
        index = start + length

    return values[0] + values[1]


def make_token(key_id: str, issuer_id: str, key_path: Path) -> str:
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + TOKEN_LIFETIME_SECONDS,
        "aud": "appstoreconnect-v1",
    }
    signing_input = ".".join(
        _b64url(json.dumps(part, separators=(",", ":")).encode()) for part in (header, payload)
    ).encode("ascii")

    try:
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", str(key_path), "-binary"],
            input=signing_input,
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode(errors="replace").strip()
        raise AscError(f"openssl could not sign with {key_path}: {detail}") from exc

    return f"{signing_input.decode('ascii')}.{_b64url(_der_to_raw_signature(result.stdout))}"


# --------------------------------------------------------------------------
# REST
# --------------------------------------------------------------------------


class Client:
    def __init__(self) -> None:
        key_id, issuer_id, key_path = load_credentials()
        self._token = make_token(key_id, issuer_id, key_path)

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        url = path if path.startswith("http") else f"{API}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self._token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=60, context=ssl_context()) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode(errors="replace")
            detail = raw
            try:
                errors = json.loads(raw).get("errors", [])
                detail = "; ".join(
                    f"{e.get('title', '')}: {e.get('detail', '')}".strip(": ") for e in errors
                ) or raw
            except json.JSONDecodeError:
                pass
            if exc.code == 401:
                detail += (
                    "\nA 401 usually means the key was revoked, the issuer id is wrong, "
                    "or this Mac's clock has drifted (the token is time-signed)."
                )
            raise AscError(f"{method} {url} failed [{exc.code}]: {detail}") from exc

    # -- lookups ----------------------------------------------------------

    def app_id(self, bundle_id: str = BUNDLE_ID) -> str:
        query = urllib.parse.urlencode({"filter[bundleId]": bundle_id, "limit": 200})
        for app in self.request("GET", f"/v1/apps?{query}").get("data", []):
            if app["attributes"]["bundleId"] == bundle_id:
                return app["id"]
        raise AscError(f"No app found for bundle id {bundle_id}.")

    def build(self, version: str, app_id: str | None = None, required: bool = True):
        """Find a build by its number.

        `required=False` returns None instead of raising, for callers that are
        waiting for a build to show up: a freshly uploaded build is invisible to
        this API for a minute or two, which is a reason to keep waiting rather
        than an error.
        """
        app_id = app_id or self.app_id()
        query = urllib.parse.urlencode(
            {"filter[app]": app_id, "filter[version]": str(version), "limit": 10}
        )
        builds = self.request("GET", f"/v1/builds?{query}").get("data", [])
        if not builds:
            if not required:
                return None
            raise AscError(
                f"Build {version} not found. Uploads take a few minutes to appear; "
                f"if it never does, check the upload actually succeeded."
            )
        return builds[0]

    def beta_groups(self, app_id: str | None = None) -> list[dict]:
        app_id = app_id or self.app_id()
        return self.request("GET", f"/v1/apps/{app_id}/betaGroups?limit=200").get("data", [])

    def beta_group(self, name: str, app_id: str | None = None) -> dict:
        groups = self.beta_groups(app_id)
        for group in groups:
            if group["attributes"]["name"] == name:
                return group
        available = ", ".join(g["attributes"]["name"] for g in groups) or "(none)"
        raise AscError(f"No beta group named {name!r}. Available: {available}")

    def resolve_track(self, track: str, app_id: str | None = None) -> dict:
        """Find the one group on a track, or refuse to guess between several.

        Naming a track rather than a group is only unambiguous while that track
        holds exactly one group. With more than one, which testers receive the
        build is a decision for the person asking, not a default.
        """
        want_internal = track == "internal"
        matches = [
            g
            for g in self.beta_groups(app_id)
            if bool(g["attributes"].get("isInternalGroup")) is want_internal
        ]
        if not matches:
            raise AscError(f"No {track} beta group exists for this app.")
        if len(matches) > 1:
            names = ", ".join(repr(g["attributes"]["name"]) for g in matches)
            raise AscError(
                f"There are {len(matches)} {track} groups ({names}). Ask which one the "
                f"build should go to, then pass --group with that name."
            )
        return matches[0]

    def beta_detail(self, build_id: str) -> dict:
        """Beta review/distribution state for a build, as Apple reports it."""
        detail = self.request("GET", f"/v1/builds/{build_id}/buildBetaDetail")
        return detail.get("data", {}).get("attributes", {})


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def cmd_status(client: Client, args: argparse.Namespace) -> int:
    build = client.build(args.version)
    attrs = build["attributes"]
    print(f"Build {attrs['version']}  id={build['id']}")
    print(f"  processingState: {attrs.get('processingState')}")
    print(f"  uploadedDate:    {attrs.get('uploadedDate')}")
    print(f"  expired:         {attrs.get('expired')}")
    return 0


def cmd_wait(client: Client, args: argparse.Namespace) -> int:
    deadline = time.time() + args.timeout
    app_id = client.app_id()
    while True:
        build = client.build(args.version, app_id, required=False)
        # A build that has not surfaced yet is the normal first minute or two
        # after an upload, not a failure.
        state = build["attributes"].get("processingState") if build else "not yet visible"

        if state == "VALID":
            print(f"Build {args.version} is processed and ready.")
            return 0
        if state in {"FAILED", "INVALID"}:
            print(f"Build {args.version} finished processing as {state}.", file=sys.stderr)
            return 1
        if time.time() >= deadline:
            print(
                f"Timed out after {args.timeout}s; build {args.version} is {state}.",
                file=sys.stderr,
            )
            return 1
        print(f"  {state}; checking again in {args.interval}s...")
        time.sleep(args.interval)


def cmd_set_notes(client: Client, args: argparse.Namespace) -> int:
    notes = Path(args.notes_file).read_text().strip() if args.notes_file else args.notes
    if not notes:
        raise AscError("Refusing to set empty What to Test notes.")
    if len(notes) > args.max_chars:
        raise AscError(
            f"Notes are {len(notes)} characters, over the {args.max_chars} limit set by "
            f"docs/ios-beta-releases.md. Tighten them rather than raising the limit."
        )

    build = client.build(args.version)
    existing = client.request(
        "GET", f"/v1/builds/{build['id']}/betaBuildLocalizations?limit=200"
    ).get("data", [])
    match = next(
        (loc for loc in existing if loc["attributes"]["locale"] == args.locale), None
    )

    if match:
        client.request(
            "PATCH",
            f"/v1/betaBuildLocalizations/{match['id']}",
            {
                "data": {
                    "type": "betaBuildLocalizations",
                    "id": match["id"],
                    "attributes": {"whatsNew": notes},
                }
            },
        )
        print(f"Updated What to Test for build {args.version} ({args.locale}).")
    else:
        client.request(
            "POST",
            "/v1/betaBuildLocalizations",
            {
                "data": {
                    "type": "betaBuildLocalizations",
                    "attributes": {"locale": args.locale, "whatsNew": notes},
                    "relationships": {
                        "build": {"data": {"type": "builds", "id": build["id"]}}
                    },
                }
            },
        )
        print(f"Set What to Test for build {args.version} ({args.locale}).")

    print("--- notes ---")
    print(notes)
    return 0


# How Apple's externalBuildState maps onto "did this just become a submission?"
_EXTERNAL_STATE_NOTES = {
    "READY_FOR_BETA_TESTING": "ready to test; external testing may still need to be started",
    "IN_BETA_TESTING": "available to external testers",
    "IN_BETA_REVIEW": "in beta app review — Apple is reviewing it now",
    "WAITING_FOR_BETA_REVIEW": "queued for beta app review; testers get it once approved",
    "READY_FOR_BETA_SUBMISSION": "not submitted for review; testers cannot see it yet",
    "BETA_REJECTED": "rejected by beta app review",
}


def cmd_assign(client: Client, args: argparse.Namespace) -> int:
    app_id = client.app_id()
    build = client.build(args.version, app_id)

    if args.group:
        group = client.beta_group(args.group, app_id)
    else:
        group = client.resolve_track(args.track, app_id)

    name = group["attributes"]["name"]
    is_internal = bool(group["attributes"].get("isInternalGroup"))

    client.request(
        "POST",
        f"/v1/betaGroups/{group['id']}/relationships/builds",
        {"data": [{"type": "builds", "id": build["id"]}]},
    )
    kind = "internal" if is_internal else "external"
    print(f"Assigned build {args.version} to {kind} group {name!r}.")

    if is_internal:
        return 0

    # External distribution reaches people outside the team, and may or may not
    # have needed review. Say which actually happened rather than leaving the
    # caller to assume.
    state = client.beta_detail(build["id"]).get("externalBuildState")
    note = _EXTERNAL_STATE_NOTES.get(state, "state not recognized; check App Store Connect")
    print(f"  external state: {state} — {note}")

    if group["attributes"].get("publicLinkEnabled"):
        link = group["attributes"].get("publicLink") or "(enabled)"
        print(f"  public link is live, so anyone with it can install: {link}")

    if state in {"IN_BETA_REVIEW", "WAITING_FOR_BETA_REVIEW"}:
        print(
            "  note: this assignment put the build into beta app review. "
            "App Store submission is still a separate, human-only step."
        )
    if args.publish_update:
        # Query actual external distribution afresh, not the just-uploaded build
        # number. A pending review must leave the previous eligible build visible.
        print("Refreshing the public external beta update record.")
        try:
            refresh_external_update(client, publish=True)
        except (AscError, ValueError, OSError) as exc:
            raise AscError(
                "The group assignment succeeded, but update metadata publication failed. "
                "Retry `external-update --publish`; do not re-upload the build. "
                f"{exc}"
            ) from exc
    return 0


def refresh_external_update(client: Client, output: str | None = None, publish: bool = False) -> None:
    from external_beta import generate_manifest, publish_manifest, write_manifest

    manifest = generate_manifest(client)
    if output:
        write_manifest(manifest, Path(output))
    if publish:
        publish_manifest(manifest)
    build = manifest["externalBuild"]
    description = f"{build['version']} ({build['build']})" if build else "none available"
    print(f"External beta update: {description}; valid until {manifest['validUntil']}.")


def cmd_external_update(client: Client, args: argparse.Namespace) -> int:
    if not args.output and not args.publish:
        raise AscError("Pass --output PATH to preview, or --publish to update the public metadata.")
    refresh_external_update(client, output=args.output, publish=args.publish)
    return 0


def cmd_groups(client: Client, args: argparse.Namespace) -> int:
    app_id = client.app_id()
    for group in client.request("GET", f"/v1/apps/{app_id}/betaGroups?limit=200").get("data", []):
        attrs = group["attributes"]
        kind = "internal" if attrs.get("isInternalGroup") else "external"
        auto = "auto-distributes" if attrs.get("hasAccessToAllBuilds") else "manual"
        print(f"{attrs['name']}  [{kind}, {auto}]  id={group['id']}")
    return 0


def cmd_verify(client: Client, args: argparse.Namespace) -> int:
    app_id = client.app_id()
    print(f"Authenticated. App {BUNDLE_ID} -> id {app_id}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("verify", help="Confirm the key authenticates and can see the app.")
    sub.add_parser("groups", help="List beta groups and how they distribute builds.")

    p = sub.add_parser("status", help="Show a build's processing state.")
    p.add_argument("--version", required=True)

    p = sub.add_parser("wait", help="Poll until a build finishes processing.")
    p.add_argument("--version", required=True)
    p.add_argument("--timeout", type=int, default=1800)
    p.add_argument("--interval", type=int, default=30)

    p = sub.add_parser("set-notes", help="Set the What to Test notes for a build.")
    p.add_argument("--version", required=True)
    p.add_argument("--notes")
    p.add_argument("--notes-file")
    p.add_argument("--locale", default="en-US")
    p.add_argument("--max-chars", type=int, default=350)

    p = sub.add_parser("assign", help="Assign a build to a beta group.")
    p.add_argument("--version", required=True)
    p.add_argument(
        "--track",
        choices=("internal", "external"),
        default="internal",
        help="Resolve the single group on this track. Fails if the track has several.",
    )
    p.add_argument("--group", help="Exact group name; overrides --track.")
    p.add_argument(
        "--publish-update", action="store_true",
        help="After an external assignment, refresh the public external-only update metadata.",
    )

    p = sub.add_parser("external-update", help="Refresh update metadata from active external builds only.")
    p.add_argument("--output", help="Write a local JSON preview without publishing unless --publish is also set.")
    p.add_argument("--publish", action="store_true", help="Publish latest.json to the GitHub metadata release.")

    args = parser.parse_args(argv)
    handlers = {
        "verify": cmd_verify,
        "groups": cmd_groups,
        "status": cmd_status,
        "wait": cmd_wait,
        "set-notes": cmd_set_notes,
        "assign": cmd_assign,
        "external-update": cmd_external_update,
    }

    try:
        return handlers[args.command](Client(), args)
    except (AscError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
