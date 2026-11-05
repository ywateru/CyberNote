import { isTauri } from "@tauri-apps/api/core";
import { recordingAccess } from "../plugins/tauri-plugin-notes-ui/guest-js";

/** Called from the single Start attempt, never at mount or app initialization. */
export async function authorizeNativeRecording(): Promise<void> {
  if (
    !isTauri() ||
    !/Mac/.test(navigator.platform) ||
    /Android|iPhone|iPad/.test(navigator.userAgent)
  )
    throw Error("当前环境不支持Mac麦克风授权预检。");
  try {
    const result = await recordingAccess();
    if (result?.status !== "authorized")
      throw Error("系统未明确允许麦克风访问，录音未开始。");
  } catch (error) {
    if (error instanceof Error) throw error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    )
      throw Error(error.message);
    throw Error("无法确认系统麦克风权限，录音未开始。");
  }
}
