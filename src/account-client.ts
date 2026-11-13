import { invoke, isTauri } from "@tauri-apps/api/core";

// The registered native account_command/runtime is available by default.
// Browser fixtures require all three development flags; native can opt out.
export const accountUIAvailable =
  (import.meta.env.VITE_NOTES_ACCOUNT_NATIVE !== "0" && isTauri()) ||
  (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1" && import.meta.env.VITE_NOTES_ACCOUNT_UI === "1");

const networkStages = ["callbackListen", "browserOpen", "callbackReceive", "identityProvider", "coordinator"] as const;
type NetworkStage = typeof networkStages[number];

// Frozen account109 DTO. The native singleton owns authorization and networking.
export type AccountStatus = {
  state: "signedOut" | "authorizing" | "connecting" | "ready" | "paused" | "error";
  enabled: boolean;
  profile?: { subject: string; displayName: string; username?: string };
  devices: { id: string; name: string; online: boolean; current: boolean; connected: boolean }[];
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: { code: string; message: string; stage?: NetworkStage };
};
export type AccountCommand =
  | { type: "status" | "signIn" | "signUp" | "cancel" | "signOut" | "syncNow" }
  | { type: "setEnabled"; enabled: boolean };

const invalidMessage = "账户服务返回了无效数据，请更新应用后重试";
function invalid(): never { throw Error(invalidMessage); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 256): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return invalid();
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
export function validateAccountStatus(value: unknown): AccountStatus {
  const s = record(value, ["state", "enabled", "profile", "devices", "lastSyncAt", "pendingCount", "conflictCount", "error"]);
  if (!["signedOut", "authorizing", "connecting", "ready", "paused", "error"].includes(s.state as string)) return invalid();
  if (!Array.isArray(s.devices) || s.devices.length > 256) return invalid();
  const profile = s.profile === undefined ? undefined : record(s.profile, ["subject", "displayName", "username"]);
  const error = s.error === undefined ? undefined : record(s.error, ["code", "message", "stage"]);
  if (error?.stage !== undefined && !networkStages.includes(error.stage as NetworkStage)) return invalid();
  return {
    state: s.state as AccountStatus["state"], enabled: bool(s.enabled),
    profile: profile ? { subject: text(profile.subject, 1024), displayName: text(profile.displayName, 512), username: profile.username === undefined ? undefined : text(profile.username, 1024) } : undefined,
    devices: s.devices.map(value => {
      const d = record(value, ["id", "name", "online", "current", "connected"]);
      return { id: text(d.id), name: text(d.name, 512), online: bool(d.online), current: bool(d.current), connected: bool(d.connected) };
    }),
    lastSyncAt: s.lastSyncAt === undefined ? undefined : count(s.lastSyncAt),
    pendingCount: count(s.pendingCount), conflictCount: count(s.conflictCount),
    error: error ? { code: text(error.code), message: text(error.message, 1000), ...(error.stage === undefined ? {} : { stage: error.stage as NetworkStage }) } : undefined,
  };
}
export async function accountCommand(command: AccountCommand): Promise<AccountStatus> {
  if (!accountUIAvailable) throw Error("此构建尚未启用账户与同步。本地备忘录仍可继续编辑。");
  if (!isTauri()) throw Error("账户与同步需要在已安装的 CyberNote 应用中使用。本地备忘录仍可继续编辑。");
  // Construct an allowlisted request; tokens/URLs/debug objects never reach IPC.
  let request: AccountCommand;
  switch (command.type) {
    case "setEnabled": request = { type: "setEnabled", enabled: bool(command.enabled) }; break;
    case "status": case "signIn": case "signUp": case "cancel": case "signOut": case "syncNow":
      request = { type: command.type }; break;
    default: throw Error("未知账户指令");
  }
  try { return validateAccountStatus(await invoke("account_command", { command: request })); }
  catch (cause) {
    if (cause instanceof Error && cause.message === invalidMessage) throw cause;
    // Raw provider/IPC errors may contain credentials. Only safe status DTOs are displayed.
    throw Error("账户操作未完成，请检查网络后重试。本地备忘录仍可继续编辑。");
  }
}
