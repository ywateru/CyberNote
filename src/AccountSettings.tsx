import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserRound, Laptop, Smartphone, MonitorSmartphone, RefreshCw, ChevronRight, Pencil, FileText, Check, LoaderCircle } from "lucide-react";
import { accountCommand, accountConnectionRetry, accountNeedsLogin, accountErrorMessage, accountErrorDetails, accountErrorStateKey, AccountCommandFailure, deviceName, type AccountDevice, type DeviceDirection, type SafeError, type AccountAuthorizationSurface, type AccountCommand, type AccountStatus } from "./account-client";
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
const commandNames: Record<AccountCommand["type"], string> = {status:"读取账户状态",signIn:"登录",signUp:"创建账户",openLoginInBrowser:"在浏览器中继续",cancel:"取消登录",signOut:"退出账户",syncNow:"刷新设备",setEnabled:"更改同步设置",renameDevice:"更改设备名称",syncDevice:"设备同步"};
type CommandError = {command:AccountCommand["type"];message:string;safeError?:SafeError;stateKey:string};
type DeviceTarget = {subject: string; localId: string; id: string; name: string};
const directionNames: Record<DeviceDirection, string> = {push:"推送到此设备",pull:"从此设备拉取",both:"双向同步"};
function targetIssue(status: AccountStatus | null, target: DeviceTarget | null, syncing: boolean): string {
  if (!target || !status?.profile || status.profile.subject !== target.subject || status.devices.find(d => d.current)?.id !== target.localId || status.state === "signedOut" || status.state === "authorizing") return "账户或本机设备已变化，请关闭后重新选择设备。";
  const device = status.devices.find(d => d.id === target.id);
  if (!device || (syncing ? device.current : !device.current)) return "此设备已不在当前账户目录，请关闭后刷新设备。";
  if (!syncing) return "";
  if (!status.enabled) return "此设备的同步许可已关闭，请关闭对话框并确认允许同步后重新选择。";
  if (!device.online) return "目标设备已离线，请待其上线后重新选择。";
  if (!device.syncAvailable) return "目标设备同步已暂停或版本不兼容，请在目标设备允许同步或更新应用后重新选择。";
  return "";
}
function ErrorDetails({error}: {error: AccountStatus["error"]}) {
  const details = accountErrorDetails(error);
  return details.length ? <details className="account-error-details"><summary>错误详情</summary><dl>{details.map(([key,value]) => <div key={key}><dt>{key === "syncStage" ? "同步阶段" : key === "syncReason" ? "失败原因" : key}</dt><dd>{value}</dd></div>)}</dl></details> : null;
}

function DeviceInfo({device}: {device: AccountDevice}) {
  return <span className="account-device-info">
    <span className="account-device-title"><strong>{device.name || "未命名设备"}</strong>{device.current && <span className="account-current-badge"><Check aria-hidden="true" />此设备</span>}</span>
    <span id={`account-device-status-${device.id}`} className="account-device-status"><span className={`account-status-dot${device.online ? " is-online" : ""}`} aria-hidden="true" /><span>{device.online ? "在线" : "离线"}</span>{device.online && <span className="account-device-availability">{device.syncAvailable ? "可同步" : "同步已暂停或暂不可用"}</span>}</span>
    <span id={`account-device-summary-${device.id}`} className="account-device-summary">{!device.online ? "上线后可查看笔记信息" : !device.summary ? "笔记信息暂不可用" : <><span className="account-device-count"><FileText aria-hidden="true" />{device.summary.noteCount} 篇笔记</span><span>{device.summary.lastNoteUpdatedAt === null ? "暂无笔记更新时间" : `笔记更新于 ${formatFileTime(device.summary.lastNoteUpdatedAt)}`}</span></>}</span>
  </span>;
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
  const [confirmation, setConfirmation] = useState<"signOut" | "enable" | "syncDevice" | "renameDevice" | null>(null);
  const [target, setTarget] = useState<DeviceTarget | null>(null), [targetInvalid, setTargetInvalid] = useState("");
  const [direction, setDirection] = useState<DeviceDirection>("both"), [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const dialogRevision = useRef(0);
  const [attempt, setAttempt] = useState<{id: string; direction: DeviceDirection; baseline?: number; revision: number} | null>(null);
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
  const ask = (kind: "signOut" | "enable" | "syncDevice" | "renameDevice", initiator?: HTMLElement, deviceId?: string) => {
    if (kind === "syncDevice" || kind === "renameDevice") {
      const current = latestStatus.current, device = current?.devices.find(d => kind === "renameDevice" ? d.current : d.id === deviceId);
      const local = current?.devices.find(d => d.current);
      if (!current?.profile || !device || !local || (kind === "syncDevice" && device.current)) return;
      dialogRevision.current++;
      setTarget({subject: current.profile.subject, localId: local.id, id: device.id, name: device.name || "未命名设备"});
      setAttempt(null); setDirection("both"); setName(device.name); setTargetInvalid(""); setFormError("");
    }
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
    if (query && (reading.current || (working.current && !startingAuthorization && working.current !== "syncDevice"))) return;
    if (!query && working.current &&
      !(command.type === "cancel" && (startingAuthorization || working.current === "openLoginInBrowser")) &&
      !(transfer && startingAuthorization)) return;
    if (transfer && (status?.state !== "authorizing" || status.authorizationSurface !== "embedded"))
      throw Error("当前没有可在浏览器中继续的应用内登录，请先读取账户状态。");
    if (!confirmed && (command.type === "signOut" || (command.type === "setEnabled" && command.enabled))) {
      ask(command.type === "signOut" ? "signOut" : "enable", initiator); return;
    }
    if (command.type === "syncDevice" || command.type === "renameDevice") {
      if (!confirmed) {
        ask(command.type, initiator, command.type === "syncDevice" ? command.deviceId : undefined);
        if (command.type === "syncDevice") setDirection(command.direction); else setName(command.name);
        return;
      }
      const issue = targetInvalid || targetIssue(latestStatus.current, target, command.type === "syncDevice");
      if (issue || (command.type === "syncDevice" && (command.deviceId !== target?.id || command.direction !== direction))) { setFormError(issue || "设备或同步方向已变化，请重新确认。"); return; }
      if (command.type === "renameDevice") {
        try { command = {...command, name: deviceName(command.name)}; }
        catch { setFormError("请输入 1–96 个字符的设备名称，不含控制字符。"); return; }
      }
    }
    if (command.type === "syncDevice") setAttempt({id: command.deviceId, direction: command.direction, baseline: latestStatus.current?.deviceOperation?.startedAt, revision: dialogRevision.current});
    if (authorization) authorizationPending.current = true;
    if (!query) { generation.current++; working.current = command.type; setWorkingType(command.type); setBusy(true); setNotice(""); }
    else reading.current = true;
    const ticket = generation.current, actionRevision = dialogRevision.current, op = query ? operation.current : ++operation.current;
    const ownsDeviceAction = () => (command.type !== "syncDevice" && command.type !== "renameDevice") || !target ||
      (actionRevision === dialogRevision.current && latestStatus.current?.profile?.subject === target.subject && latestStatus.current.devices.find(d => d.current)?.id === target.localId);
    if (!query) clearError();
    try {
      const next = await accountCommand(command);
      if (!alive.current || !visible.current || ticket !== generation.current) return;
      // A late result must not replace a different account's freshly polled status.
      if (!ownsDeviceAction()) return;
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
      if (!query && command.type !== "syncDevice" && command.type !== "renameDevice") setConfirmation(null);
      if (command.type === "syncNow" && !next.error) setNotice("设备目录已刷新。刷新或恢复连接不会传输笔记及附件。");
      if (command.type === "renameDevice" && !next.error) {
        if (next.devices.find(d => d.current)?.name === command.name) { setConfirmation(null); setNotice("本机设备名称已更新。"); }
        else setFormError("尚未确认设备名称已保存，请刷新状态后再检查。");
      }
      if (command.type === "cancel") setNotice("登录已取消。本地备忘录仍可继续编辑。");
      if (command.type === "signOut") setNotice("已退出账户，本机备忘录及附件已保留。你可以登录其他账户；同步需另行确认开启。");
    } catch (cause) {
      if (alive.current && visible.current && ticket === generation.current && ownsDeviceAction() && !(query && background && latestError.current && latestError.current.command !== "status")) {
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
    // Device retries always return to explicit target/direction confirmation.
    // Never rebind an old action to a newly logged-in account.
    if (failed.type === "syncDevice" || failed.type === "renameDevice") {
      if (confirmation === failed.type) setFormError(targetInvalid || targetIssue(latestStatus.current, target, failed.type === "syncDevice") || "请在对话框中确认后重试。");
      else request({type: "status"});
      return;
    }
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
  const deviceDialog = confirmation === "syncDevice" || confirmation === "renameDevice";
  const issue = deviceDialog ? targetInvalid || targetIssue(status, target, confirmation === "syncDevice") : "";
  useEffect(() => {
    if (deviceDialog && issue && !targetInvalid) { dialogRevision.current++; setTargetInvalid(issue); }
  }, [deviceDialog, issue, targetInvalid]);
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
  const adoptionTimeout = adoptionBlocked && status?.error?.adoptionReason === "timeout";
  const commandAdoptionTimeout = commandAdoptionBlocked && commandError?.safeError?.adoptionReason === "timeout";
  const nativeBusy = status?.error?.code === "account_busy" || status?.error?.providerReason === "busy" || status?.deviceOperation?.phase === "running";
  const needsLogin = accountNeedsLogin(status?.error);
  const connectionRetry = status ? accountConnectionRetry(status) : { type: "status" } as const;
  const refreshing = workingType === "syncNow";
  const devices = status ? [...status.devices.filter(device => device.current), ...status.devices.filter(device => !device.current)] : [];
  const remoteCount = devices.filter(device => !device.current).length;
  const localMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const browserOpenFailed = status?.state === "authorizing" && status.authorizationSurface === "embedded" &&
    status.error?.code === "account_network" && status.error.stage === "browserOpen";
  const pendingMessage = status?.authorizationSurface === "embedded"
    ? "请在应用内登录窗口中完成授权。返回后会自动更新账户状态。"
    : status?.authorizationSurface === "browser" ? "请在系统浏览器中完成授权。返回后会自动更新账户状态。"
    : "请完成登录授权。完成后会自动更新账户状态。";
  const deviceOperation = status?.deviceOperation;
  const sameOperation = !issue && attempt && attempt.revision === dialogRevision.current && target && status?.profile?.subject === target.subject && deviceOperation?.deviceId === target.id && deviceOperation.deviceId === attempt.id && deviceOperation.direction === attempt.direction && (attempt.baseline === undefined || deviceOperation.startedAt > attempt.baseline);
  const operationText = sameOperation ? deviceOperation.phase === "succeeded" && !status?.error ? "本次传输完成。已取得持久传输收据；待应用内容和冲突仍需单独查看。" : (deviceOperation.phase === "failed" || status?.error) ? "本次传输未完成，请检查设备状态后对同一目标和方向重新确认。" : "正在执行本次传输，请等待持久传输结果。" : "";
  const confirm = () => {
    if (confirmation === "syncDevice" && target) void run({type:"syncDevice", deviceId:target.id, direction}, true).catch(() => {});
    else if (confirmation === "renameDevice") void run({type:"renameDevice", name}, true).catch(() => {});
    else void run(confirmation === "signOut" ? {type:"signOut"} : {type:"setEnabled",enabled:true}, true).catch(() => {});
  };
  return <div ref={panel} className="account-settings" data-account-state={status?.state || "loading"} data-account-authorization-surface={status?.authorizationSurface} onFocusCapture={event => {
    if (event.target instanceof HTMLElement) focused.current = event.target;
  }} onKeyDown={event => {
    if (event.key === "Escape" && dismiss()) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <h3 className="preferences-page-title">账户与同步</h3>
    <p className="account-intro">在你的设备间同步备忘录</p>
    <span className="account-accessible-state" role="status" aria-live="polite" aria-atomic="true">{status ? states[status.state] : "正在读取账户状态"}</span>
    {commandError && <div className="account-error account-command-error" role="alert"><h4>{commandAdoptionTimeout ? "开启同步准备超时" : commandAdoptionBlocked ? "开启同步前需要处理旧同步内容" : `本次${commandNames[commandError.command]}未完成`}</h4><p>{error}</p><ErrorDetails error={commandError.safeError} />
      {commandAdoptionBlocked && !!status?.conflictCount && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
      <button type="button" disabled={busy} onClick={retryRequest}>{commandAdoptionBlocked ? "读取账户状态" : "重试"}</button></div>}
    {!status && !error && <p className="account-loading" role="status"><LoaderCircle className="account-spinner" aria-hidden="true" />正在读取账户状态…</p>}
    {(status || error) && <>
      <section className={`account-group account-profile-group${signedIn ? " is-signed-in" : ""}`} aria-label="CyberNote 账户">
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
        {!signedIn && !authorizing && <p className="account-help">登录不会自动开启同步。开启仅允许内容同步；之后还需选择设备并明确确认，才会传输笔记及附件。</p>}
      </section>
      {status && (status.state === "error" || status.error) && <section className="account-error" role="alert"><h4>{adoptionTimeout ? "开启同步准备超时" : adoptionBlocked ? "开启同步前需要处理旧同步内容" : identityMismatch ? "账户身份或同步空间校验失败" : browserOpenFailed ? "未能打开系统浏览器" : "账户状态需要处理"}</h4><p>{browserOpenFailed ? "你仍可在应用内登录窗口完成授权，或再次选择在浏览器中继续。" : accountErrorMessage(status.error)}</p><ErrorDetails error={status.error} />
        {adoptionBlocked && !commandAdoptionBlocked && status.conflictCount > 0 && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
        {!cleanupRequired && connectionRetry.type !== "status" && <button type="button" disabled={busy || nativeBusy} onClick={() => request(connectionRetry.type === "signIn" || connectionRetry.type === "signUp" ? { type: connectionRetry.type, surface: loginSurface } : connectionRetry)}>{connectionRetry.type === "signIn" ? needsLogin ? "重新登录" : "重试登录" : "重试连接"}</button>}
      </section>}
      {signedIn && status && <>
        <section className="account-group account-sync-group" aria-label="账户同步">
          <div className="account-toggle"><label htmlFor="account-enabled">同步此设备</label><span className="account-switch"><input id="account-enabled" type="checkbox" role="switch" checked={status.enabled} disabled={busy || nativeBusy || identityMismatch || needsLogin || cleanupRequired} onChange={event => request({ type: "setEnabled", enabled: event.target.checked }, false, event.currentTarget)} /><span className="account-switch-track" aria-hidden="true" /></span></div>
          <p className="account-help">{status.enabled ? "允许与选定设备收发笔记及附件。开启后不会自动传输，离线时仍可编辑。" : "内容同步许可已关闭。你仍保持登录，设备目录继续更新，本地更改保存在此设备。"}</p>
          <p className="account-state"><span className={`account-status-dot${status.state === "ready" ? " is-online" : ""}`} aria-hidden="true" />{states[status.state]}</p>
          <dl className="account-metrics"><div><dt>待应用</dt><dd>{status.pendingCount} 项</dd></div><div><dt>最近成功传输</dt><dd>{status.lastSyncAt === undefined ? "尚无成功传输记录" : formatFileTime(status.lastSyncAt)}</dd></div></dl>
          <div className="account-actions">
            {!adoptionBlocked && !commandAdoptionBlocked && status.conflictCount > 0 && <button type="button" onClick={onConflicts}>查看冲突（{status.conflictCount}）</button>}
          </div>
        </section>
        <section className="account-group account-device-group" aria-label="账户设备">
          <div className="account-device-heading"><div><h4>我的设备</h4><p className="account-help">选择其他设备，开始一次同步</p></div><button type="button" className="account-refresh" aria-busy={refreshing} disabled={busy || nativeBusy || needsLogin || cleanupRequired} onClick={() => request({type:"syncNow"})}><RefreshCw className={refreshing ? "account-spinner" : undefined} aria-hidden="true" /><span>{refreshing ? "正在刷新…" : "刷新设备"}</span></button></div>
          <span className="account-accessible-state" role="status" aria-live="polite">{refreshing ? "正在刷新设备列表" : ""}</span>
          {devices.length > 0 && <ul className="account-devices" aria-busy={refreshing}>{devices.map(device => <li key={device.id} data-device-id={device.id} className={device.current ? "account-device-current" : "account-device-remote"}>
            {device.current ? <>
              <span className="account-device-icon" aria-hidden="true">{localMobile ? <Smartphone /> : <Laptop />}</span>
              <DeviceInfo device={device} />
              <button type="button" className="account-rename" title="更改名称" disabled={busy || nativeBusy || needsLogin || cleanupRequired} onClick={event => ask("renameDevice", event.currentTarget)}><Pencil aria-hidden="true" /><span>更改名称</span></button>
            </> : <button type="button" className="account-device-open" aria-label={device.name || "未命名设备"} aria-describedby={`account-device-status-${device.id} account-device-summary-${device.id}`} disabled={busy || nativeBusy || needsLogin || cleanupRequired} onClick={event => ask("syncDevice", event.currentTarget, device.id)}>
              <span className="account-device-icon" aria-hidden="true"><MonitorSmartphone /></span>
              <DeviceInfo device={device} />
              <ChevronRight className="account-device-chevron" aria-hidden="true" />
            </button>}
          </li>)}</ul>}
          {!remoteCount && <div className="account-devices-empty"><MonitorSmartphone aria-hidden="true" /><div><strong>连接你的另一台设备</strong><p>在另一台设备登录同一账户，即可在这里选择同步。</p></div></div>}
          <p className="account-help account-device-footnote">刷新仅更新设备状态。选择设备并确认同步方向后，才会传输笔记与附件。</p>
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
          const buttons = [...(confirmPanel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),summary") || [])];
          if (!buttons.length) { confirmPanel.current?.focus({ preventScroll: true }); return; }
          const index = buttons.indexOf(document.activeElement as HTMLElement);
          const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
          (buttons[next] || confirmPanel.current)?.focus({ preventScroll: true });
        }
      }}>
      <h4 id="account-confirmation-title">{confirmation === "signOut" ? "退出账户？" : confirmation === "enable" ? "开启账户同步？" : confirmation === "renameDevice" ? "更改本机设备名称" : `与“${target?.name || "未命名设备"}”同步`}</h4>
      <p id="account-confirmation-description">{confirmation === "signOut" ? "本库全部备忘录及附件会保留。此设备将停止账户同步，并移除本机登录授权。退出后可登录其他账户，登录不会自动开启同步。" : confirmation === "enable" ? "允许本库当前已有的全部备忘录及附件（包括先前同步后保留的内容）与当前账户选定设备合并。开启本身不会自动传输；之后需选择设备与方向，并明确确认。" : confirmation === "renameDevice" ? "修改此设备在当前账户目录中的名称，其他设备名称不受影响。名称限 1–96 个字符，不含控制字符。" : "仅本机与选定设备收发，合并笔记和附件，保留各端独有内容；冲突按既有规则处理，不覆盖整库。"}</p>
      {confirmation === "syncDevice" && <fieldset className="account-device-directions" disabled={busy || nativeBusy || !!issue}>
        <legend>本次同步方向</legend>
        {(["push", "pull", "both"] as const).map(value => <label key={value}><input type="radio" name="account-device-direction" value={value} checked={direction === value} onChange={() => {setDirection(value); setFormError("");}} /><span>{directionNames[value]}<small>{value === "push" ? `本机 → ${target?.name}` : value === "pull" ? `${target?.name} → 本机` : "仅这两台设备收发"}</small></span></label>)}
      </fieldset>}
      {confirmation === "renameDevice" && <label className="account-device-name">设备名称<input value={name} disabled={busy || nativeBusy || !!issue} onChange={event => {setName(event.target.value); setFormError("");}} /></label>}
      {(issue || formError) && <p className="account-confirmation-error" role="alert">{issue || formError}</p>}
      {confirmation === "syncDevice" && operationText && <p className="account-operation" role="status">{operationText}{deviceOperation?.phase === "running" ? `目标：${target?.name}；方向：${directionNames[direction]}。` : ""}</p>}
      {deviceDialog && status?.error && !commandError && <div className="account-confirmation-error" role="alert"><p>{accountErrorMessage(status.error)}</p><ErrorDetails error={status.error} /></div>}
      {commandError?.command === (deviceDialog ? confirmation : confirmation === "signOut" ? "signOut" : "setEnabled") && <><p className="account-confirmation-error" role="alert">{error}</p>{deviceDialog && <ErrorDetails error={commandError.safeError} />}</>}
      <div className="account-actions"><button ref={cancelButton} type="button" disabled={busy} onClick={dismiss}>取消</button><button ref={confirmButton} className="account-primary" type="button" disabled={busy || (deviceDialog && (nativeBusy || !!issue || needsLogin || cleanupRequired || identityMismatch))} onClick={confirm}>{confirmation === "signOut" ? "确认退出" : confirmation === "enable" ? "允许同步" : confirmation === "renameDevice" ? "保存名称" : "开始同步"}</button></div>
    </dialog>}
    <p className="account-notice" role="status">{notice && <Check aria-hidden="true" />}{notice}</p>
    <p className="account-help">本地使用不需要账户。</p>
  </div>;
}
