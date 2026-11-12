import { resolve } from "node:path";
import {
  api,
  idle,
  state,
  snapshot,
  saveJSON,
  waitForState,
} from "./runtime.mjs";
export const tinyPNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=",
  "base64",
);
export const refs = (node) => [
  ...(node?.type === "attachment" ? [node.attrs.id] : []),
  ...(node?.content || []).flatMap(refs),
];
export async function chooseFiles(
  page,
  files,
  { menu = false, emptyMime = false, beforeChange } = {},
) {
  const waiting = page.waitForEvent("filechooser");
  void waiting.catch(() => {});
  if (menu) {
    await page
      .locator('.editor-tools:visible [aria-label="添加附件"]')
      .first()
      .click();
    await page.getByRole("menuitem", { name: "附加文件", exact: true }).click();
  } else await api(page, "attachment.choose", { kind: "file" });
  const chooser = await waiting;
  if (beforeChange) await beforeChange();
  if (emptyMime) {
    await page.evaluate(
      (files) => {
        const transfer = new DataTransfer();
        for (const f of files)
          transfer.items.add(
            new File(
              [Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))],
              f.name,
              { type: f.mimeType },
            ),
          );
        const input = document.querySelector("input[type=file]");
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      files.map((f) => ({
        name: f.name,
        mimeType: f.mimeType,
        base64: f.buffer.toString("base64"),
      })),
    );
  } else await chooser.setFiles(files);
}
// All normal reads still use the browser FileReader. Faults replace only the
// provider read boundary, never capturePickerTarget/FileList/onChange/ACK.
export async function readerBoundary(
  page,
  { delay = 0, abort = false, error = false } = {},
) {
  await page.evaluate(
    ({ delay, abort, error }) => {
      const Native = window.FileReader;
      window.__readerBoundary = { entered: 0 };
      window.FileReader = class extends Native {
        readAsDataURL(file) {
          window.FileReader = Native;
          window.__readerBoundary.entered++;
          if (error) {
            queueMicrotask(() => this.dispatchEvent(new Event("error")));
            return;
          }
          const read = () => {
            super.readAsDataURL(file);
            if (abort) this.abort();
          };
          if (delay) setTimeout(read, delay);
          else read();
        }
      };
    },
    { delay, abort, error },
  );
}
export async function runMobileAttachments(
  runtime,
  { command, check, output },
) {
  const { page, backend } = runtime;
  const baseCall = backend.call.bind(backend);
  const reset = async () => {
    backend.call = baseCall;
    await runtime.reset();
    await command("note.select", { id: "note-a" });
  };
  const note = () => backend.workspace.notes.find((n) => n.id === "note-a");
  const count = () => refs(note().document).length;
  const done = async (expected) => {
    await idle(page);
    const s = await state(page);
    return (
      s.save.pending === 0 &&
      s.save.failed === 0 &&
      backend.workspace.attachments.length === expected &&
      count() === expected &&
      new Set(refs(note().document)).size === expected
    );
  };
  const capture = async (name) => {
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, {
        selector: ".app",
        maxChars: 24000,
        maxNodes: 120,
      }),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  const failed = async () => {
    try {
      await idle(page);
      return false;
    } catch (e) {
      return e.code === "APP_ERROR";
    }
  };
  const png = (name) => ({ name, mimeType: "image/png", buffer: tinyPNG });
  const file = {
    name: "synthetic-local.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic local attachment 75"),
  };
  await command("note.create");
  const emptyId = (await state(page)).selection.noteId;
  await chooseFiles(page, [png("empty-first.png"), file]);
  await idle(page);
  let emptyNote = backend.workspace.notes.find((n) => n.id === emptyId);
  check(
    "New empty note real multi-FileList preserves both selected attachments",
    refs(emptyNote.document).length === 2 &&
      backend.workspace.attachments.length === 2,
  );
  await command("editor.undo");
  await command("app.flush");
  emptyNote = backend.workspace.notes.find((n) => n.id === emptyId);
  check(
    "One Undo reverses latest insertion/history group together with its paragraph change",
    refs(emptyNote.document).length < 2 &&
      emptyNote.document.content.filter((n) => n.type === "paragraph")
        .length === 1,
  );
  await command("editor.redo");
  await command("app.flush");
  check(
    "Redo restores latest selected file without duplicating another card",
    refs(backend.workspace.notes.find((n) => n.id === emptyId).document)
      .length === 2,
  );
  await chooseFiles(page, [{ ...file, name: "next-chooser.txt" }]);
  await idle(page);
  emptyNote = backend.workspace.notes.find((n) => n.id === emptyId);
  check(
    "Next chooser appends after automatic insertion caret and preserves prior cards",
    refs(emptyNote.document).length === 3 &&
      backend.workspace.attachments.length === 3,
  );
  await page
    .locator(".attachment-node.file .file-card")
    .first()
    .click({ force: true });
  await page.waitForSelector(".node-attachment.ProseMirror-selectednode");
  await chooseFiles(page, [{ ...file, name: "explicit-replacement.txt" }]);
  await idle(page);
  emptyNote = backend.workspace.notes.find((n) => n.id === emptyId);
  check(
    "Explicit user selection can replace old card without deleting retained media",
    refs(emptyNote.document).length === 3 &&
      backend.workspace.attachments.length === 4 &&
      !refs(emptyNote.document).includes(backend.workspace.attachments[1].id) &&
      refs(emptyNote.document).includes(backend.workspace.attachments[0].id),
  );
  await command("editor.undo");
  await command("app.flush");
  emptyNote = backend.workspace.notes.find((n) => n.id === emptyId);
  check(
    "One Undo restores explicitly replaced card through normal editor/save pipeline",
    refs(emptyNote.document).length === 3 &&
      refs(emptyNote.document).includes(backend.workspace.attachments[1].id) &&
      refs(emptyNote.document).includes(backend.workspace.attachments[0].id),
  );
  await reset();
  await chooseFiles(page, [png("single.png")], { menu: true });
  check(
    "Mobile menu chooser → actual FileList/onChange → PNG bytes and body ACK",
    (await done(1)) &&
      backend.files.get(backend.workspace.attachments[0].id) ===
        tinyPNG.toString("base64"),
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".attachment-node img")?.complete &&
      document.querySelector(".attachment-node img")?.naturalWidth > 0,
  );
  check(
    "Single image reads authorized stored bytes and actually decodes in HTML",
    (await page.locator(".attachment-node img").count()) === 1,
  );
  await chooseFiles(page, [file]);
  await idle(page);
  await chooseFiles(page, [
    {
      ...file,
      name: "synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n% synthetic non-rendered PDF fixture\n%%EOF",
      ),
    },
  ]);
  check(
    "Generic file and PDF each retain correct MIME/bytes/reference and ACK",
    (await done(3)) &&
      backend.workspace.attachments.some((a) => a.mime === "application/pdf") &&
      (await page.locator(".file-card").count()) === 2,
  );
  await capture("mobile-attachments-saved");
  await reset();
  backend.configure({ delay: { media: 650 } });
  await chooseFiles(page, [png("multi-a.png"), png("multi-b.png")]);
  check(
    "Two selected images save exactly one reference per original file",
    await done(2),
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".attachment-node img")].length === 2 &&
      [...document.querySelectorAll(".attachment-node img")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
  );
  check(
    "Delayed thumbnail issuance survives next-file synchronize through fully gated grants",
    (await page.locator(".attachment-node .inline-error").count()) === 0 &&
      backend.calls.filter((c) => c.command === "acquire_attachment_source").length >= 2 && !backend.calls.some(c=>c.command==="read_attachment"),
  );
  await capture("mobile-multi-image-recovered");
  await reset();
  await chooseFiles(page, [{ ...png("missing-mime.png"), mimeType: "" }], {
    emptyMime: true,
  });
  check(
    "Missing File.type PNG is identified by bytes, persisted and displayed as image",
    (await done(1)) &&
      backend.workspace.attachments[0].mime === "image/png" &&
      backend.workspace.attachments[0].kind === "image",
  );
  await chooseFiles(
    page,
    [
      {
        ...file,
        name: "misleading.png",
        mimeType: "",
        buffer: Buffer.from("unknown bytes"),
      },
    ],
    { emptyMime: true },
  );
  check(
    "Unknown empty-MIME bytes stay generic despite PNG filename",
    (await done(2)) &&
      backend.workspace.attachments[1].mime === "application/octet-stream" &&
      backend.workspace.attachments[1].kind === "file",
  );
  await reset();
  await chooseFiles(page, [file]);
  await idle(page);
  await chooseFiles(page, [file]);
  check(
    "Same filename reselection creates two distinct operations and correct cards",
    (await done(2)) && backend.journal.size === 2,
  );
  await reset();
  let chooser = page.waitForEvent("filechooser");
  await api(page, "attachment.choose", { kind: "file" });
  await chooser;
  await page.locator("input[type=file]").first().dispatchEvent("cancel");
  await idle(page);
  check(
    "System picker cancellation stores nothing",
    backend.workspace.attachments.length === 0 &&
      !backend.calls.some((c) => c.command === "store_attachment_operation"),
  );
  await chooseFiles(page, [file]);
  check(
    "Picker can reselect after cancel with a fresh captured target",
    await done(1),
  );
  await reset();
  await readerBoundary(page, { delay: 350 });
  await chooseFiles(page, [file], {
    beforeChange: async () => {
      await page.evaluate(async () => {
        window.dispatchEvent(new Event("blur"));
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
    },
  });
  check(
    "Chooser roundtrip blur/visibility/focus plus delayed actual FileReader preserves original target",
    await done(1),
  );
  for (const boundary of ["abort", "error"]) {
    await reset();
    await readerBoundary(page, { [boundary]: true });
    await chooseFiles(page, [file]);
    check(
      `FileReader ${boundary} ends pending with readable explicit error, no stored bytes`,
      (await failed()) &&
        backend.workspace.attachments.length === 0 &&
        (await state(page)).error.length > 0,
    );
    const before = [...backend.journal.keys()];
    await command("attachment.retry");
    check(
      `FileReader ${boundary} retry uses original retained operation once and reaches ACK`,
      (await done(1)) && backend.journal.size === 1 && before.length === 0,
    );
  }
  await reset();
  backend.configure({ fail: { save: 2 } });
  await chooseFiles(page, [file]);
  check(
    "Body save failure retains one stored attachment and explicit pending failure",
    (await failed()) &&
      backend.workspace.attachments.length === 1 &&
      count() === 0,
  );
  const first = [...backend.journal.keys()][0];
  backend.configure({ fail: { save: 2 } });
  let retryError;
  try {
    await api(page, "attachment.retry");
    await idle(page);
  } catch (e) {
    retryError = e;
  }
  check(
    "Unsuccessful body retry keeps explicit error and pending/failed state",
    retryError?.code === "APP_ERROR" &&
      (await state(page)).error.length > 0 &&
      ((await state(page)).save.failed > 0 ||
        (await state(page)).save.pending > 0),
  );
  backend.configure({ fail: { save: 0 } });
  await command("attachment.retry");
  check(
    "Body save retry commits same original operation without duplicate card",
    (await done(1)) && backend.journal.size === 1 && backend.journal.has(first),
  );
  await reset();
  backend.configure({ fail: { storeResponse: 1 } });
  await chooseFiles(page, [file]);
  check(
    "Lost store response queries original operation and ACKs once",
    (await done(1)) &&
      backend.journal.size === 1 &&
      backend.calls.some((c) => c.command === "query_attachment_operation"),
  );
  await reset();
  let armedRefresh = false;
  backend.call = async (command, args) => {
    const result = await baseCall(command, args);
    if (
      command === "workspace_action" &&
      args.action?.type === "saveNote" &&
      result.ok &&
      !armedRefresh
    ) {
      armedRefresh = true;
      backend.configure({ fail: { load: 10 } });
    }
    return result;
  };
  await chooseFiles(page, [file]);
  check(
    "Post-ACK list refresh failure retains committed body and one operation",
    (await failed()) &&
      count() === 1 &&
      backend.workspace.attachments.length === 1 &&
      (await state(page)).save.pending === 0,
  );
  const savedRevision = note().revision,
    savedOperation = [...backend.journal.keys()][0];
  backend.call = baseCall;
  backend.configure({fail:{load:0}});
  await command("attachment.retry");
  check(
    "Post-ACK retry refreshes only without another store/body save/card",
    (await done(1)) &&
      note().revision === savedRevision &&
      backend.journal.size === 1 &&
      backend.journal.has(savedOperation),
  );
  await reset();
  let stores = 0;
  const realCall = backend.call.bind(backend);
  backend.call = async (...args) => {
    if (args[0] === "store_attachment_operation" && ++stores === 2)
      backend.configure({ fail: { store: 1 } });
    return realCall(...args);
  };
  await chooseFiles(page, [png("first.png"), file]);
  check(
    "Second item failure preserves first ACK and independent second operation",
    (await failed()) &&
      backend.workspace.attachments.length === 1 &&
      count() === 1,
  );
  const originalFirst = backend.workspace.attachments[0].id;
  await command("attachment.retry");
  check(
    "Multi-file retry retains first identity and inserts second exactly once",
    (await done(2)) &&
      backend.workspace.attachments[0].id === originalFirst &&
      backend.journal.size === 2,
  );
  await reset();
  await readerBoundary(page, { delay: 450 });
  await chooseFiles(page, [file]);
  await page.waitForFunction(() => window.__readerBoundary.entered === 1);
  const cancelled = api(page, "attachment.discard");
  await cancelled;
  await idle(page);
  check(
    "Cancel waits for actual delayed FileReader/store settling; no late body insertion",
    count() === 0 &&
      [...backend.journal.values()].every((op) => op.status === "aborted") &&
      (await state(page)).save.pending === 0,
  );
  await reset();
  await chooseFiles(page, [file], {
    beforeChange: () => api(page, "note.select", { id: "note-b" }),
  });
  check(
    "A chooser returning after navigation to B is rejected without storing/cross-note insertion",
    (await failed()) &&
      backend.workspace.attachments.length === 0 &&
      refs(backend.workspace.notes.find((n) => n.id === "note-b").document)
        .length === 0,
  );
  await reset();
  await chooseFiles(page, [file], {
    beforeChange: () =>
      api(page, "editor.insertText", { text: " changed while choosing" }),
  });
  check(
    "A chooser returning after original document change is rejected without storing",
    (await failed()) && backend.workspace.attachments.length === 0,
  );
  await reset();
  await chooseFiles(page, [file]);
  await idle(page);
  await page.locator(".file-card").waitFor();
  check("Generic file is metadata-only with zero source or legacy-byte prefetch",!backend.calls.some(c=>["read_attachment","acquire_attachment_source"].includes(c.command)));
  await reset();await chooseFiles(page,[png("stale-source.png")]);await idle(page);
  backend.configure({delay:{media:100}});let reads=0;const readCall=backend.call.bind(backend);
  backend.call=async(command,args)=>{const result=await readCall(command,args);if(command==="acquire_attachment_source"){reads++;await page.evaluate(async()=>{(await import("/src/bridge.ts")).invalidateAccessRequests();});}return result;};
  await page.reload();await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await api(page,"note.select",{id:"note-a"});
  await page.waitForSelector('.attachment-node .inline-error [aria-label="重试附件"]');
  check("Stale lease response remains rejected without decoded media publication",reads>=1&&reads<=3&&(await page.locator('.attachment-node img[src]').count())===0);
  backend.call=readCall;await page.getByRole("button",{name:"重试附件",exact:true}).click();
  await page.waitForFunction(()=>{const image=document.querySelector('.attachment-node img');return image?.complete&&image.naturalWidth>0;});
  check("Manual thumbnail retry gets a fresh gated grant and recovers",(await page.locator('.attachment-node .inline-error').count())===0);
  await reset();
  await chooseFiles(page, [png("revoked.png")]);
  await idle(page);
  backend.configure({ delay: { media: 350 } });
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await api(page, "note.select", { id: "note-a" });
  await waitForState(
    page,
    () =>
      backend.calls.filter((c) => c.command === "acquire_attachment_source").length >= 2,
    { label: "delayed read admission" },
  );
  backend.workspace.notes.find((n) => n.id === "note-a").locked = true;
  await page.waitForSelector(".attachment-node .inline-error");
  check(
    "Real boundary authorization rejection never publishes delayed bytes or an image URL",
    (await page.locator('.attachment-node img[src]').count()) === 0,
  );
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  check(
    "Navigation makes old media lifetime unable to publish into B",
    (await page.locator(".tiptap:visible .attachment-node").count()) === 0,
  );
  await reset();
  backend.workspace.notes.find((n) => n.id === "note-a").locked = true;
  backend.unlocked = new Set(["note-a"]);
  await command("app.refresh");
  await page
    .locator('.editor-tools:visible [aria-label="添加附件"]')
    .first()
    .click();
  check(
    "Unlocked locked-note attachment menu is disabled consistently with Rust store policy",
    (await page
      .getByRole("menuitem", { name: "附加文件", exact: true })
      .isDisabled()) &&
      (await page
        .getByRole("menuitem", { name: "录音", exact: true })
        .isDisabled()),
  );
  await reset();
  await chooseFiles(page, [
    { ...file, name: "very-long-file-name-".repeat(12) + ".txt" },
    {
      ...file,
      name: "long-pdf-".repeat(18) + ".pdf",
      mimeType: "application/pdf",
    },
  ]);
  await idle(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await command("settings.update", { settings: { theme } });
      const geometry = await page
        .locator(".tiptap:visible")
        .evaluate((editor) => {
          const e = editor.getBoundingClientRect();
          return [...editor.querySelectorAll(".file-card")].map((card) => {
            const r = card.getBoundingClientRect();
            return {
              x: r.x,
              right: r.right,
              width: r.width,
              editorX: e.x,
              editorRight: e.right,
            };
          });
        });
      check(
        `Long generic/PDF cards stay within mobile editor at ${width}px ${theme}`,
        geometry.length === 2 &&
          geometry.every(
            (r) => r.x >= r.editorX - 1 && r.right <= r.editorRight + 1,
          ),
      );
      await capture(`mobile-file-cards-${width}-${theme}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    "Mobile attachments produce no page errors",
    runtime.errors.length === 0,
  );
}
