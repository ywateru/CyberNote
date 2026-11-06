# Native completion tools independent review: blocked scenario assertion

2026-11-06. Frozen product source `803c680d69348db908627050bc8daa85e17a9b1f` (body `59e1e356`), author evidence `06d7f473`. Review ran in the clean author worktree `/private/tmp/apple-notes-sync87-native` without changing any product file. All 13 native tool files match the frozen product commit; the three shared DOM dependency files independently match `3352b913149b827a61d66e961e9ae9ac8d5522a9`, with before/after source maps unchanged.

The scope is host tools and one root-authorized candidate desktop DOM smoke. No emulator, ADB, installation, native CDP, original Android data, microphone, Apple Notes, VPN, tunnel or public route was accessed.

## P2 blocking: mobile-to-desktop text is not asserted

Task `docs/plan/tasks/app-sync87-native.md` and parent `app-sync87-e2e.md` require bidirectional actual text convergence. In `scripts/debug/sync87-native/scenarios.mjs:17`, the mobile-to-desktop gate only checks the note ID plus PNG/WAV attachment names. Lines18–19 verify media bytes but never inspect the note's document/plainText. It proceeds to the desktop-created half at line20 even if the mobile body's text is empty.

The independent `text-boundary-probe.mjs` invokes the actual exported `roundtrip` function with explicit host stubs: the desktop workspace has the expected mobile ID and attachment names, but an empty document and empty plainText. The stub media verifier is explicitly synthetic. The actual function proceeds to `peer.create`; that stub throws `REVIEW_STOP_BEFORE_ANY_NATIVE_ACTION` to stop before all native operations. Its natural exit0 means the review reproduced the assertion gap; it does not mean roundtrip passed. Raw output records `acceptedMobileTextBoundary:true`, with the empty received body and expected marker. This is an acceptance-tool false-pass boundary, not evidence of a product/network/native failure.

Required repair belongs to the author: compare the expected actual mobile document/plainText at the desktop receiving Store, including the marker and Chinese body, while respecting attachment changes. The desktop-to-mobile half at lines23–26 similarly only gates on entity/media IDs and later checks a marker substring; its final acceptance should compare the complete expected text/document rather than just a prefix. Preserve the counterexample and add negative receiver-body tests. Native device execution is still pending, so this gap must be closed before those scenario results can establish text convergence.

No further blocking finding was identified in the assigned export, receipt, real DOM event-pump or restart/cold-boot host preparation boundaries.

## Independently passing scopes

The existing host82 checks independently exit0: Python18, CDP/XML10, input21 and scenario33. Each exact argv, natural exit and measured subprocess wall time is retained in `host-commands.json` with raw stdout/stderr.

The independently written Python guard probe adds nine host-only checks, natural exit0 in0.175024125s. It covers correct original-byte publication and0600 mode, foreign remote rejection before device entry, symlink export directory/parent rejection, manifest duplicate/unknown-field/byte-count rejection, and two late-publication races. O_CREAT|O_EXCL|O_NOFOLLOW prevents replacing either a late existing file or a late symlink target. The guard's ADB function is mocked and subprocess.run is patched to throw if called; there is no device execution.

Source review confirmed the export flow selects only known run/index/original names, prepares an exact new owned export directory, checks device size and original SHA256 before exclusive publication, and does not expose arbitrary pull paths. Android DocumentsUI navigation remains unexecuted. Receipt checks hash complete binaries/actual APK ZIP entries; root retains responsibility for build provenance, signing and embedded frontend/native source review. A matching `.so` hash from a root receipt is not claimed here as independent ELF provenance.

The DesktopPeer imports the shared reviewed runtime, mounts a real App before registering the participant, continuously pumps real Rust events through one sink, and does not generate renderer probe/prepare replies or a headless apply. Runtime/transport/DOM reference dependencies match their exact source commit. Reopen requires a fresh app lifetime; cold-boot comparison requires new guest/emulator identity and unchanged owned userdata identity. These native paths have only host source/negative checks here.

## Single actual desktop DOM smoke

Root authorized only the candidate build10 receipt `/private/tmp/sync87-peer-review-build10/receipt.json`, binary SHA256 `2f21f7ff9f6abad3b341585a16e973714c81af7c93eef0f4e2a435bd2eb53515`, Rust source receipt `17af6dfc148e5d84de924ac47b69611e627e5722`. The known resolve blocker does not enter this smoke; no resolve is called.

The independent run naturally exits0 with10 checks in **10.016911542 seconds outer subprocess wall time**. One real Rust process PID19018 and temporary Store back an actual React/Tiptap App. Actual semantic handlers start host, generate an in-memory invitation, close secret UI, create/update text through editor/save handlers, attach a synthetic PNG through FileChooser/FileReader handlers, and verify real read/export/separate managed-file SHA256 plus image decode. OS/media boundaries are synthetic. This is not a physical keyboard, native Mac application, Android or second-peer sync test.

The Rust process naturally exits0/signalnull, five real events pass through the sink, page errors0, and browser/context terminal close events are recorded. The internal peer wall9.78044875s is separately preserved rather than substituted for outer wall time. Both peer and outer frontend149-file fingerprints before/after equal `21dd34ed32508d508b659ee53c6fa081df566f2b8cea38f58d2b52ff9e571c02`; source is clean. Exact root receipt and binary hashes are independently unchanged before/after.

## Conclusion and remaining scope

**BLOCKED-HOST-SCENARIO-ASSERTION** for this tool delivery, due solely to the bidirectional text assertion gap above. Host82, independent guard9 and candidate single-DOM10 passes remain accurately separate and do not repair that gap.

No native exact export, provider operation, mobile pairing/roundtrip, foreground restore, process reopen or cold boot was executed. The new code's SHA comparison is prepared capability, not a native-byte acceptance result. All original Android approximately13-second recording restrictions remain intact. Original P2 input-redaction failures and accepted repair396a7fa4 remain preserved.
