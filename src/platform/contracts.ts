import type { Editor } from "@tiptap/core";
import type { SelectionBookmark } from "@tiptap/pm/state";
import type { AccessStamp } from "../access-client";
/** Captured native intent target. Execution must validate against live root
 * authority, editor ownership, scope and document version before restoring it. */
export interface NativeContext {
  noteId: string | null;
  scope: string;
  stamp: AccessStamp;
  editor: Editor | null;
  bookmark: SelectionBookmark | null;
  documentVersion: number;
}
