# Android mobile106 — independent review

2026-11-10. **Rejected: F1, CSS specificity regression.** Candidate`95b287cb1154ceffaa36574e1bb5c89b2f87b709`, base`7fd7b282`, isolated `/private/tmp/cybernote-android-mobile106`. Reviewer separate from author. Root product unchanged; no native build/device action. Original102 long-press failure remains open; this is not native rotation/IME acceptance.

## F1 — previously removed SVG circles return

`src/style.css:2219` adds `.mobile` before the shared narrow-window more-icon selector; line2226 does the same to undo/redo. Candidate `.mobile .mobile-header-actions .icon-button[aria-label="更多"] svg` has specificity(0,4,1). It overrides the later unified phone-icon reset at line3595, `.mobile .mobile-header-actions .icon-button svg`, specificity(0,3,1), setting border0/radius0/padding0. Before106, both had(0,3,1), so the later reset won.

Actual App at360×700, interfaceFontSize=tiny, iconScale120/mobileHitScale120 compared candidate CSS with exact `git show 7fd7b282:src/style.css` on the same mounted App. More SVG changes from padding0px/radius0px to padding1px/radius50%. Source also restores the earlier1.5px circular border. This is a visual regression unrelated to the necessary identity/geometry fix. Undo/redo have the same specificity problem when rendered; not separately exercised.

Small evidence: `artifacts/android-mobile106-independent/font-tiny.json` retains both computed maps; `review-summary.json` contains exact differences. Source anchors above are candidate lines. Preserve original selector precedence while adding the mobile identity boundary, without changing design variables or new restyling. Zero-specificity scope for newly scoped rules is one possible approach. Reviewer did not modify product CSS.

## Checks and limits

- Read exact nine-path commit diff, initial/navigation/hydration/resize flow, four expanded mobile media groups and36 newly scoped shared selectors. All parsed selectors in four expanded groups remain mobile-bound. Original shared narrow styles remain under max699; desktop/separate are not globally unwrapped.
- App changes only import/create a stable resolver and use it for initialMobile/resize. Navigation/hydration derive from that initialMobile. Controller, access, owner, selection and setEditable implementations unchanged. Native detection uses existing native+UA, not keyboard bridge timing.
-61 layout cases and8 production-controller/real-PM boundaries passed with an independent output directory. Test replica only changes output path, preserving author evidence.
- Independent actual App passed1024 cold mobile-list initialization, same real EditorView/DOM/nonempty PM selection/generation and true bottom-docked full-width format geometry across1024×600→700×420→699×420→1024×340. Underline after exact699/700 crossings affects only selected `boundary`.
- Tiny comparison found F1; every other captured narrow-window typography/control property matched old CSS in that observation. Huge and remaining planned assertions were not reached. Interrupted probe is not a complete pass. Existing design-controls important min-hit/icon source declarations are unchanged; F1 shows why precedence needs runtime verification.
- All26 author frozen evidence files match length/SHA. Candidate is nine paths. Approved guest-js/public test symlinks remain setup-only, outside candidate commit.

Probe files: `artifacts/android-mobile106-independent/{app-probe.mjs,unit-probe.mjs}`. From isolated tree run `node artifacts/android-mobile106-independent/app-probe.mjs`; use a new output directory after fix to preserve failure bytes. Imports existing real App debug runtime and Vite-owned PostCSS; no install. Initial harness attempts failed before browser launch on a direct PostCSS import, then caught a transient exact-x check during existing page-in animation (x0.1748px). Final probe awaits editor's own animation completion. Stable computed F1 is separate from that harness issue. Each runtime cleaned owned resources in finally.

Review frozen; tree released for this narrow CSS correction. Immediate re-review should retain accepted source/session/geometry evidence and rerun the distinguishing CSS case plus necessary affected layout checks; no full48-case replay or native/device work. Final real rotation/IME and original102 remain open.
