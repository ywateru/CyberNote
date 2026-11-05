# Same Mac16 bundle after normal relaunch: one bounded snapshot

2026-11-05, Asia/Shanghai. This supplement preserves the earlier `12:14:31` snapshot unchanged and records **one additional latest log query**, ending exactly at **12:23:05**. No continuing polling was performed.

Root reports that the old failed child was normally closed; the fresh child still reported a previous pending request; Settings displayed the `mac-sealed` microphone switch as on; no prompt was visibly found; and root then used normal CmdQ and relaunched the same sealed bundle. These are root's GUI observations, not independent GUI observations by this diagnostic agent.

## Identity

Read-only `ps -p 74528 -o pid=,lstart=,command=` independently returned:

```text
74528 Thu Nov  5 12:21:27 2026     /Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-presentation-build16/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone
```

Root identifies this as the same sealed Mac16 package: source `9167db94908ac635b026220e782878447c9e16a7`, executable SHA256 `2235f976b9fa464f78b3f8d700f2f0361ae55c7069fae73c1889b43a09b93e4a`, CDHash `469ea16128121596a2875236e9c69ef6ffa5d06b`. These exact package hashes were independently checked in the preceding snapshot (`identity.json`, `codesign-current.txt`); this supplement did not rehash/re-sign or rebuild anything. The new log attribution uses the same full package executable path.

Root's new recording session is `aeb48084-d26c-4af0-84c1-505cf1b90c26`, operation `8deddd24-2681-4512-baae-c055a9d7b2dc`. Session/operation identifiers are handoff context; TCC logs identify the process and request IDs instead.

## Three distinct transactions

The exact filtered output is `reopened-microphone-transactions.log`, with the query and post-filter recorded in `reopened-query.json`. Query stderr is empty. The raw PID-prefixed query also allowed new-PID transaction discovery; only new request IDs whose own records name Microphone were retained, together with the exact old transaction and this bundle's Microphone condition comparisons. Other-service records were discarded.

| Transaction | Directly recorded facts through 12:23:05 |
|---|---|
| Old `71272.6` | Request was at **12:11:05.280**, prompting at **12:11:05.287**. Still no recorded `AUTHREQ_RESULT` or `REPLY` in this query, about **719.720 seconds** after request. Process exit is not proof that TCC recorded a terminal result. This does not establish indefinite pending or what happened after the query cutoff. |
| New launch preflight `74528.2` | At **12:21:27.908**, Microphone `preflight=yes`; at **12:21:27.915**, internal `authValue=1`, `authReason=0`, `error=null`, then `REPLY`. This is the startup preflight, not the later explicit Start authorization. These internal numbers are not a measured public AVAuthorizationStatus enum. |
| New explicit Start `74528.6` | At **12:22:10.241**, Microphone `preflight=no`; at **12:22:10.246**, `AUTHREQ_PROMPTING`. No `AUTHREQ_RESULT` or `REPLY` through **12:23:05**, about **54.759 seconds** after request. The preflight reply cannot be reused as this request's successful result. |

Both new transactions log failure to match the existing Microphone code requirement, comparing old `0a258674ff1844f9fe57fc9d3619c5cd22fa7cad` with current `469ea16128121596a2875236e9c69ef6ffa5d06b`. The same comparison was present before relaunch. It is a repeated, signature-specific condition fact, not proof of the unique cause of the authorization behavior.

## Prompt visibility and readiness boundary

`AUTHREQ_PROMPTING` records that TCC entered the prompting path. It does **not** prove a prompt was displayed, in front, visible on a particular desktop, or acted on. This read-only query does not contradict root's independent observation that no prompt was visible. Similarly, a displayed Settings switch does not independently measure the public authorization status returned to this exact current signature; the code-requirement comparisons make treating the switch as proof particularly unwarranted.

The bounded logs do not yet establish a completed new explicit authorization, processed native completion, WebKit stream, or actual capture. The fixed native source in the initial snapshot remains the relevant one-delivery/30-second-timeout/pending-owner behavior. This supplement does not infer the exact new child UI timeout time from source or treat the prior PID's in-memory pending owner as surviving process termination.

No permission change, TCC reset, signing change, product change, audio/DB read, GUI action, build/test or cache operation was performed. No further query or recovery action is prescribed by this finite snapshot; root can decide the next step using these exact transaction identities and the separately observed GUI state.
