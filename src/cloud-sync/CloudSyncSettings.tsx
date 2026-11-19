import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { cloudError, cloudSyncClient } from "./client";
import type {
  CloudClient,
  CloudCommand,
  CloudPreview,
  CloudProvider,
  CloudReply,
  CloudStatus,
  CloudSyncPorts,
} from "./types";
import "./cloud-sync.css";
import { CloudSelect } from "./CloudSelect";
const names = {
  webdav: "WebDAV",
  s3: "S3 兼容存储",
  github: "GitHub 私有仓库",
};
const fields: Record<
  CloudProvider,
  {
    key: string;
    label: string;
    hint?: string;
    secret?: boolean;
    required?: boolean;
  }[]
> = {
  webdav: [
    {
      key: "endpoint",
      label: "HTTPS 地址",
      hint: "https://dav.example.com/dav/",
      required: true,
    },
    { key: "directory", label: "目录", hint: "可留空" },
    { key: "username", label: "用户名" },
    { key: "password", label: "密码或应用密码", secret: true, required: true },
  ],
  s3: [
    {
      key: "endpoint",
      label: "Endpoint",
      hint: "https://s3.example.com",
      required: true,
    },
    {
      key: "region",
      label: "Region",
      hint: "us-east-1 / auto",
      required: true,
    },
    { key: "bucket", label: "Bucket", required: true },
    {
      key: "prefix",
      label: "Prefix",
      hint: "可留空；使用路径风格，兼容 MinIO / R2",
    },
    { key: "accessKey", label: "Access key", secret: true, required: true },
    { key: "secretKey", label: "Secret key", secret: true, required: true },
    { key: "sessionToken", label: "Session token", secret: true },
  ],
  github: [
    { key: "owner", label: "仓库所有者", required: true },
    { key: "repo", label: "私有仓库名称", required: true },
    { key: "branch", label: "已有分支", hint: "main", required: true },
    { key: "prefix", label: "目录", hint: "可留空" },
    {
      key: "token",
      label: "访问令牌",
      hint: "需要此仓库的 Contents 读写权限",
      secret: true,
      required: true,
    },
  ],
};
type Draft = {
  values: Record<string, string>;
  secrets: Record<string, string>;
};
export type CloudSyncSettingsProps = {
  active: boolean;
  ports: CloudSyncPorts;
  client?: CloudClient;
};
export function CloudSyncSettings({
  active,
  ports,
  client = cloudSyncClient,
}: CloudSyncSettingsProps) {
  const id = useId();
  const [status, setStatus] = useState<CloudStatus>();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<CloudProvider>("webdav");
  const [enabled, setEnabled] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<CloudProvider, Draft>>>(
    {},
  );
  const [passphrase, setPassphrase] = useState("");
  const [preview, setPreview] = useState<CloudPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const generation = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const request = useRef({ ports, client });
  request.current = { ports, client };
  const setupButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = active;
    const current = ++generation.current;
    setPreview(undefined);
    setDrafts({});
    setPassphrase("");
    setOpen(false);
    setMessage("");
    setFailure("");
    if (!active) {
      setStatus(undefined);
      return;
    }
    setBusy(true);
    const { ports: p, client: c } = request.current;
    void p
      .context()
      .then((ctx) => c(ctx, { type: "status" }))
      .then((reply) => {
        if (!mounted.current || current !== generation.current) return;
        setStatus(reply.status);
        setProvider(reply.status.selected);
        setEnabled(reply.status.enabled);
      })
      .catch((e) => {
        if (mounted.current && current === generation.current)
          setFailure(cloudError(e).message);
      })
      .finally(() => {
        if (mounted.current && current === generation.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, [active]);
  const run = async (
    command: CloudCommand,
  ): Promise<CloudReply | undefined> => {
    if (!active || inFlight.current) return;
    inFlight.current = true;
    const current = generation.current;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      const ctx = await request.current.ports.context();
      if (!mounted.current || current !== generation.current) return;
      const reply = await request.current.client(ctx, command);
      if (!mounted.current || current !== generation.current) return;
      setStatus(reply.status);
      setMessage(reply.message || "");
      setPreview(reply.preview);
      if (reply.result) await request.current.ports.onCommitted?.(reply.result);
      if (!mounted.current || current !== generation.current) return;
      return reply;
    } catch (e) {
      if (mounted.current && current === generation.current)
        setFailure(cloudError(e).message);
    } finally {
      inFlight.current = false;
      if (mounted.current && current === generation.current) setBusy(false);
    }
  };
  const close = () => {
    setOpen(false);
    setDrafts({});
    setPassphrase("");
    setupButton.current?.focus();
  };
  const draft = drafts[provider];
  const value = (key: string) =>
    draft?.values[key] ?? status?.providers[provider]?.fields[key] ?? "";
  const update = (key: string, text: string, secret: boolean) =>
    setDrafts((all) => ({
      ...all,
      [provider]: {
        values: {
          ...all[provider]?.values,
          ...(!secret ? { [key]: text } : {}),
        },
        secrets: {
          ...all[provider]?.secrets,
          ...(secret ? { [key]: text } : {}),
        },
      },
    }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!status) return;
    const result = await run({
      type: "save",
      patch: {
        expectedRevision: status.revision,
        enabled,
        selected: provider,
        provider,
        fields: draft?.values,
        secrets: draft?.secrets,
        ...(passphrase ? { passphrase } : {}),
      },
    });
    if (result) {
      setPassphrase("");
      setDrafts({});
      close();
    }
  };
  const apply = async (mode: "sync" | "restore") => {
    if (!preview || busy) return;
    const current = generation.current;
    const question =
      mode === "restore"
        ? `恢复所选 ${preview.versions} 个版本及 ${preview.attachments} 个附件？当前本机内容会先加密保留；恢复保留稳定 ID 和并发分支。`
        : `同步本机 ${preview.localNotes} 条笔记与${preview.remoteExists ? `远端 ${preview.versions} 个版本` : "新的空远端"}？本机与远端的并发版本都会保留。`;
    if (
      !(await request.current.ports.confirm(question)) ||
      !mounted.current ||
      current !== generation.current
    )
      return;
    await run({ type: mode, previewId: preview.id });
  };
  if (!active) return null;
  return (
    <section
      className="settings121-list cloud-sync-settings"
      aria-label="用户云存储同步"
      aria-busy={busy}
      onKeyDown={(e) => {
        if (e.key === "Escape" && (open || preview)) {
          e.stopPropagation();
          e.preventDefault();
          if (preview) setPreview(undefined);
          else close();
        }
      }}
    >
      <div className="settings121-row cloud-sync-row">
        <div className="settings121-label cloud-sync-who">
          <span>WebDAV / S3 / GitHub 同步</span>
          <small>
            {!status
              ? "正在读取配置…"
              : status.enabled
                ? `已启用 ${names[status.selected]}`
                : "未启用 · 使用你自己的云存储"}
          </small>
        </div>
        <button
          className="settings121-text"
          ref={setupButton}
          type="button"
          disabled={busy || !status}
          aria-expanded={open}
          aria-controls={`${id}-form`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? "收起" : "设置…"}
        </button>
      </div>
      {open && status && (
        <form id={`${id}-form`} className="cloud-sync-form" onSubmit={save}>
          <div className="cloud-sync-field">
            <span>存储服务</span>
            <CloudSelect
              label="存储服务"
              value={provider}
              disabled={busy}
              onChange={(v) => setProvider(v as CloudProvider)}
              options={Object.entries(names).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>
          {fields[provider].map((f) => (
            <label className="cloud-sync-field" key={`${provider}-${f.key}`}>
              <span>{f.label}</span>
              <span>
                <input
                  aria-label={f.label}
                  type={f.secret ? "password" : "text"}
                  value={
                    f.secret ? (draft?.secrets[f.key] ?? "") : value(f.key)
                  }
                  placeholder={
                    f.secret &&
                    status.providers[provider]?.credentialsSet[f.key]
                      ? "已保存；输入新值以替换"
                      : f.hint
                  }
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  required={
                    enabled &&
                    f.required &&
                    !(
                      f.secret &&
                      status.providers[provider]?.credentialsSet[f.key]
                    )
                  }
                  onChange={(e) => update(f.key, e.target.value, !!f.secret)}
                />
                {f.hint && <small>{f.hint}</small>}
              </span>
            </label>
          ))}
          <label className="cloud-sync-field">
            <span>加密密码</span>
            <span>
              <input
                aria-label="加密密码"
                type="password"
                value={passphrase}
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                required={enabled && !status.passphraseSet}
                disabled={busy}
                placeholder={
                  status.passphraseSet
                    ? "已保存；留空保留"
                    : "至少 8 个字符，各设备保持一致"
                }
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <small>请妥善保管。远端仅保存密文，凭据只保存在本机。</small>
            </span>
          </label>
          <label className="cloud-sync-field">
            <span>启用所选服务</span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </label>
          <p className="cloud-sync-hint">
            各服务配置分别保留；保存配置不会开始同步。支持笔记、附件与主题、视图、排序、日期分组；账户授权不上传。
          </p>
          <div className="settings121-actions cloud-sync-tools">
            <button
              className="settings121-text"
              type="button"
              disabled={busy}
              onClick={close}
            >
              取消
            </button>
            <button className="settings121-text" type="submit" disabled={busy}>
              保存配置
            </button>
          </div>
        </form>
      )}
      <div className="settings121-row cloud-sync-row">
        <div className="settings121-label cloud-sync-who">
          <span>同步状态</span>
          <small>
            {status?.lastSuccess
              ? `上次完成：${new Date(status.lastSuccess * 1000).toLocaleString("zh-CN")}`
              : "尚未完成同步"}
          </small>
        </div>
        <div className="settings121-actions cloud-sync-tools">
          <button
            className="settings121-text"
            disabled={busy || !status?.enabled}
            onClick={() => void run({ type: "test" })}
          >
            测试连接
          </button>
          <button
            className="settings121-text"
            disabled={busy || !status?.enabled}
            onClick={() => void run({ type: "preview" })}
          >
            立即同步…
          </button>
          <button
            className="settings121-text"
            disabled={busy || !status?.enabled}
            onClick={() => void run({ type: "preview" })}
          >
            预览
          </button>
        </div>
      </div>
      <div className="settings121-row cloud-sync-row">
        <div className="settings121-label cloud-sync-who">
          <span>自动同步</span>
          <small>仅在应用运行且权限有效时执行</small>
        </div>
        <CloudSelect
          label="自动同步"
          disabled={busy || !status}
          value={String(status?.minutes ?? 0)}
          options={[
            [0, "关闭"],
            [3, "3 分钟"],
            [15, "15 分钟"],
            [30, "30 分钟"],
            [60, "60 分钟"],
          ].map(([value, label]) => ({
            value: String(value),
            label: String(label),
          }))}
          onChange={(v) =>
            status &&
            void run({
              type: "save",
              patch: {
                expectedRevision: status.revision,
                minutes: Number(v) as CloudStatus["minutes"],
              },
            })
          }
        />
      </div>
      <div className="settings121-row cloud-sync-row">
        <div className="settings121-label cloud-sync-who">
          <span>恢复版本</span>
          <small>恢复前预览，并保留当前本机版本</small>
        </div>
        <div className="settings121-actions cloud-sync-tools">
          <button
            className="settings121-text"
            disabled={busy || !status?.enabled}
            onClick={() => void run({ type: "preview" })}
          >
            从远端恢复…
          </button>
          {!!status?.recoveries.length && (
            <CloudSelect
              label="预览本机保护版本"
              value=""
              disabled={busy}
              onChange={(v) => v && void run({ type: "preview", recovery: v })}
              options={[
                {
                  value: "",
                  label: `本机保护版本（${status.recoveries.length}）`,
                },
                ...status.recoveries.map((value, i) => ({
                  value,
                  label: `版本 ${i + 1} · ${value.slice(0, 8)}`,
                })),
              ]}
            />
          )}
        </div>
      </div>
      {preview && (
        <div className="cloud-sync-preview" role="region" aria-label="同步预览">
          <p>
            {preview.source === "remote" ? "远端预览" : "本机保护版本"}：
            {preview.versions} 个版本 · {preview.attachments} 个附件 ·{" "}
            {(preview.bytes / 1024).toFixed(1)} KiB
          </p>
          <p>
            本机 {preview.localNotes} 条笔记；远端含 {preview.conflicts}{" "}
            组冲突。并发分支保留，恢复会产生可同步的新版本。
          </p>
          <div className="settings121-actions cloud-sync-tools">
            <button
              className="settings121-text"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              关闭预览
            </button>
            {preview.remoteExists && (
              <button
                className="settings121-text"
                disabled={busy}
                onClick={() => void apply("restore")}
              >
                恢复此版本…
              </button>
            )}
            {preview.source === "remote" && (
              <button
                className="settings121-text"
                disabled={busy}
                onClick={() => void apply("sync")}
              >
                确认同步…
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className="cloud-sync-feedback"
        role={failure ? "alert" : "status"}
        aria-live="polite"
      >
        {busy
          ? "正在处理…"
          : failure || message || status?.lastError?.message || ""}
      </div>
    </section>
  );
}
