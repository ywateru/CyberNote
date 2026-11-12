import type { Settings } from "./types";
import { parseInterfaceDetails } from "./interface-details";

export const fontSizeOptions = [
  { value: "tiny", label: "极小", interface: 12, editor: 12 },
  { value: "small", label: "小", interface: 13, editor: 14 },
  { value: "medium", label: "中", interface: 14, editor: 16 },
  { value: "large", label: "大", interface: 16, editor: 18 },
  { value: "huge", label: "极大", interface: 18, editor: 20 },
] as const;
export type FontSize = (typeof fontSizeOptions)[number]["value"];
export function fontSizeOption(value: unknown) {
  return (
    fontSizeOptions.find((option) => option.value === value) ??
    fontSizeOptions[2]
  );
}
export function fontScales(settings: Settings) {
  return {
    interface: fontSizeOption(settings.interfaceFontSize).interface / 18,
    editor: fontSizeOption(settings.editorFontSize).editor / 18,
  };
}

/** Geometry shares the typography scale; reference metrics are authored at 18px. */
export function interfaceMetrics(settings: Settings, width: number) {
  const scale = fontScales(settings).interface;
  const details = parseInterfaceDetails(settings.interfaceDetails);
  const hit = details.desktopHitScale / 100;
  const compact = width <= 1100;
  return {
    scale,
    toolbarHeight: Math.ceil(Math.max(68 * scale, 42 * scale * hit + 12, 28 * hit + 12)),
    sidebarWidth: Math.round(
      (compact
        ? Math.min(settings.sidebarWidth || 272, 220)
        : settings.sidebarWidth || 272) * scale,
    ),
    listWidth: Math.round(
      (compact
        ? Math.min(settings.listWidth || 390, 280)
        : settings.listWidth || 390) * scale,
    ),
  };
}
