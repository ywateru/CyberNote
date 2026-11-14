# Account110 bounded independent SDK mapping probe 01

2026-11-14. Parent authorized one independent CLI probe following the preserved
App single-push coordinator error (live02-push-diagnostic02). Frozen product
source d0ad2267289cbe3f527fd7ee30299a62812d6ac9 and Cicero-approved package
mac-d0ad2267-debug-01 remained unchanged. This archive records CLI mapping
observations, not application transfer acceptance or a replacement for prior failures.

## Actual result

Normal AuthClient restore, SDK registration and fixed registry GET passed. Exactly
one enrollment map succeeded in 33026 ms and one sync map succeeded in 28400 ms.
Both recorded fallback cloudflare-tunnel WebSocket upgrade, mutual TLS,
multiplexer-ready and port-open. Successful enrollment mapping stayed alive until
both calls completed, matching product ownership. Both mappings were then closed;
client.close returned normally. No typed map error was returned in this probe.

The event stream also contains mapping-disconnected and one phase=error during
final teardown. Its raw message was neither captured nor interpreted. No code
field exists in this SDK Event type; eventCodeAvailable=false is explicit. Only
fixed phase/transport labels were retained. Successful map calls do not establish
that every background event was successful.

Probe exit and pipe close were zero; its independent owned process group was
confirmed gone, with no forced signal. B naturally exited zero with confirmed
close, no forced signal, and final ready/enabled status without account error.
Product input fingerprint and frozen HEAD matched before/after. Original live02
first-result bytes/SHA remained unchanged. No additional probe or retry followed.

This did not reproduce the prior App map/coordinator failure. It demonstrates
that these two target ports were reachable through the normal SDK relay path in
this particular run. It does not identify the old SDK variant, establish a stable
network condition, exercise pair/transfer, prove reverse exclusion or attachments,
or justify changing product timeouts, trust checks or success conditions.

## Dependency and build identity

The CLI directly uses the frozen product's vendor/cybergrid-sdk 0.3.0 and
crates/account-auth, including product config/provider sources. The final lock
was derived from the exact src-tauri/Cargo.lock: all 536 non-root probe packages
match product name/version/source/checksum; only the probe root is additional.
lock-comparison.json pins both locks. Tokio is 1.54.1 in both. Probe directly asks
for full; product's direct Tokio dependency lists a subset, while its SDK already
asks for full. The standalone harness has a different whole-application feature
union from Tauri; this is not a byte-identical product executable.

Initial copied-lock metadata resolution failed offline for an uncached package;
an initial offline generate-lockfile build subsequently succeeded but drifted in
16 transitive package versions. Both receipts/logs are retained privately, and that
binary was never used for this network probe. The final build instead copied the
product lock, made only the necessary root/pruning adjustment with cargo build
--offline, and verified cargo build --locked --offline successfully. No dependencies
were downloaded. Runtime used only the final binary pinned in build-receipt.json.

Only the existing single shared target was used. CARGO_BUILD_JOBS=2,
CARGO_PROFILE_DEV_DEBUG=0, CARGO_PROFILE_TEST_DEBUG=0, CARGO_INCREMENTAL=0;
no HOME override. One-second disk monitoring retained the approved 6 GiB floor;
minimum free space was 9348296704 bytes. Final build steps took 62.159 s and
1.006 s. Target was released after compilation; no product build/suite rerun.

Seven local safe-projection self-test assertions passed in the final binary.
Two device-free process fixtures verified natural group disappearance and cleanup
of a child remaining after its parent exits. Huygens statically reviewed finite
projections, mapping ownership, serialized receipts and owned-PGID cleanup before
execution. These are harness checks, not native product regression tests.

## Execution and privacy boundary

B was the real approved App, explicitly opened on its existing owned live02 data
directory and normally restored. A App remained closed. The probe acquired A's
normal AuthClient owner in place, checked the restored subject against B in RAM,
and registered a fresh temporary SDK session through the product AuthProvider.
This was not wholly read-only: normal restore can rotate/persist the owned grant;
SDK registration/close and provider cache are normal side effects. No grant,
Noise identity, original library or credentials were copied/exported/read by hand.
No login, logout, registry PUT, notes protocol request or content action occurred.

One fixed registry GET used normal TLS, no redirect, 15-second timeout, 256 KiB
body limit and strict schema/row checks. Exact B was selected in RAM; its subject
and registry identity went only through probe stdin, never argv/disk/log. Each map
was called once with unchanged SDK defaults and product fixed ports. The probe
had a 360-second outer budget; B ready/restore had separate 60/90-second limits.
No forced transport, DNS/route/proxy change or credential capture occurred.

Only finite SDK Error variant, reviewed static Timeout labels and bounded numeric
API statuses could be serialized. No such error appeared. No raw errors, event
messages, bodies, IDs, authorization URLs, profile/subject, keys or content are
archived. SDK stderr byte count was zero. safe-summary.json pins the preserved
private harness/build inputs and result. Private root is retained for independent
review; SHA256SUMS covers this small safe archive. Main/artifacts remain frozen.
