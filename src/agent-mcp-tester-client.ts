import { invoke } from "@tauri-apps/api/core";
import { accessGate, native } from "./bridge";
export const testerTools = ["notes_get_capabilities", "notes_list_folders", "notes_list", "notes_search", "notes_read", "notes_create", "notes_append", "notes_update", "notes_get_operation"] as const;
export interface McpTool { name: string; description: string | null; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }
export interface TesterStart { connectionId: string; binary: string; workspaceId: string; grantId: string }
export interface TesterConnected { connectionId: string; tools: McpTool[] }
export interface TesterCalled { result: { structuredContent: Record<string, unknown>; isError?: boolean; content?: unknown[] }; elapsedMs: number }
/** Separate seam: the existing four-method AgentClient remains compatible. */
export interface McpTesterClient {
  connect(input: TesterStart): Promise<TesterConnected>;
  call(connectionId: string, tool: string, args: Record<string, unknown>): Promise<TesterCalled>;
  stop(connectionId: string): Promise<void>;
}
export class TesterError extends Error {
  constructor(code: string = "Unavailable") {
    super(({
      RecoveryCapacity: "恢复记录已达容量上限；请先复制恢复信息，本轮未发送新的写入。",
      Input: "请求无效：请检查绝对路径、工具与 JSON 参数。",
      Authority: "窗口、资料库或授权已改变，请断开后重新连接。",
      Busy: "测试连接或调用已达容量上限，请停止现有连接后重试。",
      Timeout: "MCP 调用超时，连接已停止；写入可能已提交，请核对操作回执，勿自动重试。",
      Cancelled: "连接已停止；未收到写入回执时，不能认定没有提交。",
      Protocol: "适配器协议或响应不符合约定，连接已停止。",
      Unavailable: "未能完成 MCP 连接或调用，请检查已安装适配器与宿主。写入可能已提交，勿自动重试。",
    } as Record<string, string>)[code] ?? "MCP 测试未完成，连接可能已停止。写入请核对回执，勿自动重试。");
  }
}
export function testerErrorMessage(error: unknown) { return error instanceof TesterError ? error.message : new TesterError().message; }
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function parseConnected(value: unknown, id: string): TesterConnected {
  if (!record(value) || value.connectionId !== id || !Array.isArray(value.tools) || value.tools.length !== 9) throw new TesterError("Protocol");
  const tools = value.tools.map((tool): McpTool => {
    if (!record(tool) || typeof tool.name !== "string" || !testerTools.includes(tool.name as typeof testerTools[number]) || !record(tool.inputSchema) || !record(tool.outputSchema) || (tool.description !== null && typeof tool.description !== "string")) throw new TesterError("Protocol");
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema };
  });
  if (new Set(tools.map(t => t.name)).size !== 9) throw new TesterError("Protocol");
  return { connectionId: id, tools };
}
export function parseCalled(value: unknown): TesterCalled {
  if (!record(value) || !record(value.result) || !record(value.result.structuredContent) || (value.result.isError !== undefined && typeof value.result.isError !== "boolean") || !Number.isSafeInteger(value.elapsedMs) || (value.elapsedMs as number) < 0) throw new TesterError("Protocol");
  return value as unknown as TesterCalled;
}
const owners = new Map<string, ReturnType<typeof accessGate.expected>>();
async function guarded<T>(command: string, args: Record<string, unknown>, expected: ReturnType<typeof accessGate.expected>, parse: (v: unknown) => T): Promise<T> {
  const stamp = accessGate.stamp();
  let value: unknown;
  try { value = await invoke(command, { ...args, expected }); }
  catch (error) { throw new TesterError(typeof error === "string" ? error : "Unavailable"); }
  const current = accessGate.stamp();
  if (current.generation !== stamp.generation || current.sessionId !== stamp.sessionId || current.epoch !== stamp.epoch) throw new TesterError("Authority");
  return parse(value);
}
export const mcpTesterClient: McpTesterClient = {
  async connect(input) {
    if (!native) throw new TesterError("Unavailable");
    if (!input.binary.startsWith("/") || input.binary.length > 4096 || /[\u0000-\u001f]/u.test(input.binary)) throw new TesterError("Input");
    let expected: ReturnType<typeof accessGate.expected>;
    try { expected = accessGate.expected(); } catch { throw new TesterError("Authority"); }
    owners.set(input.connectionId, expected);
    try { return await guarded("agent_tester_start", { input }, expected, v => parseConnected(v, input.connectionId)); }
    catch (error) { await this.stop(input.connectionId).catch(() => {}); throw error; }
  },
  call(connectionId, tool, args) {
    const expected = owners.get(connectionId);
    if (!expected) return Promise.reject(new TesterError("Authority"));
    if (!testerTools.includes(tool as typeof testerTools[number]) || !record(args) || new TextEncoder().encode(JSON.stringify(args)).length > 2 * 1024 * 1024 - 512) return Promise.reject(new TesterError("Input"));
    return guarded("agent_tester_call", { input: { connectionId, tool, arguments: args } }, expected, parseCalled);
  },
  async stop(connectionId) {
    const expected = owners.get(connectionId);
    if (!expected) return;
    // Cleanup uses captured authority even if the current access gate has advanced.
    try { await invoke("agent_tester_stop", { connectionId, expected }); }
    catch { throw new TesterError("Cancelled"); }
    finally { owners.delete(connectionId); }
  },
};
