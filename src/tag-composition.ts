import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { documentsEqual } from "./document-equality";
import { editorSaveSnapshot } from "./editor-save-snapshot";

// Observe this Editor's real event/transaction boundary. An end event alone is
// insufficient: some keyboards deliver the final input afterwards. Its data
// must be present in the mapped composition range and a post-end PM transaction
// (including tag cleanup) must have reached the live Editor before releasing it.
export class TagComposition {
  cycle = 0;
  pending = false;
  private from = 0;
  private to = 0;
  private finalText: string | null = null;
  private postEndTransaction = false;
  private queued = false;
  private dom: HTMLElement;

  constructor(
    readonly editor: Editor,
    private settled: (cycle: number) => void,
    private restarted: () => void,
  ) {
    this.dom = editor.view.dom;
    this.dom.addEventListener("compositionstart", this.start);
    this.dom.addEventListener("compositionend", this.end);
    editor.on("transaction", this.transaction);
  }

  private start = () => {
    this.cycle++;
    this.pending = true;
    this.from = this.editor.state.selection.from;
    this.to = this.editor.state.selection.to;
    this.finalText = null;
    this.postEndTransaction = false;
    this.restarted();
  };

  private end = (event: CompositionEvent) => {
    if (!this.pending) return;
    this.finalText = event.data;
    this.checkAfterTransaction();
  };

  private transaction = ({
    transaction,
    appendedTransactions = [],
  }: {
    transaction: Transaction;
    appendedTransactions?: Transaction[];
  }) => {
    if (!this.pending) return;
    for (const tr of [transaction, ...appendedTransactions]) {
      this.from = tr.mapping.map(this.from, -1);
      this.to = tr.mapping.map(this.to, 1);
    }
    if (this.finalText !== null && !this.editor.view.composing)
      this.postEndTransaction = true;
    this.checkAfterTransaction();
  };

  private checkAfterTransaction() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      const editor = this.editor;
      if (
        !this.pending ||
        this.finalText === null ||
        !this.postEndTransaction ||
        editor.isDestroyed ||
        editor.view.composing ||
        editor.state.doc.textBetween(this.from, this.to, "\n", "\n") !==
          this.finalText ||
        !documentsEqual(editor.getJSON(), editorSaveSnapshot(editor.getJSON()))
      )
        return;
      // Tiptap's transaction event precedes onUpdate. This observation runs
      // afterwards, so the actual final body has reached the normal save port.
      this.pending = false;
      this.settled(this.cycle);
    });
  }

  dispose() {
    this.pending = false;
    this.dom.removeEventListener("compositionstart", this.start);
    this.dom.removeEventListener("compositionend", this.end);
    this.editor.off("transaction", this.transaction);
  }
}
