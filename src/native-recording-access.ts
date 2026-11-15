import { isTauri } from "@tauri-apps/api/core";
import { recordingAccess } from "../plugins/tauri-plugin-notes-ui/guest-js";

export interface NativeRecordingAccessError extends Error {
  code?: string;
  stage?: string;
  requestId?: string;
}

// Native diagnostics attach only these content-free stages, and only when the
// process explicitly enables them. Never copy arbitrary properties from IPC.
const diagnosticStages = new Set([
  "native_result",
  "rust_dispatch",
  "rust_wait_deadline",
  "rust_wait_receive",
  "rust_revalidate",
  "rust_delivery",
]);

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
    ) {
      const failure: NativeRecordingAccessError = Error(error.message);
      if ("code" in error && typeof error.code === "string")
        failure.code = error.code;
      if (
        "stage" in error &&
        typeof error.stage === "string" &&
        diagnosticStages.has(error.stage)
      )
        failure.stage = error.stage;
      if (
        "requestId" in error &&
        typeof error.requestId === "string" &&
        /^[1-9][0-9]{0,19}$/.test(error.requestId) &&
        BigInt(error.requestId) <= 18446744073709551615n
      )
        failure.requestId = error.requestId;
      throw failure;
    }
    throw Error("无法确认系统麦克风权限，录音未开始。");
  }
}
