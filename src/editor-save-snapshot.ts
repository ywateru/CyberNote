import type { JSONContent } from "@tiptap/core";
import { visitTagSpans } from "./note-tags";

/** Only for a trusted live Editor/local transaction's outgoing save body.
 * IME preedit can temporarily invalidate a tag in the active document. Keep
 * every character and other format in a separate save representation without
 * touching that Editor's DOM, selection, composition, history, or identity.
 * Never use this to repair external documents, IPC, imports or ciphertext.
 */
export function editorSaveSnapshot(document: JSONContent): JSONContent {
  let invalid = false;
  visitTagSpans(document, (_nodes, _name, legal) => {
    if (!legal) invalid = true;
  });
  // getJSON already returns a fresh tree. Most keystrokes leave every tag
  // legal, so avoid cloning the whole document on the save hot path.
  if (!invalid) return document;
  const snapshot = structuredClone(document);
  visitTagSpans(snapshot, (nodes, _name, legal) => {
    if (legal) return;
    for (const node of nodes) {
      const marks = node.marks?.filter((mark) => mark.type !== "noteTag");
      if (marks?.length) node.marks = marks;
      else delete node.marks;
    }
  });
  return snapshot;
}
