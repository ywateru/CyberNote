"""Independent subprocess/reopen probe; runs committed production Store tests."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
PROBE = OUT / "store-probes/target/debug/independent"
WORKER = ROOT / "src-tauri/target/debug/deps/notes_clone_lib-a59858f7036aafd6"


def load(path):
    return json.loads(path.read_text())


results = []
for stage in ["staging", "journal", "first_file", "files", "before_commit", "after_commit"]:
    with tempfile.TemporaryDirectory(prefix="notes-independent-crash-") as directory:
        root = Path(directory)
        subprocess.run([str(PROBE), "seed", directory], check=True)
        before = load(root / "before.json")
        source = load(root / "source.json")
        archive = root / "source.notesbackup"
        original = hashlib.sha256(archive.read_bytes()).hexdigest()
        env = dict(os.environ, NOTES_TEST_ARCHIVE_CRASH=stage,
                   NOTES_TEST_ARCHIVE_ROOT=str(root / "target"),
                   NOTES_TEST_ARCHIVE_FILE=str(archive))
        child = subprocess.run([str(WORKER), "--exact", "store::archive::tests::crash_worker", "--ignored"],
                               env=env, capture_output=True, text=True)
        assert child.returncode == 77, (stage, child.returncode, child.stdout, child.stderr)
        # This opens a fresh Store, invoking real startup journal/SQLite recovery.
        after = json.loads(subprocess.check_output([str(PROBE), "inspect", directory], text=True))
        assert original == hashlib.sha256(archive.read_bytes()).hexdigest()
        for name, data in before["files"].items():
            assert after["files"][name] == data, (stage, name)
        assert not list((root / "target/.imports").iterdir())
        if stage == "after_commit":
            assert after["workspace"]["settings"] == source["settings"]
            for key in ["notes", "folders", "attachments"]:
                for old in before["workspace"][key]:
                    assert old in after["workspace"][key], (stage, key, old)
            assert len(after["workspace"]["notes"]) == len(before["workspace"]["notes"]) + len(source["notes"])
            for a in after["workspace"]["attachments"]:
                assert a["relativePath"] in after["files"]
            expected = "committed import retained, old entities/bytes unchanged"
        else:
            assert after == before, stage
            expected = "complete old workspace/settings/bytes restored"
        results.append(dict(stage=stage, actualExitCode=child.returncode,
                            recovered=expected, sourceArchiveUnchanged=True,
                            oldAttachmentBytesEqual=True, stagingEmpty=True,
                            workerStdout=child.stdout.strip()))

result = dict(sourceCommit="9b724a5019627fd025fd0c8bb73ac92a47681263",
              workerExecutableSha256=hashlib.sha256(WORKER.read_bytes()).hexdigest(),
              stages=results)
(OUT / "crash-result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(result, indent=2, ensure_ascii=False))
