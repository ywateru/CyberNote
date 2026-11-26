import { useEffect, useMemo, useState } from "react";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  Github,
  Info,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PreferenceSelect } from "./preferences-menu/PreferenceSelect";
import { PreferenceSegments, offOnOptions } from "./preferences-menu/PreferenceSegments";
import { pluginInstallSupported } from "./plugins/client";
import type { PluginOperationResult } from "./plugins/use-plugin-registry";
import type {
  PluginConfigValue,
  PluginInstallPreview,
  PluginRegistry,
  PluginView,
} from "./plugins/types";
import "./PluginCenter.css";

type PluginFilter = "all" | "enabled" | "attention";

const filterOptions = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "已启用" },
  { value: "attention", label: "需要处理" },
] as const;

const contributionNames: [string, keyof PluginView["contributes"]][] = [
  ["命令", "commands"],
  ["面板", "panels"],
  ["主题", "themes"],
  ["设备", "devices"],
];

function pluginNeedsAttention(plugin: PluginView, registry: PluginRegistry | null) {
  return registry?.stateError != null || !plugin.available;
}

function pluginSearchText(plugin: PluginView) {
  return [
    plugin.name,
    plugin.id,
    plugin.description,
    plugin.source.reference,
    ...plugin.permissions,
    ...Object.values(plugin.contributes).flat(),
    ...plugin.ui.sections.flatMap(section => [section.title, section.body]),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "插件操作失败，请重试";
}

function sourceLabel(plugin: PluginView) {
  if (plugin.source.kind === "builtin") return "随 CyberNote 发布";
  if (plugin.source.kind === "github") return "GitHub 安装";
  return "本地 ZIP 安装";
}

function installedAtLabel(value: number | null) {
  if (!value) return "";
  return new Date(value * 1000).toLocaleString();
}

function installBlockReason(preview: PluginInstallPreview) {
  if (preview.conflict?.kind === "builtin")
    return "该插件 ID 已被内置插件占用，不能覆盖。";
  if (preview.conflict?.kind === "same") return "此版本已经安装。";
  if (preview.conflict?.kind === "downgrade")
    return `已安装更新版本 ${preview.conflict.version ?? ""}，不能降级安装。`;
  return null;
}

function PluginSwitch({
  plugin,
  busy,
  disabled,
  onChange,
}: {
  plugin: PluginView;
  busy: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="plugin-switch"
      role="switch"
      aria-label={`${plugin.name}：${plugin.enabled ? "已启用" : "已关闭"}`}
      aria-checked={plugin.enabled}
      disabled={busy || disabled}
      onClick={() => onChange(!plugin.enabled)}
    >
      <span className="plugin-switch-track" aria-hidden="true" />
      <span>{busy ? "保存中…" : plugin.enabled ? "已启用" : "已关闭"}</span>
    </button>
  );
}

export default function PluginCenter({
  registry,
  loading,
  error,
  mobile,
  active,
  onReload,
  onSetEnabled,
  onUpdateConfig,
  onPreviewArchive,
  onInstallArchive,
  onPreviewGithub,
  onInstallGithub,
  onUninstall,
}: {
  registry: PluginRegistry | null;
  loading: boolean;
  error: string | null;
  mobile: boolean;
  active: boolean;
  onReload: () => Promise<void>;
  onSetEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  onUpdateConfig: (
    id: string,
    config: Record<string, PluginConfigValue>,
  ) => Promise<boolean>;
  onPreviewArchive: (path: string) => Promise<PluginInstallPreview>;
  onInstallArchive: (
    path: string,
    id: string,
    version: string,
  ) => Promise<PluginOperationResult>;
  onPreviewGithub: (url: string) => Promise<PluginInstallPreview>;
  onInstallGithub: (
    url: string,
    id: string,
    version: string,
  ) => Promise<PluginOperationResult>;
  onUninstall: (id: string) => Promise<PluginOperationResult>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  const [installMode, setInstallMode] = useState<"zip" | "github" | null>(null);
  const [archivePath, setArchivePath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const [uninstallBusy, setUninstallBusy] = useState<string | null>(null);

  const plugins = registry?.plugins ?? [];
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return plugins.filter(plugin => {
      if (filter === "enabled" && !plugin.enabled) return false;
      if (filter === "attention" && !pluginNeedsAttention(plugin, registry))
        return false;
      const searchable = pluginSearchText(plugin);
      return terms.every(term => searchable.includes(term));
    });
  }, [filter, plugins, query, registry]);

  useEffect(() => {
    if (!registry) return;
    if (mobile) {
      if (!selectedId) return;
      if (!registry.plugins.some(plugin => plugin.id === selectedId))
        setSelectedId(null);
      return;
    }
    if (!selectedId || !registry.plugins.some(plugin => plugin.id === selectedId))
      setSelectedId(registry.plugins[0]?.id ?? null);
  }, [mobile, registry, selectedId]);

  useEffect(() => {
    if (!active && mobile) setSelectedId(null);
  }, [active, mobile]);

  useEffect(() => {
    if (!installMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || installBusy) return;
      event.preventDefault();
      setInstallMode(null);
      setArchivePath("");
      setGithubUrl("");
      setPreview(null);
      setInstallError(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [installBusy, installMode]);

  const selected =
    selectedId == null
      ? null
      : plugins.find(plugin => plugin.id === selectedId) ?? null;
  const blocked = registry?.stateError != null;
  const selectedUiVisible =
    !selected ||
    selected.ui.visibilityConfig == null ||
    selected.configValues[selected.ui.visibilityConfig] !== false;
  const previewBlockReason = preview ? installBlockReason(preview) : null;

  const changeEnabled = async (plugin: PluginView, enabled: boolean) => {
    if (busy) return;
    setBusy({ id: plugin.id, action: "enabled" });
    await onSetEnabled(plugin.id, enabled);
    setBusy(null);
  };

  const changeConfig = async (
    plugin: PluginView,
    key: string,
    value: PluginConfigValue,
  ) => {
    if (busy) return;
    setBusy({ id: plugin.id, action: key });
    await onUpdateConfig(plugin.id, { [key]: value });
    setBusy(null);
  };

  const closeInstall = () => {
    if (installBusy) return;
    setInstallMode(null);
    setArchivePath("");
    setGithubUrl("");
    setPreview(null);
    setInstallError(null);
  };

  const startArchiveInstall = async () => {
    if (installBusy) return;
    setInstallError(null);
    setInstallNotice(null);
    let path: string | string[] | null = null;
    try {
      path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "CyberNote 插件", extensions: ["zip"] }],
      });
    } catch (error) {
      setInstallMode("zip");
      setInstallError(messageOf(error));
      return;
    }
    if (typeof path !== "string" || !path) return;
    setInstallMode("zip");
    setArchivePath(path);
    setPreview(null);
    setInstallBusy(true);
    try {
      setPreview(await onPreviewArchive(path));
    } catch (error) {
      setInstallError(messageOf(error));
    } finally {
      setInstallBusy(false);
    }
  };

  const startGithubInstall = () => {
    setInstallMode("github");
    setArchivePath("");
    setGithubUrl("");
    setPreview(null);
    setInstallError(null);
    setInstallNotice(null);
  };

  const checkGithub = async () => {
    if (installBusy || !githubUrl.trim()) return;
    setInstallBusy(true);
    setInstallError(null);
    setPreview(null);
    try {
      setPreview(await onPreviewGithub(githubUrl.trim()));
    } catch (error) {
      setInstallError(messageOf(error));
    } finally {
      setInstallBusy(false);
    }
  };

  const installPreview = async () => {
    if (!preview || !installMode || installBusy) return;
    if (installBlockReason(preview)) return;
    setInstallBusy(true);
    setInstallError(null);
    const result =
      installMode === "zip"
        ? await onInstallArchive(archivePath, preview.id, preview.version)
        : await onInstallGithub(githubUrl.trim(), preview.id, preview.version);
    setInstallBusy(false);
    if (!result.ok) {
      setInstallError(result.error);
      return;
    }
    setSelectedId(preview.id);
    setInstallNotice(
      `“${preview.name}”已安装并保持关闭。启用前不会加载任何界面或能力。`,
    );
    setInstallMode(null);
    setArchivePath("");
    setGithubUrl("");
    setPreview(null);
  };

  const removePlugin = async (plugin: PluginView) => {
    if (uninstallBusy) return;
    const approved = await confirm(
      `卸载“${plugin.name}”？插件设置会一并移除，不会删除笔记、附件、备份或远端数据。`,
      { title: "卸载插件", kind: "warning" },
    );
    if (!approved) return;
    setUninstallBusy(plugin.id);
    const result = await onUninstall(plugin.id);
    setUninstallBusy(null);
    if (!result.ok) {
      setInstallError(result.error);
      return;
    }
    setInstallNotice(`“${plugin.name}”已卸载。`);
    setSelectedId(null);
  };

  const removeBrokenRecord = async (id: string) => {
    if (uninstallBusy) return;
    const approved = await confirm(
      "移除这条无法加载的插件记录？不会删除笔记、附件、备份或远端数据。",
      { title: "移除插件记录", kind: "warning" },
    );
    if (!approved) return;
    setUninstallBusy(id);
    const result = await onUninstall(id);
    setUninstallBusy(null);
    if (!result.ok) setInstallError(result.error);
    else setInstallNotice("无法加载的插件记录已移除。");
  };

  const clearFilter = () => {
    setFilter("all");
    setQuery("");
    if (mobile) setSelectedId(null);
  };

  const list = (
    <section className="plugin-list-pane" aria-label="插件列表">
      <div className="plugin-list-heading">
        <div>
          <h3>已安装插件</h3>
          <p>
            {plugins.length} 个插件
            {plugins.some(plugin => !plugin.builtin) &&
              ` · ${plugins.filter(plugin => !plugin.builtin).length} 个扩展`}
          </p>
        </div>
        {!mobile && (
          <button
            type="button"
            className="plugin-icon-button"
            aria-label="重新读取插件状态"
            disabled={loading || !!busy}
            onClick={() => void onReload()}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {pluginInstallSupported && (
        <div className="plugin-install-actions" aria-label="安装插件">
          <button
            type="button"
            disabled={loading || !!busy || installBusy}
            onClick={() => void startArchiveInstall()}
          >
            <FileArchive size={15} aria-hidden="true" />
            从文件安装…
          </button>
          <button
            type="button"
            disabled={loading || !!busy || installBusy}
            onClick={startGithubInstall}
          >
            <Github size={15} aria-hidden="true" />
            从 GitHub 安装…
          </button>
        </div>
      )}
      <div className="plugin-filter">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          aria-label="查找插件"
          placeholder="查找插件"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label="清除插件查找"
            onClick={() => setQuery("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="plugin-filter-options">
        <PreferenceSegments
          label="插件筛选"
          value={filter}
          options={filterOptions}
          disabled={loading}
          onChange={value => setFilter(value as PluginFilter)}
        />
      </div>
      {loading && !registry ? (
        <div className="plugin-skeletons" aria-label="正在读取插件">
          {[0, 1, 2].map(row => (
            <div className="plugin-skeleton" key={row} aria-hidden="true" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="plugin-list" role="list">
          {filtered.map(plugin => {
            const activeRow = selectedId === plugin.id;
            return (
              <div
                className={`plugin-row${activeRow ? " is-selected" : ""}`}
                role="listitem"
                key={plugin.id}
              >
                <button
                  type="button"
                  className="plugin-row-open"
                  aria-label={`${plugin.name}详情`}
                  aria-current={activeRow && !mobile ? "true" : undefined}
                  onClick={() => setSelectedId(plugin.id)}
                >
                  <span className="plugin-icon" aria-hidden="true">
                    <Puzzle size={18} />
                  </span>
                  <span className="plugin-row-copy">
                    <strong>{plugin.name}</strong>
                    <small>
                      {plugin.builtin ? "内置" : "扩展"} · {plugin.version}
                      {!plugin.available && " · 本端不可用"}
                    </small>
                  </span>
                  <ChevronRight
                    className="plugin-row-chevron"
                    size={16}
                    aria-hidden="true"
                  />
                </button>
                <PluginSwitch
                  plugin={plugin}
                  busy={busy?.id === plugin.id && busy.action === "enabled"}
                  disabled={loading || blocked || !plugin.available || !!busy}
                  onChange={enabled => void changeEnabled(plugin, enabled)}
                />
                {busy?.id === plugin.id && busy.action !== "enabled" && (
                  <span className="plugin-row-status" role="status">
                    正在保存设置…
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="plugin-empty">
          <Puzzle size={22} aria-hidden="true" />
          <strong>没有匹配的插件</strong>
          <p>清除筛选或换一个关键词。</p>
          <button type="button" onClick={clearFilter}>
            清除筛选
          </button>
        </div>
      )}
    </section>
  );

  const detail = (
    <section className="plugin-detail-pane" aria-label={selected ? `${selected.name}详情` : "插件详情"}>
      {selected ? (
        <>
          {mobile && (
            <button
              type="button"
              className="plugin-detail-back"
              onClick={() => setSelectedId(null)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              插件列表
            </button>
          )}
          <header className="plugin-detail-heading">
            <span className="plugin-icon" aria-hidden="true">
              <Puzzle size={20} />
            </span>
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
            </div>
            <PluginSwitch
              plugin={selected}
              busy={busy?.id === selected.id && busy.action === "enabled"}
              disabled={loading || blocked || !selected.available}
              onChange={enabled => void changeEnabled(selected, enabled)}
            />
          </header>

          {!selected.available && (
            <div className="plugin-notice" role="status">
              <Info size={16} aria-hidden="true" />
              <span>此插件不支持当前平台，状态与设置仍会保留。</span>
            </div>
          )}

          <section className="plugin-section" aria-label="基本信息">
            <h4>基本信息</h4>
            <dl>
              <div>
                <dt>来源</dt>
                <dd>
                  {sourceLabel(selected)}
                  {!selected.builtin && (
                    <small className="plugin-source-reference">
                      {selected.source.reference}
                      {selected.source.installedAt
                        ? ` · ${installedAtLabel(selected.source.installedAt)}`
                        : ""}
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{selected.version}</dd>
              </div>
              <div>
                <dt>平台</dt>
                <dd>{selected.platforms.join("、") || "未声明"}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  {blocked
                    ? "状态不可读，已关闭"
                    : !selected.available
                      ? "本端不可用"
                      : selected.enabled
                        ? "已启用"
                        : "已关闭"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="plugin-section" aria-label="能力与位置">
            <h4>能力与位置</h4>
            <div className="plugin-contributions">
              {contributionNames.map(([label, key]) => {
                const values = selected.contributes[key];
                if (!values.length) return null;
                return (
                  <div key={key}>
                    <span>{label}</span>
                    <code>{values.join(" · ")}</code>
                  </div>
                );
              })}
              {!Object.values(selected.contributes).some(value => value.length) && (
                <p>此插件没有声明可挂载的能力。</p>
              )}
            </div>
          </section>

          {selected.ui.sections.length > 0 && (
            <section className="plugin-section" aria-label="插件界面">
              <h4>插件界面</h4>
              {!selected.enabled ? (
                <p>启用插件后，宿主会在此处渲染声明式界面。外部插件不会执行脚本。</p>
              ) : !selected.available ? (
                <p>此插件不支持当前平台，界面不会加载。</p>
              ) : !selectedUiVisible ? (
                <p>插件界面已被关联的设置隐藏。</p>
              ) : (
                <div className="plugin-ui-sections">
                  {selected.ui.sections.map(section => (
                    <article key={`${section.slot}:${section.title}`}>
                      <h5>{section.title}</h5>
                      <p>{section.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="plugin-section" aria-label="权限">
            <h4>权限</h4>
            {selected.permissions.length ? (
              <div className="plugin-permissions">
                {selected.permissions.map(permission => (
                  <span key={permission}>{permission}</span>
                ))}
              </div>
            ) : (
              <p>不需要额外权限，也不会访问笔记正文、账户或本机文件。</p>
            )}
          </section>

          <section className="plugin-section" aria-label="插件设置">
            <h4>设置</h4>
            {selected.config.length ? (
              <div className="plugin-config">
                {selected.config.map(field => {
                  const value =
                    selected.configValues[field.key] ?? field.default;
                  const fieldBusy =
                    busy?.id === selected.id && busy.action === field.key;
                  const fieldDisabled =
                    loading || blocked || fieldBusy || !!busy;
                  return (
                    <div className="plugin-config-row" key={field.key}>
                      <span>
                        {field.title}
                        {field.description && <small>{field.description}</small>}
                      </span>
                      {field.type === "boolean" ? (
                        <PreferenceSegments
                          label={field.title}
                          value={value === true ? "on" : "off"}
                          options={offOnOptions}
                          disabled={fieldDisabled}
                          onChange={next =>
                            void changeConfig(selected, field.key, next === "on")
                          }
                        />
                      ) : (
                        <PreferenceSelect
                          label={field.title}
                          mobile={mobile}
                          value={String(value)}
                          options={field.options}
                          disabled={fieldDisabled}
                          onChange={next =>
                            void changeConfig(selected, field.key, next)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>此插件没有可调整的设置。</p>
            )}
          </section>

          <section className="plugin-section" aria-label="设备接入预留">
            <h4>设备接入</h4>
            <p className="plugin-section-help">
              插件宿主已预留智能笔与录音设备的适配器契约。本版本只报告只读能力，
              不会扫描、连接设备或申请蓝牙、麦克风权限。
            </p>
            <dl className="plugin-device-capabilities">
              <div>
                <dt>蓝牙连接</dt>
                <dd>{registry?.devices.bluetooth ? "可用" : "未启用"}</dd>
              </div>
              <div>
                <dt>智能笔点读与手写</dt>
                <dd>{registry?.devices.smartPen ? "可用" : "未启用"}</dd>
              </div>
              <div>
                <dt>智能录音设备</dt>
                <dd>
                  {registry?.devices.recordingDevice ? "可用" : "未启用"}
                </dd>
              </div>
            </dl>
          </section>

          {selected.removable && (
            <section className="plugin-section" aria-label="维护">
              <h4>维护</h4>
              <p className="plugin-section-help">
                卸载只移除插件文件、安装记录和本插件设置。笔记、附件、备份和远端数据不受影响。
              </p>
              <button
                type="button"
                className="plugin-danger-button"
                disabled={!!uninstallBusy || busy != null}
                onClick={() => void removePlugin(selected)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {uninstallBusy === selected.id ? "正在卸载…" : "卸载插件"}
              </button>
            </section>
          )}
        </>
      ) : (
        <div className="plugin-empty plugin-detail-empty">
          <Puzzle size={24} aria-hidden="true" />
          <strong>选择一个插件</strong>
          <p>查看来源、能力、权限和设备接入状态。</p>
        </div>
      )}
    </section>
  );

  return (
    <div className="plugin-center">
      {installNotice && (
        <div className="plugin-success" role="status">
          <Info size={17} aria-hidden="true" />
          <span>{installNotice}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setInstallNotice(null)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {(registry?.stateError || error) && (
        <div className="plugin-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>{registry?.stateError ? "插件未加载" : "插件操作失败"}</strong>
            <p>{registry?.stateError ?? error}</p>
          </div>
          <button type="button" disabled={loading} onClick={() => void onReload()}>
            重试
          </button>
        </div>
      )}
      {registry?.installErrors.length ? (
        <div className="plugin-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>部分扩展未能加载</strong>
            <ul className="plugin-install-error-list">
              {registry.installErrors.map(entry => (
                <li key={entry.id}>
                  <code>{entry.id}</code>
                  <span>{entry.message}</span>
                  <button
                    type="button"
                    disabled={uninstallBusy === entry.id}
                    onClick={() => void removeBrokenRecord(entry.id)}
                  >
                    {uninstallBusy === entry.id ? "正在移除…" : "移除记录"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {!installMode && installError && (
        <div className="plugin-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>插件操作失败</strong>
            <p>{installError}</p>
          </div>
          <button type="button" onClick={() => setInstallError(null)}>
            关闭
          </button>
        </div>
      )}
      <div className="plugin-center-layout">
        {(!mobile || !selected) && list}
        {(!mobile || selected) && detail}
      </div>
      {installMode && (
        <div
          className="plugin-dialog-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeInstall();
          }}
        >
          <section
            className="plugin-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-install-title"
          >
            <header>
              <div>
                <h3 id="plugin-install-title">安装插件</h3>
                <p>
                  {installMode === "github"
                    ? "从公开 GitHub 仓库读取插件清单。"
                    : "检查本地 ZIP 包后再安装。"}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭安装"
                disabled={installBusy}
                onClick={closeInstall}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            <div className="plugin-install-body">
              {installMode === "github" && (
                <label className="plugin-github-field">
                  <span>GitHub 地址</span>
                  <input
                    autoFocus
                    type="url"
                    spellCheck={false}
                    value={githubUrl}
                    disabled={installBusy}
                    placeholder="https://github.com/owner/repo"
                    onChange={event => {
                      setGithubUrl(event.target.value);
                      setPreview(null);
                      setInstallError(null);
                    }}
                    onKeyDown={event => {
                      if (event.key === "Enter") void checkGithub();
                    }}
                  />
                  <small>
                    支持仓库根地址、<code>/tree/分支/子目录</code>，或{" "}
                    <code>owner/repo#子目录</code>。
                  </small>
                </label>
              )}
              {installMode === "zip" && !preview && (
                <p className="plugin-install-file">
                  {archivePath
                    ? `正在检查 ${archivePath.split(/[\\/]/).pop()}`
                    : "请选择插件 ZIP 包。"}
                </p>
              )}
              {installBusy && !preview && (
                <p className="plugin-install-progress" role="status">
                  正在读取并验证插件包…
                </p>
              )}
              {preview && (
                <div className="plugin-install-preview">
                  <dl>
                    <div>
                      <dt>插件</dt>
                      <dd>
                        <strong>{preview.name}</strong>
                        <small>{preview.id}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>版本</dt>
                      <dd>
                        {preview.version}
                        {preview.conflict?.kind === "upgrade" &&
                          ` · 升级自 ${preview.conflict.version}`}
                      </dd>
                    </div>
                    <div>
                      <dt>来源</dt>
                      <dd>
                        {preview.source.kind === "github"
                          ? "GitHub"
                          : "本地 ZIP"}
                        <small>{preview.source.reference}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>平台</dt>
                      <dd>
                        {preview.platforms.join("、") || "未声明"}
                        {!preview.available && " · 本端不可用"}
                      </dd>
                    </div>
                    <div>
                      <dt>界面</dt>
                      <dd>
                        {preview.ui.sections.length
                          ? `${preview.ui.sections.length} 个宿主渲染区块`
                          : "没有声明式界面"}
                      </dd>
                    </div>
                  </dl>
                  {preview.permissions.length > 0 && (
                    <div className="plugin-install-permissions">
                      <span>申请权限</span>
                      <div className="plugin-permissions">
                        {preview.permissions.map(permission => (
                          <span key={permission}>{permission}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="plugin-install-policy">
                    安装后保持关闭。插件只提供声明式界面、设置和贡献描述；
                    CyberNote 不执行包内脚本、可执行文件或安装命令。
                  </p>
                  {previewBlockReason && (
                    <div className="plugin-install-blocked" role="alert">
                      <AlertTriangle size={16} aria-hidden="true" />
                      <span>{previewBlockReason}</span>
                    </div>
                  )}
                </div>
              )}
              {installError && (
                <div className="plugin-error" role="alert">
                  <AlertTriangle size={17} aria-hidden="true" />
                  <div>
                    <strong>未能安装</strong>
                    <p>{installError}</p>
                  </div>
                </div>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="plugin-secondary-button"
                disabled={installBusy}
                onClick={closeInstall}
              >
                取消
              </button>
              {installMode === "github" && !preview ? (
                <button
                  type="button"
                  className="plugin-primary-button"
                  disabled={installBusy || !githubUrl.trim()}
                  onClick={() => void checkGithub()}
                >
                  {installBusy ? "正在检查…" : "检查仓库"}
                </button>
              ) : (
                <button
                  type="button"
                  className="plugin-primary-button"
                  disabled={
                    installBusy || !preview || previewBlockReason != null
                  }
                  onClick={() => void installPreview()}
                >
                  {installBusy
                    ? "正在安装…"
                    : preview?.conflict?.kind === "upgrade"
                      ? `升级到 ${preview.version}`
                      : "安装并保持关闭"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
