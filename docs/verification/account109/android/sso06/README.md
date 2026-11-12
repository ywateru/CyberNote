# One fresh d69 native SignIn using existing hosted SSO

Exactly one real UI SignIn was issued on the installed d69 isolated debug APK.
Preflight read the authoritative native status as signedOut, disabled, no profile
and no error. PID 15212 matched user0, the APK SHA matched d69, the callback handler
was uniquely owned, and no prior tool handles/leases were present.

The existing audited prepareHostedDriver was invoked once, without its credential
consumer. It observed a newly changed trusted-origin target after SignIn. Its
trusted-form stage then stopped with BROWSER_USER0_NOT_FOREGROUND because Chrome
no longer owned the foreground. This is a preparation-tool stop, not the native
product outcome and not a reason to repeat SignIn. No editable-form input or
credential transfer was attempted. Browser configuration was not changed.

The existing guarded native terminal observer returned callback-native-error.
A subsequent read-only DTO, followed by fresh deadline/unlock/u0-foreground
checks, confirmed **state=error, safeCode=account_network**, profile absent,
username absent and sync disabled. The authoritative read occurred 65,186 ms
after this SignIn attempt began, within the 120-second bound. Thus account_network
is reproduced on latest d69 by a real native attempt, independently of Chrome
health/fetch inference. No particular HTTP endpoint, transport failure, token
exchange outcome or native callback-validation stage is proven by this receipt.

Native paused/profile login success was not observed. sameSyntheticUser=false
with usernamePresent=false means the expected synthetic user was not verified;
it does not establish another user or a mismatch. Native AuthClient remains the
authority for callback state/PKCE/issuer/nonce. No raw callback URL/scheme event,
profile string, provider error, grant or token was recorded or copied out.

The final native state was error rather than authorizing, so product Cancel was
unnecessary. The failure was left intact. No credential entry, sync enablement,
network setting/DNS/TLS bypass, business-data write, logout or automatic retry
was performed. There was no test-created browser target in this attempt; the
product opened its own hosted page, and the test did not close unrelated tabs.
Preparation, observer and final-read drivers closed. Final read-only checks at
2026-11-12T21:50:10.939Z found no browser/known-owned-PID forward, reverse mapping
or native/browser lease, with the test app restored to user0 foreground. These
are timestamped historical observations, not assumptions of future liveness.

`result.json` preserves the independent fresh attempt, source hashes, guarded
observer receipt and static safe native detail. It does not overwrite hosted-live01
or the separate public probes. No authentication, same-user or sync pass is claimed.
