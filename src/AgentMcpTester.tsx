import { useId, useLayoutEffect, useRef, useState } from "react";
import type { AgentGrant, AgentHostSettings } from "./agent-client";
import { mcpTesterClient, record, TesterError, testerErrorMessage, type McpTesterClient, type McpTool } from "./agent-mcp-tester-client";
import { queryMcpRecovery, recoveryState, runMcpBatch, type BatchRow, type RecoveryIntent } from "./agent-mcp-tester-runner";
import "./AgentMcpTester.css";
export interface AgentMcpTesterProps {
  binary: string; grant: AgentGrant; settings: AgentHostSettings;
  trigger: HTMLElement | null; onClose(): void;
  client?: McpTesterClient;
}
interface Row extends BatchRow { response?: string }
const bounded = (value: unknown) => {
  const text = JSON.stringify(value, null, 2);
  return text.length > 32_768 ? text.slice(0, 32_768) + "\n…显示已截断（上限 32768 字符）" : text;
};
export default function AgentMcpTester({ binary, grant, settings, trigger, onClose, client = mcpTesterClient }: AgentMcpTesterProps) {
  const id = useId(), root = useRef<HTMLElement>(null), connectButton = useRef<HTMLButtonElement>(null);
  const active = useRef<string | null>(null), epoch = useRef(0), mounted = useRef(false), working = useRef(false), abort = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [tools, setTools] = useState<McpTool[]>([]), [selected, setSelected] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}"), [write, setWrite] = useState(false), [rows, setRows] = useState<Row[]>([]);
  const stopping = useRef<Promise<void> | null>(null), closing = useRef<Promise<void> | null>(null);
  const recoveryLog = useRef<RecoveryIntent[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryIntent[]>([]);
  const latest = useRef({ onClose, client }); latest.current = { onClose, client };
  const remember = (intent: RecoveryIntent) => {
    const previous = recoveryLog.current;
    if (!previous.some(item => item.intentId === intent.intentId) && previous.length >= 100) throw new TesterError("RecoveryCapacity");
    const next = previous.some(item => item.intentId === intent.intentId) ? previous.map(item => item.intentId === intent.intentId ? intent : item) : [...previous, intent];
    recoveryLog.current = next;
    if (mounted.current) setRecoveries(next);
  };
  const append = (row: Row) => {
    if (!mounted.current) return;
    if (row.recovery) remember(row.recovery);
    setRows(old => [...old.slice(-99), row]);
  };
  const disconnect = (): Promise<void> => {
    if (stopping.current) return stopping.current;
    const ticket = ++epoch.current;
    abort.current?.abort();
    const connectionId = active.current, stopClient = latest.current.client;
    active.current = null; working.current = true;
    if (mounted.current) { setConnected(false); setBusy("正在停止并回收适配器…"); }
    // Defer even an empty stop so every reentrant caller observes the same owner.
    const pending = Promise.resolve().then(async () => {
      try { if (connectionId) await stopClient.stop(connectionId); }
      catch (cause) { if (mounted.current && ticket === epoch.current) setError(testerErrorMessage(cause)); }
      finally {
        if (ticket === epoch.current) { working.current = false; if (mounted.current) setBusy(""); }
        if (stopping.current === pending) stopping.current = null;
      }
    });
    stopping.current = pending;
    return pending;
  };
  const close = (): Promise<void> => {
    if (closing.current) return closing.current;
    const stopped = disconnect(), ticket = epoch.current;
    const pending = stopped.then(() => {
      if (mounted.current && ticket === epoch.current) latest.current.onClose();
    }).finally(() => { if (closing.current === pending) closing.current = null; });
    closing.current = pending;
    return pending;
  };
  const closeRef = useRef(close); closeRef.current = close;
  useLayoutEffect(() => {
    mounted.current = true; connectButton.current?.focus();
    const targets = () => [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest("[inert]"));
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); void closeRef.current(); }
      else if (event.key === "Tab") {
        const nodes = targets(), first = nodes[0], last = nodes.at(-1);
        if (!nodes.includes(document.activeElement as HTMLElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault(); event.stopImmediatePropagation(); (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) (targets()[0] ?? root.current)?.focus(); };
    document.addEventListener("keydown", keyboard, true); document.addEventListener("focusin", focus);
    return () => {
      mounted.current = false; epoch.current++; abort.current?.abort();
      void disconnect();
      document.removeEventListener("keydown", keyboard, true); document.removeEventListener("focusin", focus);
      queueMicrotask(() => { if (trigger?.isConnected && !trigger.closest("[inert],[hidden]") && !trigger.matches(":disabled")) trigger.focus({ preventScroll: true }); });
    };
  }, [trigger]);
  const connect = async () => {
    if (working.current || active.current || stopping.current || closing.current) return;
    const connectionId = crypto.randomUUID(), ticket = ++epoch.current;
    active.current = connectionId; working.current = true; setBusy("正在 initialize / initialized / tools/list…"); setError(""); setRows([]); setTools([]);
    try {
      const result = await client.connect({ connectionId, binary, workspaceId: settings.workspaceId, grantId: grant.grantId });
      if (!mounted.current || ticket !== epoch.current) { await client.stop(connectionId); return; }
      setTools(result.tools); setSelected(result.tools[0]?.name ?? ""); setConnected(true);
      append({ tool: "initialize → initialized → tools/list", status: "pass", detail: `真实 stdio 已连接；发现 ${result.tools.length} 个工具。` });
    } catch (cause) { if (mounted.current && ticket === epoch.current) { setError(testerErrorMessage(cause)); active.current = null; } }
    finally { if (mounted.current && ticket === epoch.current) { working.current = false; setBusy(""); } }
  };
  const execute = async (batch: boolean) => {
    if (working.current || stopping.current || closing.current || !connected || !active.current) return;
    const connectionId = active.current, ticket = epoch.current;
    const controller = new AbortController(); abort.current = controller;
    working.current = true; setBusy(batch ? "正在逐项测试…" : "正在调用工具…"); setError("");
    const current = () => mounted.current && ticket === epoch.current && !controller.signal.aborted;
    try {
      if (batch) await runMcpBatch({ workspaceId: settings.workspaceId, grant, write, signal: controller.signal,
        call: (tool, args) => client.call(connectionId, tool, args), report: row => { if (current()) append(row); } });
      else {
        let args: unknown;
        try { args = JSON.parse(argumentsText); } catch { throw new TesterError("Input"); }
        if (!record(args)) throw new TesterError("Input");
        const response = await client.call(connectionId, selected, args);
        if (current()) append({ tool: selected, status: response.result.isError ? "fail" : "pass", detail: response.result.isError ? "工具返回业务错误。" : "工具返回成功。", elapsedMs: response.elapsedMs, response: bounded(response.result) });
      }
    } catch (cause) {
      if (current()) { setError(testerErrorMessage(cause)); if (!(cause instanceof TesterError && cause.message === new TesterError("Input").message)) await disconnect(); }
    } finally { if (current()) { working.current = false; setBusy(""); } }
  };
  const recover = async (intent: RecoveryIntent) => {
    if (working.current || stopping.current || closing.current || !connected || !active.current || !intent.operationId || intent.workspaceId !== settings.workspaceId || intent.grantId !== grant.grantId) return;
    const connectionId = active.current, ticket = epoch.current, controller = new AbortController();
    abort.current = controller; working.current = true; setBusy("正在只读查询操作回执…");
    try {
      const result = await queryMcpRecovery(intent, (tool, args) => client.call(connectionId, tool, args), controller.signal);
      if (mounted.current && ticket === epoch.current && !controller.signal.aborted) append({ tool: "notes_get_operation", status: result.lookup === "committed" ? "pass" : result.lookup === "failed" ? "fail" : "skip", detail: `恢复查询：${result.lookup}；${recoveryState(result)}。`, recovery: result, receipt: result.receipt });
    } catch (cause) { if (mounted.current && ticket === epoch.current && !controller.signal.aborted) setError(testerErrorMessage(cause)); }
    finally { if (mounted.current && ticket === epoch.current) { working.current = false; setBusy(""); } }
  };
  const copyRecovery = async (intent: RecoveryIntent) => {
    const ticket = epoch.current;
    try { await navigator.clipboard.writeText(JSON.stringify(intent, null, 2)); }
    catch { if (mounted.current && ticket === epoch.current) setError("复制失败，请选择恢复信息文本手动复制。"); }
  };
  const tool = tools.find(t => t.name === selected);
  return <div className="agent-dialog-backdrop">
    <section ref={root} className="agent-dialog agent-mcp-tester" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header><h3 id={`${id}-title`}>MCP 测试程序</h3><button type="button" onClick={() => void close()}>关闭</button></header>
      <div className="agent-mcp-scroll">
        <dl className="agent-metadata"><div><dt>适配器</dt><dd>{binary}</dd></div><div><dt>资料库</dt><dd>{settings.workspaceId}</dd></div><div><dt>授权</dt><dd>{grant.clientId} · {grant.scopes.join("、")}</dd></div></dl>
        <div className="agent-actions"><button ref={connectButton} type="button" disabled={!!busy || connected} onClick={() => void connect()}>连接</button><button type="button" disabled={!active.current} onClick={() => void disconnect()}>停止 / 断开</button></div>
        <p role="status" aria-live="polite">{busy || (connected ? "已连接（真实 MCP stdio）" : "未连接")}</p>
        {error && <p className="agent-error" role="alert">{error}</p>}
        <fieldset disabled={!!busy || !connected}><legend>单项测试</legend>
          <label className="agent-field">真实工具列表<select value={selected} onChange={e => { setSelected(e.target.value); setArgumentsText("{}"); }}>{tools.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
          {tool && <details><summary>工具说明与输入 / 输出 schema</summary><p>{tool.description}</p><pre>{bounded({ inputSchema: tool.inputSchema, outputSchema: tool.outputSchema })}</pre></details>}
          <label className="agent-field">JSON 参数（手动调用会按真实授权执行，包括写入）<textarea value={argumentsText} rows={6} maxLength={200_000} spellCheck={false} onChange={e => setArgumentsText(e.target.value)} /></label>
          <button type="button" disabled={!selected} onClick={() => void execute(false)}>调用所选工具</button>
        </fieldset>
        <fieldset disabled={!!busy || !connected}><legend>自动测试</legend>
          <label className="agent-choice"><input type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} /><span>本轮显式启用读写批量测试（默认只读）</span></label>
          <p className="agent-help">只读批量每页至多 1 条，不展示已有正文。读写批量仅创建并修改带本轮 UUID 标识的测试笔记；使用 UUID 幂等键、读后 CAS、readback 和操作回执，不重试写入。权限不足将跳过。</p>
          <p className="agent-help">没有删除工具：测试笔记会留在授权目录，需自行在应用中清理。停止或超时不能证明写入未提交；保留并核对回执。</p>
          <button type="button" disabled={write && recoveries.length > 97} onClick={() => void execute(true)}>{write ? "运行读写批量（会留存测试笔记）" : "运行只读批量"}</button>
        </fieldset>
        <section aria-labelledby={`${id}-recovery`}><h3 id={`${id}-recovery`}>本对话框的写入恢复信息（最多 100 项）</h3>
          <p className="agent-help">发送前保留原工具、参数和幂等键；停止或重连不会清空。没有 operationId 时结果未知，请勿自动换新键重写。关闭对话框前请复制需要的恢复信息。</p>
          {recoveries.length > 97 && <p className="agent-help">恢复记录容量将满，已禁用新一轮批量写入；仍可查询已有 operationId。</p>}
          {recoveries.map(intent => <details key={intent.intentId}><summary>{intent.tool} · {recoveryState(intent)} · {intent.idempotencyKey}</summary>
            <pre aria-label="写入恢复信息">{bounded(intent)}</pre><div className="agent-actions"><button type="button" onClick={() => void copyRecovery(intent)}>复制完整恢复信息</button>
            <button type="button" disabled={!!busy || !connected || !intent.operationId || intent.workspaceId !== settings.workspaceId || intent.grantId !== grant.grantId} onClick={() => void recover(intent)}>只读查询 operationId</button></div>
          </details>)}
        </section>
        <section aria-labelledby={`${id}-results`}><h3 id={`${id}-results`}>逐项结果（最近 100 项）</h3><ol className="agent-mcp-results">{rows.map((row, index) => <li key={index} data-status={row.status}><strong>{({ pending: "待确认", pass: "通过", fail: "失败", skip: "跳过" })[row.status]} · {row.tool}</strong>{row.elapsedMs !== undefined && <span> · {row.elapsedMs} ms</span>}<p>{row.detail}</p>{row.receipt && <pre aria-label="操作回执">{bounded(row.receipt)}</pre>}{row.response && <pre aria-label="工具响应">{row.response}</pre>}</li>)}</ol></section>
      </div>
    </section>
  </div>;
}
