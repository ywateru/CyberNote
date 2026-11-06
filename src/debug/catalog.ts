export type Field = {
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  enum?: readonly unknown[];
  nullable?: boolean;
};
export type Command = {
  id: string;
  group: string;
  mode: "semantic" | "dom" | "unsupported";
  boundary: string;
  description: string;
  args: Record<string, Field>;
};
const s = (required = false): Field => ({ type: "string", required });
const o = (required = true): Field => ({ type: "object", required });
const e = (values: string[], required = true): Field => ({
  type: "string",
  enum: values,
  required,
});
const descriptors: Command[] = [];
function add(
  group: string,
  id: string,
  description: string,
  args: Command["args"] = {},
  boundary = "App handler / editor / save queue",
  mode: Command["mode"] = "semantic",
) {
  descriptors.push({ id, group, description, args, boundary, mode });
}
add(
  "app",
  "app.state",
  "Read current application projection and workspace snapshot",
);
add("app", "app.flush", "Await actual document save queue ACK");
add("app", "app.refresh", "Reload through trusted application bridge");
add("app", "app.back", "Application Back including overlay dismissal");
add("app", "app.dismissError", "Dismiss application error banner");
add("navigation", "folder.select", "Navigate physical or smart folder", {
  id: s(true),
});
add("navigation", "note.select", "Select note using real navigation", {
  id: s(true),
});
add("navigation", "tag.select", "Select tag or all tags", {
  name: { ...s(true), nullable: true },
});
add(
  "notes",
  "note.create",
  "Create through actual createNote / flush / receipt",
);
add(
  "notes",
  "note.patch",
  "Move, pin or change paper using actual note patch",
  {
    pinned: { type: "boolean" },
    folderId: s(),
    paperStyle: e(
      [
        "plain",
        "lines-small",
        "lines-medium",
        "lines-large",
        "grid-small",
        "grid-medium",
        "grid-large",
      ],
      false,
    ),
  },
);
for (const id of ["delete", "restore", "purge"])
  add("notes", `note.${id}`, `${id} selected note through application action`);
add(
  "notes",
  "note.separate",
  "Open independent note window",
  {},
  "Native window mocked by fixture; browser preview selects note",
);
add(
  "notes",
  "note.share",
  "Use actual share handler",
  {},
  "System share/clipboard boundary",
);
add("folders", "folder.open", "Open new/edit folder form", { id: s() });
add(
  "folders",
  "folder.updateDraft",
  "Update real form draft retaining validation/conflict rules",
  { draft: o() },
);
for (const id of ["submit", "cancel", "refresh", "draft"])
  add("folders", `folder.${id}`, `Real folder form ${id}`);
add("folders", "folder.rename", "Open real rename/edit form", { id: s(true) });
add("folders", "folder.delete", "Open real deletion confirmation", {
  id: s(true),
});
add(
  "editor",
  "editor.insertText",
  "Insert literal text through Tiptap transaction",
  { text: s(true) },
);
add(
  "editor",
  "editor.setContent",
  "Set validated editor JSON through actual transaction/save",
  { document: o() },
);
add("editor", "editor.select", "Set real text selection", {
  from: { type: "number", required: true },
  to: { type: "number", required: true },
});
add("editor", "editor.format", "Execute actual format menu command", {
  command: e([
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "highlight",
    "colorDefault",
    "colorPurple",
    "colorPink",
    "colorOrange",
    "colorMint",
    "colorBlue",
    "styleTitle",
    "styleHeading",
    "styleSubheading",
    "styleBody",
    "styleMonospaced",
    "listBullet",
    "listDash",
    "listNumber",
    "blockquote",
    "checklist",
    "table",
    "convertTableToText",
  ]),
});
for (const id of ["undo", "redo"])
  add("editor", `editor.${id}`, `Actual editor history ${id}`);
add("editor", "editor.table", "Actual table chain", {
  action: e([
    "insert",
    "addRowBefore",
    "addRowAfter",
    "addColumnBefore",
    "addColumnAfter",
    "deleteRow",
    "deleteColumn",
    "deleteTable",
    "mergeCells",
    "splitCell",
    "toggleHeaderRow",
    "convertToText",
  ]),
});
add("search", "search.set", "Use global search state and normal projection", {
  query: s(true),
});
add("search", "search.find", "Open/find inside current note", {
  query: s(true),
});
add("settings", "settings.update", "Persist application settings", {
  settings: o(),
});
add("settings", "sidebar.toggle", "Use sidebar preference handler");
add("data", "data.open", "Open actual local data management page");
add("data", "data.refresh", "Refresh real data-management bridge snapshot");
add("data", "data.navigate", "Navigate actual storage overview or category detail", {
  view: e(["overview", "all", "image", "audio", "video", "attachments", "database", "logs", "other"]),
});
add("data", "data.filter", "Filter or paginate actual file listing", { query: s(), kind: e(["all", "image", "audio", "video", "file", "unowned"], false), page: { type: "number" } });
add("data", "data.exportAttachment", "Export original attachment from management listing", { id: s(true) }, "Native dialog and original-owner export boundary");
add("data", "image.preview", "Open actual image preview", { id: s(true) });
add("data", "image.info", "Toggle actual preview image information", {});
add("data", "image.close", "Close actual image preview", {});
add("data", "image.save", "Use actual image save control", { id: s(true) }, "Native dialog and original-byte export boundary");
add("menus", "menu.open", "Open existing menu", {
  menu: e([
    "format",
    "view",
    "media",
    "more",
    "folder",
    "table",
    "note",
    "app",
  ]),
});
add("menus", "modal.open", "Open real modal", {
  type: e(["lock", "unlock", "paper", "settings", "move", "purge"]),
  value: s(),
});
add(
  "menus",
  "modal.submit",
  "Submit current real confirmation; fill its input with dom.fill first",
);
add("menus", "modal.cancel", "Dismiss current modal through Back");
add(
  "attachments",
  "attachment.choose",
  "Open actual picker for a captured editor target",
  { kind: e(["file", "media", "camera"], false) },
  "OS picker/camera boundary; fixture synthetic File only",
);
add(
  "attachments",
  "attachment.submit",
  "Submit bounded synthetic files through actual picker batch",
  { files: { type: "array", required: true } },
  "File input boundary; actual AttachmentSubmission/save ACK",
);
for (const id of ["retry", "discard"])
  add("attachments", `attachment.${id}`, `Actual attachment ${id}`);
add(
  "ocr",
  "ocr.open",
  "Create real OcrHost operation",
  {},
  "Native OCR platform mocked; no real recognition claim",
);
add(
  "ocr",
  "ocr.select",
  "Process real OcrHost source",
  { source: e(["image", "camera"], false) },
  "OCR device/recognition boundary",
);
for (const id of ["insert", "retry", "cancel"])
  add("ocr", `ocr.${id}`, `Actual OcrHost ${id}`, {}, "OCR platform boundary");
add("recording", "recording.open", "Open real owner/Panel/session");
add(
  "recording",
  "recording.action",
  "Dispatch validated real recording action",
  {
    action: e([
      "toggle",
      "close",
      "finish",
      "playback",
      "preview-retry",
      "skip",
      "seek",
    ]),
    seconds: { type: "number", enum: [-15, 15] },
    milliseconds: { type: "number" },
  },
  "Fixture fixed synthetic media only; actual Session/PCM/revisions/body ACK",
);
for (const id of ["export", "import"])
  add(
    "archive",
    `archive.${id}`,
    `Actual archive ${id} handler`,
    {},
    "System dialog and native storage mocked by default fixture",
  );
add(
  "lifecycle",
  "app.close",
  "Request native window close intent",
  {},
  "Native event delivery mocked; actual app save barrier",
);
add(
  "lifecycle",
  "app.quit",
  "Request native app quit intent",
  {},
  "Native exit delivery mocked; no OS termination claim",
);
add(
  "drawing",
  "drawing.open",
  "Open existing drawing editor",
  {},
  "Draw with DOM pointer interaction; native sketch menu remains disabled",
);
add(
  "dom",
  "dom.click",
  "Click one visible enabled actual element",
  { selector: s(true) },
  "DOM supplementary control wiring",
  "dom",
);
add(
  "dom",
  "dom.fill",
  "Fill one real input using input/change events",
  { selector: s(true), value: s(true) },
  "DOM supplementary control wiring",
  "dom",
);
add(
  "dom",
  "dom.key",
  "Dispatch actual key event (not text synthesis)",
  {
    selector: s(true),
    key: s(true),
    ctrlKey: { type: "boolean" },
    metaKey: { type: "boolean" },
    shiftKey: { type: "boolean" },
  },
  "DOM supplementary control wiring",
  "dom",
);
for (const id of [
  "viewAttachments",
  "takePhoto",
  "scanDocument",
  "addSketch",
  "recentNotes",
  "mathInsert",
  "mathSuggest",
  "mathOff",
  "attachmentsSmall",
  "attachmentsLarge",
])
  add(
    "unsupported",
    `native.${id}`,
    "Existing native menu is explicitly disabled",
    {},
    "Existing product limitation; web camera/drawing are separately reachable",
    "unsupported",
  );
export const catalog: readonly Command[] = descriptors;
