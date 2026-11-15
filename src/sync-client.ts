import { invoke, isTauri } from "@tauri-apps/api/core";
import { accessGate } from "./bridge";

export type SyncState =
  | "disabled"
  | "paused"
  | "listening"
  | "connecting"
  | "syncing"
  | "idle"
  | "error";
export type SyncPeer = {
  id: string;
  name: string;
  endpoint?: string;
  connected: boolean;
  lastSyncAt?: number;
};
export type SyncStatus = {
  state: SyncState;
  deviceName: string;
  workspaceId?: string;
  deviceId?: string;
  listenAddress?: string;
  peers: SyncPeer[];
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: string;
};
export type SyncConflict = {
  kind: "note" | "folder";
  entityId: string;
  variants: {
    digest: string;
    title: string;
    updatedAt?: number;
    deleted: boolean;
    purged: boolean;
    locked: boolean;
    attachmentCount: number;
  }[];
};
export type SyncCommand =
  | { type: "status" | "syncNow" | "stop" | "resume" | "conflicts" }
  | { type: "startHost"; deviceName: string; port: number }
  | { type: "createInvite"; endpoint: string }
  | { type: "pair"; invitation: string; deviceName: string }
  | { type: "revoke"; peerId: string }
  | {
      type: "resolve";
      kind: "note" | "folder";
      entityId: string;
      digest: string;
      keepAll: boolean;
    };
export type SyncResult = {
  status: SyncStatus;
  invitation?: string;
  conflicts?: SyncConflict[];
};
const invalid = () => {
  throw Error("同步服务返回了无效数据，请更新应用后重试");
};
function record(v: unknown, keys: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    return invalid();
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 256): string {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    return invalid();
  return v;
}
function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
    return invalid();
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") return invalid();
  return v;
}
function optional<T>(v: unknown, parse: (v: unknown) => T): T | undefined {
  return v === undefined ? undefined : parse(v);
}
function list<T>(v: unknown, max: number, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) return invalid();
  return v.map(parse);
}
export function syncEndpoint(v: unknown): string {
  const raw = text(v, 2048).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Error("请输入 ws:// 或 wss:// 同步服务地址");
  }
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw Error("请输入不含凭据和查询参数的 ws:// 或 wss:// 服务地址");
  return raw;
}
export function validateSyncResult(value: unknown): SyncResult {
  const r = record(value, ["status", "invitation", "conflicts"]);
  const s = record(r.status, [
    "state",
    "deviceName",
    "workspaceId",
    "deviceId",
    "listenAddress",
    "peers",
    "lastSyncAt",
    "pendingCount",
    "conflictCount",
    "error",
  ]);
  if (
    ![
      "disabled",
      "paused",
      "listening",
      "connecting",
      "syncing",
      "idle",
      "error",
    ].includes(s.state as string)
  )
    return invalid();
  const status: SyncStatus = {
    state: s.state as SyncState,
    deviceName: text(s.deviceName, 120),
    workspaceId: optional(s.workspaceId, text),
    deviceId: optional(s.deviceId, text),
    listenAddress: optional(s.listenAddress, (v) => text(v, 2048)),
    lastSyncAt: optional(s.lastSyncAt, count),
    pendingCount: count(s.pendingCount),
    conflictCount: count(s.conflictCount),
    error: optional(s.error, (v) => text(v, 1000)),
    peers: list(s.peers, 64, (v) => {
      const p = record(v, [
        "id",
        "name",
        "endpoint",
        "connected",
        "lastSyncAt",
      ]);
      return {
        id: text(p.id),
        name: text(p.name, 120),
        endpoint: optional(p.endpoint, (v) => text(v, 2048)),
        connected: bool(p.connected),
        lastSyncAt: optional(p.lastSyncAt, count),
      };
    }),
  };
  const conflicts = optional(r.conflicts, (v) =>
    list(v, 1024, (v) => {
      const c = record(v, ["kind", "entityId", "variants"]);
      if (c.kind !== "note" && c.kind !== "folder") return invalid();
      return {
        kind: c.kind,
        entityId: text(c.entityId),
        variants: list(c.variants, 32, (v) => {
          const b = record(v, [
            "digest",
            "title",
            "updatedAt",
            "deleted",
            "purged",
            "locked",
            "attachmentCount",
          ]);
          const digest = text(b.digest, 64);
          if (!/^[a-f0-9]{64}$/.test(digest)) return invalid();
          return {
            digest,
            title: text(b.title, 4096),
            updatedAt: optional(b.updatedAt, count),
            deleted: bool(b.deleted),
            purged: bool(b.purged),
            locked: bool(b.locked),
            attachmentCount: count(b.attachmentCount),
          };
        }),
      } as SyncConflict;
    }),
  );
  return {
    status,
    invitation: optional(r.invitation, (v) => text(v, 16384)),
    conflicts,
  };
}
export async function syncCommand(command: SyncCommand): Promise<SyncResult> {
  if (!isTauri()) throw Error("设备同步需要在已安装的备忘录应用中使用");
  // Build a fresh allowlisted payload. Never pass debug/DOM objects to IPC.
  let request: SyncCommand;
  switch (command.type) {
    case "startHost": {
      const deviceName = text(command.deviceName, 120).trim();
      if (
        !deviceName ||
        !Number.isSafeInteger(command.port) ||
        command.port < 1 ||
        command.port > 65535
      )
        throw Error("请填写设备名称和 1–65535 之间的端口");
      request = { type: command.type, deviceName, port: command.port };
      break;
    }
    case "createInvite":
      request = {
        type: command.type,
        endpoint: syncEndpoint(command.endpoint),
      };
      break;
    case "pair": {
      const deviceName = text(command.deviceName, 120).trim(),
        invitation = text(command.invitation, 16384).trim();
      if (!deviceName || !invitation) throw Error("请填写设备名称和完整配对串");
      request = { type: command.type, deviceName, invitation };
      break;
    }
    case "revoke":
      request = { type: command.type, peerId: text(command.peerId) };
      if (!request.peerId) throw Error("请选择设备");
      break;
    case "resolve":
      request = {
        type: command.type,
        kind: command.kind,
        entityId: text(command.entityId),
        digest: text(command.digest, 64),
        keepAll: bool(command.keepAll),
      };
      if (
        !["note", "folder"].includes(request.kind) ||
        !request.entityId ||
        !/^[a-f0-9]{64}$/.test(request.digest)
      )
        throw Error("请选择有效的冲突版本");
      break;
    case "status":
    case "syncNow":
    case "stop":
    case "resume":
    case "conflicts":
      request = { type: command.type };
      break;
    default:
      throw Error("未知同步指令");
  }
  try {
    return validateSyncResult(
      await invoke("sync_command", {
        command: request,
        expected: accessGate.expected(),
      }),
    );
  } catch (cause) {
    // An IPC error may contain native input. Never echo an invitation/PSK.
    if (
      cause instanceof Error &&
      cause.message === "同步服务返回了无效数据，请更新应用后重试"
    )
      throw cause;
    throw Error("同步操作未完成，请检查服务地址与连接后重试");
  }
}
