# SYNC87 native full-text assertion repair: independent narrow re-review

Date: 2026-11-06. Frozen repair source `cb202998a12231b6526b94c2e9348856d6c4e577`; candidate evidence baseline `fa44dbf0f52f25bcff34fae5f9c1725bde54351b`. Verdict: **PASS-HOST-TEXT-ASSERTION-REPAIR**. The acceptance-tool P2 in `d122daf3` is resolved in the affected roundtrip boundary. Original blocked report and original actual-function empty-body counterexample remain unmodified.

## Findings and source assessment

No remaining blocking finding in the narrow repair scope. `captureExpectedNote` first checks the sending Store's complete intended text and a present complete document, then deep-clones both. `roundtrip` captures the actual sender after attachments commit in each direction. `waitForNoteReplica` requires exact plainText and deep document equality, including structure/attachment attributes, before subsequent media/native acceptance stages. The mobile editor check uses the complete expected desktop text. Result body hashes represent the received snapshots that satisfied both fields, not just note IDs or prefixes.

The receiver wait permits an incomplete transient snapshot to settle rather than treating a marker prefix as success. Absent sending notes/documents and incomplete intended sender text fail explicitly. Existing media-byte checks and desktop attachment identity checks remain. This closes the previously reproduced missing-text gate without altering product or shared runtime source.

## Independent host verification

A separately written probe invokes the actual exported roundtrip function with explicitly synthetic workspace/media stubs. Its **28 checks naturally exit0**, complete subprocess wall **4.276665917 seconds**. No Rust process, browser, network or native operation runs.

Twenty checks exercise ten receiver faults in each direction: missing entity, missing plainText, missing document, wrong full body, truncated plainText only, truncated document only, changed node structure, missing attachment node, wrong attachment attribute and an extra document-body field. Each faults the real roundtrip function, reads the receiving workspace, and rejects before the next acceptance stage. A mobile→desktop failure cannot create the desktop note or verify mobile media; a desktop→mobile failure cannot read native original bytes. This directly replaces the original empty-body counterexample with rejection at the intended gate.

The exact positive passes both complete-body gates and stops at a deliberate sentinel before the synthetic native-byte read. Additional checks cover complete-body comparison, independent cloned attachment attributes, absent/incomplete sender snapshots, and a transient marker-only receiver followed by the exact body. The latter must read twice. The positive does not establish any actual file/hash, network, native or provider behavior.

The author's new **43 checks** independently rerun with natural exit0 and outer wall **3.871932209 seconds**. Existing **33 scenario boundary checks** independently rerun with natural exit0 and wall **0.180568084 seconds**. Both affected JS syntax checks and diff-check also exit0. Exact argv, stdout/stderr and measured natural process wall times are preserved under `docs/verification/sync87-native/text-convergence-independent/`.

## Integrity and limits

All14 native-tool files match the frozen repair source byte for byte, with independently captured before/after hash maps equal. The311 product/native/config/plugin files named by the author's baseline map were independently read and compared to `d122daf3`; all match. This comparison is independently summarized in product-baseline.json rather than merely accepting the author's booleans.

The three shared DOM files still match3352b913 by reference comparison after these checks. This review does not audit or accept the separate pending runtime/browser-log pipe repair, and it does not replace root's eventual final-backend11 single-Peer smoke. No DOM or device rerun was performed because this change only affects the host scenario text gate.

No APK receipt, Rust backend, socket, browser/DOM, Android/ADB, native CDP, export chooser, foreground restore, reopen or cold boot was used. Exact native media export, mobile pairing/roundtrip and original provider results remain unexecuted. The original approximately13-second Android recording and user data remain untouched. This verdict releases only the host text-assertion repair; it does not complete app-sync87-native or establish native/full-sync acceptance.
