import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatFileSize } from "../data-management";
import { PreferenceSegments } from "../preferences-menu/PreferenceSegments";
import type {
  BackupHours,
  BackupKeep,
  BackupStatus,
  EncryptedImportPreview,
  ImportCommitted,
  LocalBackupSettingsProps,
  RestorePreview,
} from "./contracts";
import "./LocalBackupSettings.css";

const hours: readonly [BackupHours, string][] = [
  [0, "关闭"],
  [1, "1 小时"],
  [6, "6 小时"],
  [24, "1 天"],
  [168, "1 周"],
];
const keeps: readonly BackupKeep[] = [3, 7, 14, 30];
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const message = (cause: unknown) =>
  cause &&
  typeof cause === "object" &&
  "message" in cause &&
  typeof cause.message === "string"
    ? cause.message
    : String(cause);

function Row({
  label,
  detail,
  children,
}: {
  label: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="settings121-row">
      <div className="settings121-label">
        <div className="local-backup-name">{label}</div>
        {detail && <small>{detail}</small>}
      </div>
      <div className="settings121-actions">{children}</div>
    </div>
  );
}

export function LocalBackupSettings({
  active,
  blocked,
  accessKey,
  host,
  onArchive,
  appleImport,
  encryptedArchive,
  showArchiveControls = true,
}: LocalBackupSettingsProps) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [statusUnconfirmed, setStatusUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState("");
  const [open, setOpen] = useState(false);
  const [restore, setRestore] = useState<RestorePreview | null>(null);
  const [encryptedMode, setEncryptedMode] = useState<
    "export" | "import" | null
  >(null);
  const [encryptedPreview, setEncryptedPreview] =
    useState<EncryptedImportPreview | null>(null);
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const generation = useRef(0),
    working = useRef(false),
    reading = useRef<number | null>(null),
    mounted = useRef(false);
  const current = useRef({ active, blocked });
  current.current = { active, blocked };
  const restoreTrigger = useRef<HTMLButtonElement | null>(null);
  const cancelRestore = useRef<HTMLButtonElement | null>(null);
  const focusedRestore = useRef<string | null>(null);
  const passwordInput = useRef<HTMLInputElement | null>(null);
  const encryptedTrigger = useRef<HTMLButtonElement | null>(null);
  const encryptedCancel = useRef<HTMLButtonElement | null>(null);
  const focusedEncrypted = useRef<string | null>(null);
  const encryptedOwned = useRef<{
    host: NonNullable<typeof encryptedArchive>;
    confirmation: string;
  } | null>(null);
  const valid = (ticket: number) =>
    ticket === generation.current &&
    current.current.active &&
    !current.current.blocked;
  const disabled = !active || blocked || !!operation || loading;
  const statusDisabled = disabled || statusUnconfirmed;
  const discardEncrypted = () => {
    const owned = encryptedOwned.current;
    encryptedOwned.current = null;
    if (owned)
      void owned.host.discardImport(owned.confirmation).catch(() => {});
  };
  const refresh = async (ticket: number, clearError = true) => {
    if (!valid(ticket) || reading.current === ticket || working.current) return;
    reading.current = ticket;
    setLoading(true);
    try {
      const value = await host.status();
      if (valid(ticket)) {
        setStatus(value);
        setStatusUnconfirmed(false);
        if (clearError) setError("");
      }
    } catch (cause) {
      if (valid(ticket)) {
        setStatusUnconfirmed(true);
        setError(message(cause));
      }
    } finally {
      if (reading.current === ticket) reading.current = null;
      if (valid(ticket)) setLoading(false);
    }
  };
  const refreshCurrent = useRef((clearError = true) =>
    refresh(generation.current, clearError),
  );
  refreshCurrent.current = (clearError = true) =>
    refresh(generation.current, clearError);
  useLayoutEffect(() => {
    mounted.current = true;
    generation.current++;
    setStatus(null);
    setStatusUnconfirmed(false);
    setError("");
    setNotice("");
    setLoading(false);
    setOperation(working.current ? "pending" : "");
    setRestore(null);
    setEncryptedMode(null);
    setEncryptedPreview(null);
    setPassword("");
    setPasswordAgain("");
    discardEncrypted();
    return () => {
      mounted.current = false;
      generation.current++;
      discardEncrypted();
    };
  }, [active, blocked, accessKey, host, encryptedArchive]);
  useEffect(() => {
    if (!active || blocked) return;
    const ticket = generation.current;
    void refresh(ticket);
    const timer = window.setInterval(() => void refresh(ticket), 30_000);
    return () => window.clearInterval(timer);
  }, [active, blocked, accessKey, host, encryptedArchive]);
  useEffect(() => {
    if (!restore) {
      focusedRestore.current = null;
      return;
    }
    if (!disabled && focusedRestore.current !== restore.confirmation) {
      cancelRestore.current?.focus();
      focusedRestore.current = restore.confirmation;
    }
  }, [restore, disabled]);
  useEffect(() => {
    if (encryptedMode && !encryptedPreview) passwordInput.current?.focus();
  }, [encryptedMode, encryptedPreview]);
  useEffect(() => {
    if (!encryptedPreview) {
      focusedEncrypted.current = null;
      return;
    }
    if (
      !disabled &&
      focusedEncrypted.current !== encryptedPreview.confirmation
    ) {
      encryptedCancel.current?.focus();
      focusedEncrypted.current = encryptedPreview.confirmation;
    }
  }, [encryptedPreview, disabled]);

  const run = async (
    name: string,
    action: (ticket: number) => Promise<string | void>,
  ) => {
    if (
      !current.current.active ||
      current.current.blocked ||
      working.current ||
      reading.current === generation.current
    )
      return;
    const ticket = generation.current;
    working.current = true;
    setOperation(name);
    setError("");
    setNotice("");
    try {
      const text = await action(ticket);
      if (valid(ticket) && text) setNotice(text);
    } catch (cause) {
      if (valid(ticket)) setError(message(cause));
    } finally {
      working.current = false;
      if (mounted.current) {
        setOperation("");
        await refreshCurrent.current(false);
      }
    }
  };
  const configure = (patch: Parameters<typeof host.configure>[0]) =>
    run("configure", async (ticket) => {
      const value = await host.configure(patch);
      if (valid(ticket)) {
        setStatus(value);
        setRestore(null);
      }
    });
  const archive = (mode: "export" | "import") =>
    run(mode, async () => {
      const result = await onArchive(mode);
      if (result.status === "error") throw Error(result.message);
      if (result.status === "success")
        return mode === "export" ? "本地备份已导出" : "本地备份已导入";
    });
  const closeRestore = () => {
    setRestore(null);
    restoreTrigger.current?.focus();
  };
  const closeEncrypted = () => {
    discardEncrypted();
    setEncryptedMode(null);
    setEncryptedPreview(null);
    setPassword("");
    setPasswordAgain("");
    encryptedTrigger.current?.focus();
  };
  const committedWarning = (result: ImportCommitted) => {
    const issues = [
      result.maintenanceError?.message,
      result.refreshError,
    ].filter(Boolean);
    if (issues.length)
      setError(
        `导入已提交，但后续维护或界面刷新未完成：${issues.join("；")}。请重新读取或重新打开界面查看，勿重复导入。`,
      );
  };
  const encrypted = () =>
    run("encrypted", async (ticket) => {
      if (!encryptedArchive || !encryptedMode) return;
      if (encryptedMode === "import" && encryptedPreview) {
        const result = await encryptedArchive.confirmImport(
          encryptedPreview.confirmation,
        );
        if (valid(ticket)) {
          encryptedOwned.current = null;
          closeEncrypted();
          committedWarning(result);
        }
        return "加密备份已导入";
      }
      if (!password) throw Error("请输入备份密码");
      if (encryptedMode === "export" && password !== passwordAgain)
        throw Error("两次输入的密码不一致");
      try {
        if (encryptedMode === "export") {
          const result = await encryptedArchive.export(password);
          if (result.status === "error") throw Error(result.message);
          if (valid(ticket)) closeEncrypted();
          return result.status === "success" ? "加密备份已导出" : undefined;
        }
        const preview = await encryptedArchive.prepareImport(password);
        if (!preview) {
          if (valid(ticket)) closeEncrypted();
          return;
        }
        if (!valid(ticket)) {
          await encryptedArchive.discardImport(preview.confirmation);
          return;
        }
        encryptedOwned.current = {
          host: encryptedArchive,
          confirmation: preview.confirmation,
        };
        setEncryptedPreview(preview);
      } finally {
        if (valid(ticket)) {
          setPassword("");
          setPasswordAgain("");
        }
      }
    });

  return (
    <section
      className="local-backup-settings"
      data-backup-state={blocked ? "blocked" : statusUnconfirmed ? "unconfirmed" : status ? "ready" : "loading"}
      aria-label="导入与备份"
      hidden={!active}
      inert={!active}
    >
      {(showArchiveControls || encryptedArchive || appleImport) && (
        <div className="settings121-list">
          {showArchiveControls && (
            <Row
              label="导入与导出"
              detail="当前备忘录、附件原文件及归档设置；不含账户或 Agent 授权文件。"
            >
              <button
                className="settings121-text"
                type="button"
                disabled={disabled}
                onClick={() => void archive("import")}
              >
                导入…
              </button>
              <button
                className="settings121-text"
                type="button"
                disabled={disabled}
                onClick={() => void archive("export")}
              >
                导出…
              </button>
            </Row>
          )}
          {encryptedArchive && (
            <Row
              label="加密备份"
              detail="使用密码保护导出文件；密码错误或文件损坏时不导入。"
            >
              <button
                className="settings121-text"
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  encryptedTrigger.current = event.currentTarget;
                  closeEncrypted();
                  setEncryptedMode("import");
                }}
              >
                加密导入…
              </button>
              <button
                className="settings121-text"
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  encryptedTrigger.current = event.currentTarget;
                  closeEncrypted();
                  setEncryptedMode("export");
                }}
              >
                加密导出…
              </button>
            </Row>
          )}
          {encryptedMode && (
            <form
              className="local-backup-confirm"
              onSubmit={(event) => {
                event.preventDefault();
                void encrypted();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!working.current) closeEncrypted();
                }
              }}
            >
              <strong>
                {encryptedMode === "export"
                  ? "加密导出备份"
                  : encryptedPreview
                    ? "确认导入加密备份"
                    : "打开加密备份"}
              </strong>
              {encryptedPreview ? (
                <>
                  <p>{encryptedPreview.archive.summary}</p>
                  <p>
                    {encryptedPreview.archive.notes} 条备忘录 ·{" "}
                    {encryptedPreview.archive.attachments}{" "}
                    个附件。先保存当前业务投影快照，再新增副本并应用归档设置。
                  </p>
                </>
              ) : (
                <>
                  <label>
                    备份密码
                    <input
                      ref={passwordInput}
                      type="password"
                      autoComplete={
                        encryptedMode === "export"
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      disabled={disabled}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {encryptedMode === "export" && (
                    <label>
                      再次输入
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwordAgain}
                        disabled={disabled}
                        onChange={(event) =>
                          setPasswordAgain(event.target.value)
                        }
                      />
                    </label>
                  )}
                  <p>
                    {encryptedMode === "export"
                      ? "请妥善保管密码，丢失后无法打开此备份。"
                      : "选择文件后会先解密并显示预览，确认后才导入。"}
                  </p>
                </>
              )}
              <div className="local-backup-confirm-tools">
                <button
                  className="settings121-text"
                  type="button"
                  ref={encryptedCancel}
                  disabled={disabled}
                  onClick={closeEncrypted}
                >
                  取消
                </button>
                <button
                  className="settings121-text"
                  type="submit"
                  disabled={disabled}
                >
                  {encryptedPreview
                    ? "确认导入"
                    : encryptedMode === "export"
                      ? "选择位置并导出…"
                      : "选择文件并预览…"}
                </button>
              </div>
            </form>
          )}
          {appleImport && (
            <div className="local-backup-apple">{appleImport}</div>
          )}
        </div>
      )}
      <div className="settings121-list" aria-busy={loading || !!operation}>
        <Row
          label="自动本地备份"
          detail={
            status
              ? status.config.hours
                ? "应用运行且权限有效、没有录音时备份到本机文件夹。"
                : "默认关闭，不会自动创建备份。"
              : "读取后显示自动备份状态"
          }
        >
          <PreferenceSegments
            label="自动备份间隔"
            value={status?.config.hours}
            options={hours.map(([value, label]) => ({ value, label }))}
            disabled={statusDisabled || !status}
            onChange={(hours) => void configure({ hours })}
          />
        </Row>
        <Row
          label="保留份数"
          detail="新备份写入并校验成功后，才清理此资料库已验证的旧版本。"
        >
          <PreferenceSegments
            label="保留备份份数"
            value={status?.config.keep}
            options={keeps.map((value) => ({ value, label: String(value) }))}
            disabled={statusDisabled || !status}
            onChange={(keep) => void configure({ keep })}
          />
        </Row>
        <Row
          label="备份文件夹"
          detail={status?.directory || "读取后显示备份位置"}
        >
          {status?.directoryMode === "selectableFilesystem" &&
            host.chooseDirectory && (
              <button
                className="settings121-text"
                type="button"
                disabled={statusDisabled || !status}
                onClick={() =>
                  void run("directory", async (ticket) => {
                    const path = await host.chooseDirectory!();
                    if (path !== null && valid(ticket)) {
                      const value = await host.configure({ directory: path });
                      if (valid(ticket)) {
                        setStatus(value);
                        setRestore(null);
                      }
                    }
                  })
                }
              >
                更改…
              </button>
            )}
          {host.revealDirectory && status && (
            <button
              className="settings121-text"
              type="button"
              disabled={statusDisabled}
              onClick={() =>
                void run("reveal", async () => {
                  await host.revealDirectory!(status.directory);
                })
              }
            >
              显示
            </button>
          )}
          {status?.directoryMode === "selectableFilesystem" &&
            host.chooseDirectory &&
            status.config.directory && (
              <button
                className="settings121-text"
                type="button"
                disabled={statusDisabled}
                onClick={() => void configure({ directory: "" })}
              >
                默认
              </button>
            )}
        </Row>
        {status?.directoryMode === "privateOnly" && (
          <p className="local-backup-status local-backup-private">
            备份保存在应用私有目录。卸载应用或丢失设备可能一并丢失备份，请使用单文件导出另存；此平台暂不支持外部备份文件夹。
          </p>
        )}
        <Row
          label={
            <button
              type="button"
              className="settings121-text local-backup-fold"
              aria-expanded={open}
              disabled={!status?.versions.length}
              onClick={() => setOpen(!open)}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              版本
            </button>
          }
          detail={
            status
              ? status.versions.length
                ? `${status.versions.length} 个备份 · 最新 ${when(status.versions[0].manifest.createdAtMs)}`
                : "尚无备份"
              : "正在读取备份状态…"
          }
        >
          <button
            className="settings121-text"
            type="button"
            disabled={statusDisabled || !status}
            onClick={() =>
              void run("backup", async () => {
                await host.backupNow();
                return "本地备份已创建";
              })
            }
          >
            {operation === "backup" ? "备份中…" : "立即备份"}
          </button>
        </Row>
        {open &&
          status?.versions.map((version) => (
            <Row
              key={version.name}
              label={when(version.manifest.createdAtMs)}
              detail={`${version.manifest.reason === "beforeRestore" ? "恢复前的业务投影 · " : ""}${formatFileSize(version.manifest.archiveBytes)} · v${version.manifest.appVersion}`}
            >
              <button
                className="settings121-text"
                type="button"
                disabled={statusDisabled}
                onClick={(event) => {
                  restoreTrigger.current = event.currentTarget;
                  void run("preview", async (ticket) => {
                    const preview = await host.prepareRestore(version.name);
                    if (valid(ticket)) setRestore(preview);
                  });
                }}
              >
                恢复…
              </button>
            </Row>
          ))}
        {restore && (
          <section
            className="local-backup-confirm"
            role="group"
            aria-label="确认恢复备份"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (!working.current) closeRestore();
              }
            }}
          >
            <strong>
              导入 {when(restore.version.manifest.createdAtMs)} 的备份？
            </strong>
            <p>
              {restore.archive.notes} 条备忘录 · {restore.archive.folders}{" "}
              个文件夹 · {restore.archive.attachments} 个附件
            </p>
            <p>{restore.archive.summary}</p>
            <p>
              先保存当前业务投影快照，再沿现有导入规则新增副本并应用设置，不会原位回退。快照不含全部历史版本或待应用收件；现有冲突与删除记录必须保留。导入会更新应用身份，已有
              Agent 授权上下文失效。
            </p>
            <div className="local-backup-confirm-tools">
              <button
                className="settings121-text"
                type="button"
                ref={cancelRestore}
                disabled={disabled}
                onClick={closeRestore}
              >
                取消
              </button>
              <button
                className="settings121-text"
                type="button"
                disabled={statusDisabled}
                onClick={() =>
                  void run("restore", async (ticket) => {
                    const result = await host.restore(restore.confirmation);
                    if (valid(ticket)) {
                      closeRestore();
                      committedWarning(result);
                    }
                    return "备份已导入；恢复前的业务投影快照已保留";
                  })
                }
              >
                {operation === "restore" ? "恢复中…" : "确认恢复"}
              </button>
            </div>
          </section>
        )}
        <Row
          label="数据文件夹"
          detail={status?.dataDirectory || "读取后显示数据位置"}
        >
          {host.revealDirectory && status && (
            <button
              className="settings121-text"
              type="button"
              disabled={statusDisabled}
              onClick={() =>
                void run("reveal-data", async () => {
                  await host.revealDirectory!(status.dataDirectory);
                })
              }
            >
              显示
            </button>
          )}
        </Row>
      </div>
      {statusUnconfirmed && status && (
        <p className="local-backup-status" role="status">当前状态未确认，显示上次读取结果</p>
      )}
      {blocked && (
        <p className="local-backup-status" role="status">
          请先完成录音或当前数据操作，并确认资料库访问权限。
        </p>
      )}
      {loading && !status && (
        <p className="local-backup-status" role="status">
          正在读取本地备份…
        </p>
      )}
      {status?.automaticSuspended && (
        <p className="local-backup-status local-backup-error" role="alert">
          自动备份已暂停：{status.lastError?.message || "请检查资料库访问状态"}{" "}
          <button
            className="settings121-text"
            type="button"
            disabled={statusDisabled}
            onClick={() => void configure({ hours: status.config.hours })}
          >
            重新启用
          </button>
        </p>
      )}
      {!!status?.issues.length && (
        <p className="local-backup-status local-backup-error" role="alert">
          {status.issues.length} 个备份文件无法验证，已保留原文件：
          {status.issues
            .map((issue) => `${issue.name}：${issue.message}`)
            .join("；")}
        </p>
      )}
      {error && (
        <p className="local-backup-status local-backup-error" role="alert">
          {error}{" "}
          <button
            className="settings121-text"
            type="button"
            disabled={disabled}
            onClick={() => void refresh(generation.current)}
          >
            重新读取
          </button>
        </p>
      )}
      {notice && (
        <p className="local-backup-status" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
export default LocalBackupSettings;
