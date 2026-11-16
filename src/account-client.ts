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
const requestReasons = ["timeout", "connect", "request", "responseBody", "httpStatus", "invalidResponse"] as const;
type RequestReason = typeof requestReasons[number];
const requestStages = ["coordinatorProfile", "coordinatorEnrollment", "coordinatorJwks"];
const adoptionStages = ["probe", "prepare", "media"] as const;
type AdoptionStage = typeof adoptionStages[number];
const syncStages = ["pair", "recoverPairing", "transfer", "retirement"] as const;
type SyncStage = typeof syncStages[number];
const syncReasons = ["io", "invalid_input", "corrupt_identity", "authentication", "expired", "revoked", "workspace_mismatch", "protocol", "limit", "timeout", "stopped", "backend", "plan_stale", "busy", "transport"] as const;
type SyncReason = typeof syncReasons[number];
const errorCodes = ["account_configuration", "account_authentication", "account_auth_callback_invalid", "account_auth_identity_invalid", "account_auth_code_rejected", "account_auth_token_response_invalid", "account_auth_refresh_missing", "account_owner_workspace_mismatch", "account_network", "account_enrollment_invalid", "account_storage", "account_cancelled", "account_busy", "account_platform_unsupported", "account_cleanup_required", "account_sync_failed", "account_sync_protocol", "account_sync_adoption_blocked", "account_window_invalid", "account_device_offline", "account_device_incompatible", "account_sync_not_enabled", "account_directory_unavailable", "account_directory_unsupported"];
export type SafeError = { code: string; message: string; stage?: NetworkStage; reason?: IdentityReason; providerReason?: ProviderReason; tokenOperation?: TokenOperation; tokenField?: TokenField; requestReason?: RequestReason; httpStatus?: number; adoptionStage?: AdoptionStage; adoptionReason?: "timeout"; syncStage?: SyncStage; syncReason?: SyncReason };
const transportKinds = ["webrtc-direct", "iroh-direct", "cloudflare-tunnel", "unavailable", "unknown"] as const;
type TransportKind = typeof transportKinds[number];
type MappingObservation = { generation: number; sample: number; ageMs: number; enrollment: TransportKind; sync: TransportKind };
const authorizationSurfaces = ["embedded", "browser"] as const;
export type AccountAuthorizationSurface = typeof authorizationSurfaces[number];

// Frozen account110 DTO. The native singleton owns authorization and networking.
export const deviceDirections = ["push", "pull", "both"] as const;
export type DeviceDirection = typeof deviceDirections[number];
export type AccountDevice = { id: string; name: string; online: boolean; current: boolean; connected: boolean; syncAvailable: boolean; transport?: MappingObservation; summary?: {noteCount: number; lastNoteUpdatedAt: number | null; capturedAt: number} };
const progressStages = ["connecting", "pairing", "inventory", "receiving", "sending", "finishing"] as const;
export type DeviceProgress = {stage: typeof progressStages[number]; completed: number; total: number; bytesTransferred: number};
export type DeviceOperation = {deviceId: string; direction: DeviceDirection; phase: "running" | "succeeded" | "failed"; startedAt: number; finishedAt?: number; progress?: DeviceProgress};
export type AccountStatus = {
  state: "signedOut" | "authorizing" | "connecting" | "ready" | "paused" | "error";
  authorizationSurface?: AccountAuthorizationSurface;
  enabled: boolean;
  profile?: { subject: string; displayName: string; username?: string };
  devices: AccountDevice[];
  deviceOperation?: DeviceOperation;
  transportGeneration?: number;
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: SafeError;
};
export type AccountCommand =
  | { type: "signIn" | "signUp"; surface?: AccountAuthorizationSurface }
  | { type: "status" | "openLoginInBrowser" | "cancel" | "signOut" | "syncNow" }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "renameDevice"; name: string }
  | { type: "syncDevice"; deviceId: string; direction: DeviceDirection };

export function accountNetworkError(error: AccountStatus["error"]): boolean {
  return error?.code === "account_network" ||
    (error?.code === "account_authentication" && error.stage === "authorizationProvider" && error.providerReason === "network");
}
export function accountNeedsLogin(error: AccountStatus["error"]): boolean {
  return error?.code === "account_authentication" && (
    (error.stage === "identityRefresh" && error.providerReason === undefined) ||
    (error.stage === "authorizationProvider" && error.providerReason === "refreshFailed"));
}
// A legacy sync failure carries no evidence of an expired token. Offer an
// explicit sign-out recovery, without treating it as permission to reauthorize.
export function accountSuggestsRelogin(error: AccountStatus["error"]): boolean {
  if (!error) return false;
  try {
    const safe = validateAccountError(error);
    return safe.code === "account_sync_failed" && safe.syncStage === undefined && safe.syncReason === undefined;
  } catch { return false; }
}
// Fixed local explanations only. Legacy generic errors have no inferred cause.
export function accountTokenResponseMessage(error: AccountStatus["error"]): string | undefined {
  if (error?.code !== "account_auth_identity_invalid" || error.reason !== "responseMetadata" ||
    !tokenOperations.includes(error.tokenOperation as TokenOperation) || !tokenFields.includes(error.tokenField as TokenField) ||
    error.stage !== undefined || error.providerReason !== undefined || "requestReason" in error || "httpStatus" in error || "adoptionStage" in error || "adoptionReason" in error || "syncStage" in error || "syncReason" in error) return undefined;
  const operation = error.tokenOperation === "codeExchange" ? "登录响应" : "刷新响应";
  const field = { tokenType: "授权类型", accessToken: "访问授权", expiresIn: "有效期", scope: "授权范围" }[error.tokenField!];
  return `${operation}的${field}未通过校验。请检查服务或更新应用。本机备忘录会保留。`;
}
function initialAuthorizationRetry(error: AccountStatus["error"]): boolean {
  if (!error || error.providerReason !== undefined) return false;
  return ["account_auth_callback_invalid", "account_auth_code_rejected", "account_auth_token_response_invalid", "account_auth_identity_invalid", "account_owner_workspace_mismatch", "account_cancelled"].includes(error.code) ||
    (["account_network", "account_authentication"].includes(error.code) && error.stage === "coordinatorProfile") ||
    (error.code === "account_network" && ["callbackListen", "browserOpen", "callbackReceive", "identityProvider"].includes(error.stage || "")) ||
    (error.code === "account_authentication" && error.stage === "identitySession");
}
// Polling remains status-only. This chooses an action solely for an explicit retry.
export function accountConnectionRetry(status: AccountStatus): AccountCommand {
  if (!status.profile && status.state === "signedOut" && status.error?.code === "account_owner_workspace_mismatch") return { type: "signIn" };
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
export function deviceName(value: unknown): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return invalid();
  const name = value.trim();
  if (!name || [...name].length > 96) return invalid();
  return name;
}
function deviceId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value.toLowerCase();
}
function deviceDirection(value: unknown): DeviceDirection {
  if (!deviceDirections.includes(value as DeviceDirection)) return invalid();
  return value as DeviceDirection;
}
function bool(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
export function validateAccountError(value: unknown): SafeError {
  const error = record(value, ["code", "message", "stage", "reason", "providerReason", "tokenOperation", "tokenField", "requestReason", "httpStatus", "adoptionStage", "adoptionReason", "syncStage", "syncReason"]);
  if (!errorCodes.includes(text(error.code))) {
    text(error.message, 1000);
    if (Object.keys(error).some(key => key !== "code" && key !== "message")) return invalid();
    return {code:"unknown",message:"未知错误。账户操作未完成，本机备忘录会保留。"};
  }
  if ("syncStage" in error || "syncReason" in error) {
    if (error.code !== "account_sync_failed" || !syncStages.includes(error.syncStage as SyncStage) || !syncReasons.includes(error.syncReason as SyncReason) ||
      Object.keys(error).some(key => !["code", "message", "syncStage", "syncReason"].includes(key))) return invalid();
  }
  if (error.stage !== undefined && (!networkStages.includes(error.stage as NetworkStage) || !["account_network", "account_authentication"].includes(error.code as string))) return invalid();
  if (error.reason !== undefined && (!identityReasons.includes(error.reason as IdentityReason) || error.code !== "account_auth_identity_invalid")) return invalid();
  if (error.providerReason !== undefined && (!providerReasons.includes(error.providerReason as ProviderReason) || error.code !== "account_authentication" || error.stage !== "authorizationProvider")) return invalid();
  if ("adoptionStage" in error || "adoptionReason" in error) {
    if (error.code !== "account_sync_adoption_blocked" || !adoptionStages.includes(error.adoptionStage as AdoptionStage) || error.adoptionReason !== "timeout" ||
      Object.keys(error).some(key => !["code", "message", "adoptionStage", "adoptionReason"].includes(key))) return invalid();
  }
  // Legacy responseMetadata may omit both details; partial or cross-branch details fail closed.
  if (("tokenOperation" in error || "tokenField" in error) &&
    (error.code !== "account_auth_identity_invalid" || error.reason !== "responseMetadata" ||
      error.stage !== undefined || error.providerReason !== undefined ||
      !tokenOperations.includes(error.tokenOperation as TokenOperation) || !tokenFields.includes(error.tokenField as TokenField))) return invalid();
  if ("requestReason" in error || "httpStatus" in error) {
    if (!["account_network", "account_authentication"].includes(error.code as string) || !requestStages.includes(error.stage as string) ||
      !requestReasons.includes(error.requestReason as RequestReason) || "reason" in error || "providerReason" in error ||
      "tokenOperation" in error || "tokenField" in error) return invalid();
    if (error.requestReason === "httpStatus") {
      if (!Number.isInteger(error.httpStatus) || (error.httpStatus as number) < 100 || (error.httpStatus as number) > 599 ||
        ((error.httpStatus as number) >= 200 && (error.httpStatus as number) < 300)) return invalid();
      if ((error.code === "account_authentication") !== (error.httpStatus === 401 || error.httpStatus === 403)) return invalid();
    } else if ("httpStatus" in error) return invalid();
    else if (error.code !== "account_network") return invalid();
  }
  return { code: error.code as string, message: text(error.message, 1000),
    ...(error.stage === undefined ? {} : {stage: error.stage as NetworkStage}),
    ...(error.reason === undefined ? {} : {reason: error.reason as IdentityReason}),
    ...(error.providerReason === undefined ? {} : {providerReason: error.providerReason as ProviderReason}),
    ...(error.tokenOperation === undefined ? {} : {tokenOperation: error.tokenOperation as TokenOperation, tokenField: error.tokenField as TokenField}),
    ...(error.requestReason === undefined ? {} : {requestReason: error.requestReason as RequestReason}),
    ...(error.httpStatus === undefined ? {} : {httpStatus: error.httpStatus as number}),
    ...(error.adoptionStage === undefined ? {} : {adoptionStage: error.adoptionStage as AdoptionStage, adoptionReason: "timeout" as const}),
    ...(error.syncStage === undefined ? {} : {syncStage: error.syncStage as SyncStage, syncReason: error.syncReason as SyncReason}),
  };
}

// Only fixed labels are rendered. Neither status nor IPC message text is used as user copy.
const stageNames: Record<NetworkStage, string> = {
  callbackListen: "建立登录回跳监听", browserOpen: "打开登录页面", callbackReceive: "接收登录回跳",
  identityProvider: "连接登录服务", coordinator: "连接协调服务", coordinatorConfiguration: "读取协调服务配置",
  coordinatorRegistration: "注册账户设备", coordinatorProfile: "读取账户资料", coordinatorEnrollment: "取得设备授权凭证",
  coordinatorJwks: "读取授权公钥", authorizationProvider: "处理登录服务授权", identitySession: "恢复登录授权",
  identityRefresh: "刷新登录授权", identityRevocation: "撤销登录授权", coordinatorSession: "建立协调服务会话",
};
const syncStageNames: Record<SyncStage, string> = {pair:"配对",recoverPairing:"恢复配对",transfer:"传输",retirement:"收尾"};
const syncReasonNames: Record<SyncReason, string> = {
  io:"读写操作未完成", invalid_input:"同步请求参数无效", corrupt_identity:"同步身份数据未通过校验", authentication:"设备身份验证未通过",
  expired:"同步凭证或请求已过期", revoked:"同步授权已撤销", workspace_mismatch:"设备同步空间不一致", protocol:"设备同步协议校验未通过",
  limit:"本次同步超出支持的限制", timeout:"操作超时", stopped:"同步操作已停止", backend:"同步数据处理未完成",
  plan_stale:"同步计划已失效", busy:"已有同步操作正在处理", transport:"同步传输连接未完成",
};
export function accountErrorMessage(error: AccountStatus["error"]): string {
  if (!error) return "账户操作未完成，具体原因尚未确认。请读取账户状态后重试。本机备忘录会保留。";
  try { error = validateAccountError(error); } catch { return accountErrorMessage(undefined); }
  if (error.code === "unknown") return "未知错误。账户操作未完成，请读取账户状态后重试。本机备忘录会保留。";
  if (error.syncStage && error.syncReason) return `设备同步在${syncStageNames[error.syncStage]}阶段未完成：${syncReasonNames[error.syncReason]}。${error.syncReason === "timeout" ? "请确认两台设备保持运行且网络可用，再选择此设备重试。已接收的内容会保留。" : "本地更改仍保存在此设备。"}`;
  const token = accountTokenResponseMessage(error); if (token) return token;
  if (error.adoptionReason === "timeout") {
    const stage: Record<AdoptionStage, string> = {probe:"检查同步窗口",prepare:"保存并冻结本地更改",media:"准备附件"};
    return `开启同步时，${stage[error.adoptionStage!]}超时。当前账户仍已登录且同步暂停，本机内容会保留。请稍后重新确认开启同步。`;
  }
  const operation = error.stage ? stageNames[error.stage] : undefined;
  const at = operation ? `${operation}时` : "账户操作时";
  if (error.requestReason) {
    const messages: Record<Exclude<RequestReason, "httpStatus">, string> = {
      timeout: "请求超时，请稍后重试。", connect: "无法建立连接，请检查网络后重试。", request: "请求未能完成，请稍后重试。",
      responseBody: "无法完整读取服务响应，请稍后重试。", invalidResponse: "服务响应格式无效，请检查服务或更新应用。",
    };
    if (error.requestReason !== "httpStatus") return `${at}${messages[error.requestReason]}本机备忘录会保留。`;
    const http = error.httpStatus!;
    const explanation = http === 401 || http === 403 ? "服务拒绝了账户授权" : http === 429 ? "服务请求过于频繁，请稍后重试" : http >= 500 ? "服务暂时出错，请稍后重试" : "服务未接受请求";
    return `${at}${explanation}（HTTP ${http}）。本机备忘录会保留。`;
  }
  const fixed: Record<string, string> = {
    account_cleanup_required: "存在待撤销的登录授权，请先退出账户并完成授权清理，再重新登录。本机备忘录会保留。",
    account_owner_workspace_mismatch: "账户服务返回的身份或同步空间与本次登录信息不一致，无法继续账户同步。请重新登录；如仍有未完成的授权，可先退出账户。本机备忘录会保留。",
    account_configuration: "账户配置无效，请检查服务配置或更新应用。本机备忘录会保留。",
    account_storage: "无法安全读取或保存账户授权，请检查本机存储。本机备忘录会保留。",
    account_cancelled: "登录已取消，你可以继续使用本地备忘录。",
    account_busy: "已有账户操作正在进行，请等待该操作结束后再重试。本机备忘录会保留。",
    account_window_invalid: "当前窗口不能管理账户，请回到应用主窗口后重试。本机备忘录会保留。",
    account_platform_unsupported: "此平台暂不支持账户操作。本机备忘录仍可继续编辑。",
    account_device_offline: "目标设备已离线，本次传输未完成。请待其上线后重新选择并确认同步。",
    account_device_incompatible: "目标设备不支持本次同步协议，请更新目标设备后重新选择。",
    account_sync_not_enabled: "本机或目标设备尚未允许内容同步。请在两端允许同步后重新选择并确认。",
    account_directory_unavailable: "暂时无法读取账户设备目录，请明确刷新设备或重试连接。本机备忘录会保留。",
    account_directory_unsupported: "账户服务尚不支持设备目录，请更新服务。不会退回自动向全部设备传输，本机备忘录会保留。",
    account_sync_failed: "同步未完成。请先退出账户并重新登录，再重新开启同步。本机备忘录及附件会保留。",
    account_sync_protocol: "设备同步响应未通过校验，请检查服务或更新应用。本地更改仍会保留。",
    account_sync_adoption_blocked: "旧同步仍有未解决冲突、待应用内容或正在保存的操作。请先处理后再开启合并；当前账户已登录且同步暂停，本机内容会保留。若旧同步来自“设备同步”，可退出当前账户，再前往“设备同步”恢复并处理旧同步。若旧账户仍有待接收内容，可退出当前账户并重新登录旧账户；身份及同步空间验证通过且原同步凭证仍可用时，会恢复旧设备身份，同步仍保持暂停。请确认开启原同步空间并处理待接收内容，完成后再退出，登录目标账户并确认开启合并。",
    account_enrollment_invalid: "设备授权凭证未通过校验，请检查服务或更新应用。本机备忘录会保留。",
    account_auth_callback_invalid: "登录回跳未通过校验，请重新开始登录。本机备忘录会保留。",
    account_auth_code_rejected: "登录授权码交换被拒绝，请重新开始登录。本机备忘录会保留。",
    account_auth_refresh_missing: "登录响应缺少可续用的授权，请检查服务或更新应用。本机备忘录会保留。",
  };
  if (fixed[error.code]) return fixed[error.code];
  if (error.code === "account_authentication" && error.stage === "identitySession") return "尚未恢复可用的登录授权。请先退出账户并确认清理，再重新登录。本机备忘录会保留。";
  if (error.providerReason) {
    const provider: Record<ProviderReason, string> = {
      configuration: "登录服务配置无效", network: "登录服务请求未完成，请检查网络", invalidCallback: "登录回跳未通过校验",
      invalidIdentity: "登录身份无效", identityRejected: "登录身份校验被拒绝", codeExchangeRejected: "登录授权码交换被拒绝",
      tokenResponseInvalid: "登录授权响应无效", missingRefreshToken: "缺少可续用的登录授权", cancelled: "登录已取消",
      noSession: "没有可恢复的登录授权，请先退出账户并确认清理，再重新登录", ownershipMismatch: "登录服务返回的身份与本次授权会话不一致，请结束当前登录后重试",
      storage: "无法读取或保存登录授权", refreshFailed: "登录授权刷新被拒绝，请重新登录", revocationFailed: "登录授权撤销未完成", busy: "已有登录操作正在进行",
    };
    return `${at}${provider[error.providerReason]}。本机备忘录会保留。`;
  }
  if (["account_auth_token_response_invalid", "account_auth_identity_invalid"].includes(error.code)) {
    const reason: Record<IdentityReason, string> = {responseMetadata:"响应元数据",missingIdToken:"身份凭证完整性",issuer:"签发方",audience:"接收方",expired:"有效期",nonce:"登录事务关联",signingKey:"签名公钥",signature:"签名",algorithm:"签名算法",subject:"账户身份",authorizedParty:"授权客户端",issuedAt:"签发时间",accessTokenHash:"访问授权摘要",otherClaims:"身份声明"};
    return `登录身份响应${error.reason ? `的${reason[error.reason]}` : ""}未通过校验，请检查服务或更新应用。本机备忘录会保留。`;
  }
  if (accountNeedsLogin(error)) return `${at}登录授权已失效或未完成，请重新登录。本机备忘录会保留。`;
  if (error.code === "account_network") return `${at}网络请求未完成，请重试。本机备忘录会保留。`;
  if (error.code === "account_authentication") return `${at}账户授权未被接受，请查看账户状态后重试。本机备忘录会保留。`;
  return "账户操作未完成，具体原因尚未确认。请读取账户状态后重试。本机备忘录会保留。";
}
export function accountErrorDetails(error: AccountStatus["error"]): [string, string][] {
  if (!error) return [];
  try {
    const safe = validateAccountError(error);
    return (["code", "stage", "reason", "providerReason", "tokenOperation", "tokenField", "requestReason", "httpStatus", "adoptionStage", "adoptionReason", "syncStage", "syncReason"] as const)
      .flatMap(key => safe[key] === undefined ? [] : [[key, key === "syncStage" ? syncStageNames[safe.syncStage!] : key === "syncReason" ? syncReasonNames[safe.syncReason!] : key === "code" && safe.code === "unknown" ? "未知错误" : String(safe[key])] as [string, string]]);
  } catch { return []; }
}
// Ignore metric/device polling churn; only account state or safe error changes retire an immediate failure.
export function accountErrorStateKey(status: AccountStatus | null): string {
  return JSON.stringify(status ? {state:status.state,enabled:status.enabled,hasProfile:!!status.profile,surface:status.authorizationSurface,error:accountErrorDetails(status.error)} : null);
}
export class AccountCommandFailure extends Error {
  constructor(readonly safeError?: SafeError, kind: "unknown" | "invalidData" | "cancelPending" | "signOutPending" = "unknown") {
    super(safeError ? accountErrorMessage(safeError) : kind === "invalidData" ? invalidMessage : kind === "cancelPending" ? "取消登录尚未确认，请等待账户状态更新后重试。" : kind === "signOutPending" ? "退出账户尚未完成，请检查账户状态后重试。" : accountErrorMessage(undefined));
  }
}
export function accountIPCError(cause: unknown): SafeError | undefined {
  try {
    let value = cause;
    if (cause && typeof cause === "object" && "commit" in cause) {
      const legacy = record(cause, ["code", "message", "commit"]);
      if (legacy.commit !== null) return undefined;
      value = {code:legacy.code,message:legacy.message};
    }
    if (!value || typeof value !== "object" || !("code" in value) || !errorCodes.includes(value.code as string)) return undefined;
    const safe = validateAccountError(value);
    return {...safe,message:accountErrorMessage(safe)};
  } catch { return undefined; }
}
export function validateAccountStatus(value: unknown): AccountStatus {
  const s = record(value, ["state", "authorizationSurface", "enabled", "profile", "devices", "lastSyncAt", "pendingCount", "conflictCount", "error", "transportGeneration", "deviceOperation"]);
  if (!["signedOut", "authorizing", "connecting", "ready", "paused", "error"].includes(s.state as string)) return invalid();
  if ("authorizationSurface" in s && (s.state !== "authorizing" || !authorizationSurfaces.includes(s.authorizationSurface as AccountAuthorizationSurface))) return invalid();
  if (!Array.isArray(s.devices) || s.devices.length > 64) return invalid();
  const profile = s.profile === undefined ? undefined : record(s.profile, ["subject", "displayName", "username"]);
  const error = s.error === undefined ? undefined : validateAccountError(s.error);
  const generation = s.transportGeneration === undefined ? undefined : count(s.transportGeneration);
  if (generation !== undefined && (generation === 0 || s.state !== "ready" || s.enabled !== true || error !== undefined)) return invalid();
  const ids = new Set<string>();
  let operation: DeviceOperation | undefined;
  if (s.deviceOperation !== undefined) {
    const o = record(s.deviceOperation, ["deviceId", "direction", "phase", "startedAt", "finishedAt", "progress"]);
    if (!["running", "succeeded", "failed"].includes(o.phase as string)) return invalid();
    const startedAt = count(o.startedAt), finishedAt = o.finishedAt === undefined ? undefined : count(o.finishedAt);
    if (finishedAt !== undefined && (finishedAt < startedAt || o.phase === "running")) return invalid();
    let progress: DeviceProgress | undefined;
    if (o.progress !== undefined) {
      const p = record(o.progress, ["stage", "completed", "total", "bytesTransferred"]);
      if (!progressStages.includes(p.stage as DeviceProgress["stage"])) return invalid();
      const completed = count(p.completed), total = count(p.total);
      if (completed > total) return invalid();
      progress = {stage: p.stage as DeviceProgress["stage"], completed, total, bytesTransferred: count(p.bytesTransferred)};
    }
    operation = {deviceId: deviceId(o.deviceId), direction: deviceDirection(o.direction), phase: o.phase as DeviceOperation["phase"], startedAt, ...(finishedAt === undefined ? {} : {finishedAt}), ...(progress === undefined ? {} : {progress})};
  }
  return {
    ...(operation === undefined ? {} : {deviceOperation: operation}),
    state: s.state as AccountStatus["state"], enabled: bool(s.enabled),
    ...(s.authorizationSurface === undefined ? {} : { authorizationSurface: s.authorizationSurface as AccountAuthorizationSurface }),
    profile: profile ? { subject: text(profile.subject, 1024), displayName: text(profile.displayName, 512), username: profile.username === undefined ? undefined : text(profile.username, 1024) } : undefined,
    devices: s.devices.map(value => {
      const d = record(value, ["id", "name", "online", "current", "connected", "transport", "syncAvailable", "summary"]);
      const id = deviceId(d.id);
      if (ids.has(id.toLowerCase())) return invalid();
      ids.add(id.toLowerCase());
      let summary: AccountDevice["summary"];
      if (d.summary !== undefined) {
        const m = record(d.summary, ["noteCount", "lastNoteUpdatedAt", "capturedAt"]);
        const noteCount = count(m.noteCount);
        const lastNoteUpdatedAt = m.lastNoteUpdatedAt === null ? null : count(m.lastNoteUpdatedAt);
        if ((noteCount === 0) !== (lastNoteUpdatedAt === null)) return invalid();
        summary = {noteCount, lastNoteUpdatedAt, capturedAt: count(m.capturedAt)};
      }
      let transport: MappingObservation | undefined;
      if (d.transport !== undefined) {
        const t = record(d.transport, ["generation", "sample", "ageMs", "enrollment", "sync"]);
        if (generation === undefined || t.generation !== generation || d.current !== false || d.online !== true ||
          count(t.generation) === 0 || count(t.sample) === 0 || count(t.ageMs) > 3000 ||
          !transportKinds.includes(t.enrollment as TransportKind) || !transportKinds.includes(t.sync as TransportKind)) return invalid();
        transport = {generation, sample: t.sample as number, ageMs: t.ageMs as number, enrollment: t.enrollment as TransportKind, sync: t.sync as TransportKind};
      }
      return { id, name: text(d.name, 512), online: bool(d.online), current: bool(d.current), connected: bool(d.connected), syncAvailable: bool(d.syncAvailable), ...(summary === undefined ? {} : {summary}), ...(transport === undefined ? {} : {transport}) };
    }),
    lastSyncAt: s.lastSyncAt === undefined ? undefined : count(s.lastSyncAt),
    ...(generation === undefined ? {} : {transportGeneration: generation}),
    pendingCount: count(s.pendingCount), conflictCount: count(s.conflictCount),
    error,
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
    case "renameDevice":
      record(command, ["type", "name"]);
      request = {type: "renameDevice", name: deviceName(command.name)}; break;
    case "syncDevice":
      record(command, ["type", "deviceId", "direction"]);
      request = {type: "syncDevice", deviceId: deviceId(command.deviceId), direction: deviceDirection(command.direction)}; break;
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
    // Raw provider/IPC text is never rendered or interpreted as a network cause.
    throw new AccountCommandFailure(accountIPCError(cause), cause instanceof Error && cause.message === invalidMessage ? "invalidData" : "unknown");
  }
}
