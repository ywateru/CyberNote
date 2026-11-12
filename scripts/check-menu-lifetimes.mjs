import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const js = ts.transpile(await readFile("src/attachment-media.ts", "utf8"), {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const { createAttachmentMediaSource } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const events = [];
const source = createAttachmentMediaSource(
  { data: btoa("original bytes"), mime: "image/svg+xml" },
  "image",
  {
    createObjectURL: () => "blob:retained-image",
    revokeObjectURL: (url) => events.push("revoke:" + url),
  },
);
const preview = source.retain();
source.bindController(() => events.push("editor-stop"));
preview.bindController(() => events.push("preview-stop"));
source.dispose();
source.dispose();
assert.deepEqual(events, ["editor-stop"]);
assert(source.disposed && !preview.disposed);
assert.throws(() => source.retain(), /已释放/);
const second = preview.retain();
preview.dispose();
assert.deepEqual(events, ["editor-stop", "preview-stop"]);
assert.equal(second.src, source.src);
second.dispose();
second.dispose();
assert.deepEqual(events, [
  "editor-stop",
  "preview-stop",
  "revoke:blob:retained-image",
]);
let immediatelyStopped = false;
second.bindController(() => {
  immediatelyStopped = true;
});
assert(immediatelyStopped);
console.log(
  "Attachment leases: independent preview/editor controllers, final URL release, duplicate cleanup and expired lease rejection passed",
);
