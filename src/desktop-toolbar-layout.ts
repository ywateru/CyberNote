/** Logical points at the reference size (18px UI); both toolbars use this policy. */
export type DesktopTool =
  | "newNote"
  | "format"
  | "checklist"
  | "table"
  | "attachment"
  | "recordAudio"
  | "insertTag"
  | "share"
  | "more"
  | "viewOptions";
export const desktopToolOrder: DesktopTool[] = [
  "format",
  "checklist",
  "table",
  "attachment",
  "recordAudio",
  "insertTag",
  "share",
  "more",
];
export function desktopToolbarLayout(
  width: number,
  scale: number,
  actions: DesktopTool[],
  search = true,
  hitScale = 1,
  iconScale = 1,
) {
  const hitMin = 28 * hitScale;
  const slot = Math.max(42 * scale * hitScale, hitMin, 25 * scale * iconScale + 12);
  const settings = slot;
  const gap = 12 * scale;
  const searchMin = (width < 420 * scale ? 110 : 140) * scale;
  const searchMax = 254 * scale;
  const itemWidth = (id: DesktopTool, labels: boolean) =>
    Math.max((id === "format" ? (labels ? 60 : 48) : labels ? 54 : 42) * scale * hitScale, slot);
  const needed = (items: DesktopTool[], labels: boolean, overflow: boolean) =>
    items.reduce((sum, id) => sum + itemWidth(id, labels), 0) +
    (overflow ? slot : 0) +
    (search ? searchMin + gap : 0) +
    settings +
    gap;
  const labels = needed(actions, true, false) <= width;
  const visible = [...actions];
  const overflow: DesktopTool[] = [];
  for (const drop of [
    "insertTag",
    "recordAudio",
    "share",
    "attachment",
    "table",
    "checklist",
    "format",
    "newNote",
    "viewOptions",
  ] as DesktopTool[]) {
    if (needed(visible, labels, overflow.length > 0) <= width) break;
    const index = visible.indexOf(drop);
    if (index >= 0) {
      visible.splice(index, 1);
      overflow.push(drop);
    }
  }
  const toolsWidth =
    visible.reduce((sum, id) => sum + itemWidth(id, labels), 0) +
    (overflow.length ? slot : 0);
  return {
    labels,
    visible,
    overflow,
    widths: Object.fromEntries(
      visible.map((id) => [id, itemWidth(id, labels)]),
    ),
    searchWidth: search
      ? Math.min(
          searchMax,
          Math.max(0, width - toolsWidth - settings - gap * 2),
        )
      : 0,
  };
}
