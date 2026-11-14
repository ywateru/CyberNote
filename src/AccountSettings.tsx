import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserRound, Laptop, Smartphone } from "lucide-react";
import { accountCommand, accountConnectionRetry, accountNeedsLogin, accountErrorMessage, accountErrorDetails, accountErrorStateKey, AccountCommandFailure, type SafeError, type AccountAuthorizationSurface, type AccountCommand, type AccountStatus } from "./account-client";
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
const commandNames: Record<AccountCommand["type"], string> = {status:"读取账户状态",signIn:"登录",signUp:"创建账户",openLoginInBrowser:"在浏览器中继续",cancel:"取消登录",signOut:"退出账户",syncNow:"立即同步",setEnabled:"更改同步设置"};
type CommandError = {command:AccountCommand["type"];message:string;safeError?:SafeError;stateKey:string};
function ErrorDetails({error}: {error: AccountStatus["error"]}) {
  const details = accountErrorDetails(error);
  return details.length ? <details className="account-error-details"><summary>错误详情</summary><dl>{details.map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details> : null;
}

export default function AccountSettings({ active, onHandle, onConflicts }: {
  active: boolean; onHandle: (handle: AccountSettingsHandle | null) => void; onConflicts: () => void;
}) {
  const [status, setStatus] = useState<AccountStatus | null>(null), [busy, setBusy] = useState(false);
  const [workingType, setWorkingType] = useState<AccountCommand["type"] | null>(null);
  const [commandError, setCommandError] = useState<CommandError | null>(null), [notice, setNotice] = useState("");
  const error = commandError?.message || "";
  const latestStatus = useRef<AccountStatus | null>(null), latestError = useRef<CommandError | null>(null);
  const clearError = () => { latestError.current = null; setCommandError(null); };
  const [loginSurface, setLoginSurface] = useState<AccountAuthorizationSurface>("embedded");
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
    const transfer = command.type === "openLoginInBrowser";
    const startingAuthorization = working.current === "signIn" || working.current === "signUp";
    if (authorization && status?.state === "authorizing") return;
    // Read-only status, explicit transfer and cancel stay available while the
    // original opener IPC is pending. They never start a second authorization.
    if (authorizationPending.current && !query && command.type !== "cancel" && !transfer) return;
    if (query && (reading.current || (working.current && !startingAuthorization))) return;
    if (!query && working.current &&
      !(command.type === "cancel" && (startingAuthorization || working.current === "openLoginInBrowser")) &&
      !(transfer && startingAuthorization)) return;
    if (transfer && (status?.state !== "authorizing" || status.authorizationSurface !== "embedded"))
      throw Error("当前没有可在浏览器中继续的应用内登录，请先读取账户状态。");
    if (!confirmed && (command.type === "signOut" || (command.type === "setEnabled" && command.enabled))) {
      ask(command.type === "signOut" ? "signOut" : "enable"); return;
    }
    if (authorization) authorizationPending.current = true;
    if (!query) { generation.current++; working.current = command.type; setWorkingType(command.type); setBusy(true); setNotice(""); }
    else reading.current = true;
    const ticket = generation.current, op = query ? operation.current : ++operation.current;
    if (!query) clearError();
    try {
      const next = await accountCommand(command);
      if (!alive.current || !visible.current || ticket !== generation.current) return;
      setStatus(next); latestStatus.current = next;
      if (next.state === "authorizing" && next.authorizationSurface) setLoginSurface(next.authorizationSurface);
      const completedExit = command.type === "status" && next.state === "signedOut" && !next.profile && !next.error &&
        (retry.current.type === "cancel" || retry.current.type === "signOut");
      if (latestError.current && latestError.current.stateKey !== accountErrorStateKey(next)) {
        clearError();
        retry.current = { type: "status" };
      }
      if (!query || completedExit) retry.current = { type: "status" };
      if (completedExit) setConfirmation(null);
      if ((command.type === "cancel" || command.type === "signOut") &&
        (next.state !== "signedOut" || next.profile || next.error)) {
        throw new AccountCommandFailure(undefined, command.type === "cancel" ? "cancelPending" : "signOutPending");
      }
      if (!query) setConfirmation(null);
      if (command.type === "syncNow" && !next.error) setNotice(next.state === "paused" ? "账户连接已恢复，自动传输仍已暂停。" : "同步请求已发送，实际进度请查看待处理数和最近成功时间。");
      if (command.type === "cancel") setNotice("登录已取消。本地备忘录仍可继续编辑。");
      if (command.type === "signOut") setNotice("已退出账户，本机备忘录已保留。");
    } catch (cause) {
      if (alive.current && visible.current && ticket === generation.current && !(query && background && latestError.current && latestError.current.command !== "status")) {
        retry.current = command;
        const failure = cause instanceof AccountCommandFailure ? cause : new AccountCommandFailure();
        const nextError = {command:command.type,message:failure.message,safeError:failure.safeError,stateKey:accountErrorStateKey(latestStatus.current)};
        latestError.current = nextError; setCommandError(nextError);
      }
      throw cause;
    } finally {
      if (query) reading.current = false;
      else {
        if (authorization) authorizationPending.current = false;
        if (op === operation.current) {
          working.current = null;
          if (alive.current) setWorkingType(null);
        }
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
    if (status?.error?.code === "account_cleanup_required") {
      request({ type: "status" });
    } else if ((failed.type === "signIn" || failed.type === "signUp") &&
      (status?.state === "authorizing" || (status?.profile && !status.error))) {
      request({ type: "status" });
    } else if ((failed.type === "cancel" || failed.type === "signOut") && status?.state === "signedOut" && !status.profile) {
      request({ type: "status" });
    } else if (failed.type === "openLoginInBrowser" && (status?.state !== "authorizing" || status.authorizationSurface !== "embedded")) {
      request({ type: "status" });
    } else request(failed.type === "signIn" || failed.type === "signUp" ? { type: failed.type, surface: loginSurface } : failed);
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
  const authorizing = authorizationPending.current || status?.state === "authorizing" || (busy && (workingType === "signIn" || workingType === "signUp"));
  const signedIn = !!status?.profile && status.state !== "signedOut" && !authorizing;
  const cleanupRequired = status?.error?.code === "account_cleanup_required";
  const ownership = status?.error?.code === "account_owner_workspace_mismatch";
  const needsLogin = accountNeedsLogin(status?.error);
  const connectionRetry = status ? accountConnectionRetry(status) : { type: "status" } as const;
  const browserOpenFailed = status?.state === "authorizing" && status.authorizationSurface === "embedded" &&
    status.error?.code === "account_network" && status.error.stage === "browserOpen";
  const pendingMessage = status?.authorizationSurface === "embedded"
    ? "请在应用内登录窗口中完成授权。返回后会自动更新账户状态。"
    : status?.authorizationSurface === "browser" ? "请在系统浏览器中完成授权。返回后会自动更新账户状态。"
    : "请完成登录授权。完成后会自动更新账户状态。";
  return <div ref={panel} className="account-settings" data-account-state={status?.state || "loading"} data-account-authorization-surface={status?.authorizationSurface} onFocusCapture={event => {
    if (event.target instanceof HTMLElement) focused.current = event.target;
  }} onKeyDown={event => {
    if (event.key === "Escape" && dismiss()) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <h3 className="preferences-page-title">账户与同步</h3>
    <p className="account-intro">在你的设备间同步备忘录</p>
    <span className="account-accessible-state" role="status" aria-live="polite" aria-atomic="true">{status ? states[status.state] : "正在读取账户状态"}</span>
    {commandError && <div className="account-error account-command-error" role="alert"><h4>本次{commandNames[commandError.command]}未完成</h4><p>{error}</p><ErrorDetails error={commandError.safeError} /><button type="button" disabled={busy} onClick={retryRequest}>重试</button></div>}
    {!status && !error && <p role="status">正在读取账户状态…</p>}
    {(status || error) && <>
      <section className="account-group" aria-label="CyberNote 账户">
        <div className="account-profile"><span className="account-avatar" aria-hidden="true"><UserRound /></span><div>
          <h4>{signedIn ? status?.profile?.displayName || "CyberNote 账户" : authorizing ? "正在等待登录" : "登录 CyberNote"}</h4>
          {signedIn ? <p className="account-identifier">{status?.profile?.username || status?.profile?.subject}</p> : <p>{authorizing ? pendingMessage : "备忘录保存在此设备。登录同一账户后，可在你的设备间同步。"}</p>}
        </div></div>
        {(!signedIn || needsLogin) && !cleanupRequired && <fieldset className="account-login-method" disabled={busy || !status || authorizing}>
          <legend>登录方式</legend>
          <div className="account-login-options">
            <label><input type="radio" name="account-login-surface" value="embedded" checked={loginSurface === "embedded"} onChange={() => setLoginSurface("embedded")} />应用内登录</label>
            <label><input type="radio" name="account-login-surface" value="browser" checked={loginSurface === "browser"} onChange={() => setLoginSurface("browser")} />系统浏览器</label>
          </div>
        </fieldset>}
        <div className="account-actions">
          {authorizing ? <><button type="button" disabled={workingType === "cancel"} onClick={() => request({ type: "cancel" })}>取消登录</button>
            {status?.authorizationSurface === "embedded" && <button type="button" disabled={!!workingType && workingType !== "signIn" && workingType !== "signUp"} onClick={() => request({ type: "openLoginInBrowser" })}>在浏览器中继续</button>}
          </> : signedIn || cleanupRequired ? <button type="button" disabled={busy} onClick={() => request({ type: "signOut" })}>退出账户</button> : <>
            <button type="button" className="account-primary" disabled={busy || !status} onClick={() => request({ type: "signIn", surface: loginSurface })}>登录</button>
            <button type="button" disabled={busy || !status} onClick={() => request({ type: "signUp", surface: loginSurface })}>创建账户</button>
          </>}
        </div>
        {!signedIn && !authorizing && <p className="account-help">首次开启同步时，本地备忘录将与同一账户设备的备忘录合并。本机内容会保留。</p>}
      </section>
      {status && (status.state === "error" || status.error) && <section className="account-error" role="alert"><h4>{ownership ? "资料库归属不匹配" : browserOpenFailed ? "未能打开系统浏览器" : "账户状态需要处理"}</h4><p>{browserOpenFailed ? "你仍可在应用内登录窗口完成授权，或再次选择在浏览器中继续。" : accountErrorMessage(status.error)}</p><ErrorDetails error={status.error} />
        {!ownership && !cleanupRequired && connectionRetry.type !== "status" && <button type="button" disabled={busy} onClick={() => request(connectionRetry.type === "signIn" || connectionRetry.type === "signUp" ? { type: connectionRetry.type, surface: loginSurface } : connectionRetry)}>{connectionRetry.type === "signIn" ? needsLogin ? "重新登录" : "重试登录" : "重试连接"}</button>}
      </section>}
      {signedIn && status && <>
        <section className="account-group" aria-label="账户同步">
          <div className="account-toggle"><label htmlFor="account-enabled">同步此设备</label><input id="account-enabled" type="checkbox" role="switch" checked={status.enabled} disabled={busy || ownership || needsLogin || cleanupRequired} onChange={event => request({ type: "setEnabled", enabled: event.target.checked })} /></div>
          <p className="account-help">{status.enabled ? "本地备忘录将与同一账户的设备合并，离线时仍可编辑。" : "自动传输已暂停。你仍保持登录，本地更改会保存在此设备。"}</p>
          <p className="account-state">{states[status.state]}</p>
          <dl className="account-metrics"><div><dt>待处理</dt><dd>{status.pendingCount} 项</dd></div><div><dt>最近成功同步</dt><dd>{status.lastSyncAt === undefined ? "尚无成功同步记录" : formatFileTime(status.lastSyncAt)}</dd></div></dl>
          <div className="account-actions"><button type="button" disabled={busy || !status.enabled || ownership || needsLogin || cleanupRequired} onClick={() => request({ type: "syncNow" })}>立即同步</button>
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
