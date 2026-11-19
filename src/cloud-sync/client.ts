import { invoke } from "@tauri-apps/api/core";
import type { CloudClient, CloudError } from "./types";
export const cloudSyncClient: CloudClient = (context, command) =>
  invoke("cloud_sync_command", { context, command });
export function cloudError(value: unknown): CloudError {
  if (
    value &&
    typeof value === "object" &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  )
    return { code: value.code, message: value.message };
  // Never show raw transport errors, URLs or supplied credential values.
  return {
    code: "unavailable",
    message: "云同步未完成，请检查连接或重新打开设置",
  };
}
