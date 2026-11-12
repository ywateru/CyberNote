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
Do not use wildcards, recursive cache copies or a Cargo target directory as SDK
inputs. Every crates/vendor file needs exactly one explicit ownership root.
Foreign code uses a `thirdParty` entry with pinned origin/revision and retained
licenses. Project-authored crates use `firstParty` instead of inventing an
external origin or a third-party license:

```json
{
  "firstParty": [{
    "root": "crates/account-auth",
    "provenance": "project-authored",
    "rights": "reserved",
    "rightsSource": "scripts/publish/LICENSE.project-reserved.txt"
  }]
}
```

This is an explicit reviewed authorship/rights assertion. Only exact crate roots
are eligible; vendor roots cannot be classified as first party. Overlapping
ownership roots, absent rights/license sources and empty roots are rejected.

Binary providers additionally require `runtimeAssets` entries, supplied in the
same reviewed extension as their exact `files` SHA inventory. Each entry names
`path`, `sha256`, raw byte `size`, `licenses`, a `source` object with HTTPS `url`,
commit `revision` and `version`, and a `provenance` object naming a retained
provider `manifest` and `platform`. The current provider manifest schema must
bind repository/commit/version and exact platform binary path/SHA/size, disable
runtime downloads, and retain referenced patches/build information. All declared
licenses must be retained under that vendor root. Package notice sidecars include
every declared license path, even when its filename lacks the word LICENSE.
Staging validates all notice paths and SHA pins, opens each directory component
and file without following symlinks, and writes verified bytes directly into the
archive. Generated root notices must match their pinned public templates.
Exact upstream license inventories may contain `.github` provenance workflows;
that named directory is allowed with the same SHA and no-follow checks. Other
hidden components, including `.git` and `.env`, remain rejected by notice staging.

The checker hashes actual committed binary bytes and compares both inventories.
Only validated exact runtime entries receive a binary exception; the default
50 MiB per-file cap remains. JNI exceptions are restricted to the single current
`vendor/cybergrid-sdk/provider-assets/android-arm64/jniLibs/arm64-v8a/libcloudflared.so`
path. Application-generated JNI directories and adjacent unlisted binaries stay
excluded. Manifest refresh never automatically updates a runtime pin when its
binary changes: a new version/path or an explicitly reviewed pin change is needed.
New provider metadata schemas require a reviewed validator change.

Service notices, original font/OFL, Gradle wrapper,
lockfiles, pnpm patch and handwritten platform sources are retained explicitly.

## Verification and build boundaries

In the NEW source repository, run `node scripts/publish/verify.mjs` before
installing dependencies. It rejects the private development tree, extra tracked
files, changed source bytes and missing public transforms. Then run locked
dependency installation, version checks, typecheck, `pnpm test:publish`, frontend
build, and the Rust archive/shared-corpus tests. Use a Cargo target outside the
source tree. Tests cover absent-target guards, ignored/dirty-source exclusion,
new history, credential/binary/symlink rejection and explicit build identity.

Before adding a remote or publishing the initial import, separately run
`node scripts/publish/verify.mjs --new-root`. This requires an independent Git
directory, one parentless main commit, no other refs/remotes, no shallow history
or alternates, and no retained reflog commits or unreachable historical objects.
The exporter also runs this check after `--init`. Ordinary CI content checks do
not make this history claim; later repository development may have more commits.

For a true source archive without `.git`, create metadata with
`deploy-metadata.mjs` from a clean trusted source checkout and transport it
outside source inputs. Set `CYBERNOTE_DEPLOY_METADATA` explicitly. Missing or
mismatched metadata fails; revision provenance is a trusted producer assertion,
while fingerprint and file count are always recomputed from actual local bytes.

The workflow requires a real arm64 macOS runner and an explicit Android arm64
toolchain. No `--all-features` build is used. Package staging validates package
architecture and writes only the named package, notices, identity receipt and
checksums. Android output is unsigned; macOS signing/notarization is not asserted.
Android staging checks every packaged native library's ELF64/AArch64 header,
rejects duplicate library entries and signing material (including APK signing
blocks outside ZIP entries), and requires the pinned apksigner's specific
unsigned diagnostic. Other tool failures fail closed. The compiled manifest must
decode with aapt2, match the production application ID and package.json version,
and have no enabled debuggable/testOnly flag; an output directory named release
alone does not establish these properties. These checks do not prove installation
or runtime behavior.
Before writing a receipt, staging recomputes the clean current source identity
and compares all revision/fingerprint/count/dirty fields with production build
metadata. It extracts the executable from the actual app ZIP/APK and requires
the current build-info payload in those native bytes. Compressed Tauri assets
are located in the same Cargo release/build output, decoded with Brotli, matched
to the current metadata, and matched as encoded bytes inside that executable.
Missing/stale evidence fails closed; a new sidecar cannot relabel an old package.
The helper supports the locked Tauri raw/Brotli asset format. Other asset formats
need an explicit validator update. This is an identity/byte check, not execution
of the native package. Release stamps compare dirty state and input count too.
Actions package success is separate from installation, device, login, sync and
deployment acceptance. No process logs, keys, whole build directories or user
stores are artifact upload inputs.
