# Private Android hosted-login tool review closure

The four files in `source/` are byte-for-byte snapshots of the corresponding
`/private/tmp/account109-hosted-*.mjs` private runtime modules. Paths and SHA-256
are frozen in `checks.json`. They contain no live credential, private key,
authorization URL/code/state, provider response or grant. The modules operate
only the fixed Account109 sandbox when explicitly invoked. Import has no device
effects. Their fixed absolute paths bind this evidence to the current isolated
worktree; they are not a general deployment interface.

The applicable review findings were repaired:

- Every mouse press/release, key down/up and inserted text goes through
  `sendInput`, which runs the same guard for each event. It verifies deadline
  (minimum of envelope, credential data and preparedAt + four minutes), browser
  PID/cmdline/lease, Chrome foreground and unlocked device, trusted origin,
  selected document href/frame/loader, visible/focused page, and exact editable
  field focus for key/text. Native authorizing/no profile/disabled/no error is
  checked; page/device/deadline are checked again after that asynchronous read.
  Navigation or socket ownership loss invalidates the input driver. These are
  observations before dispatch, not an atomic browser/OS transaction guarantee.
- The post-Input recorder is now awaited. Both recorder paths replace external
  rejected errors with a fixed error without the original cause or attributes;
  the shared transfer helper also sanitizes callback failures. An async recorder
  failure after Input cannot return a normal completion or invoke the observer.
- The terminal observer compares the expected synthetic username in memory and
  emits only `sameSyntheticUser`. Success requires the owned app in foreground,
  unlocked device, native paused/profile/disabled/no error and the expected
  synthetic user. Native error, timeout, mismatch and unexpected sync enablement
  remain failures. Input dispatch and webpage results do not establish success.

The new SignIn and newly changed unique trusted-origin page provide temporal
association only. The driver has no production attempt/generation identifier and
cannot prove cryptographic binding to a Native transaction. No production IPC,
authorization URL or state disclosure was added. The operator must be exclusive;
concurrent cancel/restart that leaves no observable page/ownership/status change
cannot be independently distinguished by this driver. Native AuthClient is the
authority for state/PKCE/issuer/nonce validation. No raw OS scheme-event claim is
made.

The private RSA factory uses 4096-bit RSA-OAEP/SHA-256, a maximum 446-byte plaintext,
a single decrypt attempt and fixed four-minute expiry. Live callers use the real
consumer/observer defaults. Optional consumer/observer injections exist only for
the offline error-boundary test and must never be used as native auth evidence.
There is no pbpaste fallback. JavaScript reference cleanup does not guarantee
string zeroization.

Offline tests: **16 passed, zero failures/skips**, with an external-command trap
confirming **zero child-process commands**. Tests cover hidden/unfocused pages,
origin/document/ownership changes, expiry during native-read waiting, per-event
guarding, recorder async rejection, minimum expiry, and synthetic identity
classification. RSA test keys and plaintext are offline fixtures only. No live
key is published by these tests. Logs are retained in `green01.txt` and
`green02.txt`. `red01.json` preserves the initial fixture-only failure: the test
passed an incorrectly nested public-key options object to `publicEncrypt`; this
was a harness error, not a product failure. The final fixture uses createPublicKey.

No real credential was transferred and no real login was submitted during this
repair. Old live envelope keys were retired before editing. These tests do not
prove actual callback success. Await review closure before creating a new live
one-shot key; use only the frozen reviewed modules for the next authorized run.
