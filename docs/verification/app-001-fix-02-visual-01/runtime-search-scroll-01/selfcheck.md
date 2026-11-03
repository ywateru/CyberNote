# Native search scrolling and shortcut: bounded developer pass

Date: 2026-11-03. The default `pnpm mac:build` completed with exit 0, features `[]`, from source `5a5669f10756f7db0758e942ea72a1e1f3206546`. The 99-file input aggregate is `9d27cd8592fe291e2513961137bca643f71fd9ef5b419056404015bdbb182e7f`. All input bytes remained unchanged through build and actual runtime observations. Relative to the preceding 6c155 package, product inputs change only the public `setScrollable:YES` initialization and the Rust menu accelerator correction `444f03b`. The exact native source is retained in `toolbar-source.m`.

The complete package is preserved at `/private/tmp/notes-search-scroll-56d7e05.app`; executable SHA-256 `56d7e059437690fa000a1e69a01fee24f1595eed69e9acf287c694098a2eff9a`, 15,534,976 bytes, verified after copying. The preserved executable was directly launched to capture only its own output. `launch.windows.json` records actual clone PID 4880 and its native windows. GUI actions and AX/PNG observations used CUA exclusively.

The limited actual core checks passed:

- From the gallery HTML focus, old Command-Shift-F left the focus on HTML and did not focus global search (`old-shift-command-f`). This does not claim the app now implements original Notes' Find and Replace behavior.
- Option-Command-F moved actual focus to the native search field. After observing that focus separately, MacABC produced one matching synthetic note; continuing with ` Beta` preserved the full MacABC Beta query and one result (`option-command-f-focused`, `short-continuation`).
- The same complete long query used by the preceding failed package now scrolls to its final `ABCDEFGHIJKLMNOPQRSTUVWXYZ-END` content (`long-query-end`). Command-Left visibly returns to `LONG-QUERY-0123456789…` (`long-query-start`). Command-Right and appending `-TAIL` visibly scrolls to `…END-TAIL` with the real caret at the right (`long-query-tail`). AX preserves the entire query value throughout. The native magnifier and clear button remain separate from the scrolling text.
- Clicking the native clear button empties the query and restores the two-note synthetic folder (`long-query-cleared`).

This is a developer check in the main gallery context. It does not re-run or replace the previous candidate's click-entry, selection or Undo body-ownership observations, and does not establish all-window or marked-IME parity. Independent verification must explicitly use this preserved package rather than whichever package later occupies the release target.

The actual focus ring/caret is still system blue, so original Notes' golden accent parity remains **FAIL**. No color changes or further probes were included. Full-page/raw matched-geometry pixel parity, menus, mobile behavior, and marked IME were not tested here. The failed ec1 Fill ROI and prior 6c155 long-query failure remain separately preserved; no numerical score or whole-UI acceptance is inferred from this limited pass.

The app was closed with a real Command-Q. Its owned launch session reported exit 0; stderr is 0 bytes. `after-quit.windows.json` confirms no clone remains. Mac GUI ownership was explicitly handed to the independent verifier for the same preserved package. No note content was edited during this search check.
