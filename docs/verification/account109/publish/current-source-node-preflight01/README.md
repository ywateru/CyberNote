# Sanitized DRAFT: actual Node and frontend preflight

2026-11-13. **PASS: local Node/frontend prerequisites only.** The fixed sanitized root `66ad8c524841acd574b705ead8d08c7bb9a50ad7` was independently cloned using `git clone --no-local` from `/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01`. Origin was removed immediately. The temporary clone had no remote or Git alternates and was deleted after evidence preservation and clean-source checks. The old DRAFT was only read, never edited or used as a build working directory.

This supplements [the existing source preparation report](../current-source-draft01/README.md), which had passed source-boundary/new-root/history/version checks but explicitly had not installed dependencies, run tests or built the frontend. That old sealed-root audit, source comparison and native checks were not repeated. The ordinary sanitized-checkout gate and version command below were required and executed against the new build checkout. The development base for this docs-only task is `6aa009b216d0fb6a64ebeb2c9c53580fe7581e38`.

Exact build inputs before and after execution:

- Sanitized root: `66ad8c524841acd574b705ead8d08c7bb9a50ad7`.
- Root tree: `0857239a05d12f81f2147c4dc435e0ef8cbf542b`.
- Product fingerprint: `87db73de665537b85a8c4de87c0bc1a837c70c567d96ef1bf23a00f187877585`.
- Product inputs: **1621**; sourceDirty=false before/after and again immediately before cleanup.
- All four lockfile hashes unchanged: root pnpm, native Cargo, account-auth Cargo and coordinator npm. Exact hashes are in [receipt.json](receipt.json).

| Step | Exit | Seconds |
| --- | ---: | ---: |
| clone | 0 | 3.057 |
| remove-origin | 0 | 0.569 |
| verify | 0 | 18.089 |
| install | 0 | 1.983 |
| versions | 0 | 0.818 |
| typecheck | 0 | 4.956 |
| publish-tests | 0 | 3.547 |
| frontend-build | 0 | 6.724 |

Node `v22.16.0` and pnpm `10.15.0` were used. Installation was `pnpm install --frozen-lockfile --offline --store-dir /Users/water/Library/pnpm/store/v10 --package-import-method=copy --side-effects-cache-readonly`: dependencies were installed in the new clone from the existing local store, with no downloads, lock changes, dependency symlinks to the development checkout or dependency installation in the old DRAFT. A task-owned HOME/config/cache/tmp under the clone's `.git` isolated user configuration and test temporary files; credential-bearing environment variables and account/debug overrides were not inherited.

**`pnpm test:publish`: 19 passed, 0 failed/cancelled/skipped/todo.** These are the retained sanitized repository's publisher/helper fixtures, not the development tree's broader Node integration suite. Staging tests operate on synthetic bytes; no native build, APK package build, actual executable staging or device operation occurred. `pnpm typecheck` and `pnpm build` both passed. The production-mode frontend identity has target=`web`, the exact sanitized root/fingerprint above and 1,621 clean inputs; [frontend-build-info.json](frontend-build-info.json) preserves it. This is a frontend output identity, not an identity claim for any native candidate.

Installation reported pnpm 10's default unapproved lifecycle scripts for `core-js` and `esbuild`; no `approve-builds`, install-script bypass flag, configuration change or source patch was applied. The frontend build nevertheless completed. Vite also reported a minified chunk above 500 kB; this remains a recorded warning, not a failed check.

The controller sampled the owned clone plus receipt every 0.5 seconds during commands and after completion, stopping the process group if either logical or allocated bytes exceeded **2 GiB (2,147,483,648 bytes)**. Recorded peaks: logical 276,059,136 bytes, allocated **315,953,152 bytes (301.32 MiB)**. This is sampled local usage, not a claim about machine-wide disk changes. It includes the independent `.git`, dependency copy and task-owned temporary/config/cache files. No Cargo target was created or accessed.

Cleanup rechecked the exact root, absence of remotes, empty tracked/untracked Git status, fingerprint and all lock hashes. It saved the frontend output path/length/SHA inventory and cleanup eligibility before deleting only this task's `node_modules`, `dist`, then `/private/tmp/account109-source-66ad8c52-node-preflight01`. The clone is confirmed absent. Only this small evidence directory remains; no dependency/output tree is retained. [controller.py](controller.py) and [cleanup.py](cleanup.py) preserve the executed procedures; command stdout/stderr and their SHA values are retained. `SHA256SUMS` covers all evidence files except itself.

This is **DRAFT prerequisite validation**, not actual Actions execution, native compilation, package/install acceptance, real relogin04 success or phone/relay synchronization acceptance. QA credentials and domain confirmation remain separate user-input dependencies. There was no GitHub/Vercel/Logto interaction, ADB/UI operation, account credential access or original/test-store access. Old sealed roots, the shared native target, previous outputs and all prior evidence were left in place. This branch changes docs only.
