import { invoke } from "@tauri-apps/api/core";
import { accessGate, native } from "./bridge";

export const agentScopes = ["notes:read", "notes:create", "notes:update"] as const;
export type AgentScope = (typeof agentScopes)[number];
export interface AgentGrant {
  grantId: string;
  clientId: string;
  workspaceId: string;
  incarnation: string;
  scopes: AgentScope[];
  folderIds: string[];
  expiresAt: number;
  revocation: number;
  revoked: boolean;
  credentialRef: string;
}
export interface AgentOperation {
  clientId: string;
  tool: string;
  noteId: string | null;
  at: number;
  outcome: string;
}
export interface AgentHostSettings {
  enabled: boolean;
  hostSessionId: string;
  workspaceId: string;
  incarnation: string;
  grants: AgentGrant[];
  recentOperations: AgentOperation[];
}
export interface CreateAgentGrant {
  clientId: string;
  scopes: AgentScope[];
  folderIds: string[];
  expiresAt: number;
}
export interface AgentConnection {
  workspaceId: string;
  credentialRef: string;
  runtimeDir: string;
}
export interface CreatedAgentGrant {
  grant: AgentGrant;
  connection: AgentConnection;
}
/** Injection is a transport seam, never a persistence fallback. */
export interface AgentClient {
  settings(): Promise<AgentHostSettings>;
  setEnabled(enabled: boolean): Promise<AgentHostSettings>;
  createGrant(input: CreateAgentGrant): Promise<CreatedAgentGrant>;
  revokeGrant(grantId: string): Promise<AgentHostSettings>;
}

export class AgentClientError extends Error {
  constructor(readonly code: "unavailable" | "dto" | "access" | "host" | "input") {
    super({
      unavailable: "Agent 接入仅支持已运行的桌面原生宿主，当前环境不可用。",
      dto: "Agent 服务返回的数据不符合接口约定，请更新应用并重新加载。",
      access: "资料库访问状态已改变，请重新加载后再操作。",
      host: "Agent 宿主未完成操作，请检查桌面宿主状态并重新加载；若刚创建授权，请先查看列表，避免重复创建。",
      input: "请填写有效的客户端名称、权限、物理目录及未来的有效期。",
    }[code]);
    this.name = "AgentClientError";
  }
}
// Never surface arbitrary transport error strings: they are outside this DTO
// and may contain private paths, parameters or credentials.
export function agentErrorMessage(error: unknown): string {
  return error instanceof AgentClientError ? error.message : new AgentClientError("host").message;
}
function invalid(): never { throw new AgentClientError("dto"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) return invalid();
  return input;
}
function text(value: unknown, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return invalid();
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) return invalid();
  return value;
}
function time(value: unknown): number { return integer(value, 8_640_000_000_000_000); }
function array<T>(value: unknown, parse: (item: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value.map(parse);
}
function strings(value: unknown): string[] {
  const values = array(value, item => text(item), 256);
  if (!values.length || new Set(values).size !== values.length) return invalid();
  return values;
}
function scopes(value: unknown): AgentScope[] {
  const values = strings(value);
  if (values.some(item => !agentScopes.includes(item as AgentScope))) return invalid();
  return values as AgentScope[];
}
function grant(value: unknown): AgentGrant {
  const g = object(value, ["grantId", "clientId", "workspaceId", "incarnation", "scopes", "folderIds", "expiresAt", "revocation", "revoked", "credentialRef"]);
  return {
    grantId: text(g.grantId), clientId: text(g.clientId), workspaceId: text(g.workspaceId), incarnation: text(g.incarnation),
    scopes: scopes(g.scopes), folderIds: strings(g.folderIds), expiresAt: time(g.expiresAt),
    revocation: integer(g.revocation), revoked: bool(g.revoked), credentialRef: text(g.credentialRef),
  };
}
export function parseAgentSettings(value: unknown): AgentHostSettings {
  const s = object(value, ["enabled", "hostSessionId", "workspaceId", "incarnation", "grants", "recentOperations"]);
  const result: AgentHostSettings = {
    enabled: bool(s.enabled), hostSessionId: text(s.hostSessionId), workspaceId: text(s.workspaceId), incarnation: text(s.incarnation),
    grants: array(s.grants, grant, 256),
    recentOperations: array(s.recentOperations, item => {
      const a = object(item, ["clientId", "tool", "noteId", "at", "outcome"]);
      return { clientId: text(a.clientId), tool: text(a.tool), noteId: a.noteId === null ? null : text(a.noteId), at: time(a.at), outcome: text(a.outcome) };
    }, 200),
  };
  if (new Set(result.grants.map(g => g.grantId)).size !== result.grants.length || result.grants.some(g => g.workspaceId !== result.workspaceId || g.incarnation !== result.incarnation)) return invalid();
  return result;
}
export function parseCreatedAgentGrant(value: unknown, expected?: CreateAgentGrant): CreatedAgentGrant {
  const c = object(value, ["grant", "connection"]), connection = object(c.connection, ["workspaceId", "credentialRef", "runtimeDir"]);
  const result = {
    grant: grant(c.grant),
    connection: { workspaceId: text(connection.workspaceId), credentialRef: text(connection.credentialRef), runtimeDir: text(connection.runtimeDir, 4096) },
  };
  if (result.connection.workspaceId !== result.grant.workspaceId || result.connection.credentialRef !== result.grant.credentialRef || !result.connection.runtimeDir.startsWith("/")) return invalid();
  if (expected && (result.grant.revoked || result.grant.clientId !== expected.clientId || result.grant.expiresAt !== expected.expiresAt ||
    JSON.stringify([...result.grant.scopes].sort()) !== JSON.stringify([...expected.scopes].sort()) ||
    JSON.stringify([...result.grant.folderIds].sort()) !== JSON.stringify([...expected.folderIds].sort()))) return invalid();
  return result;
}
export function parseCreateAgentGrant(value: unknown, now = Date.now()): CreateAgentGrant {
  try {
    const i = object(value, ["clientId", "scopes", "folderIds", "expiresAt"]);
    const input = { clientId: text(i.clientId, 96).trim(), scopes: scopes(i.scopes), folderIds: strings(i.folderIds), expiresAt: time(i.expiresAt) };
    if (input.expiresAt <= now) throw new AgentClientError("input");
    return input;
  } catch { throw new AgentClientError("input"); }
}
export function agentLaunchConfig(binaryPath: string, connection: Pick<AgentConnection, "workspaceId" | "credentialRef"> & Partial<Pick<AgentConnection, "runtimeDir">>) {
  const command = text(binaryPath.trim(), 4096);
  if (!command.startsWith("/")) throw new AgentClientError("input");
  const args = ["--workspace-id", text(connection.workspaceId), "--credential-ref", text(connection.credentialRef)];
  if (connection.runtimeDir !== undefined) {
    const dir = text(connection.runtimeDir, 4096);
    if (!dir.startsWith("/")) throw new AgentClientError("input");
    args.push("--runtime-dir", dir);
  }
  return {
    stdio: JSON.stringify({ command, args }, null, 2),
    toml: `[mcp_servers.cybernote]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map(arg => JSON.stringify(arg)).join(", ")}]`,
  };
}
async function call<T>(command: string, args: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
  if (!native) throw new AgentClientError("unavailable");
  const stamp = accessGate.stamp();
  let expected: ReturnType<typeof accessGate.expected>;
  try { expected = accessGate.expected(); } catch { throw new AgentClientError("access"); }
  let result: unknown;
  try { result = await invoke<unknown>(command, { ...args, expected }); }
  catch { throw new AgentClientError("host"); }
  const current = accessGate.stamp();
  if (current.generation !== stamp.generation || current.sessionId !== stamp.sessionId || current.epoch !== stamp.epoch) throw new AgentClientError("access");
  return parse(result);
}
export const agentClient: AgentClient = {
  settings: () => call("agent_settings", {}, parseAgentSettings),
  setEnabled: enabled => {
    if (typeof enabled !== "boolean") return Promise.reject(new AgentClientError("input"));
    return call("agent_set_enabled", { enabled }, parseAgentSettings);
  },
  createGrant: value => {
    const input = parseCreateAgentGrant(value);
    return call("agent_create_grant", { input }, result => parseCreatedAgentGrant(result, input));
  },
  revokeGrant: grantId => call("agent_revoke_grant", { grantId: text(grantId) }, parseAgentSettings),
};
