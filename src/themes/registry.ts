import palettes from "./palettes.json";
import type { ThemeId } from "./appearance";
/** Registry includes every semantic role for every supported scheme. CSS is
 * generated from this same data for recovery/first paint without the bundle. */
export const ThemeRegistry = palettes satisfies Record<ThemeId, Record<"light" | "dark", Record<string, string>>>;
