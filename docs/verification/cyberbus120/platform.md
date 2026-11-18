# CyberBus platform author verification

2026-11-18. Develop agent, worktree `Apple-Notes-Clone-cyberbus123`, branch
`codex/cyberbus123-platform`, starting revision `728cac38`. No subagents, device
connections, installations, real account login, user notes or original app use.
This is author verification, not independent review or migration acceptance.

## Android JNI contract

Implementation lives in `plugins/tauri-plugin-notes-auth/android/src/main/java/`,
not only in the generated application project. Class
`com/local/notesauth/CyberBusSecureStore`, private constructor, static acquisition:

| Method | JNI signature |
| --- | --- |
| static `lock(Context, String root, boolean firstInstall)` | `(Landroid/content/Context;Ljava/lang/String;Z)Lcom/local/notesauth/CyberBusSecureStore;` |
| instance `load()` | `()[B` |
| instance `save(byte[])` | `([B)V` |
| instance `close()` | `()V` |

Root is exactly application Context `getNoBackupFilesDir().getCanonicalPath()`
plus `/cyberbus`. The public Android API rejects alternate/noncanonical/symlink
roots. Keep one JNI GlobalRef until SDK shutdown/drain, then close. Attached native
threads should use the app Context ClassLoader. `conflict` exception maps to SDK
Conflict, other exceptions to Storage; exceptions contain no underlying error.
`firstInstall` must agree with trusted SDK StoreMode. Never fall back from Existing
to FirstInstall. Only the live first provisioning owner may load null before its
first save. macOS official KeyringStore is owned by the core/account agents.

The key stays in AndroidKeyStore (AES-256/GCM); no key export method or plaintext
fallback. JNI byte arrays contain the SDK native record, not the AES key, and may
only reach Rust/SDK. Rust must zero temporary record buffers. No Tauri storage
commands, renderer capability or Javascript interface was added. R8 keeps the
public JNI class/methods. Root/purpose are authenticated AAD. Cipher-generated
96-bit IV, 128-bit tag, private regular files and hardlink checks apply. Marker
contains authenticated current/pending ciphertext hashes. Temporary file force,
same-directory ATOMIC_MOVE and directory fsync have no weaker fallback.

Process exclusivity uses both a JVM owner reservation before opening the lock
file and an OS file lock until close. This order fixes a failure found by the
second-JVM test: opening/closing a competing descriptor in the same process could
release a POSIX process lock. Failed writes poison the current object. Interrupted
initial provisioning cannot silently become a new installation; later interrupted
updates reconcile only current/pending ciphertext. Privileged rollback of both
marker and ciphertext together with Keystore is not prevented by this contract.

## Frontend and packaging changes

- Finite `cyberbus` kind renders only `CyberBus`, without direct/relay claims.
  Unknown/unavailable kinds remain unlabelled. Registry UUID IPC, generation/sample
  validation, existing layout and single push/pull/both confirmation stay intact.
- Finite SDK authorization reasons extend existing `providerReason` wire shape;
  reauthentication, temporary unavailability and unknown outcome have separate
  recovery choices and fixed local copy. Remote error strings never render.
- Existing callback namespace `com.local.notesclone.auth://callback` is untouched.
  Deployment resource/client/product/relay pins belong to the account agent.
- Tracked Android application Gradle drops the legacy provider source directory
  and excludes `libcloudflared.so`, including stale generated copies. Storage API
  remains in the auth plugin's handwritten Java source.
- `scripts/android.mjs` and `src-tauri/build.rs` were inspected: this baseline
  already only dispatches Tauri/builds Tauri and contains no provider bundling.
  They were therefore left unchanged. Native Cargo/account sources were not edited.
- Exact manifest changes remove both cloudflared binary inputs and runtimeAssets,
  retain legacy source/license provenance, add platform source/tests and fixed
  CyberBus license texts/provenance. Android package staging rejects a retired
  helper even if its ELF header is valid. Ordinary JNI source-export exceptions
  were removed. License sidecars explicitly include LGPL/GPL text filenames.
- `scripts/publish/cyberbus-manifest.mjs` is the committed-input finalizer for
  subsequent core/account integration. It adds `notes-cyberbus` source and explicit
  first-party declaration, checks exact git revision/native dependency and lock,
  rejects production legacy owners and updates only adapter/account/native pins.
  The new core crate was still uncommitted in its own worktree during this task;
  its unfinished source was not copied into this platform branch or manifest.
- SDK revision is `359465e83bd74b571a963f3d1fdc238f50169919` from
  `https://github.com/osd-pub/CyberBus.git`. Original MIT/Apache/LGPL/GPL/EasyTier
  texts and SHA provenance were copied from that exact checked-out revision.
  Full corresponding sources/relinkable application objects and final dependency
  license closure remain required before binary distribution. This sidecar does
  not claim that closure is complete.

## Executed checks

| Check | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | Passed; 134 cached packages, no lockfile changes |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed; 1,991 modules; existing chunk-size advisory, no build error |
| `node --test plugins/tauri-plugin-notes-auth/*.test.mjs scripts/publish/*.test.mjs` | 31/31 passed |
| SecureVault host tests within that suite | 21 contract cases; synthetic keys/private temporary directories only |
| Android SDK 36 `javac -source 8 -target 8` | Both production Java classes compiled; bootstrap-classpath advisory |
| `javap -s` on compiled public storage class | Exactly the four signatures above |
| Android build-tools 36.0.0 D8, `--min-api 26` | Passed; generated classes.dex |
| Isolated Gradle 9.6.1 / AGP 9.3.1 / Kotlin 2.2.10 / JDK 17 `--offline --no-daemon :notes-auth:assembleDebug` | BUILD SUCCESSFUL, 35 tasks executed; existing AGP/Tauri deprecation warnings |
| Built AAR contents | JNI class, SecureVault, existing Kotlin NotesAuthPlugin and consumer keep rule present |
| `git diff --check` | Passed |

The Gradle check copied the exact plugin Android source and Tauri 2.12.5 Android
source from Cargo registry into a temporary standalone project; only the two
library projects were compiled. It did not require a Rust application build,
regenerate this worktree's Tauri bridges, install anything, or touch the original
application. This is a real Android AAR build, not a complete app APK/JNI invocation.

AAR SHA256: `e62b9c985f351b30b103ff9bf51dbc5ab231a882c176efbc13e2b0e9cf7d739a`.
DEX SHA256: `fe57b9d2c5dc97e3649570dd88d35f82f955fab3c981e3ecbb293abf159f7750`.
These are temporary compile artifacts, not distributable application packages.

Host cases include same-JVM and separate-JVM lock contention, encrypted
round-trip/restart, fresh randomized ciphertext, wrong/missing key, corrupted or
missing ciphertext/marker, interrupted initial creation, root-bound copied blob
rejection, three marker/vault/final-marker directory-fsync failures, recovery,
old-ciphertext rollback against current marker, symlink/hardlink/permission
rejection, empty-record rejection and poisoning after a failed save. Public Android
Keystore and Android filesystem runtime were not exercised by those host tests.

## Existing failures and remaining boundaries

The historical test `scripts/verification/account109-status-dto.test.mjs` runs
24/25 on this branch. Its first test expects generic timeout copy for every
syncReason; the baseline already has a timeout-specific instruction. Re-running
that identical test against unmodified `git show HEAD:src/account-client.ts`
from starting revision `728cac38` reproduces the same single failure (24/25).
The historical test was not changed. New CyberBus DTO tests both pass.

Strict source inventory validation fails first at `index.html`. The baseline
manifest already has 62 out-of-scope hash mismatches, including package, unrelated
UI/plugin, Store, Session and native files. Only this task's 28 paths were hashed;
there was no whole-manifest regeneration. An in-memory-only hash refresh allowed
policy/license/secret scanning to run and pass; no unrelated hashes were written.
The original manifest hash checks and full source export therefore are NOT passed.
The integrator must review the preexisting differences separately, then run the
committed-input finalizer after merging core/account, commit the revised manifest
and run `node scripts/publish/export.mjs --ref HEAD`. The finalizer intentionally
fails instead of silently refreshing unrelated baseline hashes.

Full combined Rust compilation, Android APK packaging, actual Rust JNI calls,
Android Keystore cryptography/invalidated-key behavior, Android filesystem
power-loss recovery, app restart restore, macOS Keyring runtime, authenticated
multi-device transport and all real note/attachment synchronization remain for
integrated/independent verification. No SDK fixture, host injected key, AAR build
or UI build is counted as migration end-to-end acceptance.
