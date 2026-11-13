# Approved custom coordinator domain: binding complete, DNS pending

2026-11-13, Asia/Shanghai. User replied “继续 允许使用” after the request to use exact host `cybernote-sync.aixgg.com`. **Existing Vercel project binding succeeded; DNS/TLS/phone acceptance remain pending.** No new deployment/project, environment change, redirect or account request to this host occurred.

The existing Vercel CLI credential had expired; an initial read returned 403. The already-cached official Vercel CLI 63.1.2 `whoami` refreshed the existing login normally. A new API read found exactly one `cybernote-sync` project and only its existing canonical domain. Parent then POSTed the exact name to `/v10/projects/{id}/domains` in the existing scope. Response 200 has redirect=null, gitBranch=null, verified=false, and the actual TXT challenge in `binding.json`. IDs and credentials are not archived. The project was not rebuilt or redeployed by this operation.

After binding, the Vercel config endpoint returned a project-specific first-ranked CNAME, replacing the pre-binding generic recommendation. The exact pending additions in zone `aixgg.com` are:

| Type | Name within zone | Value | Settings |
| --- | --- | --- | --- |
| CNAME | `cybernote-sync` | `673bb9aa89cda1fe.vercel-dns-017.com` | DNS only / proxied=false, TTL Auto |
| TXT | `_vercel` | `vc-domain-verify=cybernote-sync.aixgg.com,977eb5d7081b90eba946` | Additional record, TTL Auto |

These are proposed DNS additions, **not executed**. Public exact-name Cloudflare DoH reported NXDOMAIN for the CNAME. `_vercel.aixgg.com` already had three TXT answers, none containing this exact challenge. Append a distinct TXT record and preserve all existing values. Do not infer from public DNS that the management zone has no pending/unpublished records; inspect the authorized zone before creating anything.

The existing local Cloudflare API credential successfully queried the active exact zone, but its record-list request returned HTTP403/code10000. No write was attempted through this credential. Browser fallback used a saved Google profile to log into Cloudflare; the resulting account had no target zone and only one switchable account. A read of the zone's account metadata confirmed it differs from that browser account. The parent signed out the session created by this attempt, selected another Google account, and left an empty sign-in form as the handoff. No new account/token was created, authentication input supplied, user permission expanded or DNS record edited. Account emails, IDs, raw browser URLs and screenshots are not archived in Git. A handoff screenshot remains only at `/private/tmp/account109-domain-login-handoff01.jpg`.

## Source and validation

Approved Android config source `b4ba3f96` and manifest `c39458d4` were adopted on main as `f9e78054` and `a528f11d`; author receipt is `aade7ddd`, independent review `bc718a47`. Android alone now compiles the approved fixed transport host; desktop and strict enrollment issuer remain the canonical Vercel origin. No runtime override or fallback was added. [Independent source/pin review](../../native/approved-domain-review01.md) records the two focused author-run Rust checks, source invariants and independent policy/export checks; Android cfg has not yet been package/device-tested.

On clean main `bc718a47`, parent reran the full account/driver/publish/native-policy Node command from [login-surfaces-integration02](../../native/login-surfaces-integration02.md): **274 pass, zero failure/cancel/skip/todo**, 259 top-level items, 4233.405083 ms, exit0. Raw TAP `/private/tmp/account109-approved-domain-integration01.tap`, SHA256 `69ac30b1d82369df4354e97ac5f2647e9851d2e5298b52ea6941993bc37344ac`. The previous `72513d12` candidate artifacts remain unchanged and contain the old Android transport; they are not relabeled as new-domain builds.

## Remaining execution

After a target-zone administrator signs in or otherwise completes these exact DNS additions, re-read Vercel domain/config state, invoke its documented verify endpoint if required, and confirm public DNS and hostname-valid TLS. Verify fixed anonymous `/healthz`, `/api/v1/auth/config?appId=<fixed-native-client>` and `/api/v1/account/jwks` against the canonical service with redirects rejected. Compare fixed Logto issuer/client/resource/product, stable enrollment issuer and signing key identities without copying credentials or broad environment data. Domain verified alone is insufficient evidence of these contracts.

Then build a new exact candidate with refreshed package identity and run the bounded anonymous Android CELLULAR check before account authorization to this host. Only after those gates pass continue real login, original-data preservation, three-device full-document/attachment convergence and current relay transport evidence. Preserve phone error/data and old baselines throughout. No successful DNS, TLS, login, new-client build, phone reachability or three-device result is claimed by this receipt.
