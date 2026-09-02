"""Exercise real Gradle signing guards with disposable keys; never read real passwords."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
GRADLE = str(ROOT / ("gradlew.bat" if os.name == "nt" else "gradlew"))
NAMES = ["ACQUIRING_RELEASE_STORE_FILE", "ACQUIRING_RELEASE_STORE_PASSWORD", "ACQUIRING_RELEASE_KEY_ALIAS", "ACQUIRING_RELEASE_KEY_PASSWORD"]


def gradle(env, *args, expected=None):
    result = subprocess.run([GRADLE, "-p", str(ROOT), "--no-daemon", "--no-configuration-cache", *args],
                            env=env, capture_output=True, text=True, timeout=180)
    output = result.stdout + result.stderr
    if expected is None:
        assert result.returncode == 0, "Expected successful Gradle check; logs withheld"
    else:
        assert result.returncode != 0 and expected in output, "Expected signing/version rejection not observed; logs withheld"


def main():
    env = os.environ.copy()
    for name in NAMES:
        env.pop(name, None)
    # Explicit empty properties shadow a developer's global Gradle credentials.
    blank = [f"-P{name}=" for name in NAMES]
    gradle(env, "help", *blank)
    gradle(env, ":app:validateAcquiringReleaseSigning", *blank,
           expected="Release signing requires the original upload keystore")
    print("PASS debug configuration without credentials; missing release credentials rejected")
    java = Path(env["JAVA_HOME"]) / "bin" / ("keytool.exe" if os.name == "nt" else "keytool")
    with tempfile.TemporaryDirectory(prefix="acquiring-signing-guard-") as folder:
        key = Path(folder) / "disposable-test.jks"
        password = secrets.token_hex(24)
        env["ACQ_TEST_PASSWORD"] = password
        result = subprocess.run([str(java), "-genkeypair", "-keystore", str(key), "-storetype", "PKCS12",
                                 "-alias", "test-only", "-dname", "CN=Acquiring release guard test", "-keyalg", "RSA",
                                 "-validity", "1", "-storepass:env", "ACQ_TEST_PASSWORD", "-keypass:env", "ACQ_TEST_PASSWORD"],
                                env=env, capture_output=True, timeout=60)
        assert result.returncode == 0, "Disposable key generation failed"
        env.update(dict(zip(NAMES, [str(key), password, "test-only", password])))
        gradle(env, ":app:validateAcquiringReleaseSigning", expected="Upload certificate does not match Google Play")
        env["ACQUIRING_RELEASE_KEY_PASSWORD"] = "deliberately-wrong-test-password"
        gradle(env, ":app:validateAcquiringReleaseSigning", expected="Cannot unlock the upload key")
        env["ACQUIRING_RELEASE_STORE_PASSWORD"] = "deliberately-wrong-test-password"
        gradle(env, ":app:validateAcquiringReleaseSigning", expected="Cannot unlock the upload key")
    print("PASS wrong certificate, wrong key password and wrong store password rejected")
    for name in NAMES:
        env.pop(name, None)
    for override in ("0", "2100000001", "not-a-number"):
        gradle(env, "help", *blank, f"-PACQUIRING_RELEASE_VERSION_CODE={override}",
               expected="ACQUIRING_RELEASE_VERSION_CODE must be between")
    gradle(env, "help", *blank, "-PACQUIRING_RELEASE_VERSION_CODE=1",
           expected="Release version override must exceed the repository versionCode")
    gradle(env, "help", *blank, "-PACQUIRING_RELEASE_VERSION_CODE=1000000")
    print("PASS invalid/duplicate version overrides rejected; valid override accepted")


if __name__ == "__main__":
    main()
