import { useLayoutEffect, useId, useRef, useState } from "react";
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
  ConfigPatch,
} from "./types";
import "./cloud-sync.css";
import { PreferenceSegments } from "../preferences-menu/PreferenceSegments";
import { PreferenceSelect } from "../preferences-menu/PreferenceSelect";
import { useMobileInteraction } from "../platform/interaction";
const names = {
  webdav: "WebDAV",
  s3: "S3",
  github: "GitHub",
};
const providers = [
  { value: "webdav", label: names.webdav },
  { value: "s3", label: names.s3 },
  { value: "github", label: names.github },
] as const;
const intervals = [
  { value: "0", label: "关闭" }, { value: "3", label: "3 分钟" },
  { value: "15", label: "15 分钟" }, { value: "30", label: "30 分钟" },
  { value: "60", label: "1 小时" },
] as const;
const fields: Record<
  CloudProvider,
  {
    key: string;
    label: string;
    hint?: string;
    detail?: string;
    advanced?: boolean;
    secret?: boolean;
    required?: boolean;
  }[]
> = {
  webdav: [
    {
      key: "endpoint",
      label: "地址",
      hint: "https://dav.jianguoyun.com/dav/",
      detail: "输入 WebDAV 服务的 HTTPS 地址。",
      required: true,
    },
    { key: "directory", label: "目录", hint: "可留空", advanced: true },
    { key: "username", label: "用户", hint: "用户名" },
    { key: "password", label: "密码", hint: "密码或应用密码", secret: true, required: true },
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
      hint: "可留空",
      detail: "使用路径风格，兼容 MinIO 和 R2。",
      advanced: true,
    },
    { key: "accessKey", label: "Access key", secret: true, required: true },
    { key: "secretKey", label: "Secret key", secret: true, required: true },
    { key: "sessionToken", label: "Session token", secret: true, advanced: true },
  ],
  github: [
    { key: "owner", label: "仓库所有者", required: true },
    { key: "repo", label: "私有仓库名称", required: true },
    { key: "branch", label: "已有分支", hint: "main", required: true },
    { key: "prefix", label: "目录", hint: "可留空", advanced: true },
    {
      key: "token",
      label: "访问令牌",
      detail: "需要此私有仓库的 Contents 读写权限。",
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
  const mobile = useMobileInteraction();
  const [status, setStatus] = useState<CloudStatus>();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<CloudProvider>("webdav");
  const [minutes, setMinutes] = useState<CloudStatus["minutes"]>(0);
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
  const inFlight = useRef<{
    generation: number;
    id: number;
    confirming: boolean;
  } | null>(null);
  const sequence = useRef(0);
  const request = useRef({ ports, client });
  request.current = { ports, client };
  const setupButton = useRef<HTMLButtonElement>(null);
  const restoreSetupFocus = useRef(false);
  useLayoutEffect(() => {
    if (!active) restoreSetupFocus.current = false;
    if (open || busy || !restoreSetupFocus.current) return;
    restoreSetupFocus.current = false;
    setupButton.current?.focus({ preventScroll: true });
  }, [active, open, busy]);
  useLayoutEffect(() => {
    mounted.current = active;
    const current = ++generation.current;
    inFlight.current = null;
    setStatus(undefined);
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
    const owner = {
      generation: current,
      id: ++sequence.current,
      confirming: false,
    };
    inFlight.current = owner;
    const { ports: p, client: c } = request.current;
    void p
      .context()
      .then((ctx) => {
        if (
          !mounted.current ||
          current !== generation.current ||
          inFlight.current !== owner
        )
          return undefined;
        return c(ctx, { type: "status" });
      })
      .then((reply) => {
        if (
          !reply ||
          !mounted.current ||
          current !== generation.current ||
          inFlight.current !== owner
        )
          return;
        setStatus(reply.status);
        setProvider(reply.status.selected);
      })
      .catch((e) => {
        if (mounted.current && current === generation.current)
          setFailure(cloudError(e).message);
      })
      .finally(() => {
        if (inFlight.current === owner) {
          inFlight.current = null;
          if (mounted.current && current === generation.current) setBusy(false);
        }
      });
    return () => {
      mounted.current = false;
      ++generation.current;
      if (inFlight.current === owner) inFlight.current = null;
    };
  }, [active]);
  const run = async (
    command: CloudCommand,
    confirmation?: string,
  ): Promise<CloudReply | undefined> => {
    if (!active || !mounted.current || inFlight.current) return;
    const current = generation.current;
    const owner = {
      generation: current,
      id: ++sequence.current,
      confirming: confirmation !== undefined,
    };
    inFlight.current = owner;
    const valid = () =>
      mounted.current &&
      current === generation.current &&
      inFlight.current === owner;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      if (confirmation !== undefined) {
        let accepted: boolean;
        try {
          accepted = await request.current.ports.confirm(confirmation);
        } catch {
          throw {
            code: "confirmation",
            message: "无法打开确认对话框，请重试此次操作",
          };
        }
        if (!accepted || !valid()) return;
        owner.confirming = false;
      }
      const ctx = await request.current.ports.context();
      if (!valid()) return;
      const reply = await request.current.client(ctx, command);
      if (!valid()) return;
      setStatus(reply.status);
      setMessage(reply.message || "");
      setPreview(reply.preview);
      if (reply.result) await request.current.ports.onCommitted?.(reply.result);
      if (!valid()) return;
      return reply;
    } catch (e) {
      if (valid()) setFailure(cloudError(e).message);
    } finally {
      if (inFlight.current === owner) {
        inFlight.current = null;
        if (mounted.current && current === generation.current) setBusy(false);
      }
    }
  };
  const close = () => {
    restoreSetupFocus.current = true;
    setOpen(false);
    setPreview(undefined);
    setDrafts({});
    setPassphrase("");
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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!status) return;
    const patch: ConfigPatch = {
      expectedRevision: status.revision, enabled: true, selected: provider,
      provider, minutes, fields: draft?.values, secrets: draft?.secrets,
      ...(passphrase ? { passphrase } : {}),
    };
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    if (submitter.value === "preview") {
      await run({ type: "previewSetup", patch });
    } else if (await run({ type: "save", patch })) close();
  };
  const apply = async (mode: "sync" | "restore") => {
    if (!preview || busy) return;
    const question =
      mode === "restore"
        ? `恢复所选 ${preview.versions} 个版本及 ${preview.attachments} 个附件？当前本机内容会先加密保留；恢复保留稳定 ID 和并发分支。`
        : `同步本机 ${preview.localNotes} 条笔记与${preview.remoteExists ? `远端 ${preview.versions} 个版本` : "新的空远端"}？本机与远端的并发版本都会保留。`;
    await run({ type: mode, previewId: preview.id }, question);
  };
  const field = (f: typeof fields[CloudProvider][number]) => {
    const saved = f.secret && status?.providers[provider]?.credentialsSet[f.key];
    return <label className="cloud-sync-field" key={`${provider}-${f.key}`}>
      <span>{f.label}</span>
      <span>
        <input aria-label={f.label} type={f.secret ? "password" : "text"}
          value={f.secret ? (draft?.secrets[f.key] ?? "") : value(f.key)}
          placeholder={saved ? "已保存，输入新值可替换" : f.hint}
          autoComplete={f.secret ? "new-password" : "off"} spellCheck={false}
          disabled={busy} required={f.required && !saved}
          onChange={event => update(f.key, event.target.value, !!f.secret)} />
        {f.detail && <small>{f.detail}</small>}
      </span>
    </label>;
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
          if (inFlight.current?.confirming) {
            inFlight.current = null;
            setBusy(false);
          }
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
          onClick={() => {
            if (open) close();
            else if (status) {
              setProvider(status.selected);
              setMinutes(status.minutes);
              setPreview(undefined);
              setOpen(true);
            }
          }}
        >
          {open ? "关闭" : "设置"}
        </button>
      </div>
      {open && status && (
        <form id={`${id}-form`} className="cloud-sync-form" onSubmit={submit} onChange={() => setPreview(undefined)}>
          <div className="cloud-sync-field">
            <span>同步到</span>
            <div><PreferenceSegments label="同步到" value={provider} options={providers} disabled={busy}
              onChange={next => { setProvider(next); setPreview(undefined); }} />
              {status.enabled && <small>{provider === status.selected ? "当前正同步到这里。" : `当前使用 ${names[status.selected]}，保存后会切换服务。`}</small>}
            </div>
          </div>
          {fields[provider].filter(option => !option.advanced).map(field)}
          <label className="cloud-sync-field">
            <span>口令</span>
            <span>
              <input
                aria-label="加密密码"
                type="password"
                value={passphrase}
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                required={!status.passphraseSet}
                disabled={busy}
                placeholder={
                  status.passphraseSet
                    ? "已保存；留空保留"
                    : "至少 8 个字符，各设备保持一致"
                }
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <small>文件在本机加密，远端只保存密文。请保管好口令，其他设备需要它才能打开文件。</small>
            </span>
          </label>
          <div className="cloud-sync-field">
            <span>同步内容</span>
            <div>文件夹、备忘录及附件<br />外观明暗、桌面显示方式、排序和日期分组
              <small>账户授权、凭据和设备专属设置保留在本机。</small>
            </div>
          </div>
          <details className="cloud-sync-advanced">
            <summary>高级</summary>
            {fields[provider].filter(option => option.advanced).map(field)}
            <div className="cloud-sync-field"><span>自动同步</span><div>
              <PreferenceSegments label="自动同步" value={String(minutes)} options={intervals} disabled={busy}
                onChange={value => setMinutes(Number(value) as CloudStatus["minutes"])} />
              <small>仅在应用运行且权限有效时执行。</small>
            </div></div>
            <p className="cloud-sync-hint cloud-sync-limits">单次上限为明文 32 MiB、密文 48 MiB、单附件 16 MiB、1024 个笔记或文件夹版本及 128 个设置头。超出时拒绝同步，不截断。</p>
          </details>
          <div className="settings121-actions cloud-sync-tools">
            {status.enabled && <button className="settings121-text cloud-sync-disable" type="button" disabled={busy}
              onClick={async () => { if (await run({ type: "save", patch: { expectedRevision: status.revision, enabled: false } })) close(); }}>关闭同步</button>}
            <button
              className="settings121-text"
              type="button"
              disabled={busy}
              onClick={close}
            >
              取消
            </button>
            <button className="settings121-text" type="submit" value="preview" disabled={busy}>预览</button>
            <button className="settings121-text cloud-sync-primary" type="submit" value="save" disabled={busy}>
              {!status.enabled ? "开启" : status.selected === provider ? "保存" : `切换到 ${names[provider]}`}
            </button>
          </div>
        </form>
      )}
      {!open && status?.enabled && <><div className="settings121-row cloud-sync-row">
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
        </div>
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
            <PreferenceSelect
              mobile={mobile}
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
      </div></>}
      {preview && (
        <div className="cloud-sync-preview" role="region" aria-label="同步预览">
          <p>
            {preview.source === "setup" ? "配置预览" : preview.source === "remote" ? "远端预览" : "本机保护版本"}：
            {preview.versions} 个版本 · {preview.attachments} 个附件 ·{" "}
            {(preview.bytes / 1024).toFixed(1)} KiB
          </p>
          <p>
            本机 {preview.localNotes} 条笔记；远端含 {preview.conflicts}{" "}
            组冲突。{preview.source === "setup" ? "此预览没有保存配置或同步内容。" : "并发分支保留，恢复会产生可同步的新版本。"}
          </p>
          <div className="settings121-actions cloud-sync-tools">
            <button
              className="settings121-text"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              关闭预览
            </button>
            {preview.source !== "setup" && preview.remoteExists && (
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
