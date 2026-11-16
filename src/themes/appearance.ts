import { ThemeRegistry } from "./registry";
import type { Settings } from "../types";
export const themeOptions = [
  { value: "classic", label: "Classic · 经典" },
  { value: "paper", label: "Paper · 纸感" },
  { value: "high-contrast", label: "High Contrast · 高对比" },
] as const;
export type ThemeId = typeof themeOptions[number]["value"];
export type SchemePreference = "system" | "light" | "dark";
export type AppearanceV2 = Readonly<{ version: 2; themeId: ThemeId; schemePreference: SchemePreference }>;
export class AppearanceInvalid extends Error {
  readonly code = "appearance_invalid";
  constructor(message = "外观配置无效或版本不受支持") { super(message); this.name = "AppearanceInvalid"; }
}
export function parseScheme(value: unknown): SchemePreference {
  if (value !== "system" && value !== "light" && value !== "dark") throw new AppearanceInvalid();
  return value;
}
/** Present objects are exact, complete and versioned. Never silently downgrade. */
export function parseAppearance(value: unknown): AppearanceV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppearanceInvalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 3 || !Object.hasOwn(v, "version") || !Object.hasOwn(v, "themeId") || !Object.hasOwn(v, "schemePreference") || v.version !== 2 || (typeof v.themeId !== "string" || !Object.hasOwn(ThemeRegistry, v.themeId))) throw new AppearanceInvalid();
  return Object.freeze({ version: 2, themeId: v.themeId as ThemeId, schemePreference: parseScheme(v.schemePreference) });
}
export function appearanceOf(settings: Pick<Settings, "appearance" | "theme">): AppearanceV2 {
  if (Object.hasOwn(settings, "appearance")) return parseAppearance(settings.appearance);
  return Object.freeze({ version: 2, themeId: "classic", schemePreference: settings.theme === undefined ? "system" : parseScheme(settings.theme) });
}
/** Read migration is in memory; appearance wins over a stale valid legacy projection. */
export function normalizeAppearanceSettings(value: Settings): Settings {
  if (Object.hasOwn(value, "theme")) parseScheme(value.theme);
  const appearance = appearanceOf(value);
  return { ...value, appearance, theme: appearance.schemePreference };
}
/** Every settings write migrates in one receipt. Legacy callers retain the skin
 * and change the scheme; explicit AppearanceV2 always wins within the patch. */
export function appearancePatch(current: Settings, patch: Settings): Settings {
  if (Object.hasOwn(patch, "theme")) parseScheme(patch.theme);
  const appearance = Object.hasOwn(patch, "appearance") ? parseAppearance(patch.appearance)
    : Object.hasOwn(patch, "theme") ? parseAppearance({ ...appearanceOf(current), schemePreference: patch.theme }) : appearanceOf(current);
  return { ...patch, appearance, theme: appearance.schemePreference };
}
/** Attribute-only projection. No editor, capture, settings persistence or wire owner. */
export function applyAppearance(appearance: AppearanceV2): () => void {
  const a = parseAppearance(appearance), media = matchMedia("(prefers-color-scheme: dark)"), root = document.documentElement;
  const apply = () => {
    const dark = a.schemePreference === "dark" || (a.schemePreference === "system" && media.matches);
    root.dataset.themeId = a.themeId;
    root.dataset.theme = a.schemePreference;
    root.dataset.scheme = dark ? "dark" : "light";
    root.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--paper").trim());
  };
  apply(); media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}
