# Android native Rust public connectivity probe

Result: **all six coordinator requests failed with connection-phase timeouts;
Logto discovery returned HTTP 200.** The single probe execution completed in
5,091 ms, within its independent 25-second device bound.

| Public endpoint | Mode | Android result | Earlier desktop result |
| --- | --- | --- | --- |
| Coordinator health | inherited | connect timeout, 5,003 ms | HTTP 200 |
| Coordinator health | no_proxy client | connect timeout, 5,003 ms | HTTP 200 |
| Coordinator auth config | inherited | connect timeout, 5,003 ms | HTTP 200 |
| Coordinator auth config | no_proxy client | connect timeout, 5,003 ms | HTTP 200 |
| Coordinator anonymous profile | inherited | connect timeout, 5,002 ms | HTTP 401 |
| Coordinator anonymous profile | no_proxy client | connect timeout, 5,003 ms | HTTP 401 |
| Logto discovery | no_proxy client | HTTP 200, 1,093 ms | HTTP 200 |

Coordinator requests use only `cybernote-sync.vercel.app`; discovery uses only
`auth.x.aixgg.com`. The source hardcodes seven credential-free public HTTPS GETs,
starts them concurrently, uses normal rustls certificate verification, disables
redirect following, and bounds each connection at 5 seconds and each request at
15 seconds. It sends no credentials and archives no response bodies. The public
auth-config app identifier is part of the fixed original source.

The inherited and `ClientBuilder.no_proxy()` modes are the source's existing
comparison, explicitly authorized for this run. All eight shell proxy
environment variables were independently observed absent, and the probe
reported `hasLowercaseProxy=false`. The operator added or changed no environment
variable, proxy, DNS, VPN, route, certificate, network setting or IP override.

Binary identity was independently checked before pushing:

- Artifact: `/private/tmp/account109-android-public-native-probe01/account109-public-connectivity`.
- Bytes: 11,655,616.
- SHA-256: `b9c628a47f70c6be884478c3957185a2ecf5a6a086880505a1bf2bdfc2494d02`.
- Independently parsed ELF64, little-endian, AArch64, DYN/PIE,
  `/system/bin/linker64`, Android API **28** from the ELF Android note.
- `Cargo.toml`, lockfile and Rust source matched their supplied manifest hashes
  and the archived desktop source byte-for-byte.
- The feature declarations are reqwest `0.12.28`, default features disabled,
  `json` plus `rustls-tls`, matching the product's HTTP feature declarations.
  Historical compilation is attributed to the supplied build receipt; this
  verifier ran no build and did not access any Cargo target.

[artifact-receipt.json](artifact-receipt.json),
[build-command.json](build-command.json), [source-manifest.json](source-manifest.json),
[source](source), [elf-inspection.txt](elf-inspection.txt) and the independent
[elf-verified.json](elf-verified.json) preserve build/source/ELF provenance.
The original artifact receipt describes its pre-execution state; the actual
execution is recorded separately in [run-receipt.json](run-receipt.json).

[run-probe.py](run-probe.py) used only serial `98895a3147304c3132`. It proved a
fresh UUID-based `/data/local/tmp/account109-public-probe-*` file path absent,
pushed the exact artifact, set mode 700, and verified its on-device SHA-256
before execution. It invoked the binary exactly once under
`timeout -s KILL 25`, with a separate host-side timeout. Execution exited 0;
SELinux did not block it. Only schema-validated JSON is archived as
[result.json](result.json). Raw stderr was discarded.

The exact owned device binary was then removed and verified absent. No other
device path was removed. The helper created no forward or driver lease; ADB
ownership was explicitly returned after cleanup. No app launch, SSO retry,
grant access, APK installation/update or desktop operation occurred.

[comparison.json](comparison.json), [desktop-result.json](desktop-result.json)
and [desktop-receipt.json](desktop-receipt.json) preserve the comparison with the
earlier same-source desktop probe. Its desktop public endpoints returned the
expected HTTP statuses in both client modes. The phone result supports a
selective coordinator connectivity problem rather than a general failure of
this Rust TLS stack: verified HTTPS to Logto completed successfully. It does
not establish authenticated Logto or coordinator behavior, a root routing or
filtering cause, or behavior under the product's application UID. This probe
runs under the ADB shell UID. Coordinator TLS and HTTP did not complete.

In the error rows, `connect=true` is reqwest's **connection-error classification**,
not evidence of a successful TCP connection. `timeout=true` and the approximately
5-second durations establish the observed connection-phase timeout boundary.
No underlying OS code or IO error kind was provided for those failures.

The evidence manifest records full SHA-256 values. No commit was made.
