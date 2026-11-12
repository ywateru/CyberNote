# Source-only delivery tools

This directory owns the sanitized source boundary, public templates, synthetic
archive fixtures and package staging policy. The private development checkout
and its history must never become the new repository's initial history.

## Export contract

`export.mjs` defaults to a validation-only plan. It reads the requested commit's
exact tracked blobs and manifest, checks each SHA-256, checks retained module,
fixture and script dependencies, and applies the explicit public transforms.
Ignored files and dirty working copies are not source inputs. Regular files are
required; symlinks and submodules are rejected. Credential-pattern checks are
additional defenses, not a replacement for reviewing each inventory addition.

```sh
node scripts/publish/export.mjs --ref HEAD
node scripts/publish/export.mjs --ref HEAD \
  --target /absolute/new-source-directory \
  --expected-target /absolute/new-source-directory --apply --init
```

Use an absent canonical destination outside the source checkout. The exporter
never deletes or reuses a directory. `--init` creates one root commit with a
neutral author and no remote or old refs. It does not create a GitHub repository,
push, publish a release or deploy a service. Review the resulting exact tree
before a separately authorized private-repository push.

The root package transform explicitly retains the commands in
`package-transform.mjs`; removed historical commands are reported. Root README,
ignore rules and project license are replaced with the adjacent reviewed public
templates. Four archive backups are generated from synthetic data. The shared
synthetic smart corpus is retained separately, with an exact export-only Rust
include rewrite. No old docs directory is copied.

## Updating source and adding SDK/providers

First commit the reviewed source changes. Refresh existing manifest entries from
that exact commit; `manifest.mjs` defaults to a dry-run too:

```sh
node scripts/publish/manifest.mjs --ref HEAD
node scripts/publish/manifest.mjs --ref HEAD --write
```

New files are never discovered or added automatically. Prepare a reviewed JSON
extension outside the exported tree with `files` mapping each exact new tracked
path to its committed SHA-256, and `thirdParty` entries containing `root`, HTTPS
`origin`, pinned `revision`, and retained `licenses` paths. Run:

```sh
node scripts/publish/manifest.mjs --ref HEAD --extension /absolute/reviewed-extension.json
node scripts/publish/manifest.mjs --ref HEAD --extension /absolute/reviewed-extension.json --write
```

Commit the refreshed manifest, then run the exporter against that final commit.
Do not use wildcards, recursive cache copies, downloaded binaries or a Cargo
target directory as SDK inputs. Every crates/vendor file needs a matching pinned
provenance entry and retained license. Review provider download version/hash and
license metadata separately. Service notices, original font/OFL, Gradle wrapper,
lockfiles, pnpm patch and handwritten platform sources are retained explicitly.

## Verification and build boundaries

In the NEW source repository, run `node scripts/publish/verify.mjs` before
installing dependencies. It rejects the private development tree, extra tracked
files, changed source bytes and missing public transforms. Then run locked
dependency installation, version checks, typecheck, `pnpm test:publish`, frontend
build, and the Rust archive/shared-corpus tests. Use a Cargo target outside the
source tree. Tests cover absent-target guards, ignored/dirty-source exclusion,
new history, credential/binary/symlink rejection and explicit build identity.

For a true source archive without `.git`, create metadata with
`deploy-metadata.mjs` from a clean trusted source checkout and transport it
outside source inputs. Set `CYBERNOTE_DEPLOY_METADATA` explicitly. Missing or
mismatched metadata fails; revision provenance is a trusted producer assertion,
while fingerprint and file count are always recomputed from actual local bytes.

The workflow requires a real arm64 macOS runner and an explicit Android arm64
toolchain. No `--all-features` build is used. Package staging validates package
architecture and writes only the named package, notices, identity receipt and
checksums. Android output is unsigned; macOS signing/notarization is not asserted.
Actions package success is separate from installation, device, login, sync and
deployment acceptance. No process logs, keys, whole build directories or user
stores are artifact upload inputs.
