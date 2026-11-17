import type { AgentGrant } from "./agent-client";
import { record, TesterError, testerErrorMessage, type TesterCalled } from "./agent-mcp-tester-client";
export interface RecoveryIntent {
  intentId: string; runId: string; workspaceId: string; grantId: string;
  tool: "notes_create" | "notes_append" | "notes_update";
  arguments: Record<string, unknown>; idempotencyKey: string;
  committed?: boolean; operationId?: string; warnings?: string[];
  error?: { code: string; committed?: boolean; operationId?: string; warnings?: string[] };
  lookup?: "committed" | "pending" | "not_found" | "denied" | "failed";
  receipt?: Record<string, unknown>;
}
export interface BatchRow { tool: string; status: "pending" | "pass" | "fail" | "skip"; detail: string; elapsedMs?: number; receipt?: Record<string, unknown>; recovery?: RecoveryIntent }
export interface BatchOptions {
  workspaceId: string; grant: AgentGrant; write: boolean; signal: AbortSignal;
  call(tool: string, args: Record<string, unknown>): Promise<TesterCalled>;
  report(row: BatchRow): void;
  uuid?: () => string;
}
const writes = ["notes_create", "notes_append", "notes_update"] as const;
const codes = new Set(["HOST_UNAVAILABLE", "WORKSPACE_UNAVAILABLE", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "NOTE_BUSY", "BARRIER_BUSY", "REVISION_CONFLICT", "SCHEMA_INVALID", "LOSSY_REPLACEMENT", "CONTENT_TOO_LARGE", "CURSOR_EXPIRED", "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "TIMEOUT", "STORAGE_ERROR"]);
const knownWarnings = new Set(["WINDOW_REFRESH_REQUIRED", "WARNING_PERSIST_FAILED"]);
function warnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 32).map(v => typeof v === "string" && knownWarnings.has(v) ? v : "OTHER_WARNING"))];
}
function operationId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : undefined;
}
function metadata(value: Record<string, unknown>) {
  return {
    ...(operationId(value.operationId) ? { operationId: operationId(value.operationId) } : {}),
    ...(typeof value.committed === "boolean" ? { committed: value.committed } : {}),
    ...(Array.isArray(value.warnings) ? { warnings: warnings(value.warnings) } : {}),
  };
}
class ToolFailure extends Error {
  readonly recovery;
  constructor(value: Record<string, unknown>) {
    const code = typeof value.code === "string" && codes.has(value.code) ? value.code : "TOOL_ERROR";
    super(code); this.recovery = { code, ...metadata(value) };
  }
}
function string(value: unknown): string { if (typeof value !== "string" || !value || value.length > 8192 || /[\u0000-\u001f]/u.test(value)) throw new TesterError("Protocol"); return value; }
function receipt(value: Record<string, unknown>): Record<string, unknown> {
  if (value.committed !== true || !Number.isSafeInteger(value.committedRevision) || (value.committedRevision as number) < 0 || !operationId(value.operationId)) throw new TesterError("Protocol");
  return { operationId: value.operationId, noteId: string(value.noteId), committedRevision: value.committedRevision, committedVersion: string(value.committedVersion), committed: true, warnings: warnings(value.warnings) };
}
export function recoveryState(intent: RecoveryIntent): string {
  return intent.committed === true ? "已提交" : intent.committed === false ? "明确未提交" : "结果未知";
}
/** A single read-only lookup. Failed/pending lookups never erase the original evidence. */
export async function queryMcpRecovery(intent: RecoveryIntent, call: BatchOptions["call"], signal: AbortSignal): Promise<RecoveryIntent> {
  if (signal.aborted) throw new TesterError("Cancelled");
  if (!operationId(intent.operationId)) return intent;
  try {
    const response = await call("notes_get_operation", { operationId: intent.operationId });
    if (signal.aborted) throw new TesterError("Cancelled");
    const value = response.result.structuredContent;
    if (response.result.isError || typeof value.code === "string") {
      return { ...intent, lookup: ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(new ToolFailure(value).recovery.code) ? "denied" : "failed" };
    }
    if (value.operationId !== intent.operationId) throw new TesterError("Protocol");
    if (value.status === "pending" || value.status === "not_found") return { ...intent, lookup: value.status };
    const saved = receipt(value);
    if (intent.arguments.noteId !== undefined && saved.noteId !== intent.arguments.noteId) throw new TesterError("Protocol");
    return { ...intent, committed: true, lookup: "committed", warnings: warnings([...(intent.warnings ?? []), ...(saved.warnings as string[])]), receipt: saved };
  } catch {
    if (signal.aborted) throw new TesterError("Cancelled");
    return { ...intent, lookup: "failed" };
  }
}
/** No write retries or replay. All mutation targets originate in this run's create receipt. */
export async function runMcpBatch(options: BatchOptions): Promise<void> {
  const { report, signal } = options, uuid = options.uuid ?? (() => crypto.randomUUID());
  const runId = uuid(), marker = `MCP 测试笔记 · ${runId}`;
  const check = () => { if (signal.aborted) throw new TesterError("Cancelled"); };
  const skip = (tool: string, detail: string) => report({ tool, status: "skip", detail });
  async function step(tool: string, args: Record<string, unknown>, validate: (v: Record<string, unknown>) => string, isReceipt = false): Promise<Record<string, unknown> | null> {
    check();
    // This intent is emitted synchronously before dispatch; cancellation may only
    // suppress later results, never the already recorded original key/arguments.
    const intent: RecoveryIntent | undefined = writes.includes(tool as typeof writes[number]) ? {
      intentId: string(args.idempotencyKey), idempotencyKey: string(args.idempotencyKey),
      runId, workspaceId: options.workspaceId, grantId: options.grant.grantId,
      tool: tool as RecoveryIntent["tool"], arguments: structuredClone(args),
    } : undefined;
    if (intent) report({ tool, status: "pending", detail: "写入意图已登记；提交结果未知。停止/超时不代表未提交，勿自动重试。", recovery: intent });
    let elapsedMs: number | undefined;
    try {
      const response = await options.call(tool, args); check();
      elapsedMs = response.elapsedMs;
      const value = response.result.structuredContent;
      if (response.result.isError || typeof value.code === "string") throw new ToolFailure(value);
      const detail = validate(value);
      const saved = isReceipt ? receipt(value) : undefined;
      report({ tool, status: "pass", detail, elapsedMs, ...(saved ? { receipt: saved } : {}),
        ...(intent && saved ? { recovery: { ...intent, committed: true, operationId: saved.operationId as string, warnings: saved.warnings as string[], receipt: saved } } : {}) });
      return value;
    } catch (error) {
      check();
      const denied = error instanceof ToolFailure && ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(error.recovery.code);
      const recovery = intent ? { ...intent, ...(error instanceof ToolFailure ? { ...metadata(error.recovery), error: error.recovery } : {}) } : undefined;
      report({ tool, status: denied ? "skip" : "fail", elapsedMs,
        detail: (error instanceof ToolFailure ? `工具返回 ${error.recovery.code}；未重试。` : testerErrorMessage(error)) + (recovery ? ` ${recoveryState(recovery)}；原工具、参数及幂等键已保留。` : ""), ...(recovery ? { recovery } : {}) });
      if (recovery?.operationId) {
        const queried = await queryMcpRecovery(recovery, options.call, signal); check();
        report({ tool: "notes_get_operation", status: queried.lookup === "committed" ? "pass" : queried.lookup === "failed" ? "fail" : "skip",
          detail: `恢复查询：${queried.lookup}；${recoveryState(queried)}。后续写入停止，不重试原写入。`, recovery: queried, ...(queried.receipt ? { receipt: queried.receipt } : {}) });
      } else if (recovery) {
        report({ tool: "notes_get_operation", status: "skip", detail: "未取得有效 operationId；保留原工具、参数及幂等键，不自动重试写入。", recovery });
      }
      if (!(error instanceof ToolFailure)) throw error;
      return null;
    }
  }
  const caps = await step("notes_get_capabilities", {}, v => {
    if (v.workspaceId !== options.workspaceId || !Array.isArray(v.scopes) || !v.scopes.every(s => typeof s === "string") || v.apiVersion !== 1) throw new TesterError("Authority");
    return `资料库匹配；实际权限：${v.scopes.join("、")}`;
  });
  if (!caps) { for (const t of ["notes_list_folders", "notes_list", "notes_search", "notes_read", "notes_create", "notes_append", "notes_update", "notes_get_operation"]) skip(t, "能力检查未通过。"); return; }
  const allowed = (scope: string) => (caps.scopes as string[]).includes(scope) && options.grant.scopes.some(s => s === scope);
  let folders: Record<string, unknown> | null = null;
  if (allowed("notes:read")) {
    folders = await step("notes_list_folders", { limit: 1 }, v => { if (!Array.isArray(v.items)) throw new TesterError("Protocol"); return `返回 ${v.items.length} 个目录（每页上限 1）。`; });
    const listed = await step("notes_list", { limit: 1 }, v => { if (!Array.isArray(v.items)) throw new TesterError("Protocol"); return `返回 ${v.items.length} 条摘要；不展示已有笔记标题/正文。`; });
    await step("notes_search", { query: marker, limit: 1 }, v => { if (!Array.isArray(v.items)) throw new TesterError("Protocol"); return `搜索本轮随机标识；返回 ${v.items.length} 条。`; });
    const candidate = Array.isArray(listed?.items) && record(listed.items[0]) ? listed.items[0] : null;
    if (candidate) await step("notes_read", { noteId: string(candidate.id), format: "text" }, v => { if (v.id !== candidate.id || typeof v.content !== "string") throw new TesterError("Protocol"); string(v.version); return `读取成功；仅核对版本及分页标记，不展示已有正文。truncated=${v.truncated === true}`; });
    else skip("notes_read", "没有可读笔记。");
  } else { for (const t of ["notes_list_folders", "notes_list", "notes_search", "notes_read"]) skip(t, "授权缺少 notes:read。"); }
  if (!options.write) { for (const t of ["notes_create", "notes_append", "notes_update"]) skip(t, "默认只读模式；未执行写入。"); skip("notes_get_operation", "没有本轮写入回执可查询。"); return; }
  let folderId: string | undefined;
  if (Array.isArray(folders?.items)) folderId = folders.items.filter(record).map(f => f.id).find((id): id is string => typeof id === "string" && options.grant.folderIds.includes(id));
  if (!allowed("notes:read") || !allowed("notes:create") || !folderId) { for (const t of ["notes_create", "notes_append", "notes_update", "notes_get_operation"]) skip(t, "需要读取、新建权限及本轮确认的授权物理目录。"); return; }
  const created = await step("notes_create", { folderId, format: "text", content: marker, idempotencyKey: uuid() }, v => { receipt(v); return `已创建本轮测试笔记 ${v.noteId}；无删除工具，笔记将留存。`; }, true);
  if (!created) { for (const t of ["notes_append", "notes_update"]) skip(t, "本轮新建未取得有效回执；不操作其他笔记，不重试。"); return; }
  const noteId = string(created.noteId);
  async function verifyReceipt(mutation: Record<string, unknown>) {
    return step("notes_get_operation", { operationId: string(mutation.operationId) }, v => {
      receipt(v);
      for (const key of ["operationId", "noteId", "committedVersion", "committedRevision"]) if (v[key] !== mutation[key]) throw new TesterError("Protocol");
      return `回执匹配 ${v.operationId}`;
    }, true);
  }
  async function readback(mutation: Record<string, unknown>, expectedContent: string) {
    return step("notes_read", { noteId, format: "text" }, v => {
      if (v.id !== noteId || v.version !== mutation.committedVersion || v.truncated !== false || v.content !== expectedContent) throw new TesterError("Protocol");
      return `本轮测试笔记 readback 匹配；版本 ${string(v.version)}`;
    });
  }
  let mutation = created, content = marker;
  let verified = await verifyReceipt(mutation), read = await readback(mutation, content);
  if (!allowed("notes:update")) { skip("notes_append", "缺少 notes:update。"); skip("notes_update", "缺少 notes:update。"); return; }
  for (const tool of ["notes_append", "notes_update"]) {
    if (!verified || !read) { skip(tool, "前一步回执或 readback 未通过；停止后续写入。"); continue; }
    const text = `MCP 追加验证 · ${marker}`, replacement = `${marker}\nMCP 替换验证（仅本轮笔记）`;
    const nextContent = tool === "notes_append" ? `${content}\n${text}` : replacement;
    const next = await step(tool, { noteId, expectedVersion: string(read.version), idempotencyKey: uuid(), ...(tool === "notes_append" ? { text } : { format: "text", content: replacement }) }, v => { receipt(v); if (v.noteId !== noteId) throw new TesterError("Protocol"); return `仅修改本轮笔记 ${noteId}；未重试。`; }, true);
    if (!next) { verified = null; read = null; continue; }
    mutation = next; content = nextContent;
    verified = await verifyReceipt(mutation); read = await readback(mutation, content);
  }
}
