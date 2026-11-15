import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { secureId } from "./secure-id";
const symbols: Record<string, string> = {
  scissors: "scissors",
  "pen-tool": "pencil.tip",
  copy: "doc.on.doc",
  "clipboard-paste": "doc.on.clipboard",
  share: "square.and.arrow.up",
  eye: "eye",
  "folder-open": "folder",
  "external-link": "arrow.up.forward.app",
  "file-text": "doc.text",
  "trash-2": "trash",
  download: "square.and.arrow.down",
  play: "play",
  pause: "pause",
  pin: "pin",
  lock: "lock",
  search: "magnifyingglass",
  folder: "folder",
  settings: "gearshape",
  list: "list.bullet",
  "grid-2x2": "square.grid.2x2",
  "notebook-pen": "note.text",
  table: "tablecells",
  "undo-2": "arrow.uturn.backward",
  "pin-off": "pin.slash",
};
/** The surface keeps action closures in React. Native only returns an item index;
 * disconnected/changed menus cannot execute an old action. */
export function presentNativeMenu(
  element: HTMLElement,
  onResult: (restore: boolean) => void,
  onError: () => void,
) {
  const token = secureId(),
    windowLabel = getCurrentWindow().label;
  let live = true;
  const rows: HTMLElement[] = [];
  type Entry = { kind: string; label: string; index: number; enabled: boolean; selected: boolean; symbol: string; items?: Entry[] };
  const entries = (parent: Element): Entry[] => [...parent.children].flatMap(child => {
    if (!(child instanceof HTMLElement)) return [];
    const submenu = child.hasAttribute('data-menu-submenu');
    const row = submenu ? child.querySelector<HTMLElement>('[aria-haspopup="menu"]') : child;
    if (!row || !row.matches('[role="menuitem"], .menu-divider, hr')) return [];
    const index = rows.push(row) - 1;
    return [{
      kind: submenu ? 'submenu' : row.matches('.menu-divider, hr') ? 'separator' : 'item',
      label: (row.textContent ?? '').trim(), index,
      enabled: !(row as HTMLButtonElement).disabled, selected: row.dataset.checked === 'true',
      symbol: [...((row.querySelector('.menu-icon svg') ?? row.querySelector('svg'))?.classList ?? [])].map(name => symbols[name.replace(/^lucide-/, '')]).find(Boolean) ?? '',
      ...(submenu ? { items: entries(child.querySelector('[role="menu"]')!) } : {}),
    }];
  });
  const items = entries(element);
  const frame = requestAnimationFrame(() => {
    if (!live) return;
    const bounds = element.getBoundingClientRect();
    void invoke<number | null>("plugin:notes-ui|popup_menu", {
      windowLabel,
      request: {
        token,
        x: bounds.left,
        y: bounds.top,
        viewportWidth: innerWidth,
        items,
      },
    })
      .then((index) => {
        if (!live || !element.isConnected) return;
        const chosen =
          index !== null &&
          rows[index]?.isConnected &&
          !(rows[index] as HTMLButtonElement).disabled;
        if (chosen) rows[index!].click();
        onResult(!chosen);
      })
      .catch(() => {
        if (live) onError();
      });
  });
  return () => {
    live = false;
    cancelAnimationFrame(frame);
    void invoke("plugin:notes-ui|cancel_popup_menu", {
      windowLabel,
      token,
    }).catch(() => {});
  };
}
