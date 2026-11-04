import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { keyboardNavigation } from "../plugins/tauri-plugin-notes-ui/guest-js";

// A Mac browser preview and independent note windows must keep their native Tab handling.
export function nativeMainKeyboardAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    /Mac/.test(navigator.platform) &&
    !/Android|iPhone|iPad/.test(navigator.userAgent) &&
    isTauri() &&
    getCurrentWindow().label === "main"
  );
}

export async function currentKeyboardNavigation(): Promise<boolean> {
  if (!nativeMainKeyboardAvailable()) throw Error("键盘导航不可用");
  const result = await keyboardNavigation();
  if (typeof result?.enabled !== "boolean") throw Error("无法读取键盘导航设置");
  return result.enabled;
}
