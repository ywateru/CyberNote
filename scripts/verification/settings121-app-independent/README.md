# Independent actual-App settings verification

Prepared by the independent UI/backup reviewer. This directory owns only the
verification runner and synthetic native responses; it changes no product or
shared debug script. **Preparation is not a verification receipt.** Run only
after the integration owner supplies a committed freeze SHA.

```sh
node scripts/verification/settings121-app-independent/run.mjs \
  --root /Users/water/work/2026/.cybernote-worktrees/settings121-integration \
  --revision FULL_FROZEN_SHA \
  --out /tmp/cybernote-settings121-app-independent-RUN
```

The runner checks the exact revision and clean product tree before importing/starting the
App (only this reviewer's untracked verification directory is allowed). It checks the revision again after cleanup. It imports the existing
`openRuntime`/FakeBackend from that exact checkout, rendering the real main.tsx,
App, Preferences, SyncSettings, LocalBackupSettings, CloudSyncSettings and
SoftwareUpdateProvider. It does not import Pasteur's actual-app.mjs and does not
substitute a component host for App.

`native-fixture.mjs` only implements serialized synthetic native responses and
controlled failures/delays. Calling a fixture command establishes frontend
callback routing, not Store transactions, cloud HTTP, native permission, crypto,
filesystem backups or installation. No user data, live services, native user App
or installed package is opened. Existing debug temporary data is cleaned up.

The frozen-source run will complement the author's smoke script with:

- Actual settings entry and six categories; exact account conflict callback,
  query and resolve confirmation/cancel; legacy sync alias; rejecting pairing
  through the conflict-only handle; Back/dismiss ordering.
- Real backup and cloud UI handlers through native invoke: partial settings,
  preview/confirm, native confirm cancellation, delayed response after navigation,
  error cardinality, committed-result refresh failures without replay.
- One root updater observation chain while settings open/close; status response
  cannot overwrite a completed command; no auto install, Android download-only.
- Access prepare/revocation while a response is held, old response disposal,
  current-generation refresh; no hidden automatic content operations.
- Real settings menus/update layering and shallow/narrow light/dark layouts with
  screenshots. Native WebKit/Android device behavior and Rust host barriers are
  separate acceptance work.

The runner records each bounded scenario independently and continues after an
assertion failure. Nonzero exit means at least one scenario failed, no successful
receipt is inferred from completed cleanup. Scripts may need selector/fixture
adjustments after the final freeze; adjust verification only and document them.
Never loosen a behavior assertion merely to match a new failure.

`--only REGEX` and `--platform desktop|mobile` select supplemental scenarios after
new concerns arise. Each scenario reloads the real App to isolate failure state;
the updater lifecycle scenario deliberately opens/closes Preferences without
reloading so it can detect accumulated provider timers. `--mac 1` optionally
enables the existing debug native-toolbar fixture; no installed Mac app is used.

Completed dfc5c841 evidence and blocking findings are recorded in
`docs/plan/reviews/settings121-frontend-integration.md`. A first timing probe used
a paused browser clock that blocked App debug animation-frame settling; the
final runner uses bounded real 2.1s/6.1s windows. It never implements a second
frontend store or rewrites a product callback to obtain a pass.
