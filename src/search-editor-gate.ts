import type { Editor } from "@tiptap/core";

// Every existing editable restoration passes through this gate. A late access,
// conflict-copy or paper callback can update a parked editor's desired state,
// but cannot make it writable before that same instance becomes active again.
// Callers keep their existing destroyed-instance checks; the gate only owns
// editability and never changes editor lifetime or authorization.
export class SearchEditorGate {
  private suspended = false;

  suspend(): void { this.suspended = true; }
  resume(): void { this.suspended = false; }

  private parked = new WeakMap<Editor, { editable: boolean }>();

  park(editor: Editor): void {
    if (!this.parked.has(editor))
      this.parked.set(editor, { editable: editor.isEditable });
    if (editor.isEditable) editor.setEditable(false, false);
  }

  activate(editor: Editor, blocked: boolean): void {
    if (blocked || this.suspended) {
      this.park(editor);
      return;
    }
    const desired = this.parked.get(editor);
    if (!desired) return;
    this.parked.delete(editor);
    if (editor.isEditable !== desired.editable)
      editor.setEditable(desired.editable, false);
  }

  restore(editor: Editor, editable: boolean, blocked: boolean): void {
    const desired = this.parked.get(editor);
    if (desired) desired.editable = editable;
    const allowed = editable && !desired && !blocked && !this.suspended;
    if (editor.isEditable !== allowed) editor.setEditable(allowed, false);
  }
}
