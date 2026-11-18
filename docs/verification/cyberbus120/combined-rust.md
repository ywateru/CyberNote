# Combined Rust CLI regression

**PASS — 49 passed, 0 failed, 0 ignored** in the four requested directed groups.
Source is the main workspace `/Users/water/work/2026/Apple-Notes-Clone`, exact HEAD
`c693a748788fe648f7959a6a72a17aa83362c6e3`. Started `2026-11-18T20:50:52+08:00`; finished `2026-11-18T20:52:00+08:00`.
This report was written without creating a Git commit.

## Shared target and source coordination

Tesla was contacted before any Cargo invocation and explicitly retained
`src-tauri/target` for the composed Debug `.app` build. Tesla reported that build
completed at 2026-11-18 20:48:12 +08:00 with exit code 0, explicitly released the target,
and confirmed no further Cargo builds would run. This author acknowledged the release,
then ran the four commands sequentially. After completion, Tesla was notified that the
shared target was free again. No extra target directory or cache cleanup was used.
The packaged `CyberNote.app` was not opened, modified, re-signed or replaced by this task.

Before and after **each** test invocation, HEAD was required to equal the SHA above and
`git diff --name-only c693a748788fe648f7959a6a72a17aa83362c6e3 -- src-tauri crates vendor` was required to be empty.
These checks passed. Other agents' documentation edits were preserved; no stash/reset,
product-source edit or commit was performed by this task.

## Exact commands and environment

Working directory: `/Users/water/work/2026/Apple-Notes-Clone`.
Toolchain: `rustc 1.97.1 (8bab26f4f 2026-07-14)`,
`cargo 1.97.1 (c980f4866 2026-06-30)`.

```sh
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_TEST_DEBUG=0
export CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
export PROTOC=/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/protoc-bin-vendored-macos-aarch_64-3.3.0/bin/protoc
unset TAURI_CONFIG
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib account::
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib account_policy_real_store
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib sync_headless::
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib sync_e2e::
```

The actual main workspace Tauri configuration was used, with **no** bundle resources or
externalBin override. Cargo dependency resolution was offline and locked. These flags
constrain Cargo dependency fetching; the selected tests themselves use only offline SDK
fixtures, temporary local Stores/Sessions and loopback protocol boundaries. They do not
perform live hosted login or remote account-network acceptance.

## Results

| Filter | Passed | Failed | Ignored | Exit code | Command wall time |
| --- | ---: | ---: | ---: | ---: | ---: |
| `account::` | 35 | 0 | 0 | 0 | 64.620s |
| `account_policy_real_store` | 3 | 0 | 0 | 0 | 1.194s |
| `sync_headless::` | 7 | 0 | 0 | 0 | 1.232s |
| `sync_e2e::` | 4 | 0 | 0 | 0 | 0.441s |
| **Total** | **49** | **0** | **0** | **all 0** | |

All four commands ran the same compiled library-test executable:
`/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/deps/notes_clone_lib-b060c545ddfd8e35`.
SHA-256: `c441bc97853fb944f0907962c98bdb3838964b3a217fc1b25ee4bda59684485d`.
The library test binary contains 375 tests; this task ran only the requested four groups,
not the full suite. Cargo reported 22 library-test warnings and existing dependency/native
warnings; no compilation or test errors occurred in this combined run. The first command
includes compilation time; test execution itself took 0.99s / 0.49s / 0.83s / 0.00s.

The account group includes the actual offline SDK UpdatePublicProfile validation, SDK
no-grant repeated logout, finite cloud/local receipt classification, current auth/network
projection, profile rejection, directory history, cancellation/retirement and real
Store/Session adoption boundaries. The three directional tests use real Store/Session,
Noise and SyncService to verify durable directional receipts, inbox isolation and attachment
byte equality. Headless tests validate fixed-command parsing, opt-in switches and real Session
participant boundaries; they do not execute a live headless account session. `sync_e2e::`
means Rust diagnostic/ownership contract tests here, **not UI automation**.

## Evidence and limits

Full local command logs and their SHA-256 values:

| Log | SHA-256 |
| --- | --- |
| `/tmp/cyberbus121-combined-account.log` | `ced950ee5266630f0709aeaac2b7734a8901a4e0f1f0058dce0e4b94ddf61235` |
| `/tmp/cyberbus121-combined-directional.log` | `75d2150c490901de9ccb37674cde62c6916c78ab6fdfb1baea37f9a25a693cbd` |
| `/tmp/cyberbus121-combined-headless.log` | `81abcb9cbc3247d546c8eb2c644e3fc36e2d2282eefcad02ded846f84cbc388f` |
| `/tmp/cyberbus121-combined-e2e-contract.log` | `c57f0cd908b8eec60d47f92cf0e591ff95f08e34ca50306307d134ed7a1a435b` |

Machine-readable command, source, environment, count and binary evidence:
`/tmp/cyberbus121-combined-rust-results.json`, SHA-256 `8e8b7996e199e50b2a8a298a838555e23b033d10650f65bac72f2fc617ba83ab`.
These `/tmp` files are local run evidence, not committed repository artifacts; this report
retains their exact results and hashes. No failures were suppressed or converted to success.
Earlier checkpoint failures remain recorded in account.md and the independent review reports.

This result does not replace the separate real Logto/remote bootstrap/Store harness evidence,
macOS Keychain or Android Keystore execution, package verification, or manual UI acceptance.
No user library, real account session, App window, browser UI or UI automation was used.
Manual UI cases remain for the user in MANUAL-UI-TESTS.md. No new tests or acceptance gates
were added during this combined regression.
