import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RefreshCw, Copy, Link, Radio, ChevronRight } from "lucide-react";
import {
  syncCommand,
  type SyncCommand,
  type SyncStatus,
  type SyncConflict,
} from "./sync-client";
import { formatFileTime } from "./data-management";
import "./SyncSettings.css";

export type SyncSettingsHandle = {
  dismiss: () => boolean;
  run: (command: SyncCommand) => Promise<void>;
  inspect: () => {
    status: SyncStatus | null;
    busy: boolean;
    error: string;
    invitationVisible: boolean;
    conflictRows: number;
  };
};
const states = {
  disabled: "未开启",
  paused: "已停止",
  listening: "等待连接",
  connecting: "正在连接",
  syncing: "正在同步",
  idle: "已连接",
  error: "连接异常",
};
type Confirmation = Extract<SyncCommand, { type: "revoke" | "resolve" }>;
export default function SyncSettings({
  active,
  onHandle,
  conflictsOnly = false,
}: {
  active: boolean;
  conflictsOnly?: boolean;
  onHandle: (handle: SyncSettingsHandle | null) => void;
}) {
  const [status, setStatus] = useState<SyncStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [port, setPort] = useState("49632"),
    [endpoint, setEndpoint] = useState("");
  const [invitationExpires, setInvitationExpires] = useState(0),
    [joining, setJoining] = useState(false),
    [pairing, setPairing] = useState(""),
    [invitation, setInvitation] = useState("");
  const [conflicts, setConflicts] = useState<SyncConflict[] | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [notice, setNotice] = useState("");
  const confirmationPanel = useRef<HTMLDivElement>(null);
  const alive = useRef(false),
    activeRef = useRef(active),
    generation = useRef(0),
    working = useRef(false),
    reading = useRef(false),
    snapshot = useRef({
      status,
      busy,
      error,
      invitationVisible: false,
      conflictRows: 0,
    });
  activeRef.current = active;
  snapshot.current = {
    status,
    busy,
    error,
    invitationVisible: !!invitation,
    conflictRows: conflicts?.length || 0,
  };
  useLayoutEffect(() => {
    generation.current++;
    setInvitation("");
    setInvitationExpires(0);
    setPairing("");
    setConfirmation(null);
    setJoining(false);
    setNotice("");
  }, [active]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useLayoutEffect(() => {
    if (!confirmation || !active) return;
    confirmationPanel.current?.scrollIntoView({ block: "nearest" });
    confirmationPanel.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }, [confirmation]);
  useEffect(() => {
    if (!invitation || !invitationExpires) return;
    const timer = window.setTimeout(
      () => {
        setInvitation("");
        setNotice("配对串已过期，请重新生成");
      },
      Math.max(0, invitationExpires - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [invitation, invitationExpires]);
  const run = async (
    command: SyncCommand,
    confirmed = false,
    background = false,
  ) => {
    if (conflictsOnly && !["status", "conflicts", "resolve"].includes(command.type)) throw Error("此入口仅处理同步冲突");
    if (!activeRef.current || !alive.current)
      throw Error("请先打开设备同步");
    if (command.type === "status" && (working.current || reading.current))
      return;
    if (working.current) throw Error("同步操作正在进行中，请稍候");
    if (
      (command.type === "revoke" || command.type === "resolve") &&
      !confirmed
    ) {
      setConfirmation(command);
      return;
    }
    const querying = command.type === "status";
    if (!querying) generation.current++;
    const ticket = generation.current;
    if (querying) reading.current = true;
    else {
      working.current = true;
      setBusy(true);
      setNotice("");
    }
    if (!background) setError("");
    if (["createInvite", "stop", "revoke", "pair"].includes(command.type))
      setInvitation("");
    try {
      const result = await syncCommand(command);
      if (!alive.current || !activeRef.current || ticket !== generation.current)
        return;
      setStatus(result.status);
      if (command.type === "status" && result.status.deviceName)
        setName((value) => value || result.status.deviceName);
      if (command.type === "createInvite") {
        if (!result.invitation) throw Error("同步服务未返回配对串，请重试");
        setInvitation(result.invitation);
        setInvitationExpires(Date.now() + 10 * 60 * 1000);
      }
      if (result.conflicts !== undefined) setConflicts(result.conflicts);
      if (command.type === "pair" || command.type === "stop") {
        setPairing("");
        setJoining(false);
      }
      if (command.type === "resolve" || command.type === "revoke")
        setConfirmation(null);
      // A durable inbox is not an applied change. Only the backend's lastSyncAt
      // is rendered as the last successful transfer time.
      if (command.type === "syncNow")
        setNotice(
          result.status.pendingCount
            ? "已接收的数据仍在等待安全应用"
            : "同步请求已发送，请查看连接状态与最近成功时间",
        );
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "同步操作未完成，请重试";
      if (alive.current && activeRef.current && ticket === generation.current)
        setError((previous) => (background ? previous || message : message));
      throw cause;
    } finally {
      if (querying) reading.current = false;
      else {
        working.current = false;
        if (alive.current) setBusy(false);
      }
      // StrictMode replay or a hidden/visible transition invalidates publication.
      // Query the current lifetime after the old operation releases singleflight.
      if (alive.current && activeRef.current && ticket !== generation.current)
        queueMicrotask(() => {
          if (
            alive.current &&
            activeRef.current &&
            !working.current &&
            !reading.current
          )
            request({ type: conflictsOnly ? "conflicts" : "status" }, true);
        });
    }
  };
  const request = (command: SyncCommand, background = false) =>
    void run(command, false, background).catch(() => {});
  useEffect(() => {
    if (!active) return;
    if (!working.current && !reading.current) request({ type: conflictsOnly ? "conflicts" : "status" }, true);
    const interval = window.setInterval(() => {
      if (
        activeRef.current &&
        !working.current &&
        !reading.current &&
        document.visibilityState !== "hidden"
      )
        request({ type: conflictsOnly ? "conflicts" : "status" }, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [active]);
  useEffect(() => {
    onHandle({
      dismiss: () => {
        if (confirmation) { setConfirmation(null); return true; }
        if (!conflictsOnly && (joining || invitation || conflicts)) { setJoining(false); setPairing(""); setInvitation(""); setConflicts(null); return true; }
        return false;
      },
      run: (command) => run(command),
      inspect: () => ({
        ...snapshot.current,
        busy: working.current || reading.current,
      }),
    });
    return () => onHandle(null);
  });
  const copy = async () => {
    if (!invitation || busy) return;
    const ticket = generation.current;
    try {
      await navigator.clipboard.writeText(invitation);
      if (alive.current && activeRef.current && ticket === generation.current)
        setNotice("配对串已复制，请仅发送给要加入的设备");
    } catch {
      if (alive.current && activeRef.current && ticket === generation.current)
        setError("复制失败，请选择配对串后手动复制");
    }
  };
  const enabled = status && status.state !== "disabled";
  return (
    <section
      className={`sync-settings${conflictsOnly ? " sync-conflicts-only" : ""}`}
      aria-label={conflictsOnly ? "冲突列表" : undefined}
      aria-labelledby={conflictsOnly ? undefined : "sync-settings-title"}
      data-sync-state={status?.state || "unknown"}
      aria-busy={busy}
    >
      {!conflictsOnly && <><header className="sync-heading">
        <h3 id="sync-settings-title">设备同步</h3>
        <span className={`sync-state sync-state-${status?.state || "unknown"}`}>
          {status?.pendingCount
            ? "等待应用"
            : status
              ? states[status.state]
              : error
                ? "状态不可用"
                : "正在读取状态"}
        </span>
        <button
          type="button"
          aria-label="刷新同步状态"
          disabled={busy}
          onClick={() => request({ type: "status" })}
        >
          <RefreshCw size={16} />
        </button>
      </header>
      <p className="sync-description">
        在你的设备间同步本地备忘录。可使用局域网、虚拟内网或隧道服务地址。
      </p>
      <div className="sync-live" role="status" aria-live="polite">
        {status?.pendingCount
          ? `已接收 ${status.pendingCount} 项，等待安全应用`
          : notice ||
            (status?.lastSyncAt
              ? `最近传输：${formatFileTime(status.lastSyncAt)}`
              : "尚无成功同步记录")}
      </div></>}
      {(error || (!conflictsOnly && status?.state === "error")) && (
        <p className="sync-error" role="alert">
          {error || "连接失败，请检查网络与服务地址后重试"}
          <button
            type="button"
            disabled={busy}
            onClick={() => request({ type: conflictsOnly ? "conflicts" : "status" })}
          >
            重试
          </button>
        </p>
      )}
      {!conflictsOnly && <>
      <div className="sync-group">
        <label className="sync-field">
          <span>本机名称</span>
          <input
            aria-label="同步设备名称"
            value={name}
            readOnly={!!enabled}
            maxLength={120}
            placeholder="例如：我的 Mac 或手机"
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!enabled && (
          <label className="sync-field">
            <span>服务端口</span>
            <input
              aria-label="同步服务端口"
              inputMode="numeric"
              value={port}
              maxLength={5}
              disabled={busy}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>
        )}
        <div className="sync-actions">
          {!enabled && (
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() =>
                request({
                  type: "startHost",
                  deviceName: name,
                  port: Number(port),
                })
              }
            >
              <Radio size={17} />
              开启此设备同步服务
            </button>
          )}
          <button
            type="button"
            disabled={busy || status?.state === "paused"}
            onClick={() => {
              setJoining((value) => !value);
              setPairing("");
              setError("");
            }}
          >
            <Link size={17} />
            {joining ? "取消连接" : enabled ? "更新连接" : "加入同步"}
          </button>
          {enabled && (
            <>
              <button
                type="button"
                disabled={busy || status.state === "paused"}
                onClick={() => request({ type: "syncNow" })}
              >
                立即同步
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  request({
                    type: status.state === "paused" ? "resume" : "stop",
                  })
                }
              >
                {status.state === "paused" ? "继续同步" : "停止同步"}
              </button>
            </>
          )}
        </div>
        {enabled && status.state === "paused" && (
          <p className="sync-description">请先继续同步，再更新连接。</p>
        )}
        {joining && (
          <div className="sync-pair">
            <label className="sync-field">
              <span>完整配对串</span>
              <input
                aria-label="粘贴完整配对串"
                type="password"
                autoComplete="off"
                data-sensitive="pairing"
                maxLength={16384}
                disabled={busy}
                onChange={(event) => setPairing(event.target.value)}
              />
            </label>
            <p>
              {enabled
                ? "请在原同步服务端为新地址重新生成配对串后粘贴。本机身份和已有笔记会保留。"
                : "从另一台设备生成配对串后粘贴。两端已有笔记会合并保留。"}
            </p>
            <button
              type="button"
              disabled={busy || !name.trim() || !pairing.trim()}
              onClick={() =>
                request({ type: "pair", deviceName: name, invitation: pairing })
              }
            >
              连接并加入
            </button>
          </div>
        )}
      </div>
      {enabled && (
        <div className="sync-group">
          {status.listenAddress && (
            <p className="sync-address">
              监听地址 <span>{status.listenAddress}</span>
            </p>
          )}
          <label className="sync-field">
            <span>服务地址</span>
            <input
              aria-label="同步服务地址"
              value={endpoint}
              placeholder="ws://192.168.1.2:49632"
              type="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={2048}
              disabled={busy}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </label>
          <div className="sync-actions">
            <button
              type="button"
              disabled={busy || status.state === "paused" || !endpoint.trim()}
              onClick={() => request({ type: "createInvite", endpoint })}
            >
              生成配对串
            </button>
          </div>
          {invitation && (
            <div className="sync-invitation">
              <label className="sync-field">
                <span>配对串</span>
                <input
                  aria-label="生成的配对串"
                  readOnly
                  data-sensitive="invitation"
                  ref={(node) => {
                    if (node && node.value !== invitation)
                      node.value = invitation;
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <p>
                有效期至 {formatFileTime(invitationExpires)}
                ，仅用于配对你的设备。关闭或切换标签后不再显示。
              </p>
              <button type="button" disabled={busy} onClick={() => void copy()}>
                <Copy size={16} />
                复制配对串
              </button>
            </div>
          )}
        </div>
      )}
      {enabled && (
        <div className="sync-group">
          <h4>已配对设备</h4>
          {status.peers.length ? (
            status.peers.map((peer) => (
              <div className="sync-peer" key={peer.id}>
                <div>
                  <strong>{peer.name}</strong>
                  <small>
                    {peer.connected ? "已连接" : "未连接"}
                    {peer.lastSyncAt
                      ? ` · ${formatFileTime(peer.lastSyncAt)}`
                      : " · 尚未成功同步"}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`撤销设备 ${peer.name}`}
                  onClick={() => request({ type: "revoke", peerId: peer.id })}
                >
                  撤销
                </button>
              </div>
            ))
          ) : (
            <p className="sync-description">
              尚无配对设备。生成配对串，在另一台设备选择“加入同步”。
            </p>
          )}
        </div>
      )}
      </>}
      {(conflictsOnly || enabled) && (
        <div className={conflictsOnly ? "sync-conflict-results" : "sync-group"}>
          {conflictsOnly ? <div className="sync-conflict-summary">
            <p role="status">{conflicts ? conflicts.length ? `${conflicts.length} 项冲突待处理` : "没有需要处理的冲突版本。" : error ? "冲突状态未确认。" : "正在读取冲突…"}</p>
            <button type="button" disabled={busy} onClick={() => request({ type: "conflicts" })}><RefreshCw size={15} aria-hidden="true" />刷新冲突</button>
          </div> : <button
            className="sync-conflict-link"
            type="button"
            disabled={busy}
            onClick={() => request({ type: "conflicts" })}
          >
            <span>冲突版本</span>
            <span>{status?.conflictCount || 0} 项</span>
            <ChevronRight size={17} />
          </button>}
          {conflicts &&
            (conflicts.length ? (
              conflicts.map((conflict) => (
                <article
                  className="sync-conflict"
                  key={`${conflict.kind}:${conflict.entityId}`}
                >
                  <h4>
                    {conflict.kind === "note" ? "备忘录" : "文件夹"} ·{" "}
                    {conflict.variants.length} 个版本
                  </h4>
                  {conflict.variants.map((variant) => (
                    <div className="sync-variant" key={variant.digest}>
                      <strong>{variant.title || "未命名"}</strong>
                      <small>
                        {variant.updatedAt
                          ? formatFileTime(variant.updatedAt)
                          : "时间未知"}
                        {variant.purged
                          ? " · 已永久删除"
                          : variant.deleted
                            ? " · 已删除"
                            : ""}
                        {variant.locked ? " · 已锁定" : ""} ·{" "}
                        {variant.attachmentCount} 个附件
                      </small>
                      <div className="sync-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            request({
                              type: "resolve",
                              kind: conflict.kind,
                              entityId: conflict.entityId,
                              digest: variant.digest,
                              keepAll: false,
                            })
                          }
                        >
                          保留此版本
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            request({
                              type: "resolve",
                              kind: conflict.kind,
                              entityId: conflict.entityId,
                              digest: variant.digest,
                              keepAll: true,
                            })
                          }
                        >
                          全部另存并解决
                        </button>
                      </div>
                    </div>
                  ))}
                </article>
              ))
            ) : !conflictsOnly && (
              <p className="sync-description">没有需要处理的冲突版本。</p>
            ))}
        </div>
      )}
      {confirmation && (
        <div
          ref={confirmationPanel}
          className="sync-confirmation"
          role="group"
          aria-label="确认同步操作"
        >
          <strong>
            {confirmation.type === "revoke"
              ? "撤销这台设备？"
              : confirmation.keepAll
                ? "保留全部版本为独立副本？"
                : "只保留所选版本？"}
          </strong>
          <p>
            {confirmation.type === "revoke"
              ? "这台设备将不能再通过现有配对连接。本地数据保留。"
              : confirmation.keepAll
                ? "全部版本会另存为可恢复副本，再解决这一冲突。"
                : "其他冲突版本将不再保留。请确认已选择要保留的内容。"}
          </p>
          <div className="sync-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(confirmation, true).catch(() => {});
              }}
            >
              确认
              {confirmation.type === "revoke"
                ? "撤销"
                : confirmation.keepAll
                  ? "全部另存"
                  : "保留此版本"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
