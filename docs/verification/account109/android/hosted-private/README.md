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

Offline tests: **23 passed, zero failures/skips**, with an external-command trap
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

## Observer post-await receipt repair

The original 9127758f observer reused pre-status device observations. A focused
red test reproduced its incorrect success after status-await lock, foreground
and deadline changes; `observer-red01.txt` preserves that result. The repaired
real `observeTerminal` path rechecks deadline after native status, re-reads current
policy/foreground, and checks deadline again after the device read before any
classification. Its deadline also includes connection setup. Loss of app
foreground during that wait, lock or expiry cannot produce a positive receipt.
Initial Chrome foreground while still authorizing may be observed while waiting
for the real callback; this is not a successful native terminal.

Trusted clock, device and connection probes exercise the real async observer
function in offline tests. Stable same-user paused state passes; lock, foreground
or time changes during status await reject; connection and device-read deadline
crossings also reject. The full offline suite is now 23/23 with no external
commands. The final log is `observer-green01.txt`; `checks9127758f.json` preserves
the earlier frozen manifest. These probes do not establish live callback success
or an atomic OS snapshot. No production source, IPC or real credential is involved.

## User-0 browser process ownership

A later live preparation stopped before SignIn because `pidof com.android.chrome`
returned two processes. Read-only UID checks found exactly one matching Chrome's
user-0 package UID. The driver now requires a unique exact Chrome cmdline plus
that explicit package UID; it does not choose the first PID. Missing UID, no
matching owner, or multiple matching same-user owners still reject. The private
socket target must still be a newly changed trusted page after this sandbox's
SignIn; guards continue checking the selected PID/cmdline/UID. The tool does not
operate another user's browser. This is test tooling, not a product auth change.

The final `user0-green01.txt` suite is **24/24**, zero skips/device commands. The
browser selector test covers cross-user ordering, no owner, same-user ambiguity,
wrong cmdline and missing package UID. Earlier red and green evidence is retained.

## Dual-UID socket and resumed-user closure

The device actually has two Chrome processes belonging to different Android
users. Before any `/json/list` page enumeration, the driver now requests only
`/json/version`, validates the loopback browser-socket authority, and requests
`SystemInfo.getProcessInfo` on that browser endpoint. It requires exactly one
browser OS PID equal to the selected exact-cmdline/user0-UID Chrome PID. Unsupported,
malformed, ambiguous or mismatched ownership fails closed. The audit socket is
closed. No other-profile pages or credentials, root, or fd permission workarounds
are used. A read-only live audit found a unique browser PID matching user0 PID
12765; no credential was received or submitted, and the previous key was revoked.

Every Input still verifies the selected process UID/PID, and additionally parses
`mResumedActivity` for the exact **u0** Chrome component. The native terminal
observer likewise requires the exact **u0** sandbox app component. Same-package
u10/u999 activities, suffix packages and ambiguous resumed records fail. Socket
ownership is a point-in-time check before enumeration; the selected page WebSocket
remains attached while per-Input ownership/document checks continue. This does
not change temporal association or Native callback verification boundaries.

`user0-socket-green01.txt` supersedes the previous test count: **33 passed, zero
failures/skips, zero device commands**. Offline cases cover cross-user foreground,
matching/mismatched/ambiguous browser OS PID, unsupported/malformed responses,
authority mismatch, sanitized fetch failure and audit socket closure. Historical
logs remain unchanged. No product source or auth acceptance rule changed.
