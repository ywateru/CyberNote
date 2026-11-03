"""Read the fixed independent bad archives without rewriting their evidence."""

import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BINARY = HERE / "store-probes/target/debug/independent"
FIXTURES = ROOT / "docs/verification/qa-fix-00/schema-fixtures"


def invoke(*args):
    completed = subprocess.run(
        [str(BINARY), *map(str, args)], check=True, capture_output=True, text=True
    )
    return json.loads(completed.stdout) if completed.stdout.strip() else None


results = []
for archive in sorted(FIXTURES.glob("*.notesbackup")):
    original = archive.read_bytes()
    with tempfile.TemporaryDirectory(prefix="notes-schema-fixture-") as temporary:
        temporary_root = Path(temporary)
        invoke("seed", temporary_root)
        before = json.loads((temporary_root / "before.json").read_text())
        outcome = invoke("import", temporary_root, archive)
        after = invoke("inspect", temporary_root)
        assert outcome["accepted"] is False, (archive.name, outcome)
        assert outcome["error"]["code"] == "archive_invalid", outcome
        assert before == after, f"Workspace/settings/files changed: {archive.name}"
        assert archive.read_bytes() == original, f"Source changed: {archive.name}"
        imports = temporary_root / "target/.imports"
        assert not imports.exists() or not any(imports.iterdir()), archive.name
        results.append(
            {
                "name": archive.name,
                "sha256": hashlib.sha256(original).hexdigest(),
                "result": outcome,
                "workspaceSettingsAndAllAttachmentBytesEqualAfterReopen": True,
                "sourceBytesEqual": True,
                "importsDirectoryClean": True,
            }
        )

assert len(results) == 3, f"Expected three original fixed fixtures, found {len(results)}"
output = HERE / "qa-fixture-result.json"
output.write_text(json.dumps({"fixtures": results}, ensure_ascii=False, indent=2) + "\n")
print(f"Rejected all {len(results)} original bad archives; state and source preserved. {output}")
