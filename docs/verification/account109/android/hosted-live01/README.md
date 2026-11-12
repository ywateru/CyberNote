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

## Fixed public endpoint reachability from the phone

The previously verified unique account root exists. No grant/token was obtained
for these probes. Source and its SHA-256 are recorded in `public-probe-source.json`.
The canonical fixed public requests were `/healthz`,
`/api/v1/auth/config?appId=il4abzwbu1ohjwv5mb667`, and
`/api/v1/account/profile` (anonymous), all at the pinned canonical HTTPS origin.
No alternate health route, IP, DNS override, TLS bypass or proxy change was used.

`public-probe01.json` preserves the first two-request attempt from a dedicated
blank page without verified foreground. Both requests were aborted by the
probe's own 15-second deadline without an HTTP status. This does not establish
a native browser connection-abort error or a failed server response.

`public-probe02.json` preserves the foreground repeat plus anonymous profile.
The global browser endpoint OS PID matched the unique user0 Chrome UID/PID before
creating the sole new target. No existing page targets were enumerated. User0
Chrome foreground and the created blank page's visibility were verified. Each
fixed fetch used `credentials:omit`, `redirect:error`, no-store/cache-disabled,
service-worker bypass, and a 15-second AbortController limit. The script inspected
only Network response status/fixed loading-failure categories, not response
bodies, request headers, cookies, profiles or App grants. All three results were
`probe_deadline`, with no HTTP metadata. The blank page uses an opaque origin;
these are fetch/network observations, not direct navigation or native reqwest
traces. No claim about a particular DNS, TLS or transport cause is justified.

The main agent separately reported contemporaneous normal-DNS/normal-TLS host
results of 200/200/401 for those endpoints; these host results are user-reported
context, not new tests executed by this branch. The contrast supports investigating
the phone's canonical-origin network path before blaming a service-wide outage,
but does not rule out transient behavior or differences between Chrome and Rust.
The 15-second bound also matches the native enrollment client's timeout; a request
that never produces a response in that interval can map to `account_network`.
This is corroboration of a hypothesis, not proof of the failed native request.

Each probe closed only its created target and exact owned CDP forward, released
the browser lease, and the second restored the isolated account test app to u0
foreground by normal start. There was no new SignIn, token copy or sync enablement.
The initial query-string import reload failed locally before executing probe02;
a separate module filename loaded the exact archived revised source instead.

## Bounded direct-navigation control

The user requested one different-method follow-up to eliminate opaque-origin
fetch/CORS uncertainty. `public-navigation03.json` records this actual phone run;
`public-navigation-source.json` freezes its exact source hash. Only a newly owned
user0 Chrome target was used. Ownership was verified through the browser endpoint
OS PID before creating/attaching that target. Existing pages were not enumerated.

The first direct `Page.navigate` targeted canonical `/healthz`. No Document HTTP
status or allowlisted `net::ERR_*` arrived within 30,005 ms, and the tool sent
`Page.stopLoading`. `navigationCommandFailed:true` records the tool's own
25-second CDP RPC timeout; it is not a browser transport error code. The result is
`diagnostic_deadline_no_http`, not a fabricated HTTP or net error.

Because health had no HTTP status, the permitted control directly navigated to
the pinned issuer's OIDC discovery document. Network.responseReceived for that
Document reported **HTTP 200** in about **606 ms**. Loading was stopped. No fetch
execution, response-body, header or cookie inspection was used in this method.
No App credential, DNS override, TLS-ignore option or network-setting change was
involved, and no login/sync operation was initiated.

The contrast demonstrates that this phone/user0 Chrome could obtain an HTTPS
Document response from the auth origin while canonical Vercel health did not
produce an HTTP result within the native enrollment client's relevant time
window. It removes the earlier fetch/CORS ambiguity and supports investigating
the canonical-origin path or a transient request stall. It still does not identify
DNS versus TCP/TLS versus server wait, establish a browser net error, prove which
stage failed in the original native request, or prove equivalence of Chrome and
Rust network stacks. Host 200 evidence is separate user-reported context.

The tool closed only its created target and exact owned forward, and released
its lease. The immediate check after normal sandbox start was initially false;
a later read-only foreground check confirmed the test app had resumed as u0.
Both observations are retained, and final owned sandbox foreground is true. No
additional network request or login retry was performed during this cleanup.
