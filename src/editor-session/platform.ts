import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

export interface SessionPlatform {
  focus(
    editor: Editor,
    options: { keyboard: boolean; atEnd?: boolean },
    current: () => boolean,
  ): boolean;
  blur(editor: Editor | null): void;
  keyboard(show: boolean): void;
}

// Focus admission stays with the caller's live authorization/gate check. This
// adapter never changes editability and never searches for an arbitrary editor.
export function browserSessionPlatform(): SessionPlatform {
  const keyboard = (show: boolean) => {
    const bridge = (
      window as Window & { NotesKeyboard?: { show(): void; hide(): void } }
    ).NotesKeyboard;
    if (show) bridge?.show();
    else bridge?.hide();
  };
  return {
    keyboard,
    blur(editor) {
      if (editor && !editor.isDestroyed) editor.view.dom.blur();
      keyboard(false);
    },
    focus(editor, options, current) {
      if (
        !current() ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !editor.view.dom.isConnected ||
        !editor.view.dom.getClientRects().length
      )
        return false;
      if (options.atEnd)
        editor.view.dispatch(
          editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)),
        );
      if (!current()) return false;
      editor.view.focus();
      if (!current()) {
        editor.view.dom.blur();
        keyboard(false);
        return false;
      }
      if (options.keyboard) keyboard(true);
      return true;
    },
  };
}
