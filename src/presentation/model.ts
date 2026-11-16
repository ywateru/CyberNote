import type { Settings } from "../types";

export type CollectionView = "list" | "gallery";
export type NavigationLayout = "three-pane" | "two-pane" | "focus";
export type Density = "compact" | "standard" | "comfortable";
export type PresentationV1 = Readonly<{
  version: 1;
  desktop: Readonly<{ navigation: NavigationLayout; lastNonFocusNavigation: Exclude<NavigationLayout, "focus">; collectionView: CollectionView; density: Density }>;
  mobile: Readonly<{ collectionView: CollectionView; density: Exclude<Density, "compact"> }>;
}>;
export class PresentationInvalid extends Error {
  readonly code = "presentation_invalid";
  constructor() { super("呈现配置无效或版本不受支持"); this.name = "PresentationInvalid"; }
}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new PresentationInvalid();
  return value as Record<string, unknown>;
}
export function parsePresentation(value: unknown): PresentationV1 {
  const p = exact(value, ["version", "desktop", "mobile"]);
  const d = exact(p.desktop, ["navigation", "lastNonFocusNavigation", "collectionView", "density"]);
  const m = exact(p.mobile, ["collectionView", "density"]);
  if (p.version !== 1 || !["three-pane", "two-pane", "focus"].includes(d.navigation as string)
    || !["three-pane", "two-pane"].includes(d.lastNonFocusNavigation as string)
    || !["list", "gallery"].includes(d.collectionView as string) || !["list", "gallery"].includes(m.collectionView as string)
    || !["compact", "standard", "comfortable"].includes(d.density as string) || !["standard", "comfortable"].includes(m.density as string)) throw new PresentationInvalid();
  return Object.freeze({ version: 1, desktop: Object.freeze({ ...d }), mobile: Object.freeze({ ...m }) }) as PresentationV1;
}
export function validateLegacyPresentation(settings: Settings) {
  if (Object.hasOwn(settings, "view") && settings.view !== "list" && settings.view !== "gallery") throw new PresentationInvalid();
  if (Object.hasOwn(settings, "macSidebarVisible") && typeof settings.macSidebarVisible !== "boolean") throw new PresentationInvalid();
}
export function presentationOf(settings: Settings): PresentationV1 {
  validateLegacyPresentation(settings);
  if (Object.hasOwn(settings, "presentation")) return parsePresentation(settings.presentation);
  const navigation = settings.macSidebarVisible === false ? "two-pane" : "three-pane";
  return parsePresentation({ version: 1, desktop: { navigation, lastNonFocusNavigation: navigation, collectionView: settings.view ?? "list", density: "standard" }, mobile: { collectionView: "gallery", density: "standard" } });
}
export function legacyProjection(presentation: PresentationV1) {
  const d = presentation.desktop;
  return { view: d.collectionView, macSidebarVisible: (d.navigation === "focus" ? d.lastNonFocusNavigation : d.navigation) === "three-pane" };
}
export function normalizePresentationSettings(settings: Settings): Settings {
  const presentation = presentationOf(settings);
  return { ...settings, presentation, ...legacyProjection(presentation) };
}
/** Persistence only: current must be the authoritative stored settings. UI
 * admission never expands unrelated/legacy intents from a cached snapshot. */
export function presentationPatch(current: Settings, patch: Settings): Settings {
  validateLegacyPresentation(patch);
  let presentation: PresentationV1;
  if (Object.hasOwn(patch, "presentation")) presentation = parsePresentation(patch.presentation);
  else {
    const previous = presentationOf(current), desktop = { ...previous.desktop };
    if (Object.hasOwn(patch, "view")) desktop.collectionView = patch.view!;
    if (Object.hasOwn(patch, "macSidebarVisible")) desktop.navigation = desktop.lastNonFocusNavigation = patch.macSidebarVisible ? "three-pane" : "two-pane";
    presentation = parsePresentation({ ...previous, desktop });
  }
  return { ...patch, presentation, ...legacyProjection(presentation) };
}
export function withNavigation(p: PresentationV1, navigation: NavigationLayout): PresentationV1 {
  return parsePresentation({ ...p, desktop: { ...p.desktop, navigation,
    lastNonFocusNavigation: navigation === "focus" ? (p.desktop.navigation === "focus" ? p.desktop.lastNonFocusNavigation : p.desktop.navigation) : navigation } });
}
