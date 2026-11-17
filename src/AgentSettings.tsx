import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Folder, PhysicalFolder } from "./types";
import {
  agentClient, agentErrorMessage, agentScopes,
  parseAgentSettings, parseCreatedAgentGrant, parseCreateAgentGrant,
  type AgentClient, type AgentGrant, type AgentHostSettings, type AgentScope,
  type CreateAgentGrant,
} from "./agent-client";
import "./AgentSettings.css";
import AgentMcpTester from "./AgentMcpTester";
import type { McpTesterClient } from "./agent-mcp-tester-client";
import { FlaskConical } from "lucide-react";
import { agentSetup } from "./agent-setup";
import AgentTestSetup from "./AgentTestSetup";

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
  const [configGrantId, setConfigGrantId] = useState<string | null>(null), [binary, setBinary] = useState("");
  const [testerSession, setTesterSession] = useState<{ grant: AgentGrant; settings: AgentHostSettings; binary: string } | null>(null);
  const configSection = useRef<HTMLElement>(null);
  const setupFocus = useRef<"enabled" | "grant" | "config" | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const physicalFolders = folders.filter(physical);
  const load = useCallback(async () => {
    if (working.current || mobile) return;
    const ticket = ++generation.current;
    setLoading(true); setError("");
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
    setBusy(null); setSettings(null); setConfigGrantId(null); setDialog(false); setTester(false); setTesterSession(null);
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
    setConfigGrantId(result.grant.grantId); setDialog(false); setNotice("授权已创建。接下来填写适配器路径，复制配置或启动测试。");
    queueMicrotask(() => configSection.current?.scrollIntoView({ block: "nearest" }));
  });
  const revoke = (g: AgentGrant) => void mutate(g.grantId, async current => {
    const result = parseAgentSettings(await client.revokeGrant(g.grantId));
    if (!current()) return;
    if (result.grants.some(grant => grant.grantId === g.grantId && !grant.revoked)) throw Error();
    adopt(result); setNotice(`已撤销 ${g.clientId} 的授权。`);
    root.current?.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
  });
  const setup = agentSetup(settings, configGrantId, binary, now);
  const { grant: availableGrant, configuration } = setup;
  useLayoutEffect(() => {
    if (tester || !setupFocus.current) return;
    const target = setupFocus.current === "enabled" ? root.current?.querySelector<HTMLButtonElement>('[role="switch"]') : setupFocus.current === "config" ? configSection.current?.querySelector<HTMLInputElement>("input") : createTrigger.current;
    setupFocus.current = null;
    // The setup dialog restores its trigger during unmount. Apply the explicit
    // destination after that cleanup and after the page is no longer inert.
    queueMicrotask(() => { target?.scrollIntoView({ block: "nearest" }); target?.focus({ preventScroll: true }); });
  }, [tester]);
  useEffect(() => {
    if (testerSession && (!settings?.enabled || settings.workspaceId !== testerSession.settings.workspaceId || settings.incarnation !== testerSession.settings.incarnation || settings.hostSessionId !== testerSession.settings.hostSessionId || !settings.grants.some(grant => grant.grantId === testerSession.grant.grantId && !grant.revoked && grant.expiresAt > now))) {
      setTester(false); setTesterSession(null);
      setNotice("接入状态或授权已改变，测试连接已关闭。请重新检查设置。");
    }
  }, [testerSession, settings, now]);
  const startTester = () => {
    if (working.current) return;
    // Re-evaluate wall-clock expiry at the click, between periodic UI updates.
    const clickedAt = Date.now(); setNow(clickedAt);
    const current = agentSetup(settings, configGrantId, binary, clickedAt);
    setTesterSession(current.ready && current.grant && settings ? { grant: current.grant, settings, binary: binary.trim() } : null);
    setTester(true);
  };
  const showConfig = (grant: AgentGrant) => {
    setConfigGrantId(grant.grantId); setNotice("");
    configSection.current?.scrollIntoView({ block: "nearest" });
    configSection.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };
  const copy = async (format: "stdio" | "toml") => {
    if (!configuration) return;
    try {
      await navigator.clipboard.writeText(configuration[format]);
      if (mounted.current) setNotice(`已复制 ${format === "stdio" ? "stdio JSON" : "TOML"} 配置（仅凭据引用）。`);
    } catch { if (mounted.current) setError("未能复制，请选择下方配置文本手动复制。"); }
  };
  if (mobile) return <section className="agent-settings agent-settings-mobile"><h2>Agent 接入</h2><p>本机 MCP 接入首版仅支持桌面宿主，移动端不提供运行开关。</p>{onClose && <button type="button" onClick={onClose}>返回设置</button>}</section>;
  return <section ref={root} className="agent-settings" aria-labelledby={`${id}-title`}>
    <div className="agent-settings-shell" inert={dialog || tester}>
      <header className="agent-page-header">
        <div><h2 id={`${id}-title`} tabIndex={-1}>Agent 接入</h2><p className="agent-help">让本机 Agent 访问你授权的备忘录。</p></div>
        <button ref={testerTrigger} type="button" className="agent-primary agent-test-launch" disabled={!!busy} onClick={startTester}><FlaskConical size={17} aria-hidden="true" />启动 MCP 测试程序</button>
        {onClose && <button type="button" disabled={!!busy} onClick={onClose}>返回设置</button>}
      </header>
      <div className="agent-settings-scroll">
        {loading && <p role="status">正在加载 Agent 接入设置…</p>}
        {error && <div className="agent-error" role="alert"><p>{error}</p><button type="button" disabled={!!busy || loading} onClick={() => void load()}>重新加载</button></div>}
        <p className="agent-status" role="status" aria-live="polite">{busy ? busy === "enabled" ? "正在保存接入开关…" : busy === "create" ? "正在创建授权…" : "正在撤销授权…" : notice}</p>
        {settings && <>
          <section className="agent-section" aria-label="接入控制" aria-busy={busy === "enabled"}>
            <div className="agent-section-heading"><div><h3><span className="agent-step" aria-hidden="true">1</span>允许本机接入</h3><p className="agent-help">桌面应用需保持运行。关闭后暂停所有客户端，已有授权仍会保留。</p></div><button className="agent-toggle" type="button" role="switch" aria-label="允许本机接入" aria-checked={settings.enabled} disabled={!!busy || loading} onClick={changeEnabled}><span className="agent-toggle-track" aria-hidden="true" /><span>{settings.enabled ? "已开启" : "已关闭"}</span></button></div>
          </section>
          <section className="agent-section" aria-labelledby={`${id}-grants`}>
            <div className="agent-section-heading"><h3 id={`${id}-grants`}><span className="agent-step" aria-hidden="true">2</span>授权客户端</h3><button ref={createTrigger} type="button" disabled={!!busy || loading || !settings.enabled} onClick={() => { setDialogError(""); setDialog(true); }}>创建授权</button></div>
            <p className="agent-help">每个客户端单独设置权限、可访问的文件夹和有效期。</p>
            {!settings.enabled && <p className="agent-help">请先开启本机接入，再创建授权。</p>}
            {!settings.grants.length ? <p className="agent-empty">尚无授权客户端。创建授权后即可生成配置或测试连接。</p> : <ul className="agent-grants">{settings.grants.map(g => <li key={g.grantId} className="agent-grant">
              <div className="agent-section-heading"><strong>{g.clientId}</strong><span className="agent-badge" data-active={!g.revoked && g.expiresAt > now && settings.enabled}>{g.revoked ? "已撤销" : g.expiresAt <= now ? "已过期" : settings.enabled ? "有效" : "接入已关闭"}</span></div>
              <p className="agent-grant-summary">{g.scopes.map(scope => scopeLabels[scope]).join("、")}<span aria-hidden="true"> · </span>{g.folderIds.length} 个文件夹<span aria-hidden="true"> · </span>有效期至 {date(g.expiresAt)}</p>
              <p className="agent-help agent-folder-summary">{g.folderIds.slice(0, 3).map(folderId => physicalFolders.find(folder => folder.id === folderId)?.name ?? "当前不可见或已移除的目录").join("、")}{g.folderIds.length > 3 ? `，另有 ${g.folderIds.length - 3} 个` : ""}</p>
              <div className="agent-actions"><button type="button" disabled={!!busy || loading || g.revoked || g.expiresAt <= now} onClick={() => showConfig(g)}>查看接入配置</button><button type="button" className="agent-revoke" aria-label={`撤销 ${g.clientId}`} disabled={!!busy || loading || g.revoked} onClick={() => revoke(g)}>撤销授权</button></div>
              <details className="agent-disclosure"><summary>授权详情</summary><dl className="agent-metadata"><div><dt>权限</dt><dd>{g.scopes.join("、")}</dd></div><div><dt>目录范围</dt><dd><ul>{g.folderIds.map(folderId => <li key={folderId}>{physicalFolders.find(folder => folder.id === folderId)?.name ?? "当前不可见或已移除的目录"} <small>({folderId})</small></li>)}</ul></dd></div><div><dt>凭据引用</dt><dd>{g.credentialRef}</dd></div></dl></details>
            </li>)}</ul>}
          </section>
          <section ref={configSection} className="agent-section agent-config" aria-labelledby={`${id}-config`}>
            <h3 id={`${id}-config`}><span className="agent-step" aria-hidden="true">3</span>配置与连接</h3>
            <p className="agent-help">选择授权和适配器路径，将配置复制到 Codex 或其他支持 MCP 的客户端。也可直接从页头启动测试。</p>
            <label className="agent-field">配置使用的客户端<select value={availableGrant?.grantId ?? ""} disabled={!!busy || loading} onChange={event => { setConfigGrantId(event.target.value); setNotice(""); }}><option value="" disabled>请选择有效授权</option>{setup.grants.map(grant => <option key={grant.grantId} value={grant.grantId}>{grant.clientId}</option>)}</select></label>
            <label className="agent-field">适配器可执行文件绝对路径<input value={binary} disabled={!!busy} spellCheck={false} autoComplete="off" placeholder="填写已安装的 cybernote-mcp 绝对路径" onChange={event => { setBinary(event.target.value); setNotice(""); }} /></label>
            <p className="agent-help">填写本机已安装的 cybernote-mcp 路径。生成配置不会运行或检查文件，实际连接时才会启动适配器。</p>
            {binary.trim() && availableGrant && !configuration && <p className="agent-error">请输入以 / 开头、不含控制字符的绝对路径。</p>}
            {!availableGrant && <p className="agent-help">{setup.grants.length ? "所选授权已失效，请重新选择有效客户端。" : "请先在上一步创建有效授权。"}</p>}
            <div className="agent-actions"><button type="button" disabled={!configuration || !!busy || !settings.enabled} onClick={() => void copy("stdio")}>复制 stdio JSON</button><button type="button" disabled={!configuration || !!busy || !settings.enabled} onClick={() => void copy("toml")}>复制 TOML</button></div>
            {configuration && <details className="agent-disclosure"><summary>查看配置文本</summary><p className="agent-help">JSON 为 command/args 片段；TOML 使用 mcp_servers.cybernote。配置只包含凭据引用，不含原始凭据。</p><pre aria-label="stdio JSON 配置">{configuration.stdio}</pre><pre aria-label="TOML 配置">{configuration.toml}</pre></details>}
          </section>
          <details className="agent-section agent-disclosure">
            <summary>近期操作{settings.recentOperations.length ? `（${settings.recentOperations.length}）` : ""}</summary>
            <div className="agent-section-heading"><p className="agent-help">当前宿主内存中的调用记录，不包含笔记正文，重启后不保留。</p><button type="button" disabled={!!busy || loading} onClick={() => void load()}>刷新</button></div>
            {!settings.recentOperations.length ? <p>尚无 Agent 调用记录。</p> : <ol className="agent-operations">{settings.recentOperations.map((op, index) => <li key={index}><strong>{op.clientId}</strong><span>{op.tool} · {op.outcome}</span>{op.noteId && <span>笔记 ID：{op.noteId}</span>}<time dateTime={new Date(op.at).toISOString()}>{date(op.at)}</time></li>)}</ol>}
          </details>
          <details className="agent-section agent-disclosure"><summary>接入诊断信息</summary><dl className="agent-metadata"><div><dt>资料库</dt><dd>{settings.workspaceId}</dd></div><div><dt>宿主会话</dt><dd>{settings.hostSessionId}</dd></div></dl></details>
        </>}
      </div>
    </div>
    {tester && (testerSession ? <AgentMcpTester binary={testerSession.binary} grant={testerSession.grant} settings={testerSession.settings} trigger={testerTrigger.current} client={testerClient} onClose={() => { setTester(false); setTesterSession(null); }} /> : <AgentTestSetup setup={setup} binary={binary} onBinary={setBinary} onGrant={setConfigGrantId} onStart={startTester} onClose={() => setTester(false)} onSetup={() => { setupFocus.current = !settings?.enabled ? "enabled" : setup.grants.length ? "config" : "grant"; setTester(false); }} trigger={testerTrigger.current} />)}
    {dialog && <CreateDialog folders={physicalFolders} busy={busy === "create"} error={dialogError} onCancel={() => { if (!working.current) setDialog(false); }} onCreate={create} trigger={createTrigger.current} />}
  </section>;
}
