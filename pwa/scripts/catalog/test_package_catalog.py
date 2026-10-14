from contextlib import closing
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("package_catalog", Path(__file__).with_name("package_catalog.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.output = self.root / "output"
        entries = []
        for name in sorted(module.REQUIRED["aural"]):
            path = self.source / name
            with closing(sqlite3.connect(path)) as db:
                db.execute("CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT)")
                db.execute("INSERT INTO metadata VALUES('snapshot_id', ?)", ("a" * 64,))
                db.execute("CREATE TABLE payload(data BLOB)")
                db.execute("INSERT INTO payload VALUES(?)", (bytes(range(256)) * 130,))
                db.commit()
            raw = path.read_bytes()
            compressed = gzip.compress(raw, mtime=0)
            (self.source / (name + ".gz")).write_bytes(compressed)
            entries.append({"name": name, "byteSize": len(raw), "checksum": hashlib.sha256(raw).hexdigest(), "compressedByteSize": len(compressed), "compressedChecksum": hashlib.sha256(compressed).hexdigest()})
        self.manifest = {"schemaVersion": "aural-catalog-3", "snapshotId": "a" * 64, "files": entries}
        self.path = self.source / "source.json"
        self.save_manifest()

    def tearDown(self):
        self.temporary.cleanup()

    def save_manifest(self):
        self.path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def run_package(self, **kwargs):
        return module.package(self.path, self.output, "aural", chunk_size=8192, **kwargs)

    def test_chunks_reconstruct_exact_source_and_manifest_is_deterministic(self):
        result = self.run_package()
        manifest_bytes = (self.output / "manifest.json").read_bytes()
        for file in json.loads(manifest_bytes)["files"]:
            reconstructed = b"".join(gzip.decompress((self.output / chunk["path"]).read_bytes()) for chunk in file["chunks"])
            self.assertEqual(reconstructed, (self.source / file["name"]).read_bytes())
            self.assertEqual(hashlib.sha256(reconstructed).hexdigest(), file["checksum"])
        repeated = self.run_package()
        self.assertTrue(result["complete"])
        self.assertEqual(repeated["newChunks"], 0)
        self.assertEqual((self.output / "manifest.json").read_bytes(), manifest_bytes)

    def test_resume_retains_valid_chunks_and_partial_files_without_early_manifest(self):
        first = self.run_package(max_new_chunks=1)
        self.assertFalse(first["complete"])
        self.assertFalse((self.output / "manifest.json").exists())
        chunk = next((self.output / "chunks").rglob("*.gz"))
        modified = chunk.stat().st_mtime_ns
        partial = chunk.with_suffix(".partial-interrupted")
        partial.write_bytes(b"partial write remains preserved")
        self.assertTrue(self.run_package()["complete"])
        self.assertEqual(chunk.stat().st_mtime_ns, modified)
        self.assertEqual(partial.read_bytes(), b"partial write remains preserved")

    def test_bad_archive_fails_before_chunks_and_source_is_untouched(self):
        entry = self.manifest["files"][0]
        archive = self.source / (entry["name"] + ".gz")
        archive.write_bytes(b"bad")
        with self.assertRaisesRegex(ValueError, "Source archive"):
            self.run_package()
        self.assertEqual(archive.read_bytes(), b"bad")
        self.assertFalse((self.output / "manifest.json").exists())

    def test_bad_raw_hash_never_promotes_staged_chunks(self):
        self.manifest["files"][0]["checksum"] = "0" * 64
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "Source database"):
            self.run_package()
        self.assertTrue((self.output / "progress.json").exists())
        self.assertFalse((self.output / "manifest.json").exists())

    def test_changed_source_intent_does_not_reuse_or_overwrite_output(self):
        self.run_package(max_new_chunks=1)
        intent = (self.output / "intent.json").read_bytes()
        self.manifest["snapshotId"] = "b" * 64
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "immutable output differs"):
            self.run_package()
        self.assertEqual((self.output / "intent.json").read_bytes(), intent)

    def test_corrupt_existing_chunk_is_preserved_and_rejected(self):
        self.run_package(max_new_chunks=1)
        chunk = next((self.output / "chunks").rglob("*.gz"))
        chunk.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "immutable output differs"):
            self.run_package()
        self.assertEqual(chunk.read_bytes(), b"corrupt")
        self.assertFalse((self.output / "manifest.json").exists())

    def test_real_killed_producer_resumes_without_rewriting_verified_chunks(self):
        signal = self.root / "child-checkpoint.json"
        code = """
import importlib.util, pathlib, sys, time
spec=importlib.util.spec_from_file_location('producer', sys.argv[1])
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
original=module.atomic_write
def checkpoint(path, data, immutable=False):
    result=original(path, data, immutable)
    if path.name=='progress.json':
        pathlib.Path(sys.argv[4]).write_text('verified chunk reached', encoding='utf-8')
        time.sleep(30)
    return result
module.atomic_write=checkpoint
module.package(sys.argv[2],sys.argv[3],'aural',chunk_size=8192)
"""
        child = subprocess.Popen([sys.executable, "-c", code, str(Path(module.__file__).resolve()), str(self.path), str(self.output), str(signal)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 10
            while not signal.exists() and child.poll() is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(signal.exists(), "producer never reached durable chunk checkpoint")
            chunk = next((self.output / "chunks").rglob("*.gz"))
            modified = chunk.stat().st_mtime_ns
        finally:
            child.kill()
            child.wait(timeout=5)
        self.assertFalse((self.output / "manifest.json").exists())
        self.assertTrue(self.run_package()["complete"])
        self.assertEqual(chunk.stat().st_mtime_ns, modified)

    def test_duplicate_missing_and_traversal_files_are_rejected(self):
        self.manifest["files"][0]["name"] = "../catalog.db"
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "bundle file"):
            self.run_package()
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
