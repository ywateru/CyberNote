# Android hosted login: single live attempt

This attempt failed at the authoritative native terminal. Exactly one invocation
of the prepared live RSA envelope consumed the encrypted synthetic credential.
The marker/expiry checks passed; the real guarded CDP Input consumer completed
and dispatched its submit click. Native observation then returned
`callback-native-error`; the owned app was foreground, profile was absent and
synchronization remained disabled. A subsequent read-only status returned the
product-defined safe code `account_network`.

This is not a successful login or proof of native callback acceptance. The code
classifies a network failure but does not identify a failing endpoint, provider
response or callback-validation outcome. No raw errors, credentials, decrypted
objects, tokens, authorization URLs, code/state, ciphertext or private keys are
archived. `usernamePresent:false` and `sameSyntheticUser:false` mean the expected
user was not verified; they do not assert that another user signed in.

`result.json` records the exact frozen tool hashes, APK/source identity, safe
preparation/consumer/native receipts and cleanup. A real UI Cancel settled the
previous transaction before this fresh SignIn. User0 foreground and browser
endpoint OS PID were verified before page access; every Input used the frozen
guard. The new SignIn/page association remains temporal only. Native AuthClient
remains the authority for callback state/PKCE/issuer/nonce.

There was no retry or synchronization enablement. The single-use envelope was
disposed, browser/native tool connections closed and their leases removed. Driver
close removes only each exact owned forward. No new reverse was created by this
flow. The test package and synthetic data remain. Other apps and profiles were
not operated. Historical preparation failure and offline test evidence remain
under `../hosted-private/`.

## Read-only current native diagnosis

`native-diagnostic01.json` preserves a subsequent read-only status and metadata
receipt. Safe code is both regex-validated (`^[a-z_]{1,80}$`) and checked against
the product's static code list. Current state is `error`, code `account_network`,
owned user0 app foreground and unlocked. The unique account directory has neither
`grant.json` nor `binding.json` as a regular file. No secret file body was read.
`cleanupRequired:false` is a projection of the status command's cleanup code:
`command(Status)` calls `cleanup_status()` before its snapshot. This is not a
new private-state IPC or a claim that a grant never existed earlier. All temporary
read-only forwards were closed; the final exact serial/local/remote tuple is
confirmed absent. Two fixed-code diagnostic setup stops are retained in the
receipt; neither initiated authorization.

Source-level narrowing uses the APK's exact source 6537b74b, not a new run:
Android login waits for a native deep link and then calls `complete_callback`.
Callback/state/identity and token-exchange rejection maps to authentication;
the OIDC client was already cached by the successful begin-authorize step.
After completion, `bind` obtains an access token and constructs the profile HTTP
client/request; reqwest failures and non-401/403 HTTP failures map to
`account_network`. Binding/profile publication follows successful profile
validation. If binding fails, login attempts grant revocation before retaining
the original binding error; that can explain absent grant plus absent binding.

Thus the most specific source-based hypothesis is the pre-binding coordinator
profile HTTP/client path. This is an inference from code and lifecycle, not an
observed stage marker or proof that a particular HTTP request was sent. No raw
provider error, endpoint traffic, HTTP status, DNS/TLS detail or historical grant
commit is proven by this receipt. Native paused/profile acceptance and the same
synthetic user remain unverified. No login retry, logout, sync enablement,
production modification or secret-body read was performed for diagnosis.
