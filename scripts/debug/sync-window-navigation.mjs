#!/usr/bin/env node
// Real React/Tiptap/Chromium navigation and focus regressions. Local sync/IPC
// receipts and metadata are explicit fixtures, with no Rust or device proof.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, state, idle } from "./runtime.mjs";
import { sourceFingerprint } from "./source-identity.mjs";

const output = resolve(process.argv[2] || "/private/tmp/sync86-navigation");
const before = await sourceFingerprint(process.cwd()),
  started = performance.now();
const checks = [],
  observations = [],
  replies = [],
  htmls = [];
let runtime,
  failure,
  releaseCancel,
  hold = false;
const check = (name, condition) => {
  assert(condition, name);
  checks.push(name);
};
const until = async (predicate, name) => {
  const deadline = performance.now() + 3500;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw Error("Timed out: " + name);
    await new Promise((done) => setTimeout(done, 10));
  }
};
const start = async (options = {}) => {
  runtime = await openRuntime(options);
  const { backend } = runtime,
    original = backend.call.bind(backend);
  backend.call = async (command, args) => {
    if (command !== "sync_window_reply") return original(command, args);
    assert.equal(args.expected.sessionId, backend.sessionId);
    assert.equal(args.expected.epoch, backend.accessEpoch);
    replies.push(structuredClone(args.reply));
    if (args.reply.ready === false && hold)
      await new Promise((done) => {
        releaseCancel = done;
      });
    return {
      ok: true,
      value: {
        operationId: args.reply.operationId,
        outcome: args.reply.ready === false ? "abort" : "pending",
      },
      events: [],
    };
  };
};
const emit = (event) =>
  runtime.page.evaluate(
    (event) => window.__DEBUG_PLATFORM__.emit("notes-sync", event),
    event,
  );
const prepare = async (noteId = "note-a") => {
  const operationId = randomUUID();
  await emit({
    phase: "prepare",
    sessionId: runtime.backend.sessionId,
    operationId,
    noteIds: [noteId],
  });
  await until(
    () =>
      replies.some(
        (reply) => reply.operationId === operationId && reply.ready === true,
      ),
    "prepare ready",
  );
  return operationId;
};
const end = async (operationId) => {
  hold = false;
  releaseCancel?.();
  releaseCancel = undefined;
  await emit({
    phase: "release",
    sessionId: runtime.backend.sessionId,
    operationId,
    outcome: "abort",
  });
  await until(
    async () => !(await state(runtime.page)).quietWindow.frozen,
    "operation terminal",
  );
  await idle(runtime.page);
};
const observe = async (name) => {
  const value = await state(runtime.page);
  observations.push({
    name,
    selection: value.selection,
    frozen: value.quietWindow.frozen,
    editors: value.quietWindow.editors,
    replyPending: !!releaseCancel,
  });
  return value;
};
const editor = () =>
  runtime.page.locator('[data-mobile-editor-note="note-a"] .tiptap');
const captureFocus = () =>
  runtime.page.evaluate(() => {
    const dom = document.querySelector(
      '[data-mobile-editor-note="note-a"] .tiptap',
    );
    const editor = dom.editor;
    editor.commands.setTextSelection({ from: 2, to: 6 });
    editor.view.focus();
    window.repairFocus = {
      dom,
      editor,
      selection: editor.state.selection.toJSON(),
      document: editor.getJSON(),
    };
  });
const focusState = () =>
  runtime.page.evaluate(() => {
    const { dom, editor, selection, document: original } = window.repairFocus;
    return {
      sameDOM:
        dom ===
          document.querySelector(
            '[data-mobile-editor-note="note-a"] .tiptap',
          ) && dom.isConnected,
      focused: document.activeElement === dom && editor.view.hasFocus(),
      sameSelection:
        JSON.stringify(selection) ===
        JSON.stringify(editor.state.selection.toJSON()),
      sameDocument:
        JSON.stringify(original) === JSON.stringify(editor.getJSON()),
      editable: editor.isEditable,
      pageFocused: document.hasFocus(),
      activeTag: document.activeElement.tagName,
    };
  });
try {
  await mkdir(output, { recursive: true });
  await start();
  const { page, backend } = runtime;
  const search = page.getByRole("textbox", { name: "搜索备忘录" });
  await search.focus();
  await idle(page);
  let operationId = await prepare();
  hold = true;
  await search.fill("Fixture");
  await until(() => !!releaseCancel, "typing requests cancellation");
  await search.press("End");
  await search.pressSequentially(" B");
  let value = await observe("HTML typing held before terminal");
  check(
    "HTML typing keeps the old applied query and editor owner until terminal receipt",
    value.selection.noteId === "note-a" &&
      value.selection.query === "" &&
      value.quietWindow.frozen &&
      !!releaseCancel,
  );
  check(
    "Multiple real HTML input events keep the latest draft visible during cancellation",
    (await search.inputValue()) === "Fixture B",
  );
  htmls.push([
    "search-typing-held.html",
    await page.locator(".app").evaluate((node) => node.outerHTML),
  ]);
  await end(operationId);
  value = await observe("HTML typing after terminal");
  check(
    "The final typed query applies after terminal and selects the matching owner",
    value.selection.noteId === "note-b" &&
      value.selection.query === "Fixture B" &&
      (await search.inputValue()) === "Fixture B",
  );

  operationId = await prepare("note-b");
  hold = true;
  await page.keyboard.press("Escape");
  await until(() => !!releaseCancel, "Escape requests cancellation");
  value = await observe("Escape held before terminal");
  check(
    "Real Escape retains the old owner and applied search until terminal",
    value.selection.noteId === "note-b" &&
      value.selection.query === "Fixture B" &&
      value.selection.searching &&
      value.quietWindow.frozen,
  );
  htmls.push([
    "search-escape-held.html",
    await page.locator(".app").evaluate((node) => node.outerHTML),
  ]);
  await end(operationId);
  value = await observe("Escape after terminal");
  check(
    "Escape exits search and returns to the original owner after terminal",
    value.selection.noteId === "note-a" &&
      value.selection.query === "" &&
      !value.selection.searching,
  );

  operationId = await prepare();
  hold = true;
  const searching = api(page, "search.set", { query: "Fixture B" });
  await until(
    () => !!releaseCancel,
    "programmatic search requests cancellation",
  );
  value = await observe("Debug search held before terminal");
  check(
    "Programmatic global search defers its projection and retains the request",
    value.selection.noteId === "note-a" &&
      value.selection.query === "" &&
      value.quietWindow.frozen,
  );
  await end(operationId);
  await searching;
  check(
    "Programmatic search applies its original query after terminal",
    (await state(page)).selection.noteId === "note-b",
  );

  operationId = await prepare("note-b");
  hold = true;
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await until(() => !!releaseCancel, "clear requests cancellation");
  value = await observe("Clear search held before terminal");
  check(
    "Clear search click continues to wait for terminal",
    value.selection.noteId === "note-b" &&
      value.selection.query === "Fixture B" &&
      value.quietWindow.frozen,
  );
  await end(operationId);
  check(
    "Clear search click replays after terminal",
    (await state(page)).selection.query === "",
  );

  operationId = await prepare();
  hold = true;
  const selectingTag = api(page, "tag.select", { name: null });
  await until(() => !!releaseCancel, "tag filter requests cancellation");
  value = await observe("Programmatic tag filter held before terminal");
  check(
    "Programmatic tag filter preserves the old owner until terminal",
    value.selection.noteId === "note-a" &&
      value.selection.tagFilter === undefined &&
      value.quietWindow.frozen,
  );
  await end(operationId);
  await selectingTag;
  check(
    "Programmatic tag filter replays after terminal",
    (await state(page)).selection.tagFilter === null,
  );
  await api(page, "folder.select", { id: "default" });
  await idle(page);

  operationId = await prepare();
  hold = true;
  const settingView = api(page, "settings.update", {
    settings: { view: "gallery" },
  });
  await until(() => !!releaseCancel, "view change requests cancellation");
  value = await observe("Programmatic view filter held before terminal");
  check(
    "Programmatic view changes defer owner and layout until terminal",
    value.workspace.settings.view !== "gallery" &&
      value.selection.noteId === "note-a" &&
      value.quietWindow.frozen,
  );
  await end(operationId);
  await settingView;
  check(
    "Programmatic view change replays after terminal",
    (await state(page)).workspace.settings.view === "gallery",
  );
  await api(page, "settings.update", { settings: { view: "list" } });
  await idle(page);

  operationId = await prepare();
  hold = true;
  await page.getByRole("button", { name: /全部备忘录/ }).click();
  await until(() => !!releaseCancel, "folder click requests cancellation");
  value = await observe("Folder click held before terminal");
  check(
    "Folder click continues to wait for terminal",
    value.selection.folderId === "default" && value.quietWindow.frozen,
  );
  await end(operationId);
  check(
    "Folder click replays after terminal",
    (await state(page)).selection.folderId === "all",
  );
  await api(page, "folder.select", { id: "default" });
  await idle(page);

  // Focus itself can change the mobile projection and must also wait.
  await page.keyboard.press("Escape");
  await editor().focus();
  operationId = await prepare();
  hold = true;
  await search.focus();
  await until(() => !!releaseCancel, "search focus requests cancellation");
  value = await observe("Search focus held before terminal");
  check(
    "Search focus defers searching state while retaining the new input focus",
    !value.selection.searching &&
      value.quietWindow.frozen &&
      (await search.evaluate((node) => node === document.activeElement)),
  );
  await end(operationId);
  check(
    "Search focus state replays after terminal without restoring the old editor focus",
    (await state(page)).selection.searching &&
      (await search.evaluate((node) => node === document.activeElement)),
  );
  await page.keyboard.press("Escape");
  await idle(page);

  operationId = await prepare();
  hold = true;
  await page.keyboard.press("Control+Shift+f");
  await until(() => !!releaseCancel, "search shortcut requests cancellation");
  value = await observe("Search shortcut held before terminal");
  check(
    "Global search keyboard shortcut defers projection until terminal",
    !value.selection.searching && value.quietWindow.frozen,
  );
  await end(operationId);
  await until(
    () => search.evaluate((node) => node === document.activeElement),
    "shortcut focuses search after terminal",
  );
  check(
    "Global search keyboard shortcut replays after terminal",
    (await state(page)).selection.searching,
  );
  await page.keyboard.press("Escape");
  await idle(page);

  await api(page, "editor.insertText", { text: " focus-history" });
  await idle(page);
  await captureFocus();
  const originalVersion = (await state(page)).quietWindow.editors.find(
    (row) => row.id === "note-a",
  ).externalVersion;
  operationId = await prepare();
  let focus = await focusState();
  observations.push({ name: "focused editor prepared", focus });
  check(
    "Prepare preserves DOM and selection while the actual focused editor is parked",
    focus.sameDOM &&
      focus.sameSelection &&
      focus.sameDocument &&
      !focus.editable &&
      !focus.focused,
  );
  backend.workspace.notes.find((note) => note.id === "note-a").pinned = true;
  backend.sequence++;
  await page.evaluate(
    (metadata) =>
      window.__DEBUG_PLATFORM__.emit("notes-metadata", { metadata, changes:[] }),
    backend.state().metadata,
  );
  await idle(page);
  value = await state(page);
  focus = await focusState();
  check(
    "Equal-body metadata keeps the same frozen editor and does not cancel the lease",
    focus.sameDOM &&
      focus.sameDocument &&
      value.quietWindow.frozen &&
      value.quietWindow.editors.find((row) => row.id === "note-a")
        .externalVersion === originalVersion &&
      !replies.some(
        (row) => row.operationId === operationId && row.ready === false,
      ),
  );
  await end(operationId);
  focus = await focusState();
  observations.push({ name: "focused editor released", focus });
  check(
    "Abort restores the original focused editor and exact selection on the same DOM",
    focus.sameDOM &&
      focus.sameSelection &&
      focus.sameDocument &&
      focus.focused &&
      focus.editable,
  );
  await page.keyboard.press("Control+z");
  await idle(page);
  check(
    "Actual keyboard Undo still reaches history after focus restoration",
    !backend.workspace.notes
      .find((note) => note.id === "note-a")
      .plainText.includes("focus-history"),
  );

  await captureFocus();
  operationId = await prepare();
  await search.focus();
  await until(
    async () => !(await state(page)).quietWindow.frozen,
    "focus-driven cancellation terminal",
  );
  await idle(page);
  check(
    "Moving focus to the actual search input prevents editor focus theft on release",
    (await search.evaluate((node) => document.activeElement === node)) &&
      !(await focusState()).focused,
  );
  await page.keyboard.press("Escape");
  await idle(page);

  await captureFocus();
  operationId = await prepare();
  await page.getByText("在我的 Mac 上", { exact: true }).click();
  await end(operationId);
  focus = await focusState();
  check(
    "A real pointer interaction on the page relinquishes saved editor focus",
    !focus.focused && focus.sameDOM,
  );

  await captureFocus();
  operationId = await prepare();
  await page.keyboard.press("Tab");
  await end(operationId);
  check(
    "Keyboard Tab relinquishes saved editor focus",
    !(await focusState()).focused,
  );

  // Headless tabs all report focus, so use a second real browsing document.
  // Chromium emits a trusted window blur when its iframe input takes focus.
  const focusOtherDocument = async () => {
    await page.evaluate(() => {
      window.repairBlur = false;
      window.addEventListener(
        "blur",
        (event) => {
          window.repairBlur = event.isTrusted;
        },
        { once: true },
      );
      const frame = document.createElement("iframe");
      frame.id = "quiet-focus-fixture";
      frame.srcdoc = '<input aria-label="other document input">';
      document.body.appendChild(frame);
    });
    await page
      .frameLocator("#quiet-focus-fixture")
      .getByRole("textbox")
      .focus();
    await until(
      () => page.evaluate(() => window.repairBlur),
      "trusted cross-document window blur",
    );
  };
  await captureFocus();
  operationId = await prepare();
  await focusOtherDocument();
  await end(operationId);
  check(
    "Release never takes focus from another real browsing document",
    (await page.evaluate(
      () =>
        document.activeElement ===
        document.getElementById("quiet-focus-fixture"),
    )) && !(await focusState()).focused,
  );
  await page.evaluate(() =>
    document.getElementById("quiet-focus-fixture").remove(),
  );

  await captureFocus();
  operationId = await prepare();
  await focusOtherDocument();
  await page.evaluate(() => {
    document.getElementById("quiet-focus-fixture").remove();
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  check(
    "Cross-document focus test returns to an actually focused page body",
    await page.evaluate(
      () =>
        document.hasFocus() &&
        document.activeElement === document.body &&
        window.repairBlur,
    ),
  );
  await end(operationId);
  check(
    "Returning to the page after trusted window blur does not reclaim abandoned editor focus",
    !(await focusState()).focused,
  );

  // B may have no mounted editor; A is still a real writable independent host.
  await editor().focus();
  operationId = await prepare("note-b");
  await page.keyboard.type(" unrelated-focus");
  await idle(page);
  await end(operationId);
  check(
    "Releasing an unrelated target preserves active editor focus and real typing",
    (await editor().evaluate((node) => document.activeElement === node)) &&
      backend.workspace.notes
        .find((note) => note.id === "note-a")
        .plainText.includes("unrelated-focus"),
  );
  await captureFocus();
  operationId = await prepare();
  backend.noteEpochs["note-a"] = 1;
  backend.accessEpoch++;
  backend.sequence++;
  await page.evaluate(
    (metadata) =>
      window.__DEBUG_PLATFORM__.emit("notes-metadata", { metadata, changes:[] }),
    backend.state().metadata,
  );
  await until(
    async () => !(await state(page)).quietWindow.frozen,
    "changed note epoch cancels old focus lease",
  );
  await idle(page);
  check(
    "A changed trusted noteEpoch cannot restore the old operation focus",
    !(await page.evaluate(
      () => document.activeElement === window.repairFocus.dom,
    )),
  );

  await runtime.reset();
  await captureFocus();
  operationId = await prepare();
  backend.sessionId = "replacement-" + randomUUID();
  backend.sequence++;
  await page.evaluate(
    (metadata) =>
      window.__DEBUG_PLATFORM__.emit("notes-metadata", { metadata, changes:[] }),
    backend.state().metadata,
  );
  await until(
    async () => !(await state(page)).quietWindow.frozen,
    "trusted Session replacement releases old lease",
  );
  await idle(page);
  check(
    "A replacement trusted Session cannot restore the old operation focus",
    !(await page.evaluate(
      () => document.activeElement === window.repairFocus.dom,
    )),
  );
  check(
    "Desktop regression runtime has no React or browser errors",
    runtime.errors.length === 0,
  );
  await runtime.cleanup();
  runtime = undefined;

  await start({ nativeToolbar: true });
  operationId = await prepare("note-b");
  hold = true;
  await runtime.page.evaluate(() => {
    const revision = window.__DEBUG_PLATFORM__.toolbarStates.at(-1).revision;
    window.__DEBUG_PLATFORM__.emit("notes-ui://intent", {
      windowLabel: "main",
      bindingId: "synthetic-toolbar82",
      stateRevision: revision,
      sequence: 1,
      intent: { kind: "search", value: "Fixture B", phase: "change" },
    });
  });
  await until(
    () => !!releaseCancel,
    "native search on unrelated target requests cancellation",
  );
  value = await observe(
    "Native search with unrelated frozen target held before terminal",
  );
  check(
    "Native global search waits even when its old context owner is unrelated to the frozen target",
    value.selection.noteId === "note-a" &&
      value.selection.query === "" &&
      value.quietWindow.frozen,
  );
  await end(operationId);
  check(
    "Native global search retains its query through terminal replay",
    (await state(runtime.page)).selection.noteId === "note-b" &&
      (await state(runtime.page)).selection.query === "Fixture B",
  );
  check(
    "Native toolbar fixture has no React or browser errors",
    runtime.errors.length === 0,
  );
  await runtime.cleanup();
  runtime = undefined;

  await start({ mobile: true });
  await api(runtime.page, "app.folders");
  await idle(runtime.page);
  const mobileSearch = runtime.page
    .getByRole("textbox", { name: "搜索备忘录" })
    .first();
  await mobileSearch.focus();
  await idle(runtime.page);
  operationId = await prepare();
  hold = true;
  await runtime.page
    .getByRole("button", { name: "已锁定备忘录", exact: true })
    .click();
  await until(() => !!releaseCancel, "mobile filter requests cancellation");
  value = await observe("Mobile suggestion filter held before terminal");
  check(
    "Mobile search suggestion preserves page and owner until terminal",
    value.selection.page === "folders" && value.quietWindow.frozen,
  );
  await end(operationId);
  check(
    "Mobile search suggestion applies after terminal",
    (await state(runtime.page)).selection.page === "notes",
  );
  operationId = await prepare();
  hold = true;
  await runtime.page.getByRole("button", { name: "取消", exact: true }).click();
  await until(() => !!releaseCancel, "mobile cancel requests cancellation");
  value = await observe("Mobile search cancel held before terminal");
  check(
    "Mobile cancel retains searching state until terminal",
    value.selection.searching && value.quietWindow.frozen,
  );
  await end(operationId);
  check(
    "Mobile search cancel replays after terminal",
    !(await state(runtime.page)).selection.searching,
  );
  check(
    "Mobile fixture has no React or browser errors",
    runtime.errors.length === 0,
  );
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  if (runtime) {
    observations.push({
      name: "failure",
      state: await state(runtime.page).catch((error) => ({
        error: error.message,
      })),
    });
    htmls.push([
      "failure.html",
      await runtime.page
        .locator(".app")
        .evaluate((node) => node.outerHTML)
        .catch((error) => String(error)),
    ]);
  }
  console.error(error);
} finally {
  hold = false;
  releaseCancel?.();
  await runtime?.cleanup();
  // Write HTML after teardown so Vite cannot reload a live regression page.
  for (const [name, html] of htmls)
    await writeFile(resolve(output, name), html);
  const after = await sourceFingerprint(process.cwd());
  const report = {
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    before,
    after,
    sourceChanged: before.sha256 !== after.sha256,
    checks,
    observations,
    replies,
    failure,
    naturalExit: failure ? 1 : 0,
    elapsedMs: Math.round(performance.now() - started),
    scope:
      "Real React/Tiptap/Chromium DOM, input, keyboard and focus with explicit local sync/metadata/IPC fixture. No Rust, network, real mic or Android device proof.",
  };
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
