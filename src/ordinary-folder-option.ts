export type OrdinaryFolderOptionResult = "ignored" | "inserted" | "failed";

/** The caller limits this to the native Mac main ordinary-folder name input. */
export function insertOrdinaryFolderOptionTab(
  event: KeyboardEvent,
  input: HTMLInputElement,
): OrdinaryFolderOptionResult {
  if (
    event.key !== "Tab" || !event.altKey || event.ctrlKey || event.metaKey ||
    event.isComposing || event.keyCode === 229 || event.defaultPrevented
  ) return "ignored";

  event.preventDefault();
  const document = input.ownerDocument;
  const start = input.selectionStart, end = input.selectionEnd;
  if (
    event.target !== input || document.activeElement !== input || !input.isConnected ||
    input.type !== "text" || input.readOnly || input.matches(":disabled") ||
    input.closest("[inert]") || typeof document.execCommand !== "function" ||
    start === null || end === null || !Number.isInteger(start) || !Number.isInteger(end) ||
    start < 0 || end < start || end > input.value.length
  ) return "failed";

  const expected = input.value.slice(0, start) + "\t" + input.value.slice(end);
  let beforeInput = false, actualInput = false;
  const observeBeforeInput = (edit: Event) => {
    if (edit.isTrusted && (edit as InputEvent).inputType === "insertText") beforeInput = true;
  };
  const observeInput = (edit: Event) => {
    if (edit.isTrusted && (edit as InputEvent).inputType === "insertText") actualInput = true;
  };
  input.addEventListener("beforeinput", observeBeforeInput);
  input.addEventListener("input", observeInput);
  try {
    // One browser editing operation owns the real input/React chain and native history.
    const inserted = document.execCommand("insertText", false, "\t");
    return inserted === true && beforeInput && actualInput &&
      input.value === expected && input.selectionStart === start + 1 &&
      input.selectionEnd === start + 1 && document.activeElement === input
      ? "inserted" : "failed";
  } catch {
    // A browser failure may already have edited. Keep its actual input/history; never replay or reset.
    return "failed";
  } finally {
    input.removeEventListener("beforeinput", observeBeforeInput);
    input.removeEventListener("input", observeInput);
  }
}
