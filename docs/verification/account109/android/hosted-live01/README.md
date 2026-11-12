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
