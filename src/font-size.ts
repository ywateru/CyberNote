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
    // Mobile UI metrics were authored at the default (medium = 14px) preference.
    mobileInterface: fontSizeOption(settings.interfaceFontSize).interface / 14,
    editor: fontSizeOption(settings.editorFontSize).editor / 18,
  };
}

/** Width preferences are pixels, independent of typography. Only the effective
 * projection is constrained by the current window; resizing never writes it. */
export function interfaceMetrics(settings: Settings, width: number, sidebar = true) {
  const scale = fontScales(settings).interface;
  const details = parseInterfaceDetails(settings.interfaceDetails);
  const hit = details.desktopHitScale / 100;
  const editorMin = Math.min(320, Math.max(200, width - 500));
  const sidebarMin = 220;
  const listMin = 280;
  const sidebarMax = Math.max(sidebarMin, Math.min(360, width - editorMin - listMin));
  const sidebarWidth = Math.round(Math.max(sidebarMin, Math.min(sidebarMax, settings.sidebarWidth || 272)));
  const listMax = Math.max(listMin, Math.min(480, width - editorMin - (sidebar ? sidebarWidth : 0)));
  return {
    scale,
    toolbarHeight: Math.ceil(Math.max(68 * scale, 42 * scale * hit + 12, 28 * hit + 12)),
    sidebarMin, sidebarMax, listMin, listMax,
    sidebarWidth,
    listWidth: Math.round(Math.max(listMin, Math.min(listMax, settings.listWidth || 390))),
  };
}
