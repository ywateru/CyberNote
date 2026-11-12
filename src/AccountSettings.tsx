import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserRound, Laptop, Smartphone } from "lucide-react";
import { accountCommand, type AccountCommand, type AccountStatus } from "./account-client";
import { formatFileTime } from "./data-management";
import "./AccountSettings.css";

export type AccountSettingsHandle = {
  dismiss: () => boolean;
  run: (command: AccountCommand) => Promise<void>;
  inspect: () => { status: AccountStatus | null; busy: boolean; error: string; confirmation: boolean };
};
const states: Record<AccountStatus["state"], string> = {
  signedOut: "未登录", authorizing: "正在等待登录", connecting: "正在连接账户设备",
  ready: "账户连接可用", paused: "同步已暂停", error: "账户或同步需要处理",
};
function accountError(error: AccountStatus["error"]) {
  if (!error) return "账户连接未完成，请检查网络后重试。";
  if (/owner|workspace|bound/i.test(error.code)) return "此资料库已关联其他账户或手工同步空间，无法与当前账户合并。请退出后登录原账户；本机备忘录会保留。";
  if (/expired|auth|token|login|session|state_mismatch|nonce|pkce|callback/i.test(error.code)) return "登录已失效或未完成，请重新登录。本机备忘录会保留。";
  if (/cancel/i.test(error.code)) return "登录已取消，你可以继续使用本地备忘录。";
  if (/sync/i.test(error.code)) return "同步未完成，请检查网络后重试。本地更改仍保存在此设备。";
  return "账户连接暂不可用，请检查网络后重试。本地备忘录仍可继续编辑。";
}

export default function AccountSettings({ active, onHandle, onConflicts }: {
  active: boolean; onHandle: (handle: AccountSettingsHandle | null) => void; onConflicts: () => void;
}) {
  const [status, setStatus] = useState<AccountStatus | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"signOut" | "enable" | null>(null);
  const panel = useRef<HTMLDivElement>(null), confirmPanel = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null), alive = useRef(false), visible = useRef(active);
  const focused = useRef<HTMLElement | null>(null);
  const authorizationPending = useRef(false);
  const generation = useRef(0), operation = useRef(0), working = useRef<AccountCommand["type"] | null>(null), reading = useRef(false);
  const retry = useRef<AccountCommand>({ type: "status" });
  visible.current = active;
  const dismiss = () => {
    if (!confirmation) return false;
    setConfirmation(null);
    queueMicrotask(() => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); });
    return true;
  };
  const ask = (kind: "signOut" | "enable") => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation(kind);
  };
  const run = async (command: AccountCommand, confirmed = false, background = false) => {
    if (!alive.current || !visible.current) throw Error("请先打开账户与同步");
    const query = command.type === "status";
    const authorization = command.type === "signIn" || command.type === "signUp";
    // A failed cancel cannot release the original browser authorization transaction.
    if (authorizationPending.current && !query && command.type !== "cancel") return;
    if (query && (working.current || reading.current)) return;
    // Cancellation must remain available even if the native browser-launch command is pending.
    if (working.current && !(command.type === "cancel" && ["signIn", "signUp"].includes(working.current))) return;
    if (!confirmed && (command.type === "signOut" || (command.type === "setEnabled" && command.enabled))) {
      ask(command.type === "signOut" ? "signOut" : "enable"); return;
    }
    if (authorization) authorizationPending.current = true;
    if (!query) { generation.current++; working.current = command.type; setBusy(true); setNotice(""); }
    else reading.current = true;
    const ticket = generation.current, op = query ? operation.current : ++operation.current;
    if (!background) setError("");
    try {
      const next = await accountCommand(command);
      if (!alive.current || !visible.current || ticket !== generation.current) return;
      setStatus(next);
      const completedExit = command.type === "status" && next.state === "signedOut" && !next.profile && !next.error &&
        (retry.current.type === "cancel" || retry.current.type === "signOut");
      if (!background || completedExit || (!next.error && (next.state === "ready" || next.state === "paused"))) {
        setError("");
        retry.current = { type: "status" };
      }
      if (completedExit) setConfirmation(null);
      if ((command.type === "cancel" || command.type === "signOut") &&
        (next.state !== "signedOut" || next.profile || next.error)) {
        throw Error(command.type === "cancel" ? "取消登录尚未确认，请等待账户状态更新后重试。" : "退出账户尚未完成，请检查账户状态后重试。");
      }
      if (!query) setConfirmation(null);
      if (command.type === "syncNow") setNotice("同步请求已发送，实际进度请查看待处理数和最近成功时间。");
      if (command.type === "cancel") setNotice("登录已取消。本地备忘录仍可继续编辑。");
      if (command.type === "signOut") setNotice("已退出账户，本机备忘录已保留。");
    } catch (cause) {
      if (alive.current && visible.current && ticket === generation.current) {
        retry.current = command;
        setError(cause instanceof Error ? cause.message : "账户操作未完成，请重试");
      }
      throw cause;
    } finally {
      if (query) reading.current = false;
      else {
        if (authorization) authorizationPending.current = false;
        if (op === operation.current) working.current = null;
        if (alive.current) setBusy(!!working.current || authorizationPending.current);
      }
      if (alive.current && visible.current && ticket !== generation.current && !working.current && !reading.current)
        queueMicrotask(() => request({ type: "status" }, true));
    }
  };
  const request = (command: AccountCommand, background = false) => void run(command, false, background).catch(() => {});
  const retryRequest = () => {
    const failed = retry.current;
    // The native status may have advanced since the failed operation. Retrying
    // an old login/exit in that new state must not start another transaction.
    if ((failed.type === "signIn" || failed.type === "signUp") &&
      (status?.state === "authorizing" || (status?.profile && !status.error))) {
      request({ type: "status" });
    } else if ((failed.type === "cancel" || failed.type === "signOut") && status?.state === "signedOut" && !status.profile) {
      request({ type: "status" });
    } else request(failed);
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; };
  }, []);
  useLayoutEffect(() => { generation.current++; setConfirmation(null); setNotice(""); }, [active]);
  useEffect(() => {
    if (!active) return;
    request({ type: "status" }, true);
    // Read-only subscription to the native runtime. Never starts/stops its lifecycle.
    const refresh = () => { if (visible.current && document.visibilityState !== "hidden") request({ type: "status" }, true); };
    const timer = window.setInterval(refresh, 2000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [active]);
  useLayoutEffect(() => {
    if (!confirmation || !active) return;
    confirmPanel.current?.scrollIntoView({ block: "nearest" });
    confirmPanel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [confirmation, active]);
  useLayoutEffect(() => {
    onHandle({ dismiss, run, inspect: () => ({ status, busy, error, confirmation: !!confirmation }) });
    return () => onHandle(null);
  });
  useLayoutEffect(() => {
    // Authorization/exit removes its focused action. Restore an enabled account
    // control only if focus actually fell out; never steal category/header focus.
    if (!active || !focused.current || focused.current.isConnected || document.activeElement !== document.body) return;
    (panel.current?.querySelector<HTMLButtonElement>(".account-confirmation button:not(:disabled),.account-group .account-actions button:not(:disabled)") ||
      panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
  });
  const authorizing = authorizationPending.current || status?.state === "authorizing" || (busy && (working.current === "signIn" || working.current === "signUp"));
  const signedIn = !!status?.profile && status.state !== "signedOut" && !authorizing;
  const ownership = /owner|workspace|bound/i.test(status?.error?.code || "");
  const needsLogin = /expired|auth|token|login|session|state_mismatch|nonce|pkce|callback/i.test(status?.error?.code || "");
  return <div ref={panel} className="account-settings" data-account-state={status?.state || "loading"} onFocusCapture={event => {
    if (event.target instanceof HTMLElement) focused.current = event.target;
  }} onKeyDown={event => {
    if (event.key === "Escape" && dismiss()) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <h3 className="preferences-page-title">账户与同步</h3>
    <p className="account-intro">在你的设备间同步备忘录</p>
    <span className="account-accessible-state" role="status" aria-live="polite" aria-atomic="true">{status ? states[status.state] : "正在读取账户状态"}</span>
    {error && <div className="account-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={retryRequest}>重试</button></div>}
    {!status && !error && <p role="status">正在读取账户状态…</p>}
    {(status || error) && <>
      <section className="account-group" aria-label="CyberNote 账户">
        <div className="account-profile"><span className="account-avatar" aria-hidden="true"><UserRound /></span><div>
          <h4>{signedIn ? status?.profile?.displayName || "CyberNote 账户" : authorizing ? "正在等待登录" : "登录 CyberNote"}</h4>
          {signedIn ? <p className="account-identifier">{status?.profile?.username || status?.profile?.subject}</p> : <p>{authorizing ? "请在系统浏览器中完成授权。返回后会自动更新账户状态。" : "备忘录保存在此设备。登录同一账户后，可在你的设备间同步。"}</p>}
        </div></div>
        <div className="account-actions">
          {authorizing ? <button type="button" disabled={working.current === "cancel"} onClick={() => request({ type: "cancel" })}>取消登录</button> : signedIn ? <button type="button" disabled={busy} onClick={() => request({ type: "signOut" })}>退出账户</button> : <>
            <button type="button" className="account-primary" disabled={busy || !status} onClick={() => request({ type: "signIn" })}>登录</button>
            <button type="button" disabled={busy || !status} onClick={() => request({ type: "signUp" })}>创建账户</button>
          </>}
        </div>
        {!signedIn && !authorizing && <p className="account-help">首次开启同步时，本地备忘录将与同一账户设备的备忘录合并。本机内容会保留。</p>}
      </section>
      {status && (status.state === "error" || status.error) && <section className="account-error" role="alert"><h4>{ownership ? "资料库归属不匹配" : "需要处理"}</h4><p>{accountError(status.error)}</p>
        {!ownership && <button type="button" disabled={busy} onClick={() => request({ type: needsLogin ? "signIn" : signedIn && status.enabled ? "syncNow" : "status" })}>{needsLogin ? "重新登录" : "重试连接"}</button>}
      </section>}
      {signedIn && status && <>
        <section className="account-group" aria-label="账户同步">
          <div className="account-toggle"><label htmlFor="account-enabled">同步此设备</label><input id="account-enabled" type="checkbox" role="switch" checked={status.enabled} disabled={busy || ownership || needsLogin} onChange={event => request({ type: "setEnabled", enabled: event.target.checked })} /></div>
          <p className="account-help">{status.enabled ? "本地备忘录将与同一账户的设备合并，离线时仍可编辑。" : "自动传输已暂停。你仍保持登录，本地更改会保存在此设备。"}</p>
          <p className="account-state">{states[status.state]}</p>
          <dl className="account-metrics"><div><dt>待处理</dt><dd>{status.pendingCount} 项</dd></div><div><dt>最近成功同步</dt><dd>{status.lastSyncAt === undefined ? "尚无成功同步记录" : formatFileTime(status.lastSyncAt)}</dd></div></dl>
          <div className="account-actions"><button type="button" disabled={busy || !status.enabled || ownership || needsLogin} onClick={() => request({ type: "syncNow" })}>立即同步</button>
            {status.conflictCount > 0 && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
          </div>
        </section>
        <section className="account-group" aria-label="账户设备"><h4>设备</h4>
          {!status.devices.some(device => !device.current) && <p className="account-help">在另一台设备登录同一账户，即可开始同步。</p>}
          {status.devices.length > 0 && <ul className="account-devices">{status.devices.map(device => <li key={device.id}>
            {device.current ? <Laptop aria-hidden="true" /> : <Smartphone aria-hidden="true" />}<div><strong>{device.name || "未命名设备"}</strong><p>{device.current ? "此设备" : device.online ? "在线" : "离线"} · {device.connected ? "同步连接已建立" : "同步未连接"}</p></div>
          </li>)}</ul>}
          <p className="account-help">设备在线表示可以被发现；同步连接与数据应用结果分别显示。</p>
        </section>
      </>}
    </>}
    {confirmation && <div ref={confirmPanel} className="account-confirmation" role="group" aria-label="确认账户操作" tabIndex={-1}>
      <h4>{confirmation === "signOut" ? "退出账户？" : "开启账户同步？"}</h4>
      <p>{confirmation === "signOut" ? "本机备忘录会保留。此设备将停止账户同步，并移除本机登录授权。" : "此设备的本地备忘录将与该账户其他设备的备忘录合并。请确认你登录了正确的账户。"}</p>
      <div className="account-actions"><button type="button" onClick={dismiss}>取消</button><button type="button" disabled={busy} onClick={() => void run(confirmation === "signOut" ? { type: "signOut" } : { type: "setEnabled", enabled: true }, true).catch(() => {})}>{confirmation === "signOut" ? "确认退出" : "开启并合并"}</button></div>
    </div>}
    <p className="account-notice" role="status">{notice}</p>
    <p className="account-help">本地使用不需要账户。</p>
  </div>;
}
