# One Android real product sign-in, sync disabled

Outcome: native terminal error after **20,692 ms** of the allowed 90-second
authentication wait. Exactly **one** product-driver `signIn()` call was made.

```json
{
  "state": "error",
  "enabled": false,
  "hasProfile": false,
  "identityCheck": "unverified",
  "error": {
    "code": "account_network",
    "stage": "coordinator",
    "providerReason": null
  }
}
```

This identifies the reported coordinator network boundary. It does not identify
an upstream HTTP response, distinguish transport from server availability, or
establish successful identity-provider login. No native profile was observed, so
the expected synthetic username and initially-paused login acceptance remain
unverified. No second attempt was made.

Before sign-in, [preflight.json](preflight.json) independently established serial
`98895a3147304c3132`, an unlocked device, user 0, Account109 foreground, no existing
serial-scoped forwards, expected package/activity/certificate, and installed APK
SHA-256 `da74379984dfc0af86bff1ae89aeac43c83fdab4e7884b9b032961519c404ce9`.
The earlier independent static identity is copied as
[apk-static-identity.json](apk-static-identity.json).

[signin.mjs](signin.mjs) used the existing product driver's visible account UI
and SignIn control. It never injected credentials, URLs, tokens or callbacks,
never requested enablement, cancel or sign-out, never cleared data, and never
touched the original app or device settings. The previously completed desktop
diagnostic had already closed both desktop processes before this phone operation.
The full desktop runner was not started.

All **four** existing synthetic note documents and plainText were compared in
full against the saved local-update baseline before sign-in and after the
terminal result. Every comparison passed, with the note count unchanged. Full
content stayed in memory; the result archives only per-note document/plainText
hashes. Status observations were deduplicated and sanitized to fixed state,
error code/stage/providerReason values and booleans. No browser URL/title,
profile identifier, credential, raw provider error or device/log body is archived.

[result.json](result.json) records `signedOut → authorizing → error`, exactly one
sign-in, no profile, and sync disabled throughout. The terminal error ended the
run; no hosted-authentication handoff or cancellation occurred.

Cleanup passed: driver closed, its exact owned forward removed, final
serial-scoped forwards empty, driver lease absent. ADB ownership was explicitly
returned to the parent. No further phone operation was performed.
[cleanup-audit.json](cleanup-audit.json) separately checks the actual
`os.tmpdir()` lease path used by the existing driver. The executed helper's
fixed `/private/tmp` lease probe alone was insufficient; the completed driver
close and this final filesystem-only audit establish actual lease cleanup.

Fresh output: `/private/tmp/account109-android-real-9263-jwks01`. The helper,
read-only preflight, exact existing Android driver/lifecycle source and results
are preserved here and in that output directory. The archived dependencies are
source evidence; the executed helper imports the existing main-workspace driver.
No build, installation, browser automation or account/sync enablement was run in
this attempt. No commit was made.

The parent subsequently authorized a separate bounded read-only phone network
diagnostic, without another SignIn. Its source is
[network-diagnostic.py](network-diagnostic.py), command inventory is
[network-availability.json](network-availability.json), and fixed-metadata result
is [network-diagnostic.json](network-diagnostic.json). It completed in 10,876 ms.

| Canonical host | System-selected DNS address class | TCP 443 |
| --- | --- | --- |
| `cybernote-sync.vercel.app` | public | failed, timeout at about 5.1 seconds |
| `auth.x.aixgg.com` | public | connected, about 0.57 seconds |

No fake-IP range was observed for either selected address. The phone had curl
and toybox, including toybox nc/timeout; wget, openssl, nslookup and getent were
unavailable. Because no standalone resolver was available, a bounded single
ping exposed each system-selected DNS answer. ICMP results were not used to
decide TCP connectivity. These observations cover a selected address, not a
complete DNS RRset, cache history or every application resolution path.

A curl request to the exact coordinator HTTPS `/healthz` endpoint used normal
certificate verification, no credentials, no redirect following and no DNS/IP
override or proxy bypass. It failed with curl exit 7, HTTP status `000`, and
zero completed TCP/TLS timing. No response body was retained. Its numeric
`verifyResult=0` is a default value before TLS and **does not establish successful
certificate verification**. No HTTPS/OAuth request was made to the identity host;
its successful TCP connect alone does not establish authentication availability.

Filtered network metadata showed public-class DNS server addresses, Wi-Fi and
cellular network transports, IPv4/IPv6 default routes and no configured global
HTTP proxy. Private DNS mode was unset (`null`) and no private-DNS specifier was
configured. Exact DNS servers, gateways, interface names, proxy endpoints and
Wi-Fi identifiers were not retained. The phone filtered connectivity dumps to
DNS/transport fields before returning data. This metadata does not rule out
per-app routing, VPN behavior, filtering or transient network differences.

The observed distinction is **coordinator transport failure versus reachable
identity-host TCP**, with public DNS answers. It supports the reported
`account_network / coordinator` boundary; it does not prove a specific routing,
filtering or upstream root cause. No tool installation, network setting/VPN
change, bypass, IP pinning, OAuth action or access to tokens/grants occurred.
The network helper created no forwards or leases and explicitly returned ADB
ownership after its final probe. No desktop operation was performed during this
phone diagnosis.
