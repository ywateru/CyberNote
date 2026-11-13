# Android public health recheck 01

Result: **BLOCKED — public health reachability prerequisite not restored**.
One authorized Android-shell GET to
`https://cybernote-sync.vercel.app/healthz` ran on 2026-11-13 from
04:23:18.799291 UTC to 04:23:21.723266 UTC. No second Android GET or retry followed. A separate subsequent host control is described below.
The exact finite [result](result.json) and executed [script](network-recheck.py)
are archived here; `SHA256SUMS` covers the archive.

The command reproduces only the coordinator HTTPS curl operation from
`../9263-signin01/network-diagnostic.py`, with ordinary canonical HTTPS certificate
validation, a 5-second connection timeout, 10-second curl total timeout, existing
12-second device command guard and 15-second host guard. It does not follow
redirects. The response body goes to `/dev/null`; upstream stdout/stderr bodies
were never printed or retained. Only allowlisted numeric curl metrics and a finite
error label were reported.

| Observation | Value |
| --- | --- |
| Authorized device | 98895a3147304c3132 |
| GET attempts | 1 |
| curl/ADB exit code | 7 |
| HTTP code | 000 (recorded numerically as 0) |
| Finite stderr classification | timeout |
| Name lookup | 0.129880 seconds |
| TCP-connect metric | 0 seconds |
| TLS-completion metric | 0 seconds |
| curl total | 2.339371 seconds |
| Host elapsed | 2924 ms |
| Host timed out | false |

The TCP/TLS zero timings and absent HTTP response do not establish successful
connection or certificate validation. In particular, curl's numeric verify result
of zero is not evidence of a successful handshake when no TLS session completed.
This result supports only that this one public endpoint GET failed on the current
Android shell path; it does not establish an underlying network cause or the app's
runtime behavior.

The workspace HEAD observed before the check was
`9677c9ee83abd6e4ccdf35d025f4cc910ecc0076`. The previous multi-request Rust probe,
login/account operations and all app/store/UI operations were excluded. No DNS
addresses, IP overrides, separate DNS/TCP probes, proxy/environment changes, VPN
changes, network-setting changes, installation or device file copy were used.
No credentials were supplied and no response body, raw stderr, routes, proxy
endpoints, browser URLs or callbacks were archived.

The command finished normally at the host layer and no check remains running.
**ADB ownership is released.** State is unchanged; remaining prerequisite and
acceptance auditing stays with the parent. No commit was created.


## Subsequent host control and desktop access

A single ordinary certificate-verifying host GET on the same canonical endpoint returned HTTP 200 at 04:25:33–04:25:35 UTC (2.640792 seconds). See [host-control.json](host-control.json). No second phone request occurred; the original phone result remained byte-identical. This establishes host reachability during that later sample, not an exact routing cause or continuous availability guarantee.

The parent also freshly queried the native app inventory in this goal turn; CUA explicitly reported Mac locked and automatic unlock unsuccessful. [desktop-current-access.json](desktop-current-access.json) records the returned diagnostic. It is a current access condition, not a proven cause of historical startup/evaluation failures. No authentication or network setting was changed.
