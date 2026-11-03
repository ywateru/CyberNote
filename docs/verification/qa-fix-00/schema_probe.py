"""Contrast production import with the installed editor's actual schema."""
import json
from pathlib import Path
import subprocess
import tempfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
PROBE = OUT / "store-probes/target/debug/independent"
cases = {
    "inline-at-doc-root": {"type": "doc", "content": [{"type": "text", "text": "TEXT DIRECTLY IN DOC"}]},
    "block-inside-paragraph": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "NESTED BLOCK"}]}]}]},
    "paragraph-inside-table": {"type": "doc", "content": [{"type": "table", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "NOT A TABLE ROW"}]}]}]},
}
results=[]
(OUT / "schema-fixtures").mkdir(exist_ok=True)
for name, document in cases.items():
    with tempfile.TemporaryDirectory(prefix="notes-schema-probe-") as directory:
        root = Path(directory)
        subprocess.run([str(PROBE), "seed", directory], check=True)
        archive = json.loads((root / "source.notesbackup").read_text())
        archive["notes"][0]["document"] = document
        fixture = OUT / "schema-fixtures" / f"{name}.notesbackup"
        fixture.write_text(json.dumps(archive, indent=2, ensure_ascii=False) + "\n")
        imported=json.loads(subprocess.check_output([str(PROBE), "import", directory, str(fixture)], text=True))
        schema=json.loads(subprocess.check_output(["node",str(OUT / "schema-check.mjs"),str(fixture)],cwd=ROOT,text=True))
        reopened=json.loads(subprocess.check_output([str(PROBE),"inspect",directory],text=True))
        persisted=any(n["document"]==document for n in reopened["workspace"]["notes"])
        assert imported["accepted"] and not schema["schemaAccepted"] and persisted
        results.append(dict(case=name,rustImport=imported,editorSchema=schema,invalidDocumentPersistedAfterReopen=persisted))
(OUT / "schema-result.json").write_text(json.dumps(results,indent=2,ensure_ascii=False)+"\n")
print(json.dumps(results,indent=2,ensure_ascii=False))
