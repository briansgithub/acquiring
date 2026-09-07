# App Store Connect API key

Lets an agent finish a TestFlight release without a human sign-in: wait for
processing, set the **What to Test** notes, and release to a tester group.
Submission is deliberately excluded — see `../../docs/ios-beta-releases.md`.

Before this existed, every metadata step needed someone to log into the App
Store Connect website by hand.

## What the key does and does not do

The key covers **metadata only**. Code signing and the upload keep using the
Xcode-stored session, which already worked unattended.

Do not pass the key to `xcodebuild` through `-authenticationKeyPath`,
`-authenticationKeyID` and `-authenticationKeyIssuerID`. Those flags make
xcodebuild authenticate as the key instead of the Xcode account, and an **App
Manager** key cannot reach signing certificates, so the export fails with:

```
error: exportArchive Cloud signing permission error
error: exportArchive No signing certificate "iOS Distribution" found
```

Admin would let the key sign, but that is a real privilege increase to duplicate
something the session already does. App Manager is the right role here.

## One-time setup

### 1. Generate the key

App Store Connect → **Users and Access** → **Integrations** → **App Store
Connect API** → **Team Keys** → **+**.

- Name: something identifiable, e.g. `acquiring-release-agent`
- Access: **App Manager**

App Manager is the least privilege that still covers TestFlight builds, beta
groups, and build metadata. Admin is not required; do not grant it.

Only an Account Holder or Admin can create keys.

### 2. Save the `.p8`

**Apple lets you download the private key exactly once.** If it is lost, the
only remedy is to revoke that key and generate another.

```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
```

That directory is where `xcodebuild` and `altool` already look. Keep the key out
of the repository — the remote is public-facing, so a committed key is a
published one. `.gitignore` blocks `*.p8` and `AuthKey_*` as a backstop, but the
real protection is not putting it there.

### 3. Record the two ids

Both are on the same App Store Connect page: the **Key ID** in the key's row,
the **Issuer ID** above the table. Neither is secret, but they stay out of the
repo anyway.

```bash
cat > ~/.appstoreconnect/acquiring-asc.json <<'JSON'
{
  "key_id": "XXXXXXXXXX",
  "issuer_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
JSON
chmod 600 ~/.appstoreconnect/acquiring-asc.json
```

`ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` override the file if set.

### 4. Confirm it works

```bash
python3 ios/scripts/asc_api.py verify
```

Expected: `Authenticated. App com.acquiring.ios -> id 6807512572`

## Releasing

Internal only — the default, since that group auto-distributes:

```bash
ios/scripts/deploy-testflight.sh --notes-file /path/to/notes.txt
```

Internal *and* external testers:

```bash
ios/scripts/deploy-testflight.sh --notes-file /path/to/notes.txt --external
```

Archives, verifies the signature, uploads, waits for processing, attaches the
notes, then releases — no browser, no sign-in.

`Acquiring Internal Testers` is set to *Automatic for Xcode Builds*, so the
build reaches internal testers as soon as processing finishes. Passing the notes
to the deploy script matters: set afterwards, they arrive after testers already
have the build. The script sets notes before any external assignment for the
same reason — that assignment notifies external testers.

`--external` resolves the single external group and refuses to guess between
several; name one with `--group "Early Access"` when that happens.

## Other commands

```bash
python3 ios/scripts/asc_api.py groups                      # list groups + distribution mode
python3 ios/scripts/asc_api.py status --version 13         # processing state
python3 ios/scripts/asc_api.py wait   --version 13         # block until processed
python3 ios/scripts/asc_api.py set-notes --version 13 --notes "..."
python3 ios/scripts/asc_api.py assign --version 13                      # internal (default)
python3 ios/scripts/asc_api.py assign --version 13 --track external     # the one external group
python3 ios/scripts/asc_api.py assign --version 13 --group "Early Access"
```

## External releases

External distribution reaches people outside the team, and `Early Access` has a
public link — anyone holding that URL can install.

Adding a build to an external group is also the beta-app-review path. For an
already-approved version the build usually distributes immediately; otherwise it
enters **Waiting for Review**. `assign` prints the resulting
`externalBuildState` so which of the two happened is never a guess.

Beta app review is not App Store submission. Nothing here submits to App Review;
that stays a human step. See `../../docs/ios-beta-releases.md`.

## Notes on the implementation

No third-party packages. This Mac's `pip3` is bound to Xcode's Python 3.9 while
`python3` is 3.12, and a release path should not depend on untangling that, so
the ES256 JWT is signed by shelling out to `openssl` and converting the DER
signature to the raw `r||s` form JOSE requires.

## Troubleshooting

**401 Unauthorized** — key revoked, wrong issuer id, or this Mac's clock has
drifted. Tokens are time-signed and Apple rejects a lifetime over 20 minutes.

**Build not found** — uploads take a few minutes to appear. If it never does,
the upload itself failed.

**Key lost** — revoke it in App Store Connect and generate a new one. There is
no way to re-download.

## Revoking

App Store Connect → Users and Access → Integrations → the key's row → **Revoke**.
Do this the moment a key is suspected exposed; it is instant and the key stops
working immediately.
