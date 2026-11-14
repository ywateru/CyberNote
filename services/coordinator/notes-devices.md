# CyberNote persistent device registry v1

Implementation for account110. Local verification passed; independent server
review and deployment are pending. This is metadata discovery, not content
authorization or a successful live synchronization result.

Both routes use the current Logto **resource access-token bearer**, validated by
`verifiedAccount`: pinned issuer/audience/signature/lifetime/scope and static
Native product membership. The registry partition is a hash of the verified
issuer, subject and canonical product; there is no caller-selectable owner.
Native aliases share the canonical product. SPA tokens are rejected.

## HTTP contract

- `GET /api/v1/notes/devices`: no body or query; returns
  `{schemaVersion:1,devices:[...]}`, sorted by stable registry UUID. Empty is `[]`.
- `PUT /api/v1/notes/devices/self`: `application/json`, at most 8192 UTF-8 bytes,
  no query. Returns `{schemaVersion:1,device:{...}}` with the same row projection.
- Every response is `Cache-Control: no-store`. Errors use the account API's
  `{error:{code,message}}` envelope and finite local messages. No input secrets
  or upstream exception text are returned or logged by this implementation.

PUT requires exactly these fields (unknown/missing fields are rejected):

| Field | Validation / meaning |
| --- | --- |
| `deviceId` | Canonical lowercase UUIDv4, persisted library-installation registry ID |
| `registryKey` | Canonical unpadded base64url of 32 random bytes, private to this installation |
| `revision` | Integer 1 through 9007199254740991; persist the increment **before** publishing |
| `name` | Trimmed 1–96 Unicode code points; no C0/C1 controls or unpaired surrogates |
| `summary` | `null`, or exactly `{noteCount,lastNoteUpdatedAt,capturedAt}` |
| `syncAvailable` | Boolean: this device is offering the account content service |
| `transportSessionKey` | Current SDK device-session key, never the Logto refresh token |
| `protocolDeviceId` | Canonical UUIDv4 when enabled, otherwise `null` |
| `noisePublicKey` | Canonical base64url of 32 public bytes when enabled, otherwise `null` |

Summary values are nonnegative safe integers; `lastNoteUpdatedAt` may be `null`.
An empty library is `{noteCount:0,lastNoteUpdatedAt:null,capturedAt:...}`; a
positive count requires an update time. `capturedAt` and `lastNoteUpdatedAt` are
client Store-derived Unix milliseconds, not server presence timestamps. The
server does not infer note activity from heartbeat, capture time or transfer
success, and cannot verify the local aggregate against note bodies.

The successful GET shape below is synthetic; the tests assert this exact set
of row fields. PUT wraps one such row under `device` instead of `devices`:

```json
{
  "schemaVersion": 1,
  "devices": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Fixture desktop",
      "online": false,
      "syncAvailable": false,
      "summary": null,
      "transportDeviceId": null,
      "protocolDeviceId": null,
      "noisePublicKey": null
    }
  ]
}
```

When online, `transportDeviceId` is the actual SDK ID resolved by the server.
`summary` is the last reported summary or `null`; the protocol ID/public key are
the enabled device's reported association or `null`. These three association
fields are native-only: they must not be passed through the frontend DTO.
There is no `current`, `connected`, timestamp of successful content exchange,
registry key, revision, session key/hash or incarnation in a public row.

## Atomic authority, replay and presence

The raw `registryKey` and `transportSessionKey` exist only while handling PUT.
Private storage retains SHA-256 key/session hashes, canonical request digest,
exact revision, SDK transport ID/incarnation and a bounded presence deadline.
No bearer, raw key, private Noise key, note title/body or attachment is stored.

The first accepted PUT atomically claims `(verified partition, deviceId)` with
the registry key hash. Subsequent PUTs require the same hash, including when
offline or after SDK replacement. A known UUID plus another same-account SDK
session cannot take over the record. Losing the local private registration
configuration requires registering a new UUID; there is no takeover fallback.

The HTTP layer checks the SDK session's current static Native mapping. The
storage operation rechecks the **live** device session, subject, canonical
product, static mode and current incarnation in the same transaction as key
binding/revision validation and the write. Revocation between the HTTP lookup
and the final transaction prevents the write. MemoryStore performs the same
final checks and mutation without an intervening `await`; Redis uses one Lua
transaction sharing the coordinator's session/device hashes.

Only a larger persisted revision changes the row/lease. A lower revision fails.
An equal revision succeeds only for the same canonical request values and same
SDK session; it does not rewrite the row or renew presence. JSON object member
order/whitespace is immaterial, but a changed field value (even the untrimmed
name or SDK session key) conflicts. Keys and request digests are never returned.
Safe-integer summary JSON and decimal revision text retain exact bytes across
Redis Lua/cjson, including the maximum safe integer.

Accepted new revisions set presence to `min(serverNow+65000, sessionExpiry)`.
`online` additionally requires that exact SDK session and incarnation to remain
valid and its transport heartbeat to be younger than 65 seconds. This is a
presence observation, not proof of a successful tunnel or content handshake.
Registry renewal cannot replace an SDK heartbeat. Offline rows remain listed,
but their summary and all route associations are returned as `null`, and
`syncAvailable` is false. Online paused devices can have a summary while
`syncAvailable` is false. SDK revoke/session expiry/GC never deletes registry
rows. Heartbeats use newer revisions; replaying one old request cannot keep a
device online.

Redis stores each partition in `{prefix}:notes:devices:<partitionHash>` with no
TTL or transient expiry index. It is excluded from coordinator GC and clean
epoch initialization. The app registry survives handler restart, Redis AOF
restart and a reset of the complete transient coordinator namespace. Redis
external flush/deletion, eviction and storage failure are outside that promise;
production must retain durable Redis configuration/backups and avoid evicting
registry keys. MemoryStore is an in-process fixture, not restart durability.

Each partition has at most 64 rows. Existing rows can be renamed/renewed at
capacity. A new row fails explicitly and never evicts an offline device. IP
requests are bounded to 300/minute before identity verification, with a separate
600/minute verified-partition bucket. Rate limits share existing bounded Redis
quotas, return 429 / Retry-After 60, and do not refresh device presence.

Important finite errors:

| Status / code | Meaning |
| --- | --- |
| 400 `INVALID_INPUT` | Schema, UUID, key, name, revision or summary invalid |
| 413 `BODY_TOO_LARGE` / 415 `JSON_REQUIRED` | Request exceeds 8 KiB / wrong content type |
| 401 `INVALID_IDENTITY` | Bearer invalid (existing provider-specific finite errors also apply) |
| 401 `INVALID_TRANSPORT_SESSION`, `INVALID_SESSION`, `SESSION_SUPERSEDED` | SDK session absent, revoked, expired or superseded |
| 403 `TRANSPORT_ACCOUNT_MISMATCH` | Transport owner/product/static Native mapping mismatch |
| 403 `REGISTRY_KEY_MISMATCH` | Another registration key already owns this UUID |
| 409 `STALE_DEVICE_REVISION` | Older publication; cannot overwrite a newer pause/name/route |
| 409 `DEVICE_REVISION_CONFLICT` | Same revision reused with different request values/session |
| 409 `NOTES_DEVICE_LIMIT` | 64 registered devices already exist |
| 429 `RATE_LIMITED` | Request rate exceeded |
| 503 `COORDINATOR_UNAVAILABLE` | Redis/coordination state unavailable; no fallback registry |

## Compatibility and deployment preparation

Only `services/coordinator/**` is changed. Existing SDK device directory,
registration, lease, revoke and publication semantics are unchanged, as are
enrollment verification, issuer/key/seed, static product policy and dependencies.
The app-specific routes are dispatched by `createAccountCoordinator`, so the
existing Node and Vercel Function adapters both reach them without a new host,
environment secret or project. The existing project deployment must include the
new source file; use the existing service release procedure after review. No
deployment was performed for this author verification.

Deploy the additive service API before a client that requires it. Old clients
remain unaffected. New clients must require successful `schemaVersion:1` and
the strict device schema. On an older service the routes may yield 404, or the
generic coordinator may interpret the resource bearer as a session key and
return `INVALID_SESSION`. Such an unsupported API must be reported as a device
directory/service-version failure; it must not trigger automatic logout,
silent transient-directory fallback, or old automatic content exchange.
Never infer support merely from a 2xx response with the wrong schema.

Registry identity/metadata is **not content authority**. The native connection
must still verify enrollment owner/product/workspace and prove Noise-key
possession before the selected single-device action. Historical devices never
registered with this API cannot be reconstructed from expired SDK rows.

## Author verification

See [the finite verification receipt](notes-devices-verification.json).
TypeScript check passed. Focused registry tests: **18 passed, 0 failed/skipped**.
Complete service suite: **190 passed, 0 failed/skipped/cancelled** (179 top-level
tests), with `REQUIRE_REDIS=1` and the existing Redis 7.4.3 executable. Only local
synthetic identities, ephemeral loopback Redis fixtures and generated signing
keys were used; external service/credential environment was not inherited.

The new suite covers real signed bearer validation; Native alias/owner/product
isolation; schema/8 KiB/private-field boundaries; wrong-key claim and update;
atomic concurrent first claim; replay without lease renewal; same-revision
conflicts; late old-session and same-session publications; pause fencing;
revoke between lookup and mutation; offline metadata hiding and retention;
64-device quota/update; AOF/process and handler restart; clean epoch reset;
exact maximum-safe-integer serialization; and storage corruption fail-closed.
It does not prove deployed source identity, production Redis durability,
real-account discovery or native directional transfer acceptance.

An initial author run had 17 passes / 1 failure because its random malformed-UUID
fixture could produce a valid UUID. Replacing that fixture with a fixed invalid
version UUID yielded the passing focused run; the initial log is preserved.
