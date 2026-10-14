"""Create resumable immutable gzip chunks; never publish or modify source catalog archives."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import uuid

CHUNK_SIZE = 8 * 1024 * 1024
SCHEMA = "acquiring-pwa-catalog-1"
REQUIRED = {"aural": {"aural-catalog.db", "aural-evidence.db", "aural-popularity.db"}, "songs": {"catalog.db"}}


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def atomic_write(path, data, immutable=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if immutable and path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Existing immutable output differs; preserve and inspect: {path}")
        return False
    temporary = path.with_name(path.name + ".partial-" + uuid.uuid4().hex)
    with temporary.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    # Retain any partial file left by abrupt interruption; it is never a valid chunk.
    os.replace(temporary, path)
    return True


def valid_hash(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Expected a lowercase SHA256")
    return value


def positive(value):
    if type(value) is not int or value <= 0:
        raise ValueError("Expected positive byte length")
    return value


def package(source_manifest, output, kind, chunk_size=CHUNK_SIZE, max_new_chunks=None):
    source_manifest, output = Path(source_manifest).resolve(), Path(output).resolve()
    if output == source_manifest.parent or output in source_manifest.parent.parents:
        raise ValueError("Output may not replace a source directory or its ancestor")
    if type(chunk_size) is not int or not 1024 <= chunk_size <= CHUNK_SIZE:
        raise ValueError("Chunk size must be1024..8388608 bytes")
    if max_new_chunks is not None and (type(max_new_chunks) is not int or max_new_chunks < 1):
        raise ValueError("max_new_chunks must be positive")
    source_bytes = source_manifest.read_bytes()
    source = json.loads(source_bytes)
    snapshot = valid_hash(source["snapshotId"])
    if source["schemaVersion"] not in (3, "aural-catalog-3"):
        raise ValueError("Unsupported source catalog schema")
    entries = source["files"]
    names = [entry["name"] for entry in entries]
    if len(set(names)) != len(names) or set(names) != REQUIRED[kind]:
        raise ValueError("Missing, duplicate or unexpected bundle file")
    manifest_hash = hashlib.sha256(source_bytes).hexdigest()
    intent = {"schemaVersion": SCHEMA, "kind": kind, "sourceSnapshot": snapshot, "sourceSchema": source["schemaVersion"], "sourceManifestSha256": manifest_hash, "chunkSizeBytes": chunk_size}
    # Prewrite immutable intent; a different input may not silently reuse this output directory.
    atomic_write(output / "intent.json", canonical(intent), immutable=True)
    files, newly_written = [], 0
    for entry in entries:
        name = entry["name"]  # Exact allowlist above prevents traversal or source path injection.
        expected_hash, archive_hash = valid_hash(entry["checksum"]), valid_hash(entry["compressedChecksum"])
        expected_size, archive_size = positive(entry["byteSize"]), positive(entry["compressedByteSize"])
        archive = source_manifest.parent / (name + ".gz")
        if not archive.is_file() or archive.stat().st_size != archive_size or digest_file(archive) != archive_hash:
            raise ValueError(f"Source archive verification failed: {name}")
        raw_hash, raw_size, chunks = hashlib.sha256(), 0, []
        with gzip.open(archive, "rb") as stream:
            while True:
                raw = stream.read(chunk_size)
                if not raw:
                    break
                if raw_size == 0 and not raw.startswith(b"SQLite format 3\0"):
                    raise ValueError(f"Not a SQLite database: {name}")
                raw_size += len(raw)
                if raw_size > expected_size:
                    raise ValueError(f"Source expands beyond declared size: {name}")
                raw_hash.update(raw)
                compressed = gzip.compress(raw, compresslevel=6, mtime=0)
                compressed_hash = hashlib.sha256(compressed).hexdigest()
                path = f"chunks/{name}/{len(chunks):06d}-{compressed_hash}.gz"
                wrote = atomic_write(output / path, compressed, immutable=True)
                newly_written += int(wrote)
                chunks.append({"index": len(chunks), "path": path, "byteSize": len(raw), "checksum": hashlib.sha256(raw).hexdigest(), "compressedByteSize": len(compressed), "compressedChecksum": compressed_hash})
                atomic_write(output / "progress.json", canonical({**intent, "status": "staging", "file": name, "verifiedChunkCount": len(chunks), "verifiedRawBytes": raw_size, "completeFileCount": len(files)}))
                if max_new_chunks is not None and newly_written >= max_new_chunks:
                    return {"complete": False, "newChunks": newly_written, "output": str(output)}
        if raw_size != expected_size or raw_hash.hexdigest() != expected_hash:
            raise ValueError(f"Source database verification failed: {name}")
        files.append({"name": name, "byteSize": raw_size, "checksum": expected_hash, "sourceArchiveChecksum": archive_hash, "compressedByteSize": sum(chunk["compressedByteSize"] for chunk in chunks), "chunks": chunks})
    manifest = {**intent, "files": files}
    manifest_bytes = canonical(manifest)
    atomic_write(output / "manifest.json", manifest_bytes, immutable=True)
    atomic_write(output / "progress.json", canonical({**intent, "status": "complete", "manifestChecksum": hashlib.sha256(manifest_bytes).hexdigest(), "completeFileCount": len(files)}))
    return {"complete": True, "newChunks": newly_written, "files": len(files), "chunks": sum(len(file["chunks"]) for file in files), "rawBytes": sum(file["byteSize"] for file in files), "compressedBytes": sum(file["compressedByteSize"] for file in files), "manifestChecksum": hashlib.sha256(manifest_bytes).hexdigest(), "output": str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--kind", choices=REQUIRED, required=True)
    parser.add_argument("--max-new-chunks", type=int)
    args = parser.parse_args()
    try:
        print(json.dumps(package(args.source_manifest, args.output, args.kind, max_new_chunks=args.max_new_chunks), sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"catalog packaging: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
