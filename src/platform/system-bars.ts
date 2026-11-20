export type SystemBarProjection = Readonly<{
  topColor: string;
  bottomColor: string;
  darkStatusIcons: boolean;
  darkNavigationIcons: boolean;
}>;

declare global {
  interface Window {
    NotesSystemBars?: {
      apply(
        topColor: string,
        bottomColor: string,
        darkStatusIcons: boolean,
        darkNavigationIcons: boolean,
      ): void;
    };
  }
}

let lastProjection = "";
const colorProbe = () => {
  const probe = document.createElement("span");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  return probe;
};

function normalizedColor(value: string): string | null {
  if (!value || !document.body) return null;
  const probe = colorProbe();
  try {
    probe.style.color = value;
    const resolved = getComputedStyle(probe).color;
    const match = resolved.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/,
    );
    if (!match || Number(match[4] ?? 1) === 0) return null;
    const channel = (index: number) =>
      Math.max(0, Math.min(255, Math.round(Number(match[index]))))
        .toString(16)
        .padStart(2, "0");
    return `#${channel(1)}${channel(2)}${channel(3)}`;
  } finally {
    probe.remove();
  }
}

function tokenColor(name: string): string | null {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return normalizedColor(value);
}

function surfaceColor(selector: string): string | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element || !element.getClientRects().length) return null;
  return normalizedColor(getComputedStyle(element).backgroundColor);
}

function relativeLuminance(color: string): number {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function projectAndroidSystemBars(input: {
  topSelector: string;
  bottomSelector: string;
  topToken: string;
  bottomToken: string;
}): SystemBarProjection | null {
  const topColor =
    surfaceColor(input.topSelector) ?? tokenColor(input.topToken);
  const bottomColor =
    surfaceColor(input.bottomSelector) ?? tokenColor(input.bottomToken);
  if (!topColor || !bottomColor) return null;
  return Object.freeze({
    topColor,
    bottomColor,
    darkStatusIcons: relativeLuminance(topColor) >= 0.5,
    darkNavigationIcons: relativeLuminance(bottomColor) >= 0.5,
  });
}

export function applyAndroidSystemBars(projection: SystemBarProjection): boolean {
  const key = JSON.stringify(projection);
  if (typeof window.NotesSystemBars?.apply !== "function") return false;
  if (key === lastProjection) return true;
  try {
    window.NotesSystemBars.apply(
      projection.topColor,
      projection.bottomColor,
      projection.darkStatusIcons,
      projection.darkNavigationIcons,
    );
    lastProjection = key;
    return true;
  } catch {
    // A WebView without the host bridge keeps the existing theme-color fallback.
    return false;
  }
}
