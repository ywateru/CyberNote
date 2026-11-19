# CyberNote Agent Guide

This is the canonical repository guide for future coding agents. Read it before
changing account, synchronization, native packaging, or GitHub Actions code.

## Repository

- The development checkout is a Tauri 2 application with React/Vite frontend,
  Rust native code, Android sources, and an in-tree CyberBus adapter.
- `main` is the default branch. The public remote is
  `https://github.com/ywateru/CyberNote.git`.
- Preserve remote history. Do not force-push, rewrite public commits, or replace
  the repository with an unrelated tree unless the user explicitly requests it.
- Never commit tokens, GitHub credentials, signing keys, private keys, local
  data directories, logs, stores, or packaged build artifacts. Use the active
  `gh` login or Git credential helper without copying secret values into files
  or command output.
- Keep `main` clean and push only verified commits when the user requests a
  remote update.

## Product Source of Truth

- `package.json` owns the product version.
- Run `pnpm version:sync` after changing it. `pnpm version:check` verifies the
  frontend, Tauri, Cargo, and lockfile versions agree.
- Product source identity is derived from tracked product inputs, not ignored
  build directories. Do not hand-edit generated build identity.
- The macOS app is ad-hoc signed and not notarized. Android release packages
  from Actions are unsigned. Do not describe either package as a signed store
  release.

## Release Workflow

- `.github/workflows/packages.yml` runs on pull requests, `main`, manual
  dispatch, and tags matching `v*`.
- A `v*` tag runs release-profile macOS arm64 and Android arm64 builds. After
  both package jobs and staging checks succeed, the workflow creates a GitHub
  Release and uploads the app, APK, notices, JSON receipts, and SHA-256 files.
- Release tags must match the stable package version:
  `v<major>.<minor>.<patch>` or `v<major>.<minor>.<patch>-<suffix>`.
  Tags containing `-` create prereleases.
- Manual or branch runs produce Actions artifacts only; they do not create a
  GitHub Release.
- To publish a new preview after a code change:

```sh
pnpm version:check
pnpm typecheck
git commit -m "docs: describe the change"
git push origin main
git tag -a v0.1.0-preview.N -m "CyberNote 0.1.0 Preview N"
git push origin v0.1.0-preview.N
```

- Never reuse a tag that already has a published Release. For a failed run with
  no Release, it is acceptable to fix the workflow and retag the same version
  after confirming no Release exists.
- `scripts/publish/stage-packages.py` validates release profile, architecture,
  package identity, Android manifest flag, signing boundary, notices, and
  checksums. Kernel and package shape checks are not device acceptance.
- Local Android builds default to QA package
  `com.local.notesclone.cyberbusqa`. Release Actions must set
  `CYBERNOTE_ANDROID_APPLICATION_ID=com.local.notesclone`; staging rejects any
  package whose ID differs from the Tauri product identifier.
- On macOS, Tauri's `beforeBuildCommand` generates the bundled MCP sidecar.
  Do not run a Tauri/Rust build that expects
  `artifacts/bundled-mcp/cybernote-mcp-aarch64-apple-darwin` before the sidecar
  step unless `node scripts/bundle-mcp.mjs` has already run.

## Validation

Start with targeted checks, then broaden only when the change warrants it.

```sh
pnpm version:check
pnpm typecheck
git diff --check
```

For release tooling and account-command boundaries:

```sh
node --test \
  scripts/publish/package-identity.test.mjs \
  scripts/publish/policy.test.mjs \
  scripts/publish/stage-packages.test.mjs \
  scripts/verification/cyberbus-command.test.mjs \
  scripts/verification/account109-status-dto.test.mjs \
  scripts/verification/account109-login-surfaces.test.mjs \
  scripts/verification/account109-android-files.test.mjs
```

For CyberBus session changes, also run:

```sh
cargo test --offline --locked \
  --manifest-path vendor/cyberbus/crates/cyberbus/Cargo.toml
cargo test --offline --locked \
  --manifest-path crates/notes-cyberbus/Cargo.toml
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e --lib account::
```

Use an isolated `CARGO_TARGET_DIR` outside the source tree in CI. Public source
exports, when used, must remain sanitized and are not the development checkout.

## Account and Sync Boundaries

- CyberBus is the production account and transport owner. Do not introduce a
  second authorization or grant owner.
- Preserve explicit enablement, device/direction confirmation, account
  isolation, revocation, pause, and identity checks.
- Discovery outbound and inbound Noise handshakes share the finite protocol
  deadline. Business operations retain their caller-owned deadline.
- Recovery and timeout evidence must distinguish transport, authentication,
  first-frame, transfer, and package failures. Device online status or a Noise
  session alone is not content-sync success.
- The Mac↔Android content transfer and internet/cross-network acceptance remain
  incomplete unless current runtime evidence proves text, attachments, MIME,
  hashes, restart recovery, and the intended network conditions. Keep the
  limitations in `docs/verification/cyberbus120/REMAINING.md` current.
- Account UI uses native confirmation dialogs, one progress surface per
  operation, and one error surface for duplicate safe errors. Preserve keyboard,
  focus, narrow-screen, light/dark, and localized behavior.

## Change Discipline

- Fix root causes and add regressions at the earliest stable boundary.
- Keep changes focused; do not repair unrelated historical failures silently.
- Update user documentation and verification receipts when behavior or release
  boundaries change.
- Before reporting completion, verify the local branch, remote branch, Actions
  run, Release tag, asset inventory, checksums, and remaining acceptance gaps.
