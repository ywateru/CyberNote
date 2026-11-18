# Native account presentation and Android CyberBus storage

The login plugin owns presentation only. The independent Java storage class is
called directly by the Rust account owner via JNI. No vault methods are annotated
`@Command`, registered as invoke handlers, exposed through Javascript interfaces,
or included in renderer capabilities.

## Frozen Android JNI boundary

Class: `com/local/notesauth/CyberBusSecureStore` (keep rule included for R8).
Private constructor; acquire through the static method:

| Method | JNI descriptor | Contract |
| --- | --- | --- |
| static `lock(Context, String root, boolean firstInstall)` | `(Landroid/content/Context;Ljava/lang/String;Z)Lcom/local/notesauth/CyberBusSecureStore;` | Holds an exclusive OS file lock until close |
| `load()` | `()[B` | Returns SDK record, or null only within the first provisioning owner before first save |
| `save(byte[] value)` | `([B)V` | Atomically/durably replace the entire record; 1 byte–8 MiB |
| `close()` | `()V` | Idempotent; release lock and key reference |

`root` MUST equal `context.getNoBackupFilesDir().getCanonicalPath() + "/cyberbus"`.
The Rust owner gets this from the application Context, not library/workspace or
renderer input. An app-private single root survives account changes but is
excluded from Android backup. The app/package owns one Keystore alias and one
vault. Noncanonical and symlink roots fail. No path is supplied to load/save.
`firstInstall=true` is an explicit trusted provisioning decision: it refuses any
marker, ciphertext, key or provisioning temporary files. Existing mode requires
all three; a missing directory is also an error. Never retry Existing failure as
FirstInstall. The account author owns selection of SDK `StoreMode` consistently
with this boolean, retains a JNI GlobalRef for the store lifetime and calls close
only after SDK shutdown/drain. On attached native worker threads load this class
through the application Context ClassLoader (`loadClass` with dotted name),
rather than assuming JNI FindClass can resolve app classes from the bootstrap
class loader. Every exception must be cleared at JNI boundary;
`IllegalStateException("conflict")` maps to SDK Conflict, all other exceptions to
Storage. Never format the exception, record, key, token or root into UI/logs.

The SDK trait at `359465e83bd74b571a963f3d1fdc238f50169919` needs decrypted
`SecretBytes` and `replace(&[u8])`; JNI byte arrays contain that native record,
never the AES key. Rust should zero temporary buffers after wrapping/passing
records and return `durable() == true` only for a successfully acquired store.
The AES-256 key is generated and retrieved only inside AndroidKeyStore; there is
no key export method, `getEncoded` call, plaintext key file or plaintext fallback.

`install` (authenticated marker with committed/pending ciphertext hashes),
`vault` (AES/GCM blob), and `owner.lock` share the private root. Purpose plus root
are authenticated additional data. Fresh cipher-generated 96-bit IVs and 128-bit
tags protect marker and record. Writes force the same-directory temporary file,
use ATOMIC_MOVE with no non-atomic fallback, then fsync the directory through
Android `Os`. Marker is durable before the first record. Interrupted initial
provisioning fails closed on reopen; interrupted later updates accept only the
old committed or new pending ciphertext, finalize the marker, then return data.
Any failed write poisons the owner until close. Missing/corrupt/copied-to-another
root/wrong-key records fail closed. Whole-directory plus Keystore rollback by a
privileged attacker is outside this filesystem integrity contract.

`SecureVault` is a package-private Java core. Host tests inject only test keys
and a directory sync implementation into that core; the public Android API has
no test-key or alternate-root option. Host tests do not prove Android Keystore
or device filesystem behavior. macOS uses the SDK's official KeyringStore in
the Rust account owner; this plugin does not implement a second macOS vault.

First-install provisioning fsyncs the parent no-backup directory on **every** attempt,
including retries that find an empty `cyberbus` directory left by an earlier failed fsync.
The barrier precedes key generation and marker writes. Persistent parent fsync failure stays
a storage error; it cannot be healed by resetting installation evidence. The retained host
regression probe and persistent-failure/empty-directory extensions run through
`public-wrapper-retest.py`; its Android API/Keystore shims are synthetic host tests only.
