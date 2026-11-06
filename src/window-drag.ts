import type { MouseEvent } from "react";
/** Only a blank drag background handles double-click. Controls keep their own
 * double-click behavior, including search selection and editor text selection. */
export function dragBackgroundDoubleClick(
  event: MouseEvent<HTMLElement>,
  enabled: boolean,
  zoom: () => unknown,
) {
  if (
    !enabled ||
    event.defaultPrevented ||
    !(event.target instanceof Element) ||
    event.target.closest(
      'button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-window-zoom]',
    )
  )
    return;
  event.preventDefault();
  void zoom();
}
