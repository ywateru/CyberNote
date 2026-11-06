"""Read-only independent audit of the author's exact build11 route evidence.

Does not run a tunnel, compile Rust, open a database, or read .sync identities.
Run from the route worktree root. Only writes this directory's audit.json.
"""
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path.cwd()
OUT = Path(__file__).resolve().parent
AUTHOR = ROOT / "docs/verification/sync87-routes/build11"
BUILD = Path("/private/tmp/sync86-transport-build11")
PRODUCT = "cd334bc88513a89c490788d2e2e27c7967575f4a"
OBSERVED = "0feb310ddae132adb13652ba909b323a72280c3c"
SCRIPT_SHA = "6d53b6b3256958046d1f3794f9ccec1513b2dce7e17acc37192bdcd12041f044"
BINARY_SHA = "333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800"
SELECTION = ["src-tauri/src", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock",
             "scripts/debug/rust", "scripts/debug/build-rust-attachments.mjs"]
checks = []
started = time.monotonic()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text())


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def check(name, condition):
    assert condition, name
    checks.append(name)


def object_fingerprint(commit):
    names = sorted(git("ls-tree", "-r", "--name-only", "-z", commit, "--", *SELECTION)
                   .decode().strip("\0").split("\0"))
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode() + b"\0")
        digest.update(git("show", commit + ":" + name))
        digest.update(b"\0")
    return {"commit": commit, "count": len(names), "sha256": digest.hexdigest()}


script = (ROOT / "scripts/debug/sync87-routes.mjs").read_bytes()
check("frozen route script equals 7323d818 object and expected SHA",
      sha(script) == SCRIPT_SHA == sha(git("show", "7323d818:scripts/debug/sync87-routes.mjs"))
      and (ROOT / "scripts/debug/rust-backend.mjs").read_bytes()
      == git("show", "7323d818:scripts/debug/rust-backend.mjs"))
manifest = load(AUTHOR / "artifacts.sha256.json")
check("author artifact manifest contains nine unique files",
      len(manifest) == 9 == len({r["path"] for r in manifest}))
artifacts = []
for row in manifest:
    data = (AUTHOR / row["path"]).read_bytes()
    check("artifact exact bytes " + row["path"], len(data) == row["size"] and sha(data) == row["sha256"])
    artifacts.append({"path": row["path"], "size": len(data), "sha256": sha(data)})
binary = BUILD / "notes-current-attachment-transport"
binary_bytes = binary.read_bytes()
check("immutable11 binary SHA size and mode", sha(binary_bytes) == BINARY_SHA
      and len(binary_bytes) == 25614448 and binary.stat().st_mode & 0o777 == 0o555)
build = load(BUILD / "build.json")
immutable = load(BUILD / "immutable-binary.json")
check("build metadata identifies cd334 and successful offline locked build",
      build["sourceHead"] == PRODUCT and build["sourcesUnchanged"] is True
      and build["binary"]["sha256"] == BINARY_SHA
      and all(r["exitCode"] == 0 and r["signal"] is None for r in build["commands"])
      and "--locked" in build["commands"][0]["command"] and "--offline" in build["commands"][0]["command"]
      and immutable["sha256"] == BINARY_SHA and immutable["sourceAndImmutableHashMatch"] is True)
source_rows = []
for path, expected in build["sources"].items():
    actual = sha(git("show", PRODUCT + ":" + path))
    assert actual == expected, path
    if path.startswith("src-tauri/src/") and path != "src-tauri/src/recording_window.rs":
        assert sha((BUILD / "harness/current" / path.removeprefix("src-tauri/src/")).read_bytes()) == expected, path
    if path.startswith("scripts/debug/rust/"):
        assert sha((BUILD / "harness" / Path(path).name).read_bytes()) == expected, path
    source_rows.append({"path": path, "sha256": actual})
check("all 47 builder source inputs match exact product objects and copied production modules", len(source_rows) == 47)
fingerprints = [object_fingerprint(c) for c in [PRODUCT, OBSERVED]]
check("55-input historical product and evidence-source fingerprints match",
      all(f["count"] == 55 and f["sha256"] == "77cae55ece5f66cb0c36a387ab7972056a7ab7c8d64da3da100249a4782a5d98" for f in fingerprints))
check("historical selected input diff is empty", not git("diff", PRODUCT, OBSERVED, "--", *SELECTION))

result = load(AUTHOR / "result.json")
execution = load(AUTHOR / "run.execution.json")
mapping = load(AUTHOR / "source-mapping.json")
check("author execution exact binary expected SHA all routes natural exit0",
      execution["exitCode"] == 0 and execution["wallMs"] == 92337
      and execution["args"][-2:] == ["all", BINARY_SHA]
      and execution["args"][2] == str(binary))
check("result declares unchanged exact script binary and source",
      result["script"] == {"sha256": SCRIPT_SHA, "after": SCRIPT_SHA}
      and result["binary"]["sha256"] == BINARY_SHA == result["binary"]["after"]
      and result["sourceBefore"] == result["sourceAfter"]
      and result["sourceBefore"]["head"] == OBSERVED
      and result["sourceBefore"]["sha256"] == fingerprints[0]["sha256"]
      and mapping["binaryProducerProductCommit"] == PRODUCT and mapping["exitCode"] == 0)
stdout = (AUTHOR / "run.stdout.log").read_text().splitlines()
check("56 checks exactly correspond to raw stdout and failures stderr empty",
      len(result["checks"]) == 56 and stdout == ["PASS " + r["name"] for r in result["checks"]]
      and result["failures"] == [] and (AUTHOR / "run.stderr.log").stat().st_size == 0)
check("internal and external wall times consistently bounded", result["wallMs"] == 92252
      and 0 <= execution["wallMs"] - result["wallMs"] < 1000)
processes = result["processes"]
check("seven distinct Rust PIDs natural0 no pending or quiet errors",
      len(processes) == 7 == len({r["pid"] for r in processes})
      and all(r["exit"] == {"code": 0, "signal": None} and r["pending"] == 0
              and r["errors"] == [] and r["closing"] is True for r in processes))
by_name = {p["name"]: p for p in processes}
for label in ["LAN", "Tunnel"]:
    original, reopened = by_name[label + "-client"], by_name[label + "-client-restart"]
    check(label + " restart has same root different PID", original["root"] == reopened["root"] and original["pid"] != reopened["pid"])
check("all Rust roots isolated under exact owned run directory",
      all(p["root"].startswith("/private/tmp/sync87-routes-build11-final01/") for p in processes))
check("LAN explicitly same host physical interface and VPN explicitly unverified",
      result["routes"]["lan"]["verified"] is True and result["routes"]["lan"]["samePhysicalHost"] is True
      and result["routes"]["lan"]["interface"] == "en0" and result["routes"]["virtualNetwork"]["verified"] is False)
t1, t2 = result["tunnels"]
check("two distinct wss endpoints match recorded cloudflared logs",
      t1["endpoint"] != t2["endpoint"]
      and all(t["endpoint"].replace("wss:", "https:") in (AUTHOR / (t["name"] + ".log")).read_text()
              and "Registered tunnel connection" in (AUTHOR / (t["name"] + ".log")).read_text()
              and t["wsProbes"] == [{"connected": True, "closed": True}] for t in [t1, t2]))
check("first tunnel forced SIGKILL retained and second graceful natural0 retained",
      t1["forced"] is True and t1["exit"] == {"code": None, "signal": "SIGKILL"}
      and t2["forced"] is False and t2["exit"] == {"code": 0, "signal": None})
bad = by_name["Tunnel-bad-key"]["timings"][0]
origin = t1["originConnections"][-1]
check("sequential incorrect PSK reaches origin Upgrade and exchanges Noise bytes",
      bad == {"type": "pair", "wallMs": 2282, "ok": False, "code": "sync_transport"}
      and result["routes"]["quickTunnel"]["badKeyCode"] == "sync_transport"
      and len(t1["originConnections"]) == 3 and origin["upgradeRequest"] is True
      and origin["upgradeResponse"] is True and origin["toHostBytes"] == 851
      and origin["fromHostBytes"] == 278 and origin["closedMs"] > origin["openedMs"])
check("all proxy connections recorded closed and new-hostname restart exchanges bytes",
      all(r["closedMs"] > r["openedMs"] for t in [t1, t2] for r in t["originConnections"])
      and len(t2["originConnections"]) == 3 and t2["originConnections"][-1]["fromHostBytes"] > 129)
cleanup = load(AUTHOR / "owned-cleanup.json")["processes"]
all_children = processes + [t1, t2]
check("author owned cleanup covers exact nine children with accurate exits",
      len(cleanup) == 9 and {r["pid"] for r in cleanup} == {r["pid"] for r in all_children}
      and all(r["alive"] is False and r["recordedExit"] == next(x["exit"] for x in all_children if x["pid"] == r["pid"]) for r in cleanup))

# The paths below are exclusively the retained synthetic author output. Read
# their bytes for identity only; never read .sync credentials or SQLite rows.
retained = []
for row in result["files"]:
    path = Path(row["path"])
    assert str(path).startswith("/private/tmp/sync87-routes-build11-final01/")
    assert ".sync" not in path.parts
    data = path.read_bytes()
    assert len(data) == row["size"] and sha(data) == row["sha256"], str(path)
    retained.append({"path": str(path), "size": len(data), "sha256": sha(data)})
check("all 31 retained synthetic export managed media config and SQLite byte hashes match", len(retained) == 31)
check("independent scan of nine archived text files contains no invitation token PSK or private key values",
      all(not re.search(r'notes-sync-v1:[A-Za-z0-9_-]+|"(?:psk|privateKey|private_key)"\s*:\s*"[^"\s]+"', (AUTHOR / r["path"]).read_text()) for r in manifest))

output = {"status": "PASS-INDEPENDENT-ROUTE-EVIDENCE-AUDIT", "scope": "Read-only independent audit, not an independent public-route rerun",
          "reviewHead": git("rev-parse", "HEAD").decode().strip(), "checks": checks,
          "passedChecks": len(checks), "wallMs": round((time.monotonic() - started) * 1000),
          "binary": {"path": str(binary), "size": len(binary_bytes), "sha256": sha(binary_bytes)},
          "historicalFingerprints": fingerprints, "builderSourceInputs": source_rows,
          "authorArtifacts": artifacts, "retainedAuthorFiles": retained,
          "limits": ["No independent route rerun; author 56 checks and 92.337s are reviewed evidence.",
                     "LAN is two Stores on one physical Mac, not two devices.",
                     "First owned cloudflared required SIGKILL after the graceful deadline.",
                     "WireGuard/EasyTier and native UI/Android remain outside this gate.",
                     "No Rust compile, VPN change, user database, .sync secret or real microphone."]}
(OUT / "audit.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"status": output["status"], "checks": len(checks), "wallMs": output["wallMs"]}))
