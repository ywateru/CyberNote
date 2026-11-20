import type { Settings } from "../types";
import { interfaceMetrics, fontSizeOption } from "../font-size";
import { presentationOf } from "./model";

export type PlatformIdentity = Readonly<{ native: boolean; android: boolean; separate: boolean }>;
export function platformIdentity(native: boolean, userAgent: string, separate: boolean): PlatformIdentity {
  return Object.freeze({ native, android: native && /Android/i.test(userAgent), separate });
}
export function interactionMode(platform: PlatformIdentity, width: number): "mobile" | "desktop" {
  return !platform.separate && (platform.android || width < 700) ? "mobile" : "desktop";
}
export function resolvePresentation(input: {
  platform: PlatformIdentity; width: number; height: number; settings: Settings;
  temporaryFocus?: boolean; nativeTop?: number; nativeToolbar?: boolean; safeAreaBottom?: number; imeHeight?: number; contentWidth?: number;
}) {
  const { platform, settings, width } = input;
  const preference = presentationOf(settings), mode = interactionMode(platform, width);
  const mobile = mode === "mobile";
  const availableWidth = input.contentWidth ?? width;
  const preferredNavigation = platform.separate ? "focus" : input.temporaryFocus ? "focus" : preference.desktop.navigation;
  const minimums = interfaceMetrics(settings, availableWidth, true);
  const threePaneMinimum = minimums.sidebarMin + minimums.listMin + minimums.editorMin;
  const twoPaneMinimum = minimums.listMin + minimums.editorMin;
  const effectiveNavigation = mobile ? preferredNavigation
    : preferredNavigation === "three-pane"
      ? availableWidth >= threePaneMinimum
        ? "three-pane"
        : availableWidth >= twoPaneMinimum
          ? "two-pane"
          : "focus"
      : preferredNavigation === "two-pane"
        ? availableWidth >= twoPaneMinimum
          ? "two-pane"
          : "focus"
        : preferredNavigation;
  const density = (mobile ? preference.mobile : preference.desktop).density;
  const spacingScale = density === "compact" ? 0.85 : density === "comfortable" ? 1.2 : 1;
  const metrics = interfaceMetrics(settings, availableWidth, effectiveNavigation === "three-pane");
  const collectionView = (mobile ? preference.mobile : preference.desktop).collectionView;
  const font = fontSizeOption(settings.interfaceFontSize).interface;
  const effectiveColumns = collectionView === "list" ? 1 : mobile
    ? Math.max(1, Math.min(4, width <= 430 && font >= 18 ? 1 : Math.floor((width - 24) / (140 * spacingScale * Math.max(1, font / 14)))))
    : Math.max(1, Math.floor((availableWidth - (effectiveNavigation === "three-pane" ? metrics.sidebarWidth : 0) - 32 + 20 * spacingScale) / (204 * spacingScale)));
  return {
    interactionMode: mode, effectiveNavigation, collectionView, density, spacingScale, effectiveColumns,
    effectiveWidths: metrics,
    availableHeight: Math.max(0, input.height - (input.nativeTop ?? 0) - (input.safeAreaBottom ?? 0) - (input.imeHeight ?? 0)),
    toolbarPolicy: mobile ? "mobile" as const : input.nativeToolbar ? "native" as const : "web" as const,
    capabilities: { directoryDrawer: !mobile && !platform.separate && effectiveNavigation === "two-pane", temporaryFocus: !mobile && !platform.separate,
      resizeSidebar: !mobile && !platform.separate && effectiveNavigation === "three-pane", resizeCollection: !mobile && !platform.separate && effectiveNavigation !== "focus",
      minimumHit: mobile ? 44 : 28 },
  };
}
export type ResolvedPresentation = ReturnType<typeof resolvePresentation>;
