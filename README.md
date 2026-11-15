# CyberNote

Private source distribution of a local notes application for macOS and Android,
with a separate Node coordinator service. Local development history, user stores,
device evidence, credentials and installation packages are not part of this tree.

Repository: [ywateru/CyberNote](https://github.com/ywateru/CyberNote).
Download narrowly staged build artifacts from [GitHub Actions](https://github.com/ywateru/CyberNote/actions/workflows/packages.yml)
after the packaging jobs succeed. Repository access is required while private.
The macOS ZIP is not notarized; the Android release APK is unsigned and needs
your own signing before installation. No signing keys are included in source or artifacts.

## Product website and account

`services/coordinator/public/` contains the responsive CyberNote product homepage
and account/device console. Product, source and build links are real. Account
login uses the existing same-origin OIDC/PKCE console flow; the site does not
store passwords or expose a cloud note editor. The website design, routes,
account states and deployment requirements are described in
[WEBSITE.md](services/coordinator/WEBSITE.md).

Run the coordinator with a dedicated configured environment to serve the website
and API together. Website/account tests and the Vercel build also run in Actions.
CI does not deploy or modify existing production infrastructure.

## Build

Use Node 22, pnpm 10.15.0 and a compatible Rust toolchain (CI pins Rust 1.97.1,
which is newer than the SDK's Rust 1.91 minimum).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm version:check
pnpm typecheck
pnpm test:publish
pnpm build
```

macOS requires Xcode/Command Line Tools. The packaging workflow requires an
actual arm64 macOS runner and builds `aarch64-apple-darwin`. Local `pnpm mac:build`
creates an app bundle. These CI packages are not notarized or claimed to be
Developer ID signed.

Android requires JDK 17, Android SDK 36, NDK 27.2.12479018 and the
`aarch64-linux-android` Rust target. Set `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME`
explicitly on other machines; the local helper has macOS development defaults.
`pnpm android:build` targets arm64 APK. The CI release APK is explicitly unsigned;
an authorized distributor must sign it before installation/distribution.

`pnpm test:rust` runs Rust tests. The four archive backup fixtures are synthetic, reproducible
with `node scripts/publish/generate-fixtures.mjs`, and contain no imported notes.
Historical browser/device commands have deliberately been removed from the public
package scripts; the exporter reports the removed names and checks retained paths.
The shared synthetic smart-projection corpus is retained under the fixture
directory; an exact export-only include rewrite removes its old docs dependency.

## Coordinator and deployment

The root `vercel.json` builds `services/coordinator/` and routes website/API requests
through `api/index.ts`. Use Node 22 and install service dependencies with
`npm --prefix services/coordinator ci --include=dev`. The service's own build/tests
are separate from desktop and Android builds.

Supply secrets only in a protected server/CI environment. Never prefix a secret
with `VITE_` or `TAURI_ENV_`, which make values available to frontend code. Public
client IDs/issuer/resource identifiers are distinct from secrets. Do not commit
real `.env` files, signing keys, tokens, databases, backups or user media.

For a source archive without `.git`, a trusted clean checkout can first run:

```sh
node scripts/publish/deploy-metadata.mjs --out /absolute/outside-checkout/deploy.json
```

Transport that metadata through a trusted build channel and explicitly set
`CYBERNOTE_DEPLOY_METADATA` to its path. Every build recomputes the fingerprint
and input count from actual local product bytes and rejects mismatches. The
revision is an assertion of the trusted producer, not a cryptographic proof of
Git history. There is no automatic fallback to a request header or a fabricated
revision. Rebuild metadata after changing any source, patch or vendored input.

## Source export and CI

`node scripts/publish/export.mjs --ref HEAD` only plans and validates. Actual export
requires a nonexisting absolute destination plus matching `--target` and
`--expected-target`, and `--apply`. `--init` creates a single new initial commit,
with no remote, inherited refs, Git history, original author identity or tags.
Before adding a remote, `node scripts/publish/verify.mjs --new-root` independently
checks the complete initial refs/object/reflog boundary; ordinary CI verification
checks the source tree and does not assert an initial-history boundary.
The checked-in manifest is an explicit file/hash inventory, not a directory-copy
rule. Review additions and provenance before refreshing hashes. Project-authored
crates use explicit first-party reserved-rights declarations. Foreign SDK sources
retain pinned origins and licenses. Bundled runtime binaries require exact
path/SHA/size/source/license entries matching their retained provider manifest;
ordinary vendor binaries and generated JNI directories remain excluded.

Actions produce macOS arm64 and Android arm64 build packages and checksums.
An uploaded CI artifact proves the recorded build only; it does not assert device
acceptance, successful login/synchronization, signing, notarization or a deployment.
Workflows do not publish releases or call account/deployment services. Retained
CI files are narrowly staged packages, checksums, notices and build identity.
Staging validates notice paths, SHA pins and symlink boundaries. It recomputes
current source identity and checks build-info bytes inside the actual packaged
executable, including the locked Tauri Brotli asset form, before writing a receipt.

## License

No general project license grant is made; see `LICENSE`. Third-party component
licenses remain effective. See `THIRD_PARTY_NOTICES.md`, the font OFL and coordinator
notices. A repository owner may choose a project license separately without
removing third-party notices.
