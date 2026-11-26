#!/usr/bin/env python3
"""Package one declarative CyberNote plugin directory into a deterministic ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def fail(message: str) -> "NoReturn":
    print(f"plugin package: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    manifest_path = source / "manifest.json"
    if not manifest_path.is_file():
        fail(f"missing manifest: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as error:
        fail(f"invalid manifest: {error}")
    if manifest.get("manifestVersion") != 1:
        fail("manifestVersion must be 1")
    plugin_id = manifest.get("id")
    version = manifest.get("version")
    if not isinstance(plugin_id, str) or not isinstance(version, str):
        fail("manifest id/version must be strings")

    files = sorted(
        path
        for path in source.rglob("*")
        if path.is_file()
        and not any(part.startswith(".") for part in path.relative_to(source).parts)
    )
    if not files:
        fail("no files to package")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(source).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "id": plugin_id,
                "version": version,
                "files": len(files),
                "bytes": output.stat().st_size,
                "sha256": digest,
                "output": str(output),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
