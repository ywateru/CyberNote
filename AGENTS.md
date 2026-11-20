# CyberNote Agent Instructions

Read `agent.md` before working in this repository. It is the canonical guide for
repository, release, validation, account, and synchronization constraints.

## Engineering Practices

1. **Read the owning contract and trace the actual runtime path.** Before a
   subsystem change, read the relevant `docs/architecture/`, `docs/ui/`, and
   module README, then verify the source from the user action through its
   callers, state transitions, persistence, and visible result. Update the
   owning document when responsibilities, interfaces, compatibility, or failure
   behavior change; keep each fact in one place and link to it. Clearly separate
   implemented behavior from proposals.

2. **Share business rules across entry points.** Desktop/mobile presentation,
   native commands, and MCP must use the existing application services and
   authorization boundaries. Keep platform adapters thin and preserve one owner
   for each store, session, save queue, and operation. Check parity at the shared
   contract boundary when exposing an existing operation through a new entry
   point.

3. **Preserve user choices and edit only what the operation owns.** A missing
   setting in a partial update means “keep the current value”; explicit `false`,
   zero, or an empty value must follow that field's contract. Defaults and
   migrations must respect explicit choices and address existing installations.
   When editing external configuration, preserve unrelated keys, comments, and
   formatting, detect intervening edits, and restore only values still owned by
   our integration.

4. **Treat unreadable state as unknown.** Distinguish a missing file from a
   permission error, invalid data, or a failed hash. Never turn those failures
   into an empty account list, an unrestricted grant, a deleted note, or a claim
   that two files match. Recover from a validated last-good copy only where the
   format permits, retain evidence of corruption before replacement, and deny
   protected operations when authorization cannot be established.

5. **Make persistence failures recoverable.** For ordinary application-owned
   files, prefer a temporary file in the same directory, flush, and atomic
   replacement; preserve required permissions and skip unchanged writes.
   Define rollback or recovery for operations spanning multiple files. Validate
   path ownership and link behavior for the specific boundary; retain the
   existing private IPC path restrictions. Notes and attachment metadata must
   continue through CyberNote's Store transactions and attachment lifecycle.

6. **Fix the whole affected family and its derived state.** Search for sibling
   commands, platform branches, callers, cached projections, and messages that
   rely on the changed rule. Revisit dependent limits, sort orders, layout
   breakpoints, and timing assumptions. Fix related instances within scope;
   explicitly record remaining gaps and unrelated failures.

7. **Review asynchronous work as an ownership and lifetime problem.** Do not
   hold a lock across network/process I/O or a wait for a window acknowledgement
   when completion needs that lock. Publish state before handing work off,
   reject stale generations after navigation, revocation, or disposal, and
   cancel or join timers, listeners, and background tasks when their owner ends.
   Use controlled delays to exercise races.

8. **Verify behavior with isolated, realistic inputs.** For a behavior fix, add
   a regression that demonstrates the old failure and the corrected result at
   the earliest stable boundary. Use real-shaped serialized documents, files,
   and error responses; cover the relevant empty, invalid, boundary, and stale
   cases. Automated tests use temporary app data, controlled clocks, and local
   service fixtures, with child processes cleaned up. Keep credentials, live
   note libraries, and system account stores outside test access. Select checks
   using `agent.md` and the affected CyberNote subsystem.

9. **Keep UI changes consistent with the target platform.** Reuse the product's
   components, theme tokens, and localized strings; check keyboard/focus,
   narrow layouts, empty/error states, and both appearances. Shared CSS,
   selectors, or breakpoint changes require checking their consumers. Browser
   checks must account for macOS WebKit and Android WebView differences;
   native IME, clipboard, and window behavior still need platform evidence.
   For settings, follow `docs/ui/preferences.md` for controls, theme, and save
   behavior.

10. **Report completed evidence at an exact revision.** Describe the trigger
    and observable before/after behavior, name the source/build tested, and
    report finished checks, failures, and checks not run. A unit test, browser
    fixture, cross-build, installed package, and real-device acceptance establish
    different facts. Keep those distinctions in verification receipts and turn
    recurring failures into a short actionable rule or a check near the work
    that repeatedly misses it. CyberNote's release and synchronization acceptance
    rules remain in `agent.md`.

11. **Use shared controls in settings.** Use segmented choices for short, fixed
    options and a dropdown for long labels or variable lists. Follow the
    [settings control rules](docs/ui/preferences.md#控件选择规则) for layout,
    keyboard interaction, and confirmation.
