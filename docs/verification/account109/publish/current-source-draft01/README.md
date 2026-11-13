# Current source-only release DRAFT

**PASS preparation; real acceptance remains PENDING.** This is a new local sanitized source DRAFT, not a published release or final accepted delivery. Prepared under the exact committed `scripts/publish/README.md` export contract, with no dependency installation, tests, product builds, App/device operation or external writes.

- Requested development source: `9010c5bada147936c9f3e8db8159ef777d3bbb87`.
- New, previously absent canonical target: `/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01`.
- Independent DRAFT root commit: `66ad8c524841acd574b705ead8d08c7bb9a50ad7`.
- DRAFT tree: `0857239a05d12f81f2147c4dc435e0ef8cbf542b`.
- Actual inventory: **1,772 files; 95,275,206 bytes**. Every payload path, mode, byte length and SHA256 matches the exact committed-source plan.

## Validation and privacy boundary

Manifest dry-run returned `changes: []`. Export dry-run and the explicit `--apply --init` succeeded. In the new repository, `node scripts/publish/verify.mjs --new-root`, version checks and clean source identity passed. History has one parentless main commit, one ref, no remotes, independent Git storage, no shallow/alternate storage and no retained historical objects. The draft remained byte/metadata-identical after read-only verification; its initial and final full seals match.

The exact allowlist, SHA pins, credential/path/binary scanners, ownership/runtime provenance/license checks and dependency closure all passed. Private docs, live evidence, process logs, verification runners, stores, build outputs and dependency caches are excluded. Public templates match exact committed bytes, and four archive backups are the reviewed synthetic fixtures. Fixed synthetic source fixtures and declared provider binaries are intentional export inputs. These checks validate the reviewed source boundary; pattern scans alone cannot prove absence of every possible sensitive string.

Compared with the prior 86cf971f DRAFT, one source file is added (`src-tauri/src/account/recovery.rs`), fourteen existing paths change and none are removed; finite path inventory is in `delta-vs-prior-draft.json`. These are source/manifest changes already subject to separate source approvals. Current source 9010c5ba differs from GUI candidate source 920fa9cf only in docs and verification scripts (30 paths); no product path changed. The exported repository has its own new revision and a transformed source fingerprint, not the GUI build's revision/fingerprint. No binary is rebuilt or relabeled.

## Workflow boundary

The exact retained workflow is unchanged: SHA256 `ecd9862f73c39b03f78b97103f431e659b6aa56f364c19d614957f7f6bb3d6f0`. It grants contents read, disables checkout credential persistence, runs the sanitized checkout gate before dependency installation, and bounds both jobs to 60 minutes. It requires actual macOS arm64 and explicit Android arm64/pinned toolchains. Artifact upload is limited to eight named package/notices/identity/checksum paths. No repository creation, push, release/deployment or signing/notarization operation was performed. The workflow itself was not executed, so package/install/runtime acceptance is not established.

## Preservation and execution record

All **nine** pre-existing `/private/tmp/account109-source-*` roots have matching before/after aggregate snapshots including `.git` and root directory metadata. No Git command ran inside them and no writes were made there. Snapshots include sorted paths, entry types, modes, sizes/hashes, mtime/ctime and symlink-target hashes; access times are excluded. Only the new DRAFT and this preparation record were written. No original/default account store was accessed. The export reads exact tracked blobs at the fixed source ref `9010c5bada147936c9f3e8db8159ef777d3bbb87`; later parent commits and dirty documentation in the development worktree are not export inputs. Parent advanced main through `0e06b715` and `a6cc1182` while handling relogin04, and its documentation working tree was dirty at times. Recorded HEAD/status observations are individual snapshots, not evidence that main stayed at 9010c5ba or remained clean throughout preparation. This record lives in the existing isolated `codex/account109-test-audit` worktree, for a docs-only commit.

The initial inventory helper call failed before DRAFT creation because its extra `node -e` positional ref triggered the imported exporter's CLI realpath guard. The reviewer corrected only its own helper invocation to inline the fixed ref; production/publisher code was untouched. `failure.json` and `preliminary-commands.json` retain that finite preparation error. The corrected export ran once and completed; this was not a live test retry.

Exact argv/output hashes, per-file inventory, tool hashes, before/after snapshots and root identity are retained here. Output uses nonignored `.stdout.txt`/`.stderr.txt` names. No DB, grant, token, browser callback, user profile or raw process payload is included. No GitHub creation, remote, push, live query, seal reuse or old-root modification occurred. SHA256SUMS covers all record files except itself. Real relogin04 and remaining account/device acceptance are explicitly outside this preparation and remain pending at this report snapshot.
