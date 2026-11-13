import { invoke, isTauri } from "@tauri-apps/api/core";

// The registered native account_command/runtime is available by default.
// Browser fixtures require all three development flags; native can opt out.
export const accountUIAvailable =
  (import.meta.env.VITE_NOTES_ACCOUNT_NATIVE !== "0" && isTauri()) ||
  (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1" && import.meta.env.VITE_NOTES_ACCOUNT_UI === "1");

const networkStages = ["callbackListen", "browserOpen", "callbackReceive", "identityProvider", "coordinator", "coordinatorConfiguration", "coordinatorRegistration", "coordinatorProfile", "coordinatorEnrollment", "coordinatorJwks", "authorizationProvider", "identitySession", "identityRefresh", "identityRevocation", "coordinatorSession"] as const;
type NetworkStage = typeof networkStages[number];
const identityReasons = ["responseMetadata", "missingIdToken", "issuer", "audience", "expired", "nonce", "signingKey", "signature", "algorithm", "subject", "authorizedParty", "issuedAt", "accessTokenHash", "otherClaims"] as const;
type IdentityReason = typeof identityReasons[number];
const providerReasons = ["configuration", "network", "invalidCallback", "invalidIdentity", "identityRejected", "codeExchangeRejected", "tokenResponseInvalid", "missingRefreshToken", "cancelled", "noSession", "ownershipMismatch", "storage", "refreshFailed", "revocationFailed", "busy"] as const;
type ProviderReason = typeof providerReasons[number];
const tokenOperations = ["codeExchange", "refresh"] as const;
type TokenOperation = typeof tokenOperations[number];
const tokenFields = ["tokenType", "accessToken", "expiresIn", "scope"] as const;
type TokenField = typeof tokenFields[number];
const transportKinds = ["webrtc-direct", "iroh-direct", "cloudflare-tunnel", "unavailable", "unknown"] as const;
type TransportKind = typeof transportKinds[number];
type MappingObservation = { generation: number; sample: number; ageMs: number; enrollment: TransportKind; sync: TransportKind };
const authorizationSurfaces = ["embedded", "browser"] as const;
export type AccountAuthorizationSurface = typeof authorizationSurfaces[number];

// Frozen account109 DTO. The native singleton owns authorization and networking.
export type AccountStatus = {
  state: "signedOut" | "authorizing" | "connecting" | "ready" | "paused" | "error";
  authorizationSurface?: AccountAuthorizationSurface;
  enabled: boolean;
  profile?: { subject: string; displayName: string; username?: string };
  devices: { id: string; name: string; online: boolean; current: boolean; connected: boolean; transport?: MappingObservation }[];
  transportGeneration?: number;
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: { code: string; message: string; stage?: NetworkStage; reason?: IdentityReason; providerReason?: ProviderReason; tokenOperation?: TokenOperation; tokenField?: TokenField };
};
export type AccountCommand =
  | { type: "signIn" | "signUp"; surface?: AccountAuthorizationSurface }
  | { type: "status" | "openLoginInBrowser" | "cancel" | "signOut" | "syncNow" }
  | { type: "setEnabled"; enabled: boolean };

export function accountNetworkError(error: AccountStatus["error"]): boolean {
  return error?.code === "account_network" ||
    (error?.code === "account_authentication" && error.stage === "authorizationProvider" && error.providerReason === "network");
}
export function accountNeedsLogin(error: AccountStatus["error"]): boolean {
  return error?.code === "account_authentication" && (
    (error.stage === "identityRefresh" && error.providerReason === undefined) ||
    (error.stage === "authorizationProvider" && error.providerReason === "refreshFailed"));
}
// Fixed local explanations only. Legacy generic errors have no inferred cause.
export function accountTokenResponseMessage(error: AccountStatus["error"]): string | undefined {
  if (error?.code !== "account_auth_identity_invalid" || error.reason !== "responseMetadata" ||
    !tokenOperations.includes(error.tokenOperation as TokenOperation) || !tokenFields.includes(error.tokenField as TokenField) ||
    error.stage !== undefined || error.providerReason !== undefined) return undefined;
  const operation = error.tokenOperation === "codeExchange" ? "登录响应" : "刷新响应";
  const field = { tokenType: "授权类型", accessToken: "访问授权", expiresIn: "有效期", scope: "授权范围" }[error.tokenField!];
  return `${operation}的${field}未通过校验。请检查服务或更新应用。本机备忘录会保留。`;
}
function initialAuthorizationRetry(error: AccountStatus["error"]): boolean {
  if (!error || error.providerReason !== undefined) return false;
  return ["account_auth_callback_invalid", "account_auth_code_rejected", "account_auth_token_response_invalid", "account_auth_identity_invalid", "account_cancelled"].includes(error.code) ||
    (error.code === "account_network" && ["callbackListen", "browserOpen", "callbackReceive", "identityProvider"].includes(error.stage || "")) ||
    (error.code === "account_authentication" && error.stage === "identitySession");
}
// Polling remains status-only. This chooses an action solely for an explicit retry.
export function accountConnectionRetry(status: AccountStatus): AccountCommand {
  if (status.state !== "error") return { type: "status" };
  if (accountNeedsLogin(status.error)) return { type: "signIn" };
  if (!status.profile && initialAuthorizationRetry(status.error)) return { type: "signIn" };
  if (status.profile && (accountNetworkError(status.error) ||
    (status.enabled && status.error?.code === "account_sync_failed"))) return { type: "syncNow" };
  return { type: "status" };
}

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
  const s = record(value, ["state", "authorizationSurface", "enabled", "profile", "devices", "lastSyncAt", "pendingCount", "conflictCount", "error", "transportGeneration"]);
  if (!["signedOut", "authorizing", "connecting", "ready", "paused", "error"].includes(s.state as string)) return invalid();
  if ("authorizationSurface" in s && (s.state !== "authorizing" || !authorizationSurfaces.includes(s.authorizationSurface as AccountAuthorizationSurface))) return invalid();
  if (!Array.isArray(s.devices) || s.devices.length > 256) return invalid();
  const profile = s.profile === undefined ? undefined : record(s.profile, ["subject", "displayName", "username"]);
  const error = s.error === undefined ? undefined : record(s.error, ["code", "message", "stage", "reason", "providerReason", "tokenOperation", "tokenField"]);
  if (error?.stage !== undefined && !networkStages.includes(error.stage as NetworkStage)) return invalid();
  if (error?.reason !== undefined && !identityReasons.includes(error.reason as IdentityReason)) return invalid();
  if (error?.providerReason !== undefined && (!providerReasons.includes(error.providerReason as ProviderReason) || error.code !== "account_authentication" || error.stage !== "authorizationProvider")) return invalid();
  // Accept legacy responseMetadata without details; partial, unknown or
  // cross-branch details are invalid, never a guessed operation or field.
  if (error && ("tokenOperation" in error || "tokenField" in error) &&
    (error.code !== "account_auth_identity_invalid" || error.reason !== "responseMetadata" ||
      error.stage !== undefined || error.providerReason !== undefined ||
      !tokenOperations.includes(error.tokenOperation as TokenOperation) || !tokenFields.includes(error.tokenField as TokenField))) return invalid();
  const generation = s.transportGeneration === undefined ? undefined : count(s.transportGeneration);
  if (generation !== undefined && (generation === 0 || s.state !== "ready" || s.enabled !== true || error !== undefined)) return invalid();
  return {
    state: s.state as AccountStatus["state"], enabled: bool(s.enabled),
    ...(s.authorizationSurface === undefined ? {} : { authorizationSurface: s.authorizationSurface as AccountAuthorizationSurface }),
    profile: profile ? { subject: text(profile.subject, 1024), displayName: text(profile.displayName, 512), username: profile.username === undefined ? undefined : text(profile.username, 1024) } : undefined,
    devices: s.devices.map(value => {
      const d = record(value, ["id", "name", "online", "current", "connected", "transport"]);
      let transport: MappingObservation | undefined;
      if (d.transport !== undefined) {
        const t = record(d.transport, ["generation", "sample", "ageMs", "enrollment", "sync"]);
        if (generation === undefined || t.generation !== generation || d.current !== false || d.online !== true ||
          count(t.generation) === 0 || count(t.sample) === 0 || count(t.ageMs) > 3000 ||
          !transportKinds.includes(t.enrollment as TransportKind) || !transportKinds.includes(t.sync as TransportKind)) return invalid();
        transport = {generation, sample: t.sample as number, ageMs: t.ageMs as number, enrollment: t.enrollment as TransportKind, sync: t.sync as TransportKind};
      }
      return { id: text(d.id), name: text(d.name, 512), online: bool(d.online), current: bool(d.current), connected: bool(d.connected), ...(transport === undefined ? {} : {transport}) };
    }),
    lastSyncAt: s.lastSyncAt === undefined ? undefined : count(s.lastSyncAt),
    ...(generation === undefined ? {} : {transportGeneration: generation}),
    pendingCount: count(s.pendingCount), conflictCount: count(s.conflictCount),
    error: error ? { code: text(error.code), message: text(error.message, 1000), ...(error.stage === undefined ? {} : { stage: error.stage as NetworkStage }), ...(error.reason === undefined ? {} : { reason: error.reason as IdentityReason }), ...(error.providerReason === undefined ? {} : { providerReason: error.providerReason as ProviderReason }), ...(error.tokenOperation === undefined ? {} : { tokenOperation: error.tokenOperation as TokenOperation, tokenField: error.tokenField as TokenField }) } : undefined,
  };
}
export async function accountCommand(command: AccountCommand): Promise<AccountStatus> {
  if (!accountUIAvailable) throw Error("此构建尚未启用账户与同步。本地备忘录仍可继续编辑。");
  if (!isTauri()) throw Error("账户与同步需要在已安装的 CyberNote 应用中使用。本地备忘录仍可继续编辑。");
  // Construct an allowlisted request; tokens/URLs/debug objects never reach IPC.
  let request: AccountCommand;
  switch (command.type) {
    case "signIn": case "signUp":
      record(command, ["type", "surface"]);
      if ("surface" in command) {
        if (command.surface !== "embedded" && command.surface !== "browser") return invalid();
        request = { type: command.type, surface: command.surface };
      } else request = { type: command.type };
      break;
    case "setEnabled":
      record(command, ["type", "enabled"]);
      request = { type: "setEnabled", enabled: bool(command.enabled) }; break;
    case "status": case "openLoginInBrowser": case "cancel": case "signOut": case "syncNow":
      record(command, ["type"]);
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
