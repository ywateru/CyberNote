# Frozen 95aa2c3f: two P2 findings closed

PASS for the two narrowly scoped findings from independent review `18d759f9`. Original counterexamples and failed actual selector experiments remain unchanged in the earlier evidence directory.

The reviewer files exactly match frozen author `95aa2c3f`; `source.json` records hashes and author/local mappings. Intervening attachment selector changes were carried only to preserve exact source alignment. They receive no acceptance or expanded review in this report.

| Host process | Natural exit | Wall seconds | Checks |
| --- | --- | --- | --- |
| Independent original witnesses and positive integration paths | 0 | 0.025250833 | 4 |
| Author focused view/redaction checks | 0 | 0.021628750 | 14 |

The independent host check extracts and executes the exact final `home` and `nativeStep` bodies with synthetic dependencies, together with the real final assertion/redaction helpers. It never executes the native runner entry point.

- Original hidden gallery witness: a gallery with 0×0 bounds is now rejected before a screenshot can be recorded. The positive mobile `page-notes` fixture has visible gallery and add-control bounds, two grid columns and a hidden editor; it passes. In both exact runner paths, `goHome` executes before observation. The successful snapshot uses the explicit new name `home-visible-final`.
- Original arbitrary guard-message witness: `SYNTHETIC_PRIVATE_SENTINEL` is absent from both final logs. The secondary record contains only the step label and fixed `GUARD_FAILURE_REDACTED` event. The exact known empty-stderr137 case retains only `GUARD_BOUNDED_EXIT_137`. Both failing operations still throw the original error and record the failed step.
- The 14 focused author checks additionally cover wrong page, zero/hidden/offscreen gallery, visible editor, undersized add control, wrong grid-column count, malformed guard output, altered error identity and successful guard output pretending to be a failure.

No ADB, device operations, emulator operations, builds, main writes, invitations or raw Store/DOM were used. No original 22-case suite or full suite was rerun. This is a host-only closure of two test-tool findings. Actual attachment multiple selection, continuous attachment addition, image export and subsequent sync acceptance remain open and must be assessed using their own actual evidence.
