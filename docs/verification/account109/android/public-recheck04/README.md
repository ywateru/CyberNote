# Frozen direct-navigation phone recheck 04

One authorized rerun used the unchanged, previously reviewed direct-navigation
probe frozen at a5e67d8d. Runtime bytes matched its archived source and manifest
SHA-256 before device navigation. `checks.json` records source/dependency and
receipt hashes. Main ec4348c6 is user-reported context; this network-only check
did not rebuild, install or relabel the previously recorded isolated APK.

Read-only preflight confirmed serial 98895a3147304c3132 online, unlocked,
Account109 installed for user0 and PID 21082 matching its package cmdline/user0
UID. The owned test app was foreground. There were no Chrome/owned-PID forwards,
reverse mappings, native/browser leases, live envelope or hosted driver.

The sole new Chrome target's browser endpoint OS PID matched selected user0
Chrome PID 12765. The probe directly navigated canonical health once. There was
no Document HTTP status or allowlisted browser network error within **30,013 ms**;
Page.stopLoading was sent. The stored navigationCommandFailed flag is the
probe's own 25-second RPC timeout, not a browser transport-error classification.
Because health had no HTTP result, the same run directly navigated the fixed
Logto OIDC discovery control; its Document returned **HTTP 200 in about 708 ms**.
Page.stopLoading was also sent for the control. No fetch/CORS interpretation is
needed for this direct-navigation result.

The same phone/canonical-origin no-HTTP condition seen in navigation03 persists.
A successful auth-origin control does not establish global internet failure or
service-wide outage, and does not identify DNS/TCP/TLS/HTTP-server waiting as the
cause. Chrome and native Rust remain different HTTP stacks. This observation
supports the existing network prerequisite remaining unresolved for live login,
but is not new proof of the original native profile failure stage.

No login or credential retry, App token copy, response-body/header/cookie read,
secret-file-body read, DNS/TLS bypass, network-setting change, or operation of
the original user app occurred. The probe closed only its created page and exact
forward, and released its browser lease. The immediate normal-start foreground
check was false; the independent final read confirmed u0 Account109 foreground.
Both observations are preserved. Final read-only checks confirmed no exact or
Chrome/owned-PID forward, no reverse mapping and no native/browser lease.

`preflight.json` and `result.json` are independent new evidence. Earlier login
failure and probe attempts remain unchanged. No production or tool source was
modified by this rerun.
