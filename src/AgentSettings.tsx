import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Folder, PhysicalFolder } from "./types";
import {
  agentClient, agentErrorMessage, agentLaunchConfig, agentScopes,
  parseAgentSettings, parseCreatedAgentGrant, parseCreateAgentGrant,
  type AgentClient, type AgentGrant, type AgentHostSettings, type AgentScope,
  type CreateAgentGrant,
} from "./agent-client";
import "./AgentSettings.css";
import AgentMcpTester from "./AgentMcpTester";
import type { McpTesterClient } from "./agent-mcp-tester-client";

const scopeLabels: Record<AgentScope, string> = {
  "notes:read": "读取", "notes:create": "新建", "notes:update": "修改",
};
function physical(folder: Folder): folder is PhysicalFolder {
  return folder.kind === "default" || folder.kind === "normal" || folder.kind === "quick";
}
function date(at: number) { return new Date(at).toLocaleString("zh-CN", { hour12: false }); }
function localDate(at: number) {
  const d = new Date(at);
  return new Date(at - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export interface AgentSettingsProps {
  folders: readonly Folder[];
  /** Omit in production. Injected clients must still obey the host DTOs. */
  client?: AgentClient;
  testerClient?: McpTesterClient;
  mobile?: boolean;
  onClose?: () => void;
  returnFocus?: HTMLElement | null;
}

function CreateDialog({ folders, busy, error, onCancel, onCreate, trigger }: {
  folders: readonly PhysicalFolder[];
  busy: boolean;
  error: string;
  onCancel(): void;
  onCreate(input: CreateAgentGrant): void;
  trigger: HTMLElement | null;
}) {
  const id = useId(), root = useRef<HTMLElement>(null), name = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [selectedScopes, setScopes] = useState<AgentScope[]>([]);
  const [folderIds, setFolders] = useState<string[]>([]);
  const [expires, setExpires] = useState(() => localDate(Date.now() + 7 * 86_400_000));
  const [validation, setValidation] = useState("");
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  useLayoutEffect(() => {
    name.current?.focus();
    const targets = () => [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest("[inert]"));
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!latest.current.busy) latest.current.onCancel();
      } else if (event.key === "Tab") {
        const nodes = targets(), first = nodes[0], last = nodes.at(-1);
        if (!nodes.includes(document.activeElement as HTMLElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault(); event.stopImmediatePropagation();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) (targets()[0] ?? root.current)?.focus();
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("focusin", focus);
      queueMicrotask(() => {
        if (trigger?.isConnected && !trigger.closest("[inert],[hidden]") && !trigger.matches(":disabled")) trigger.focus({ preventScroll: true });
      });
    };
  }, [trigger]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    try {
      const input = parseCreateAgentGrant({ clientId, scopes: selectedScopes, folderIds, expiresAt: new Date(expires).getTime() });
      if (input.folderIds.some(id => !folders.some(folder => folder.id === id))) throw Error();
      setValidation(""); onCreate(input);
    } catch { setValidation("请填写名称、未来的有效期，并主动选择至少一项权限和一个物理文件夹。"); }
  };
  return <div className="agent-dialog-backdrop">
    <section ref={root} className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header><h3 id={`${id}-title`}>创建客户端授权</h3><button type="button" disabled={busy} onClick={onCancel} aria-label="关闭创建授权">关闭</button></header>
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset disabled={busy}>
          <label className="agent-field">客户端名称<input ref={name} value={clientId} maxLength={96} autoComplete="off" onChange={e => setClientId(e.target.value)} /></label>
          <label className="agent-field">有效期至<input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} /></label>
          <fieldset><legend>权限（可独立选择）</legend>{agentScopes.map(scope => <label key={scope} className="agent-choice"><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={e => setScopes(previous => e.target.checked ? [...previous, scope] : previous.filter(s => s !== scope))} /><span>{scopeLabels[scope]} <small>{scope}</small></span></label>)}</fieldset>
          <fieldset><legend>允许访问的物理文件夹</legend>
            <p className="agent-help">初始不选目录。父目录授权不包含子目录，新增子目录需另行授权。锁定和最近删除的笔记不对 Agent 开放。</p>
            {folders.length ? <div className="agent-folder-picker">{folders.map(folder => <label className="agent-choice" key={folder.id}><input type="checkbox" checked={folderIds.includes(folder.id)} onChange={e => setFolders(previous => e.target.checked ? [...previous, folder.id] : previous.filter(id => id !== folder.id))} /><span>{folder.name}<small>{folder.id}</small></span></label>)}</div> : <p>没有可授权的物理文件夹，请先创建文件夹。</p>}
          </fieldset>
        </fieldset>
        {(validation || error) && <p className="agent-error" role="alert">{validation || error}</p>}
        <footer><span role="status">{busy ? "正在创建授权，请稍候…" : "取消不会创建授权。"}</span><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="submit" className="agent-primary" disabled={busy || !folders.length}>确认创建</button></footer>
      </form>
    </section>
  </div>;
}

export default function AgentSettings({ folders, client = agentClient, testerClient, mobile = false, onClose, returnFocus }: AgentSettingsProps) {
  const id = useId(), mounted = useRef(false), generation = useRef(0), working = useRef(false);
  const root = useRef<HTMLElement>(null), createTrigger = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState<AgentHostSettings | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(""), [dialogError, setDialogError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [tester, setTester] = useState(false);
  const testerTrigger = useRef<HTMLButtonElement>(null);
  const [configGrant, setConfigGrant] = useState<AgentGrant | null>(null), [binary, setBinary] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const physicalFolders = folders.filter(physical);
  const load = useCallback(async () => {
    if (working.current || mobile) return;
    const ticket = ++generation.current;
    setLoading(true); setError(""); setConfigGrant(null);
    try {
      const result = parseAgentSettings(await client.settings());
      if (mounted.current && generation.current === ticket) setSettings(result);
    } catch (cause) {
      if (mounted.current && generation.current === ticket) { setSettings(null); setError(agentErrorMessage(cause)); }
    } finally { if (mounted.current && generation.current === ticket) setLoading(false); }
  }, [client, mobile]);
  useEffect(() => {
    mounted.current = true;
    working.current = false;
    setBusy(null); setSettings(null); setDialog(false); setTester(false);
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      mounted.current = false; generation.current++; window.clearInterval(timer);
    };
  }, [load]);
  useEffect(() => () => {
    queueMicrotask(() => {
      if (returnFocus?.isConnected && !returnFocus.closest("[inert],[hidden]") && !returnFocus.matches(":disabled")) returnFocus.focus({ preventScroll: true });
    });
  }, [returnFocus]);
  const mutate = async (key: string, action: (current: () => boolean) => Promise<void>) => {
    if (working.current || loading || !settings) return;
    working.current = true; setBusy(key); setError(""); setDialogError(""); setNotice("");
    const ticket = generation.current;
    try { await action(() => mounted.current && ticket === generation.current); }
    catch (cause) { if (mounted.current && ticket === generation.current) (key === "create" ? setDialogError : setError)(agentErrorMessage(cause)); }
    finally {
      if (ticket === generation.current) working.current = false;
      if (mounted.current && ticket === generation.current) setBusy(null);
    }
  };
  const adopt = (result: AgentHostSettings) => {
    if (result.workspaceId !== settings!.workspaceId || result.incarnation !== settings!.incarnation) throw Error();
    setSettings(result);
    setNow(Date.now());
    if (configGrant && !result.grants.some(g => g.grantId === configGrant.grantId && !g.revoked && g.expiresAt > Date.now())) setConfigGrant(null);
  };
  const changeEnabled = () => void mutate("enabled", async current => {
    const enabled = !settings!.enabled;
    const result = parseAgentSettings(await client.setEnabled(enabled));
    if (current()) {
      if (result.enabled !== enabled) throw Error();
      adopt(result);
    }
  });
  const create = (input: CreateAgentGrant) => void mutate("create", async current => {
    if (!settings!.enabled || input.folderIds.some(folderId => !physicalFolders.some(folder => folder.id === folderId))) throw Error();
    const result = parseCreatedAgentGrant(await client.createGrant(input), input);
    if (!current()) return;
    if (result.grant.workspaceId !== settings!.workspaceId || result.grant.incarnation !== settings!.incarnation || result.connection.runtimeDir !== settings!.runtimeDir) throw Error();
    setSettings(previous => previous && { ...previous, grants: [...previous.grants.filter(g => g.grantId !== result.grant.grantId), result.grant] });
    setConfigGrant(result.grant); setDialog(false); setNotice("授权已创建。配置只包含凭据引用。");
  });
  const revoke = (g: AgentGrant) => void mutate(g.grantId, async current => {
    const result = parseAgentSettings(await client.revokeGrant(g.grantId));
    if (!current()) return;
    if (result.grants.some(grant => grant.grantId === g.grantId && !grant.revoked)) throw Error();
    adopt(result); setNotice(`已撤销 ${g.clientId} 的授权。`);
    root.current?.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
  });
  const availableGrant = configGrant && !configGrant.revoked && configGrant.expiresAt > now ? configGrant : null;
  useEffect(() => {
    if (tester && !availableGrant) {
      setTester(false);
      queueMicrotask(() => root.current?.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true }));
    }
  }, [tester, availableGrant]);
  let configuration: ReturnType<typeof agentLaunchConfig> | null = null;
  if (availableGrant && settings && binary.trim()) {
    try { configuration = agentLaunchConfig(binary, {
      workspaceId: availableGrant.workspaceId, credentialRef: availableGrant.credentialRef,
      runtimeDir: settings.runtimeDir,
    }); } catch { /* Inline path guidance below; never emit a placeholder config. */ }
  }
  const copy = async (format: "stdio" | "toml") => {
    if (!configuration) return;
    try {
      await navigator.clipboard.writeText(configuration[format]);
      if (mounted.current) setNotice(`已复制 ${format === "stdio" ? "stdio JSON" : "TOML"} 配置（仅凭据引用）。`);
    } catch { if (mounted.current) setError("未能复制，请选择下方配置文本手动复制。"); }
  };
  if (mobile) return <section className="agent-settings"><h2>Agent 接入</h2><p>本机 MCP 接入首版仅支持桌面宿主，移动端不提供运行开关。</p>{onClose && <button type="button" onClick={onClose}>返回设置</button>}</section>;
  return <section ref={root} className="agent-settings" aria-labelledby={`${id}-title`}>
    <div inert={dialog || !!(tester && settings && availableGrant)}>
      <header className="agent-page-header"><div><h2 id={`${id}-title`} tabIndex={-1}>Agent 接入</h2><p className="agent-help">允许本机 Agent 在明确授权的目录中访问备忘录。默认关闭；桌面宿主需保持运行。</p></div>{onClose && <button type="button" disabled={!!busy} onClick={onClose}>返回设置</button>}</header>
      {loading && <p role="status">正在加载 Agent 接入设置…</p>}
      {error && <div className="agent-error" role="alert"><p>{error}</p><button type="button" disabled={!!busy || loading} onClick={() => void load()}>重新加载</button></div>}
      <p className="agent-status" role="status" aria-live="polite">{busy ? busy === "enabled" ? "正在保存接入开关…" : busy === "create" ? "正在创建授权…" : "正在撤销授权…" : notice}</p>
      {settings && <>
        <section className="agent-section" aria-label="接入控制" aria-busy={busy === "enabled"}>
          <div className="agent-section-heading"><div><h3>允许 Agent 接入</h3><p className="agent-help">关闭后暂停所有客户端接入，已有授权仍保留，可单独撤销。</p></div><button type="button" role="switch" aria-checked={settings.enabled} disabled={!!busy || loading} onClick={changeEnabled}>{settings.enabled ? "已开启" : "已关闭"}</button></div>
          <dl className="agent-metadata"><div><dt>资料库</dt><dd>{settings.workspaceId}</dd></div><div><dt>宿主会话</dt><dd>{settings.hostSessionId}</dd></div></dl>
        </section>
        <section className="agent-section" aria-labelledby={`${id}-grants`}>
          <div className="agent-section-heading"><h3 id={`${id}-grants`}>授权客户端</h3><button ref={createTrigger} type="button" className="agent-primary" disabled={!!busy || loading || !settings.enabled} onClick={() => { setDialogError(""); setDialog(true); }}>创建授权</button></div>
          {!settings.enabled && <p className="agent-help">请先开启接入，再创建授权。</p>}
          {!settings.grants.length ? <p>尚无授权客户端。开启接入后，可为单个客户端选择权限和目录。</p> : <ul className="agent-grants">{settings.grants.map(g => <li key={g.grantId} className="agent-grant">
            <div className="agent-section-heading"><strong>{g.clientId}</strong><span className="agent-badge">{g.revoked ? "已撤销" : g.expiresAt <= now ? "已过期" : settings.enabled ? "有效" : "接入已关闭"}</span></div>
            <dl className="agent-metadata"><div><dt>有效期至</dt><dd>{date(g.expiresAt)}</dd></div><div><dt>权限</dt><dd>{g.scopes.map(scope => `${scopeLabels[scope]} (${scope})`).join("、")}</dd></div><div><dt>目录范围</dt><dd><ul>{g.folderIds.map(folderId => <li key={folderId}>{physicalFolders.find(folder => folder.id === folderId)?.name ?? "当前不可见或已移除的目录"} <small>({folderId})</small></li>)}</ul></dd></div><div><dt>凭据引用</dt><dd>{g.credentialRef}</dd></div></dl>
            <div className="agent-actions"><button type="button" disabled={!!busy || loading || g.revoked || g.expiresAt <= now} onClick={() => { setConfigGrant(g); setNotice(""); }}>查看接入配置</button><button type="button" className="agent-revoke" aria-label={`撤销 ${g.clientId}`} disabled={!!busy || loading || g.revoked} onClick={() => revoke(g)}>撤销授权</button></div>
          </li>)}</ul>}
        </section>
        {availableGrant && <section className="agent-section agent-config" aria-labelledby={`${id}-config`}>
          <h3 id={`${id}-config`}>{availableGrant.clientId} 的接入配置</h3>
          <label className="agent-field">适配器可执行文件绝对路径<input value={binary} spellCheck={false} autoComplete="off" placeholder="填写已安装的 cybernote-mcp 绝对路径" onChange={e => { setBinary(e.target.value); setNotice(""); }} /></label>
          <div className="agent-actions"><button ref={testerTrigger} type="button" disabled={!!busy || loading || !settings.enabled || !configuration} onClick={() => setTester(true)}>启动 MCP 测试程序</button></div>
          <p className="agent-help">本页不安装或检测适配器。未安装 cybernote-mcp 时配置不可运行；填写路径也不代表文件已存在。桌面宿主必须保持运行。</p>
          {binary.trim() && !configuration && <p className="agent-error">请输入以 / 开头、不含控制字符的绝对路径。</p>}
          <div className="agent-actions"><button type="button" disabled={!configuration || !!busy} onClick={() => void copy("stdio")}>复制 stdio JSON</button><button type="button" disabled={!configuration || !!busy} onClick={() => void copy("toml")}>复制 TOML</button></div>
          {configuration && <><p className="agent-help">stdio JSON 为 command/args 片段；TOML 使用 mcp_servers.cybernote。客户端外层配置方式依其实际支持而定。以下仅包含凭据引用，不含原始凭据。</p><pre aria-label="stdio JSON 配置">{configuration.stdio}</pre><pre aria-label="TOML 配置">{configuration.toml}</pre></>}
        </section>}
        <section className="agent-section" aria-labelledby={`${id}-operations`}>
          <div className="agent-section-heading"><h3 id={`${id}-operations`}>近期操作</h3><button type="button" disabled={!!busy || loading} onClick={() => void load()}>刷新</button></div>
          <p className="agent-help">仅显示客户端、工具、笔记 ID、时间和结果，不包含笔记正文。记录来自当前宿主内存，不是永久审计历史。</p>
          {!settings.recentOperations.length ? <p>尚无 Agent 调用记录。</p> : <ol className="agent-operations">{settings.recentOperations.map((op, index) => <li key={index}><strong>{op.clientId}</strong><span>{op.tool} · {op.outcome}</span>{op.noteId && <span>笔记 ID：{op.noteId}</span>}<time dateTime={new Date(op.at).toISOString()}>{date(op.at)}</time></li>)}</ol>}
        </section>
      </>}
    </div>
    {tester && settings && availableGrant && <AgentMcpTester binary={binary.trim()} grant={availableGrant} settings={settings} trigger={testerTrigger.current} client={testerClient} onClose={() => setTester(false)} />}
    {dialog && <CreateDialog folders={physicalFolders} busy={busy === "create"} error={dialogError} onCancel={() => { if (!working.current) setDialog(false); }} onCreate={create} trigger={createTrigger.current} />}
  </section>;
}
