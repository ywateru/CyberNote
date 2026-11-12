/** Visual acknowledgment only. Never changes focus, selection or activation. */
export function installButtonFeedback(root: Document) {
  const pending = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const activate = (event: MouseEvent) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, [role="button"], summary')
        : null;
    if (
      !button ||
      button.matches(':disabled, [aria-disabled="true"]') ||
      button.closest("[inert]")
    )
      return;
    clearTimeout(pending.get(button));
    button.dataset.buttonActivated = "";
    pending.set(
      button,
      setTimeout(() => {
        delete button.dataset.buttonActivated;
        pending.delete(button);
      }, 180),
    );
  };
  root.addEventListener("click", activate, true);
  return () => {
    root.removeEventListener("click", activate, true);
    for (const [button, timer] of pending) {
      clearTimeout(timer);
      delete button.dataset.buttonActivated;
    }
    pending.clear();
  };
}
