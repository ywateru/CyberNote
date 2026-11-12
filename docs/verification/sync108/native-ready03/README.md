# PageLoad feature build and bounded native handoff

Dewey confirmed `736469ee` as the latest frozen native module. It is cherry-picked
here as `31347d60`; the only new lib wiring is `e3225038`: the existing media
`opened` callback is retained and `sync_e2e::page_load(webview.label(), _payload)`
runs under `all(feature = "sync-e2e", debug_assertions, desktop)`.

The feature binary is `/private/tmp/cybernote-sync108-target/debug/notes-clone`,
SHA256 `771bed664a3793938b7dc18d6dd07a4cbb63cb088808174c44062d2fb49fd723`.
Its product source commit is `e3225038cd47f00774e08a8cf10e32ab2335668f`.
The static debug dist was reused without rebuilding; aggregate SHA256 remains
`ac755157f95eebd047f0f2830c0877abcecb72780f5f1ec5036d77be4fa82dc6`.

Build command (passed in 9.08 seconds, existing warnings only):

```sh
CARGO_TARGET_DIR=/private/tmp/cybernote-sync108-target \
  cargo build --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e,tauri/custom-protocol --locked --offline
```

`custom-protocol` embeds the existing static frontend; no Vite/1420 service is
required. Run with `NOTES_SYNC_E2E=1` on owned child processes and an explicit
`--data-dir /absolute/owned/path` to enable the stdin driver. Ordinary debug
without the feature and release builds exclude the module by compile cfg.
The earlier ordinary `.app` is preserved and was not rebuilt this round.

[handshake.json](handshake.json) records two actual native processes, each with
one Started and one Finished event, static `tauri://localhost`, document complete,
startup detached, root interactive, and readable actual workspace state. Both
owned processes exited naturally with code 0, without forced signals or cleanup
errors. Each reported window was visible; both reported the same position, so
this result does not establish successful left/right separation. Exact owned
canonical cache buckets were removed and recorded after shutdown.

This is a bounded read-only handoff check, not full native synchronization
acceptance. Dewey subsequently reported run05 PASS at
`/private/tmp/sync108-native-desktop-run05/result.json`: 33 checks, both read-only
DB/WAL projections equal with integrity ok and dirty/inbox zero, four owned
processes exiting naturally with code 0, no signals, and unchanged inputs.
Its result status/check count/input stability and original file hash were also
read directly and recorded in `desktop-run05-reference.json`; full formal
business evidence is owned by Dewey's separate desktop archive.
DESK11 remains partial: actual prepare/commit were observed, without a claim of
deterministic overlap with an in-flight save or IME. No business handlers,
frontend, Store, Session or synchronization logic changed here.

[canonical-native-build.json](canonical-native-build.json) records 450 canonical
product inputs through `productFiles()`/`sourceIdentity()`, product fingerprint
`e0718b71cde5440dce56d62ca43416891da77fe8db4f696fe5bf770455381b00`, and
separate native tool hashes. All enumerated product bytes match the frozen build
source commit. [build-evidence.json](build-evidence.json) records the fresh build
and build-log hash; the handshake is a separate record. The generator accepts
`--build-record` so a new artifact can be recorded while preserving the original
historical manifest. [canonical-consumer-check.json](canonical-consumer-check.json)
records acceptance by Dewey's canonical verifier (`2ef1580b`) and rejection of a
binary-hash mismatch. Later Node tool hashes are compared separately.

The prior `ready02` TIMEOUT/code-70 failure is preserved in the sibling
`native-ready02` directory. Its archived binary path and exact SHA are recorded
in the fresh `build-evidence.json` under `preservedPriorBinary`.
Earlier manifests and binaries were not overwritten. The exact prior owned
cache buckets were audited again; see `prior-ready02-cache-audit.json`.

[browser-revalidation.json](browser-revalidation.json) confirms Dewey's formal
results by reading and hashing their original records: startup 17 desktop + 4
mobile checks pass; mobile sync-settings 56 pass; desktop sync-settings fails
after 38 checks because 1280px buttons are 28–42px high against the existing
44px assertion. The original gate-hang diagnosis remains preserved. These
browser/IPC fixture checks do not prove native synchronization, and the desktop
settings failure is retained as history. The coordinator subsequently corrected
the tool's blanket 44px assertion to the existing desktop 28px/mobile 44px
interface contract, without product changes. The formal main `fixed02` records
were read and hashed: desktop and mobile sync-settings each pass 56 checks.
Tesla's independent review was pending at this handoff. No browser test was
rerun here.

The prior startup Rust suite/typecheck results are unchanged by this two-line
hook: 227 Rust tests passed, 4 ignored, including 9 startup tests; typecheck
passed. This round validates the feature compilation, actual native lifecycle
handoff, canonical consumer and generator syntax. It does not rerun those full
suites or claim an independently built release exclusion artifact.
