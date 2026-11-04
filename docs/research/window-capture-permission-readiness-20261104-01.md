# Screen capture permission readiness audit — 2026-11-04

Scope: read-only examination at main freeze `b2f42c420013436f59e676b414eb18aec4b05bf5`. No GUI, permission request, reset, grant, TCC database access, helper invocation, wrapper creation, signing, recompilation, or product modification was performed. This file is the only new output of the audit. Existing runtime evidence was read without modification.

## Decision

**NOT READY to claim a successful capture grant. UNKNOWN whether System Settings can successfully Add this exact bare executable, and UNKNOWN which responsible host would receive permission for the current launch context.** No retrieved Apple web source proves either point. The existing helper itself remains consistent with its read-only design: it checks existing capture access and stops before window enumeration when access is missing.

The bounded audit found no supported reason to reinterpret a manual unlock or authentication response as a successful screen-capture grant. The permission result and root's current GUI observation must be recorded independently.

## Exact existing artifact

- Build directory: `/private/tmp/notes-window-capture-main-083a8d4`.
- Executable: `/private/tmp/notes-window-capture-main-083a8d4/window-capture`.
- Executable SHA-256: `a5a4b11e5c74630fadf84d5aba168e5dc419cafb1449c53eefb1cd7d194ea0a4`.
- Source hashes in `build-info.json` exactly match all three current source files checked during this audit: observer Swift, builder Python, and launcher Python.
- Build: Swift 6.3.3, installed macOS 26.5 SDK, target `arm64-apple-macosx14.2`.
- Builder produces a bare executable with `swiftc`; it contains no explicit codesign invocation, application bundle packaging, Info.plist construction, or permission mutation.

A read-only `codesign -d --verbose=4 -r-` of this existing executable reported:

```text
Identifier=window-capture
Format=Mach-O thin (arm64)
CodeDirectory flags=0x20002(adhoc,linker-signed)
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
CDHash=320f45fbc61bd0e9efdcfbb95f63d1e01b385c72
# designated => cdhash H"320f45fbc61bd0e9efdcfbb95f63d1e01b385c72"
```

This establishes the displayed identity of the current on-disk artifact. It does **not** establish TCC's permission subject, responsible application, successful System Settings acceptance, persistence across rebuilds, or any permission outcome for another executable at the same path. No rebuild or signature change was made.

## Launch and preflight chain

1. `scripts/run-window-capture.py` loads `build-info.json`, verifies the fixed executable SHA-256 and exact source path/hash map, and rejects mismatches.
2. The launcher directly calls Python `subprocess.Popen([fixed_binary, *arguments], env=environment)` without a shell. It passes a deadline and its own PID in environment variables.
3. The observer's `supervision()` compares the supplied supervisor PID with `getppid()` and checks a deadline no longer than 30 seconds. This is a numeric parent check; it does not inspect a TCC responsible-code attribution token, parent executable signature, or permission record.
4. `preflight()` calls `CGPreflightScreenCaptureAccess()`. On `false`, it throws `permission_required` immediately.
5. Only after that succeeds does it inspect public console/login fields, then call `SCShareableContent.excludingDesktopWindows`.
6. Source has no call to `CGRequestScreenCaptureAccess`, no System Settings operation, no AX authorization request, and no private permission-database access.

Thus the direct launch relationship is **Python launcher → observer**. The complete live ancestry above the launcher and TCC's responsible subject were not measured in this audit. A direct parent PID or an executable's display identifier does not, by itself, provide evidence identifying the TCC subject in this run. The tool's `--bundle` values select Notes/clone capture targets; they do not identify the capture permission subject.

Local source references:

- [Builder](/Users/water/work/2026/Apple-Notes-Clone/scripts/build-window-capture.py)
- [Launcher](/Users/water/work/2026/Apple-Notes-Clone/scripts/run-window-capture.py)
- [Observer supervision and preflight](/Users/water/work/2026/Apple-Notes-Clone/scripts/window-capture.swift:239)
- [Existing usage and limitations](/Users/water/work/2026/Apple-Notes-Clone/scripts/window-capture.md)

## Existing runtime evidence

Both existing records refer to this same build directory and list command, not a successful PNG:

- `03-capture-permission-check.json`: transcribed prior result, exit 2, observer `permission_required`, elapsed approximately 0.0167 seconds, no timeout, `acceptOutput=false`.
- `04-after-user-auth-confirmation-preflight.json`: recorded invocation, exit 2, observer `permission_required`, observer elapsed approximately 0.0184 seconds, `acceptOutput=false`. Context explicitly says CUA still observed an OS password authentication sheet.

The exact preflight failure supports only **existing capture access was unavailable to the observed invocation at that time**. It does not reveal which host should be granted access, whether a different entry is enabled, or why a Settings operation did not complete.

Root subsequently reported, through coordination during this audit, that Notes was readable while System Settings still showed a `LocalAuthenticationRemoteService` password form; its own fresh helper check still returned `permission_required` and no PNG. That is root-reported context, not a GUI or helper observation made by this auditor. The user's old batched unlock/authentication replies must not be treated as closing the current specific authentication sheet.

Evidence links:

- [Prior transcribed preflight](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/mac-candidate05-wide-toolbar-runtime-01/03-capture-permission-check.json)
- [Post-confirmation preflight](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/mac-candidate05-wide-toolbar-runtime-01/04-after-user-auth-confirmation-preflight.json)

## Apple primary-source coverage and limits

The installed Apple macOS 26.5 SDK is the only Apple primary source successfully read in this audit. In `CoreGraphics.framework/Headers/CGWindow.h`, lines 294–298, Apple's declaration comment describes `CGPreflightScreenCaptureAccess` as checking whether the current process already has screen capture access, followed by the separate request API declaration. This supports interpreting preflight as a check of existing access. It does not document System Settings Add behavior or responsible-host attribution.

[Installed Apple SDK declaration](/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGWindow.h:294)

Bounded official web research was attempted for Apple Support's screen/system audio recording controls, CoreGraphics preflight documentation, and Apple Developer Forums discussion of responsible code/TCC/command-line tools. The standard web tool returned no content on multiple calls. The available search-service connector then returned `HTTP request failed` before yielding sources. One direct read of Apple's CoreGraphics documentation JSON failed locally with `Operation not permitted`. No Apple webpage text was successfully retrieved; no claim in this report relies on an unseen page, search snippet, or third-party workaround.

**Therefore:**

| Question | Audit result |
| --- | --- |
| Does the exact helper request permission? | No, by inspected source; it only preflights. |
| Was the exact current artifact identified? | Yes, hashes match, and signature display is recorded above. |
| Did the stored runtime invocation have existing access? | No, both records returned `permission_required`. |
| Does ordinary System Settings Add accept this exact bare CLI and grant the needed invocation? | UNKNOWN; not proven by successful UI evidence or retrieved Apple documentation. |
| Is permission necessarily attached to this helper rather than Python/Codex/another responsible host? | UNKNOWN; this audit did not establish responsible attribution. |
| Does granting a similarly named entry guarantee capture for this launch chain? | UNKNOWN; no identity-linked successful outcome exists in the read evidence. |
| Does permission survive recompile, move, signing change, or host change? | UNKNOWN; not tested and outside this read-only scope. |

## Practical handoff

Root may continue the already authorized, ordinary System Settings interaction after the user personally completes the system authentication. A concrete record of whether the exact existing executable is selectable, the entry actually added/enabled, and a subsequent exact-launch preflight would establish additional facts. Do not label the current helper granted, or attribute permission to a specific host, before that evidence exists. A successful preflight and subsequent valid window-list/capture output would establish the outcome for that exact invocation; the permission-subject attribution still needs its own evidence.

This audit does not prescribe a wrapper, signing/rebuild, request API call, reset, database edit, or attempt to bypass authentication. Those actions were not performed. Available free space before writing this small report was 5,766,356,992 bytes, above the 2 GiB guard.
