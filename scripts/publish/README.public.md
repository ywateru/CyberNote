# CyberNote

Private source distribution of a local notes application for macOS and Android,
with a separate Node coordinator service. Local development history, user stores,
device evidence, credentials and installation packages are not part of this tree.

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

`pnpm test:rust` runs Rust tests. Archive fixtures are synthetic, reproducible
with `node scripts/publish/generate-fixtures.mjs`, and contain no imported notes.
Historical browser/device commands have deliberately been removed from the public
package scripts; the exporter reports the removed names and checks retained paths.

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
The checked-in manifest is an explicit file/hash inventory, not a directory-copy
rule. Review additions and provenance before refreshing hashes.

Actions produce macOS arm64 and Android arm64 build packages and checksums.
An uploaded CI artifact proves the recorded build only; it does not assert device
acceptance, successful login/synchronization, signing, notarization or a deployment.
Workflows do not publish releases or call account/deployment services. Retained
CI files are narrowly staged packages, checksums, notices and build identity.

## License

No general project license grant is made; see `LICENSE`. Third-party component
licenses remain effective. See `THIRD_PARTY_NOTICES.md`, the font OFL and coordinator
notices. A repository owner may choose a project license separately without
removing third-party notices.
