import type { AgentGrant } from "./agent-client";
import { record, TesterError, testerErrorMessage, type TesterCalled } from "./agent-mcp-tester-client";
export interface BatchRow { tool: string; status: "pass" | "fail" | "skip"; detail: string; elapsedMs?: number; receipt?: Record<string, unknown> }
export interface BatchOptions {
  workspaceId: string; grant: AgentGrant; write: boolean; signal: AbortSignal;
  call(tool: string, args: Record<string, unknown>): Promise<TesterCalled>;
  report(row: BatchRow): void;
  uuid?: () => string;
}
class ToolFailure extends Error { constructor(readonly code: string) { super(code); } }
function string(value: unknown): string { if (typeof value !== "string" || !value || value.length > 8192) throw new TesterError("Protocol"); return value; }
function receipt(value: Record<string, unknown>) {
  if (value.committed !== true || !Number.isSafeInteger(value.committedRevision)) throw new TesterError("Protocol");
  string(value.noteId); string(value.operationId); string(value.committedVersion);
  return value;
}
/** No write retries or replay. All mutation targets originate in this run's create receipt. */
export async function runMcpBatch(options: BatchOptions): Promise<void> {
  const { report, signal } = options, uuid = options.uuid ?? (() => crypto.randomUUID());
  const marker = `MCP 测试笔记 · ${uuid()}`;
  const check = () => { if (signal.aborted) throw new TesterError("Cancelled"); };
  const skip = (tool: string, detail: string) => report({ tool, status: "skip", detail });
  async function step(tool: string, args: Record<string, unknown>, validate: (v: Record<string, unknown>) => string, isReceipt = false): Promise<Record<string, unknown> | null> {
    check();
    try {
      const response = await options.call(tool, args); check();
      const value = response.result.structuredContent;
      if (response.result.isError || typeof value.code === "string") throw new ToolFailure(typeof value.code === "string" ? value.code : "TOOL_ERROR");
      const detail = validate(value);
      report({ tool, status: "pass", detail, elapsedMs: response.elapsedMs, ...(isReceipt ? { receipt: value } : {}) });
      return value;
    } catch (error) {
      check();
      const denied = error instanceof ToolFailure && ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(error.code);
      report({ tool, status: denied ? "skip" : "fail", detail: error instanceof ToolFailure ? `工具返回 ${error.code.replace(/[^A-Z_]/g, "").slice(0, 80)}；未重试。` : testerErrorMessage(error) });
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
  if (!created) { for (const t of ["notes_append", "notes_update", "notes_get_operation"]) skip(t, "本轮新建未取得有效回执；不操作其他笔记，不重试。"); return; }
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
