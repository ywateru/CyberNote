# Startup handoff: bounded source investigation

2026-11-13. **Confirmed source-level unbounded frame wait; exact live failure cause remains unproven.** Analysis base `44a9f43f5600174682b1ef7e71eb2649205dcc0e`; 14 inspected startup/driver files are byte-identical to the actual GUI source `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11`. The new cancel-local runner is later test tooling, not a product change inside that binary.

The original live result was read at `/private/tmp/account109-cancel-local-live01-output/result.json`; its hash and bounded projection are in [receipt.json](receipt.json). No App/raw output, original store, grant, note contents or browser state was read. Raw result bytes were re-read unchanged. Its prepare ready timeout, documentProbe phase, 1332 probes, last hidden/loading/inert DOM, unavailable fallback diagnostic, SIGTERM and cleanup failure remain failures. The raw pidAbsent=false field is preserved as a field, not proof the process was still present: runner initializes it false and its close exception occurs before the PID query. Parent's separate gone/AX observations are attributed and have no retained exact observation timestamp.

[Analysis and proposed contract](../../../../plan/analysis/account109-startup-handoff.md) contain exact source lines and a small, not-yet-implemented dual-rAF plus cancellable timer design. No startupReady condition is proposed for removal. A separate fixed pre-ready diagnostic proposal preserves the arbitrary-Eval gate.

Executed commands (no build/dependency install):

```sh
node --check docs/verification/account109/native/startup-handoff-analysis01/fixture.mjs
node docs/verification/account109/native/startup-handoff-analysis01/fixture.mjs /private/tmp/cybernote-account109-explicit-login
```

Both exit 0. **10 source-driven fake-host cases pass**, with actual App effect and public startup script hashes in [fixture.stdout.txt](fixture.stdout.txt). Frames/timers are manually controlled, not a browser. The ready-true/no-frame case remains loading/inert after 45 simulated seconds even though the slow-message timer ran; normal frame delivery finishes. Four unready dependencies independently yield the same DOM. This is a conditional source counterexample, not proof of actual WebKit frame starvation and not verification of a new fix.

Current fixed driver fallback cannot obtain its intended rAF/timer sample before Ready, because its Eval is rejected by the existing native NOT_READY rule. Initial toolbar bind does not require rAF; show/unminimize precede stdio Ready and do not await splash. Workspace/toolbar/other gates cannot be ruled out from the saved fields. Prior gui-access02 and relogin04 success records were consulted only for finite readiness/lifecycle facts, not replayed or promoted to current acceptance.

Parent additionally identified the related debug waitForIdle rAF-only await. Source inspection confirms its elapsed guard cannot advance while awaiting an undelivered frame. Startup fallback alone does not establish complete Ready success. The analysis proposes, only if separately authorized, bounded non-paint idle resampling while retaining real active/busy/save/error/stability checks. It explicitly excludes a global frame replacement, command execute's completion barriers and App's quiet-cover safety sequence. This addition is static analysis; the 10 executed cases remain startup-only. Fourteen inspected product/driver inputs including debug runtime match the GUI source.

No product source was modified, no failed record rewritten, no App/network/UI/device/native build executed, and no HOME/CODEX_HOME/system variable overridden. The evidence includes only the source fixture, its finite output and reduced receipt. `SHA256SUMS` also covers the separate analysis document, excluding itself.
