# Mobile recording save57 independent review

Verdict: **SOURCE-READY**. No reproducible blocking source defect was found within task57.

Exact reviewed source: `c25cf7fb0a085a3b01108d23cc4e0286f847f56e`; base `9167db94908ac635b026220e782878447c9e16a7`. Changes: App24 added lines, a47-line layout-commit hook, two focused scripts and two contract supplements. The root task contract was preserved as an evidence-local snapshot because that root planning file is not in this source commit. This evidence commit changes no product source; all changed-input and dependent production fingerprints remain unchanged.

## Source review

The old trusted-read Promise can settle after a real blocked Host/Gate layout made the original editor noneditable and before React commits restoration. The baseline run mounts the actual App and proves the unchanged target is refused in exactly that temporary state: trusted synchronization and original identity, scope, owner, versions and both document comparisons are true, while isEditable/available are false.

The new wait is admitted only for mobile, same-ticket non-desktop recording after a successful still-current synchronization. useEditorCommit requests a parent render and resolves in its layout effect, after the actual mounted child Host layout effect activates the same gate. It does not poll isEditable, change gate policy, update the captured target or assume a successful commit implies availability. After waiting, the production App reacquires pickerRuntime/editor/note/stamp/documents and runs the unchanged rebindAttachmentTarget including synchronization.current(synced), owner/scope/editor/note, versions, original backend epochs, raw editor document and captured trusted document equality. A newer invalidation still refuses the old result. Generic picker/OCR and desktop remote validation do not enter this new wait.

Each wait owns a temporary AbortController in the existing recording ticket. Seal/finish abort currently outstanding waits; hook cleanup rejects pending waiters. The controller is removed in finally, so a lawful sealed cancellation can create its own later wait after the running submission settles. Actual cancellation after store exercises this path and avoids a cancellation/submission wait cycle. The production AttachmentSubmission algorithm is unchanged, so store-before/store-after, lost response query recovery and document ACK remain distinct protected boundaries.

## Finite verification

- `components-first/`: the original17-group actual mounted React App/NoteEditor/SearchEditorHost/SearchEditorGate/RecordingPanel and production bridge/access/submission/SaveQueue suite PASS on first independent run, filter=null, errors=[]. Native IPC and recording hardware are controlled. It includes exact baseline failure vs fixed success; held ACK keeps the actual sheet/ticket open; both store boundaries; nine strict mutations; stored-response loss/query recovery; same File/operation retry; ACK failure; cancellation while stored; seal and unmount during wait.
- `readonly-first/`: only one independently added meaningful gap, genuine readonly. During wait admission the real Gate's desired editable state is set false via its normal restore method. The next actual Host commit settles the waiter but remains noneditable; the unchanged original target check rejects with zero store/save, and File/ticket/sheet are retained. This PASS on first run establishes that layout completion neither forges write access nor waits forever for editability. Evidence-local script retains the author cases but runs only this independent case through its explicit filter.
- `build-first.log`: `pnpm build` PASS on first run; existing Vite large-chunk warning retained.
- `author-desktop-reviewed/`: reviewed the author's exact-source single desktop A/B regression result, execution record and matching App/dependency fingerprints. A retains latest edits/Undo/Redo, B keeps edits and selection, one store/insert to A, same File on retransmission, ticket released after child closes. This is author evidence, not an independent mounted desktop run; no old matrix was repeated.

No independent attempt failed. Browser suites were serial. The author separately retained nine pre-freeze fixture attempts; this review uses their final fixed17-case script without changing its assertions.

## Limits

This is source readiness, not Android runtime acceptance. No simulator/device, native GUI, microphone/TCC, database, private local audio, native/Rust/package build or pixel/playability check was performed. Test bytes are synthetic and do not establish valid encoded audio or audible output. The original emulator5580 retained File was not touched. The Android10 failure can be explained by the proven old-source race, but absence of device-field tracing means it is not claimed as the only device cause. Root still must package the exact integrated source and verify recording completion, one saved card, retained body, cold restart and actual saved playback in a separate authorized device environment.
