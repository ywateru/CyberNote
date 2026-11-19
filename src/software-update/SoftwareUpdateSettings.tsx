import type { ReactNode } from "react";
import { useSoftwareUpdate } from "./useSoftwareUpdate";
import type { UpdateStatus } from "./types";
import "./software-update.css";
export function updateMessage(s: UpdateStatus): string {
  switch (s.phase) {
    case "idle":
      return "尚未检查更新";
    case "checking":
      return "正在检查更新…";
    case "no_release":
      return s.preferences.channel === "stable"
        ? "尚无稳定版发布"
        : "尚无可用发布";
    case "up_to_date":
      return "此频道没有比当前版本更新的发布";
    case "available":
      return `发现新版本 ${s.release?.version ?? ""}`;
    case "downloading":
      return `正在下载… ${s.total ? Math.min(100, Math.floor((s.downloaded / s.total) * 100)) + "%" : ""}`;
    case "verifying":
      return "正在校验 SHA-256 和安装包…";
    case "ready":
      return "下载校验完成";
    case "staging":
      return "正在验证并暂存安装包…";
    case "awaiting_confirmation":
      return "等待确认并完成保存、结束录音…";
    case "restarting":
      return "已请求退出；重启后验证结果，尚未确认安装成功";
    case "error":
      return "上次更新操作未完成";
  }
}
export function friendlyUpdateError(error: string): string {
  if (/missing_asset/.test(error)) return "新发布缺少此平台的安装包或校验资料";
  if (/unsupported_platform/.test(error)) return "当前发布不支持此平台或架构";
  if (/checksum/.test(error)) return "SHA-256 校验失败，请重新下载";
  if (/identity|bundle_arch|invalid_apk|archive|package_validation/.test(error))
    return "安装包身份、版本、架构或完整性不符合要求";
  if (/network|http_|timeout/.test(error))
    return "暂时无法连接更新服务，请稍后重试";
  if (/downgrade/.test(error)) return "此发布不比当前版本新，无法降级安装";
  if (/preferences/.test(error))
    return "更新设置无法保存或已被其他进程修改，请重新打开应用后重试";
  if (/guard|record|save|cancel|declin|busy/.test(error))
    return "安装未继续：请确认保存、录音状态及安装操作";
  if (/pending_install|rollback/.test(error))
    return "上次安装需要恢复检查，旧安装包及记录已保留";
  if (/writable|location|app_bundle/.test(error))
    return "无法替换当前位置的应用，请将应用移至可写的应用程序文件夹";
  return "更新操作未完成，请重试";
}
function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings121-row software-update-row">
      <div className="settings121-label software-update-who">
        <span>{title}</span>
        {detail && <small>{detail}</small>}
      </div>
      <div className="settings121-actions software-update-value">
        {children}
      </div>
    </div>
  );
}
function Toggle({
  label,
  checked,
  disabled,
  change,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  change(value: boolean): void;
}) {
  return (
    <label className="software-update-toggle">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => change(e.target.checked)}
      />
      <span className="software-update-toggle-track" aria-hidden="true" />
    </label>
  );
}
export function SoftwareUpdateSettings() {
  const u = useSoftwareUpdate();
  const s = u.status;
  if (!s)
    return (
      <div className="settings121-list software-update-settings">
        <p role={u.error ? "alert" : "status"}>
          {u.error
            ? "无法读取原生更新服务，请确认宿主已完成注册"
            : "正在读取更新设置…"}
        </p>
      </div>
    );
  const p = s.preferences;
  const error = u.error ?? s.error;
  return (
    <section
      className="settings121-list software-update-settings"
      aria-label="软件更新"
    >
      <Row
        title="版本"
        detail={
          <span role="status" aria-live="polite">
            {updateMessage(s)}
          </span>
        }
      >
        <code>{s.currentVersion}</code>
        <button
          className="settings121-text"
          type="button"
          disabled={u.busy}
          onClick={() => void u.check()}
        >
          检查更新
        </button>
      </Row>
      <Row title="更新来源" detail="固定使用本项目 GitHub Releases">
        <span>ywateru/CyberNote</span>
      </Row>
      <Row title="启动时检查" detail="仅检查发布信息，安装始终需要手动确认">
        <Toggle
          label="启动时检查"
          checked={p.checkOnStartup}
          disabled={u.busy}
          change={(v) => void u.configure({ checkOnStartup: v })}
        />
      </Row>
      <Row title="定时检查">
        <Toggle
          label="定时检查"
          checked={p.automaticChecks}
          disabled={u.busy}
          change={(v) => void u.configure({ automaticChecks: v })}
        />
      </Row>
      <Row
        title="检查频率"
        detail={p.automaticChecks ? "自动检查的间隔" : "开启定时检查后生效"}
      >
        <select
          aria-label="检查频率"
          value={p.intervalMinutes}
          disabled={u.busy || !p.automaticChecks}
          onChange={(e) =>
            void u.configure({ intervalMinutes: Number(e.target.value) })
          }
        >
          {[15, 30, 60, 360, 720, 1440].map((n) => (
            <option key={n} value={n}>
              {n < 60 ? `${n} 分钟` : `${n / 60} 小时`}
            </option>
          ))}
        </select>
      </Row>
      <Row title="更新频道" detail="只提供比当前版本新的发布，不支持降级">
        <select
          aria-label="更新频道"
          value={p.channel}
          disabled={u.busy}
          onChange={(e) =>
            void u.configure({
              channel: e.target.value as "stable" | "preview",
            })
          }
        >
          <option value="stable">稳定版</option>
          <option value="preview">包含预发布</option>
        </select>
      </Row>
      <Row
        title="更新徽标"
        detail={
          p.quietUntil > Date.now() / 1000
            ? "已隐藏三天，设置页仍可检查更新"
            : "有新版本时在标题栏显示"
        }
      >
        {s.release && p.showBadge && p.quietUntil <= Date.now() / 1000 && (
          <button
            className="settings121-text"
            type="button"
            disabled={u.busy}
            onClick={() =>
              void u.configure({
                quietUntil: Math.floor(Date.now() / 1000) + 3 * 86400,
              })
            }
          >
            隐藏更新徽标三天
          </button>
        )}
        {p.quietUntil > Date.now() / 1000 && (
          <button
            className="settings121-text"
            type="button"
            disabled={u.busy}
            onClick={() => void u.configure({ quietUntil: 0 })}
          >
            立即显示
          </button>
        )}
        <Toggle
          label="显示更新徽标"
          checked={p.showBadge}
          disabled={u.busy}
          change={(v) => void u.configure({ showBadge: v })}
        />
      </Row>
      {s.release && (
        <>
          <Row
            title={`新版本 ${s.release.version}`}
            detail={`${s.release.platform} · ${s.release.architecture} · ${(s.release.size / 1e6).toFixed(1)} MB`}
          >
            {s.phase !== "ready" && (
              <button
                className="settings121-text"
                type="button"
                disabled={u.busy}
                onClick={() => void u.download()}
              >
                下载 {s.release.version}
              </button>
            )}
            {s.phase === "ready" && s.installMode === "replace_restart" && (
              <button
                className="settings121-text"
                type="button"
                disabled={u.busy}
                onClick={() => void u.install()}
              >
                安装并重新启动…
              </button>
            )}
            {s.phase === "ready" && s.installMode === "download_only" && (
              <span>已校验，无法安装</span>
            )}
          </Row>
          <details className="software-update-notes">
            <summary className="settings121-row">
              <span className="settings121-label">
                版本说明 · {s.release.version}
              </span>
            </summary>
            <pre>{s.release.notes || "发布者未提供版本说明。"}</pre>
          </details>
        </>
      )}
      {s.total > 0 && ["downloading", "verifying"].includes(s.phase) && (
        <div className="software-update-progress">
          <progress
            aria-label="更新下载进度"
            max={s.total}
            value={s.downloaded}
          />
          <span>
            {(s.downloaded / 1e6).toFixed(1)} / {(s.total / 1e6).toFixed(1)} MB
          </span>
        </div>
      )}
      {error && (
        <div className="software-update-error" role="alert">
          <span>{friendlyUpdateError(error)}</span>
          <button
            className="settings121-text"
            type="button"
            disabled={u.busy}
            onClick={() => void u.retry()}
          >
            重试
          </button>
          <details>
            <summary>错误详情</summary>
            <pre>{error}</pre>
          </details>
        </div>
      )}
      {s.installReport && (
        <p className="software-update-footnote" role="status">
          {s.installReport}
        </p>
      )}
      <p className="software-update-footnote">{s.installReason}</p>
      <p className="software-update-footnote">
        下载与发布的 SHA-256、回执核对。当前发布未提供独立签名的校验清单，不代表
        Developer ID 或公证认证。
        {s.lastChecked
          ? ` 上次检查：${new Date(s.lastChecked * 1000).toLocaleString("zh-CN")}`
          : ""}
      </p>
    </section>
  );
}
