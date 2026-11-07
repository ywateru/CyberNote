# APP94 first frozen source failures

Product freeze `7f1dd4df`, exact product cherry `62af03cf`. Independent `source01`: 17 groups, 15 PASS / 2 FAIL, natural exit 1, 26.603 seconds, renderer errors empty. English and Chinese Enter split and save but do not add noteTag. All literal Tab, focus/save/UndoRedo and old behavior guards pass.

Independent `boundary01`: 5 groups, 1 PASS / 4 FAIL, natural exit 1, renderer errors empty. Actual drawing NodeSelection followed by keyboard Tab removes the atom and inserts a paragraph containing a tab. Actual Meta+A AllSelection followed by keyboard Tab replaces the whole document with one tab. An actual registered PM handler after NoteTag returns false after dispatching a selection no-op; the later Enter split fails to commit. A cancelable InputEvent insertParagraph splits and prevents default but fails to mark. Composing/noncancelable InputEvent does not mutate and passes.

The complete observations preserve before/after JSON and real selection types. The no-op handler is called exactly once with its original Plugin binding. This verifies the real PM pipeline; the plugin and InputEvent are test-only fixtures, and no production debug hook was added. These are retained original product failures, not reviewer fixture issues. Root and author received the blocking findings before the narrow fixes. Recheck retains the same expectations.
