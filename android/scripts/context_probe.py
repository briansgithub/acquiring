#!/usr/bin/env python3
"""Estimate context risk locally and emit bounded, recency-first text slices."""

from __future__ import annotations

import argparse
import math
import os
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path

READ_CHUNK = 1024 * 1024
LOW_TOKEN_LIMIT = 2_000
MEDIUM_TOKEN_LIMIT = 8_000
HIGH_TOKEN_LIMIT = 20_000
DEFAULT_SKIPS = {".git", ".agent-artifacts", "__pycache__", "node_modules"}


@dataclass
class FileRisk:
    path: str
    bytes: int
    lines: int | None
    token_low: int | None
    token_high: int | None
    risk: str
    note: str


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except ValueError:
        return str(path.resolve())


def is_probably_binary(path: Path) -> bool:
    with path.open("rb") as stream:
        sample = stream.read(8192)
    if b"\x00" in sample:
        return True
    if not sample:
        return False
    controls = sum(byte < 9 or 13 < byte < 32 for byte in sample)
    return controls / len(sample) > 0.20


def classify(token_high: int) -> tuple[str, str]:
    if token_high <= LOW_TOKEN_LIMIT:
        return "low", "full read usually safe"
    if token_high <= MEDIUM_TOKEN_LIMIT:
        return "medium", "search or chunk first"
    if token_high <= HIGH_TOKEN_LIMIT:
        return "high", "chunk; justify full read"
    return "extreme", "confirm before full read"


def inspect_file(path: Path) -> FileRisk:
    size = path.stat().st_size
    if is_probably_binary(path):
        return FileRisk(display_path(path), size, None, None, None, "binary", "do not submit as text")

    characters = ascii_characters = newlines = 0
    non_ascii_characters = 0
    last_character = ""
    with path.open("r", encoding="utf-8", errors="replace", newline="") as stream:
        while chunk := stream.read(READ_CHUNK):
            characters += len(chunk)
            ascii_count = sum(ord(character) < 128 for character in chunk)
            ascii_characters += ascii_count
            non_ascii_characters += len(chunk) - ascii_count
            newlines += chunk.count("\n")
            last_character = chunk[-1]

    lines = 0 if characters == 0 else newlines + (0 if last_character == "\n" else 1)
    # Tokenization varies by model and content. This range deliberately becomes
    # more conservative for non-ASCII text instead of presenting false precision.
    token_low = math.ceil(ascii_characters / 4 + non_ascii_characters / 2)
    token_high = math.ceil(ascii_characters / 3 + non_ascii_characters * 2)
    risk, note = classify(token_high)
    return FileRisk(display_path(path), size, lines, token_low, token_high, risk, note)


def iter_files(paths: list[Path], recursive: bool) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for candidate in paths:
        resolved = candidate.resolve()
        if resolved.is_file():
            if resolved not in seen:
                files.append(resolved)
                seen.add(resolved)
            continue
        if not resolved.is_dir():
            raise FileNotFoundError(candidate)
        if not recursive:
            raise IsADirectoryError(f"{candidate} (use --recursive to scan a directory)")
        for root, directories, names in os.walk(resolved):
            directories[:] = [name for name in directories if name not in DEFAULT_SKIPS]
            for name in names:
                path = (Path(root) / name).resolve()
                if path not in seen:
                    files.append(path)
                    seen.add(path)
    return files


def token_text(low: int | None, high: int | None) -> str:
    if low is None or high is None:
        return "n/a"
    return f"{low:,}-{high:,}"


def run_scan(args: argparse.Namespace) -> int:
    try:
        paths = iter_files([Path(value) for value in args.paths], args.recursive)
    except (OSError, ValueError) as exc:
        print(f"context probe failed: {exc}", file=sys.stderr)
        return 2

    results: list[FileRisk] = []
    errors: list[str] = []
    for path in paths:
        try:
            results.append(inspect_file(path))
        except OSError as exc:
            errors.append(f"{display_path(path)}: {exc}")

    results.sort(key=lambda item: (item.token_high or -1, item.bytes), reverse=True)
    visible = results if args.top == 0 else results[: args.top]
    for result in visible:
        line_text = "n/a" if result.lines is None else f"{result.lines:,}"
        print(
            f"{result.risk:<7} {token_text(result.token_low, result.token_high):>15} tok "
            f"{result.bytes:>10,} B {line_text:>8} lines  {result.path}  [{result.note}]"
        )

    text_results = [item for item in results if item.token_low is not None]
    total_low = sum(item.token_low or 0 for item in text_results)
    total_high = sum(item.token_high or 0 for item in text_results)
    total_risk, total_note = classify(total_high)
    print(
        f"TOTAL {total_risk} {len(results)} files, "
        f"{sum(item.bytes for item in results):,} B, "
        f"~{total_low:,}-{total_high:,} text tokens "
        f"[{total_note}]"
    )
    if len(visible) < len(results):
        print(f"OUTPUT limited to {len(visible)} largest files; use --top 0 to list all")
    for error in errors:
        print(f"warning: {error}", file=sys.stderr)
    return 1 if errors else 0


def read_tail(path: Path, line_count: int, header_count: int) -> tuple[list[str], list[tuple[int, str]], int]:
    header: list[str] = []
    recent: deque[tuple[int, str]] = deque(maxlen=line_count)
    total = 0
    with path.open("r", encoding="utf-8", errors="replace") as stream:
        for total, line in enumerate(stream, start=1):
            if total <= header_count:
                header.append(line)
            recent.append((total, line))
    recent_lines = list(recent)
    while len(recent_lines) > 1 and not recent_lines[-1][1].strip():
        recent_lines.pop()
    return header, recent_lines, total


def bound_lines(
    lines: list[tuple[int, str]], max_characters: int
) -> tuple[list[tuple[int, str]], bool]:
    selected: list[tuple[int, str]] = []
    remaining = max_characters
    truncated = False
    for number, line in reversed(lines):
        text = line.rstrip("\r\n")
        cost = len(text) + 1
        if cost <= remaining:
            selected.append((number, text))
            remaining -= cost
            continue
        truncated = True
        if remaining > 16:
            selected.append((number, "..." + text[-(remaining - 4) :]))
        break
    if len(selected) < len(lines):
        truncated = True
    selected.reverse()
    return selected, truncated


def emit_lines(lines: list[tuple[int, str]], numbered: bool) -> None:
    for number, text in lines:
        print(f"{number:>7} {text}" if numbered else text)


def run_tail(args: argparse.Namespace) -> int:
    path = Path(args.path)
    try:
        if is_probably_binary(path):
            raise ValueError("binary file cannot be emitted as text")
        header, recent, total = read_tail(path, args.lines, args.header_lines)
    except (OSError, ValueError) as exc:
        print(f"context tail failed: {exc}", file=sys.stderr)
        return 2

    start = recent[0][0] if recent else 0
    print(f"--- {display_path(path)} recent lines {start}-{total} of {total} ---")
    if header and start > len(header) + 1:
        header_budget = min(2_000, max(1, args.max_characters // 4))
        bounded_header, header_truncated = bound_lines(
            list(enumerate(header, start=1)), header_budget
        )
        print(f"--- header lines 1-{len(header)} ---")
        if header_truncated:
            print(f"--- header bounded to {header_budget:,} characters ---")
        emit_lines(bounded_header, args.number)
        print(f"--- recent lines {start}-{total} ---")
        recent_budget = max(1, args.max_characters - header_budget)
    else:
        recent_budget = args.max_characters
    bounded_recent, recent_truncated = bound_lines(recent, recent_budget)
    if recent_truncated:
        print(f"--- recent output bounded to {recent_budget:,} characters ---")
    if start > 1:
        print(f"--- older context available: chunk --end-line {start - 1} --lines {args.lines} ---")
    emit_lines(bounded_recent, args.number)
    return 0


def count_lines(path: Path) -> int:
    total = 0
    with path.open("r", encoding="utf-8", errors="replace") as stream:
        for total, _line in enumerate(stream, start=1):
            pass
    return total


def run_chunk(args: argparse.Namespace) -> int:
    path = Path(args.path)
    try:
        if is_probably_binary(path):
            raise ValueError("binary file cannot be emitted as text")
        total = count_lines(path)
        end = min(args.end_line, total)
        start = max(1, end - args.lines + 1)
        selected: list[tuple[int, str]] = []
        with path.open("r", encoding="utf-8", errors="replace") as stream:
            for number, line in enumerate(stream, start=1):
                if number < start:
                    continue
                if number > end:
                    break
                selected.append((number, line))
    except (OSError, ValueError) as exc:
        print(f"context chunk failed: {exc}", file=sys.stderr)
        return 2

    if total == 0:
        print(f"--- {display_path(path)} is empty ---")
        return 0
    print(f"--- {display_path(path)} lines {start}-{end} of {total} ---")
    bounded, truncated = bound_lines(selected, args.max_characters)
    if truncated:
        print(f"--- output bounded to {args.max_characters:,} characters ---")
    if start > 1:
        print(f"--- older context available: chunk --end-line {start - 1} --lines {args.lines} ---")
    emit_lines(bounded, args.number)
    return 0


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    scan = commands.add_parser("scan", help="estimate file/context risk without emitting contents")
    scan.add_argument("paths", nargs="+", help="files, or directories with --recursive")
    scan.add_argument("--recursive", action="store_true", help="scan directories recursively")
    scan.add_argument("--top", type=int, default=20, help="show N largest files; 0 shows all")
    scan.set_defaults(handler=run_scan)

    tail = commands.add_parser("tail", help="emit the most recent text lines first")
    tail.add_argument("path")
    tail.add_argument("--lines", type=positive_integer, default=120)
    tail.add_argument("--header-lines", type=int, default=0)
    tail.add_argument("--max-characters", type=positive_integer, default=12_000)
    tail.add_argument("--number", action="store_true", help="include line numbers")
    tail.set_defaults(handler=run_tail)

    chunk = commands.add_parser("chunk", help="page backward from an inclusive line number")
    chunk.add_argument("path")
    chunk.add_argument("--end-line", type=positive_integer, required=True)
    chunk.add_argument("--lines", type=positive_integer, default=120)
    chunk.add_argument("--max-characters", type=positive_integer, default=12_000)
    chunk.add_argument("--number", action="store_true", help="include line numbers")
    chunk.set_defaults(handler=run_chunk)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if getattr(args, "top", 0) < 0 or getattr(args, "header_lines", 0) < 0:
        print("counts cannot be negative", file=sys.stderr)
        return 2
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
