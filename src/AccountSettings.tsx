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
  const panel = useRef<HTMLDivElement>(null), confirmPanel = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null), confirmButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null), alive = useRef(false), visible = useRef(active);
  const focused = useRef<HTMLElement | null>(null);
  const authorizationPending = useRef(false);
  const generation = useRef(0), operation = useRef(0), working = useRef<AccountCommand["type"] | null>(null), reading = useRef(false);
  const retry = useRef<AccountCommand>({ type: "status" });
  visible.current = active;
  const dismiss = () => {
    if (!confirmation) return false;
    // Once confirmed, the native mutation cannot be cancelled by closing UI.
    if (working.current) return true;
    setConfirmation(null);
    return true;
  };
  const ask = (kind: "signOut" | "enable", initiator?: HTMLElement) => {
    origin.current = initiator || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setConfirmation(kind);
  };
  const run = async (command: AccountCommand, confirmed = false, background = false, initiator?: HTMLElement) => {
    if (!alive.current || !visible.current) throw Error("请先打开账户与同步");
    const query = command.type === "status";
    const authorization = command.type === "signIn" || command.type === "signUp";
    const transfer = command.type === "openLoginInBrowser";
    const startingAuthorization = working.current === "signIn" || working.current === "signUp";
    if (authorization && (status?.state === "authorizing" || status?.error?.code === "account_cleanup_required" ||
      status?.error?.code === "account_busy" || status?.error?.providerReason === "busy")) return;
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
      ask(command.type === "signOut" ? "signOut" : "enable", initiator); return;
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
      if (latestError.current && ((query && latestError.current.command === "status") || latestError.current.stateKey !== accountErrorStateKey(next))) {
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
      if (command.type === "signOut") setNotice("已退出账户，本机备忘录及附件已保留。你可以登录其他账户；同步需另行确认开启。");
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
  const request = (command: AccountCommand, background = false, initiator?: HTMLElement) => void run(command, false, background, initiator).catch(() => {});
  const retryRequest = () => {
    const failed = retry.current;
    const rejectedBusy = latestError.current?.safeError?.code === "account_busy" || latestError.current?.safeError?.providerReason === "busy";
    const canRetryLogin = status && ((status.state === "signedOut" && !status.profile && !status.error) || accountConnectionRetry(status).type === "signIn");
    // The native status may have advanced since the failed operation. Retrying
    // an old login/exit in that new state must not start another transaction.
    if (status?.error?.code === "account_cleanup_required" || status?.error?.code === "account_busy" ||
      status?.error?.providerReason === "busy" ||
      latestError.current?.safeError?.code === "account_sync_adoption_blocked") {
      request({ type: "status" });
    } else if ((failed.type === "signIn" || failed.type === "signUp") &&
      (status?.state === "authorizing" || (status?.profile && !status.error) || (rejectedBusy && !canRetryLogin))) {
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
    const dialog = confirmPanel.current, previous = origin.current;
    if (!dialog) return;
    // Native top-layer modality isolates every background surface, including
    // Preferences navigation, without a portal losing the app's theme tokens.
    dialog.showModal();
    cancelButton.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      queueMicrotask(() => {
        if (!alive.current || !visible.current) return;
        const target = previous?.isConnected && !previous.matches(":disabled") ? previous :
          panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
        target?.focus({ preventScroll: true });
      });
    };
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
  const identityMismatch = status?.error?.code === "account_owner_workspace_mismatch";
  const adoptionBlocked = status?.error?.code === "account_sync_adoption_blocked";
  const commandAdoptionBlocked = commandError?.safeError?.code === "account_sync_adoption_blocked";
  const nativeBusy = status?.error?.code === "account_busy" || status?.error?.providerReason === "busy";
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
    {commandError && <div className="account-error account-command-error" role="alert"><h4>{commandAdoptionBlocked ? "开启同步前需要处理旧同步内容" : `本次${commandNames[commandError.command]}未完成`}</h4><p>{error}</p><ErrorDetails error={commandError.safeError} />
      {commandAdoptionBlocked && !!status?.conflictCount && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
      <button type="button" disabled={busy} onClick={retryRequest}>{commandAdoptionBlocked ? "读取账户状态" : "重试"}</button></div>}
    {!status && !error && <p role="status">正在读取账户状态…</p>}
    {(status || error) && <>
      <section className="account-group" aria-label="CyberNote 账户">
        <div className="account-profile"><span className="account-avatar" aria-hidden="true"><UserRound /></span><div>
          <h4>{signedIn ? status?.profile?.displayName || "CyberNote 账户" : authorizing ? "正在等待登录" : "登录 CyberNote"}</h4>
          {signedIn ? <p className="account-identifier">{status?.profile?.username || status?.profile?.subject}</p> : <p>{authorizing ? pendingMessage : "本地备忘录不绑定账户。你可以登录任意账户，用于该账户的多端同步。登录后同步默认暂停。"}</p>}
        </div></div>
        {(!signedIn || needsLogin) && !cleanupRequired && <fieldset className="account-login-method" disabled={busy || nativeBusy || !status || authorizing}>
          <legend>登录方式</legend>
          <div className="account-login-options">
            <label><input type="radio" name="account-login-surface" value="embedded" checked={loginSurface === "embedded"} onChange={() => setLoginSurface("embedded")} />应用内登录</label>
            <label><input type="radio" name="account-login-surface" value="browser" checked={loginSurface === "browser"} onChange={() => setLoginSurface("browser")} />系统浏览器</label>
          </div>
        </fieldset>}
        <div className="account-actions">
          {authorizing ? <><button type="button" disabled={workingType === "cancel"} onClick={() => request({ type: "cancel" })}>取消登录</button>
            {status?.authorizationSurface === "embedded" && <button type="button" disabled={!!workingType && workingType !== "signIn" && workingType !== "signUp"} onClick={() => request({ type: "openLoginInBrowser" })}>在浏览器中继续</button>}
          </> : <>
            {!signedIn && !cleanupRequired && <>
              <button type="button" className="account-primary" disabled={busy || nativeBusy || !status} onClick={() => request({ type: "signIn", surface: loginSurface })}>登录</button>
              <button type="button" disabled={busy || nativeBusy || !status} onClick={() => request({ type: "signUp", surface: loginSurface })}>创建账户</button>
            </>}
            {(signedIn || cleanupRequired || status?.state === "error" || identityMismatch || nativeBusy) && <button type="button" disabled={busy} onClick={event => request({ type: "signOut" }, false, event.currentTarget)}>退出账户</button>}
          </>}
        </div>
        {!signedIn && !authorizing && <p className="account-help">登录不会自动开启同步。确认开启后，本库当前已有的全部备忘录及附件（包括先前同步后保留的内容）会与当前账户合并。</p>}
      </section>
      {status && (status.state === "error" || status.error) && <section className="account-error" role="alert"><h4>{adoptionBlocked ? "开启同步前需要处理旧同步内容" : identityMismatch ? "账户身份或同步空间校验失败" : browserOpenFailed ? "未能打开系统浏览器" : "账户状态需要处理"}</h4><p>{browserOpenFailed ? "你仍可在应用内登录窗口完成授权，或再次选择在浏览器中继续。" : accountErrorMessage(status.error)}</p><ErrorDetails error={status.error} />
        {adoptionBlocked && !commandAdoptionBlocked && status.conflictCount > 0 && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
        {!cleanupRequired && connectionRetry.type !== "status" && <button type="button" disabled={busy || nativeBusy} onClick={() => request(connectionRetry.type === "signIn" || connectionRetry.type === "signUp" ? { type: connectionRetry.type, surface: loginSurface } : connectionRetry)}>{connectionRetry.type === "signIn" ? needsLogin ? "重新登录" : "重试登录" : "重试连接"}</button>}
      </section>}
      {signedIn && status && <>
        <section className="account-group" aria-label="账户同步">
          <div className="account-toggle"><label htmlFor="account-enabled">同步此设备</label><span className="account-switch"><input id="account-enabled" type="checkbox" role="switch" checked={status.enabled} disabled={busy || nativeBusy || identityMismatch || needsLogin || cleanupRequired} onChange={event => request({ type: "setEnabled", enabled: event.target.checked }, false, event.currentTarget)} /><span className="account-switch-track" aria-hidden="true" /></span></div>
          <p className="account-help">{status.enabled ? "本库当前已有的备忘录及附件（包括先前同步后保留的内容）会与当前账户同步，离线时仍可编辑。" : "自动传输已暂停。你仍保持登录，本地更改会保存在此设备；确认开启后才会与当前账户合并。"}</p>
          <p className="account-state">{states[status.state]}</p>
          <dl className="account-metrics"><div><dt>待处理</dt><dd>{status.pendingCount} 项</dd></div><div><dt>最近成功同步</dt><dd>{status.lastSyncAt === undefined ? "尚无成功同步记录" : formatFileTime(status.lastSyncAt)}</dd></div></dl>
          <div className="account-actions"><button type="button" disabled={busy || nativeBusy || !status.enabled || identityMismatch || needsLogin || cleanupRequired} onClick={() => request({ type: "syncNow" })}>立即同步</button>
            {!adoptionBlocked && !commandAdoptionBlocked && status.conflictCount > 0 && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
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
    {confirmation && active && <dialog ref={confirmPanel} className="account-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="account-confirmation-title" aria-describedby="account-confirmation-description" aria-busy={busy} tabIndex={-1}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); dismiss(); }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        // Preferences has a document bubble trap; keep modal keys local.
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); dismiss(); }
        if (event.key === "Tab") {
          event.preventDefault();
          const buttons = [cancelButton.current, confirmButton.current].filter((button): button is HTMLButtonElement => !!button && !button.disabled);
          if (!buttons.length) { confirmPanel.current?.focus({ preventScroll: true }); return; }
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
          (buttons[next] || confirmPanel.current)?.focus({ preventScroll: true });
        }
      }}>
      <h4 id="account-confirmation-title">{confirmation === "signOut" ? "退出账户？" : "开启账户同步？"}</h4>
      <p id="account-confirmation-description">{confirmation === "signOut" ? "本库全部备忘录及附件会保留。此设备将停止账户同步，并移除本机登录授权。退出后可登录其他账户，登录不会自动开启同步。" : "本库当前已有的全部备忘录及附件（包括先前同步后保留的内容）将与当前账户其他设备的备忘录合并。请确认允许将这些内容同步至当前账户。"}</p>
      {commandError?.command === (confirmation === "signOut" ? "signOut" : "setEnabled") && <p className="account-confirmation-error" role="alert">{error}</p>}
      <div className="account-actions"><button ref={cancelButton} type="button" disabled={busy} onClick={dismiss}>取消</button><button ref={confirmButton} className="account-primary" type="button" disabled={busy} onClick={() => void run(confirmation === "signOut" ? { type: "signOut" } : { type: "setEnabled", enabled: true }, true).catch(() => {})}>{confirmation === "signOut" ? "确认退出" : "开启并合并"}</button></div>
    </dialog>}
    <p className="account-notice" role="status">{notice}</p>
    <p className="account-help">本地使用不需要账户。</p>
  </div>;
}
