#!/usr/bin/env python3
"""Verify retained evidence, or replay its read-only Apple-tool commands.

REA MCP evidence is exported separately; this script handles shell supplements.
Use a fresh --out directory so the original investigation stays unchanged.
"""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def select_context(data, pattern, radius):
    lines = data.decode(errors="replace").splitlines()
    selected = set()
    for i, line in enumerate(lines):
        if pattern(line):
            selected.update(range(max(0, i - radius), min(len(lines), i + radius + 1)))
    return ("\n".join(f"{i + 1}: {lines[i]}" for i in sorted(selected)) + "\n").encode()


def select_blocks(data, patterns):
    blocks, current = [], []
    for line in data.decode(errors="replace").splitlines(keepends=True):
        if re.match(r"^\S.*:\s*$", line):
            if current:
                blocks.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append(current)
    # These are label-delimited blocks, not proof of complete function boundaries.
    return "".join("".join(b) for b in blocks if any(p in b[0] for p in patterns)).encode()


def verify(manifest):
    checked = 0
    for entry in manifest:
        path = EVIDENCE / (entry["name"] + ".txt")
        if not path.exists():
            # Full outputs replaced by explicitly described excerpts are not retained.
            assert any(e.get("derived_from") == path.name for e in manifest), path
            continue
        assert digest(path.read_bytes()) == entry["sha256"], f"Hash mismatch: {path}"
        checked += 1
    bundle = json.loads((EVIDENCE / "rea-evidence.json").read_text())
    identity = json.loads((EVIDENCE / "target-identity.json").read_text())
    assert identity["sha256"] in json.dumps(bundle), "REA target identity mismatch"
    print(f"Verified {checked} retained shell outputs and matching REA target identity.")


def replay(manifest, out):
    out.mkdir(parents=True, exist_ok=False)
    raw_by_name, command_cache, results = {}, {}, []
    derived_sources = {e.get("derived_from") for e in manifest}
    for entry in manifest:
        if "derived_from" in entry:
            raw = raw_by_name[entry["derived_from"]]
            pattern = re.compile(entry["selection_regex"])
            data = select_context(raw, lambda line: bool(pattern.search(line)), 2)
        else:
            args = entry["argv"]
            assert Path(args[0]).name in {"otool", "nm", "strings", "dyld_info"}
            assert args[-1].startswith(("/System/Applications/Notes.app/", "/System/Library/PrivateFrameworks/Notes"))
            key = tuple(args)
            if key not in command_cache:
                result = subprocess.run(args, capture_output=True, check=True)
                command_cache[key] = result.stdout
            raw = command_cache[key]
            raw_by_name[entry["name"] + ".txt"] = raw
            data = raw
            if "selection_patterns" in entry:
                patterns = entry["selection_patterns"]
                if "20 lines" in entry["selection_scope"]:
                    data = select_context(raw, lambda line: any(p in line for p in patterns), 20)
                else:
                    data = select_blocks(raw, patterns)
        name = entry["name"] + ".txt"
        if name not in derived_sources:
            (out / name).write_bytes(data)
            results.append({"name": name, "sha256": digest(data), "bytes": len(data)})
    (out / "replay-results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(f"Wrote {len(results)} outputs to {out}; compare identities before reusing conclusions.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Check retained evidence hashes; no target execution")
    parser.add_argument("--out", type=Path, help="Replay static commands into a NEW directory; no Notes launch")
    args = parser.parse_args()
    manifest = json.loads((EVIDENCE / "shell-manifest.json").read_text())
    if args.verify:
        verify(manifest)
    elif args.out:
        replay(manifest, args.out.resolve())
    else:
        parser.error("Choose --verify or --out NEW_DIRECTORY")


if __name__ == "__main__":
    main()
