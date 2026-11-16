import geometry from "./themes/geometry.json";
import type { CSSProperties } from "react";

declare const percent: unique symbol;
type Percent<K extends string> = number & { readonly [percent]: K };
export type MenuSpacing = "compact" | "standard" | "comfortable";
export type InterfaceDetails = Readonly<{
  version: 1;
  iconScale: Percent<"icon">;
  desktopHitScale: Percent<"desktop-hit">;
  mobileHitScale: Percent<"mobile-hit">;
  menuSpacing: MenuSpacing;
  radiusScale: Percent<"radius">;
}>;
export class InterfaceDetailsInvalid extends Error {
  readonly code = "interface_details_invalid";
  constructor(message: string) {
    super(message);
    this.name = "InterfaceDetailsInvalid";
  }
}
export const interfaceDetailRanges = {
  iconScale: { min: 80, max: 120 },
  desktopHitScale: { min: 100, max: 130 },
  mobileHitScale: { min: 100, max: 120 },
  radiusScale: { min: 0, max: 150 },
} as const;
const keys = [
  "version",
  "iconScale",
  "desktopHitScale",
  "mobileHitScale",
  "menuSpacing",
  "radiusScale",
];
/** Absence is legacy settings. Present values must be a complete versioned object. */
export function parseInterfaceDetails(value: unknown): InterfaceDetails {
  if (value === undefined) return defaultInterfaceDetails;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InterfaceDetailsInvalid("界面细节必须是完整配置对象");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(input, key))
  )
    throw new InterfaceDetailsInvalid("界面细节包含未知或缺失字段");
  if (input.version !== 1)
    throw new InterfaceDetailsInvalid("不支持此界面细节版本");
  for (const [key, range] of Object.entries(interfaceDetailRanges)) {
    const n = input[key];
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      !Number.isInteger(n) ||
      n < range.min ||
      n > range.max
    )
      throw new InterfaceDetailsInvalid(
        `界面细节 ${key} 必须是 ${range.min}–${range.max} 的整数百分比`,
      );
  }
  if (
    !["compact", "standard", "comfortable"].includes(
      String(input.menuSpacing),
    ) ||
    typeof input.menuSpacing !== "string"
  )
    throw new InterfaceDetailsInvalid("菜单间距无效");
  return Object.freeze({
    version: 1,
    iconScale: input.iconScale,
    desktopHitScale: input.desktopHitScale,
    mobileHitScale: input.mobileHitScale,
    menuSpacing: input.menuSpacing,
    radiusScale: input.radiusScale,
  }) as InterfaceDetails;
}
export const defaultInterfaceDetails: InterfaceDetails = Object.freeze({
  version: 1,
  iconScale: 100,
  desktopHitScale: 100,
  mobileHitScale: 100,
  menuSpacing: "standard",
  radiusScale: 100,
}) as InterfaceDetails;
export type InterfaceDetailVariables = CSSProperties &
  Record<`--${string}`, string>;
/** Shared by the actual product controls and the settings example. */
export function interfaceDetailVariables(
  value: unknown,
  mobile: boolean,
): InterfaceDetailVariables {
  const d = parseInterfaceDetails(value),
    hitScale = mobile ? d.mobileHitScale : d.desktopHitScale;
  const radius = (base: number) =>
    `${Math.min(24, (base * d.radiusScale) / 100)}px`;
  return {
    "--radius-scale": String(d.radiusScale / 100),
    "--interface-icon-scale": String(d.iconScale / 100),
    "--interface-icon-size": `${(20 * d.iconScale) / 100}px`,
    "--interface-hit-scale": String(hitScale / 100),
    "--interface-hit-min": `${Math.max(mobile ? 44 : 28, ((mobile ? 44 : 28) * hitScale) / 100)}px`,
    "--interface-menu-min": `${(mobile ? 44 : 28) * hitScale / 100}px`,
    "--interface-menu-extra": `${{ compact: 0, standard: 2, comfortable: 4 }[d.menuSpacing]}px`,
    "--interface-radius-button": radius(geometry.components.button),
    "--interface-radius-card": radius(geometry.components.card),
    "--interface-radius-menu": radius(geometry.components.menu),
    "--interface-radius-panel": radius(geometry.components.panel),
  };
}
