import { appearanceOf, themeOptions, type ThemeId, type SchemePreference } from "./themes/appearance";
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { Database, X, ChevronLeft, ChevronRight, Type, Notebook, Archive, Search, Info, PanelsTopLeft, NotebookText, HardDrive, Upload, UserRound, Bot } from "lucide-react";
import { fontSizeOptions, fontSizeOption, type FontSize } from "./font-size";
import type { Settings } from "./types";
import "./Preferences.css";
import { PreferenceSelect } from "./preferences-menu/PreferenceSelect";
import { PreferenceSegments, offOnOptions } from "./preferences-menu/PreferenceSegments";
import { dismissInnermostMenu } from "./Menu";
import PreferencesInterfaceDetails from "./PreferencesInterfaceDetails";
import PreferencesPresentation from "./presentation/PreferencesPresentation";
import { accountUIAvailable } from "./account-client";
import { buildInfo, displayVersion, releaseIdentityNotice } from "./build-info";

const allPreferencePages = [
  { id: "account", label: "账户与同步", icon: UserRound, desktopIcon: UserRound },
  { id: "settings", label: "外观与字号", icon: Type, desktopIcon: PanelsTopLeft },
  { id: "notes", label: "备忘录", icon: Notebook, desktopIcon: NotebookText },
  { id: "agent", label: "Agent 接入", icon: Bot, desktopIcon: Bot },
  { id: "data", label: "存储空间", icon: Database, desktopIcon: HardDrive },
  { id: "backup", label: "导入与备份", icon: Archive, desktopIcon: Upload },
  { id: "about", label: "关于", icon: Info, desktopIcon: Info },
] as const;
export const preferencePages = allPreferencePages.filter(page => page.id !== "account" || accountUIAvailable);
export type PreferencesTab = typeof preferencePages[number]["id"] | "sync" | "home";
export function isPreferencesTab(value: unknown): value is PreferencesTab {
  return value === "sync" || value === "home" || preferencePages.some(page => page.id === value);
}
const appearanceOptions = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const;

// Search describes visible operations, never account values, secrets or note content.
const settingsSearch = [
  ["settings", "主题", "Classic Paper High Contrast Ocean Forest Rose Lavender Graphite 经典 纸感 高对比 海洋 森林 玫瑰 薰衣草 石墨", '[aria-label="主题"]'],
  ["settings", "外观", "跟随系统 浅色 深色", '[aria-label="外观"]'],
  ["settings", "界面字体大小", "字号 极小 小 中 大 极大", '[aria-label="界面字体大小"]'],
  ["settings", "编辑器字体大小", "字号 正文", '[aria-label="编辑器字体大小"]'],
  ["settings", "界面细节", "图标大小 操作区域 菜单间距 圆角 默认值", '.preferences-details-toggle'],
  ["about", "版本信息", "发行身份 源码 构建时间", '.preferences-build-info'],
  ["notes", "排序方式", "编辑日期 创建日期 标题", '[aria-label="排序方式"]'],
  ["notes", "桌面布局", "导航 三栏 两栏 专注 显示方式 画廊 列表 密度", '[aria-label="桌面导航布局"]'],
  ["notes", "手机首页", "显示方式 画廊 列表 密度", '[aria-label="手机显示方式"]'],
  ["notes", "按日期分组", "桌面列表", '[aria-label="按日期分组"]'],
  ["notes", "锁定备忘录", "关闭所有已锁定 重新锁定", '.preferences-lock-action'],
  ["account", "CyberNote 账户", "登录 创建账户 退出账户 登录方式 系统浏览器", '.account-profile-group'],
  ["account", "我的设备", "允许此设备同步 刷新设备 更改名称 传输状态", '.account-device-group'],
  ["account", "凭据存储", "登录与安全 钥匙串 本机加密文件", '.account-storage-group [role="radiogroup"]'],
  ["account", "同步冲突", "冲突版本 解决 保留版本", '.preferences-conflicts > summary'],
  ["account", "云端同步", "WebDAV S3 GitHub 远端", '[data-settings-slot="cloud"]'],
  ["agent", "Agent 接入", "MCP 本机接入 授权客户端 配置 连接 诊断", '.agent-page-header'],
  ["data", "存储空间", "本地占用 类型 全部文件 附件 搜索 数据位置", '.data-management-header'],
  ["backup", "导入与备份", "导出 备份文件 导入 加密", '.local-backup-settings'],
  ["backup", "Apple 备忘录导入", "Apple 苹果 备忘录 导入", '.local-backup-apple'],
  ["backup", "自动备份", "备份文件夹 版本列表 保留份数 立即备份", '[data-settings-slot="backup"]'],
  ["about", "软件更新", "检查更新 版本 下载 预发布 频道 徽标", '[data-settings-slot="update"]'],
] as const;

export type PreferencesProps = {
  tab: PreferencesTab;
  onTab: (tab: PreferencesTab) => void;
  onClose: () => void;
  onBack: () => void;
  settings: Settings;
  onSettings: (settings: Partial<Settings>) => Promise<unknown>;
  onCloseLocks: () => Promise<unknown>;
  returnFocus: HTMLElement | null;
  data: ReactNode;
  /** Deprecated compatibility slot: deliberately never rendered. Pass conflictsOnly UI to syncConflicts. */
  synchronization?: ReactNode;
  account: ReactNode;
  agent?: ReactNode;
  mobile: boolean;
  /** Modules own their handlers, confirmations and active/visible lifecycle. */
  cloudSync?: ReactNode;
  softwareUpdate?: ReactNode;
  softwareUpdateBadge?: (openAbout: () => void) => ReactNode;
  automaticBackup?: ReactNode;
  /** Must contain only conflict query/resolution, never manual pairing. */
  syncConflicts?: ReactNode;
  conflictsOpen?: boolean;
  onConflictsOpenChange?: (open: boolean) => void;
};

export default function Preferences({ tab, onTab, onClose, onBack, settings, onSettings, onCloseLocks, returnFocus, data, account, agent, mobile, cloudSync, softwareUpdate, softwareUpdateBadge, automaticBackup, syncConflicts, conflictsOpen: controlledConflictsOpen, onConflictsOpenChange }: PreferencesProps) {
  const root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const live = useRef(false), backHandler = useRef(onBack), working = useRef(false);
  backHandler.current = onBack;
  const [visitedData, setVisitedData] = useState(tab === "data" || tab === "backup");
  const activeTab = tab === "sync" ? "account" : tab;
  const [localConflictsOpen, setLocalConflictsOpen] = useState(tab === "sync");
  const conflictsOpen = controlledConflictsOpen ?? localConflictsOpen;
  const setConflictsOpen = (open: boolean) => { setLocalConflictsOpen(open); onConflictsOpenChange?.(open); };
  const [query, setQuery] = useState("");
  const searchActive = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [pendingTarget, setPendingTarget] = useState<{ page: PreferencesTab; selector: string; id: number; expires: number } | null>(null);
  const targetSerial = useRef(0), targetOwner = useRef(pendingTarget);
  targetOwner.current = pendingTarget;
  const [searchMessage, setSearchMessage] = useState("");
  const [accountAvailability, setAccountAvailability] = useState("unknown");
  const localMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const cancelTarget = () => { targetSerial.current++; targetOwner.current = null; setPendingTarget(null); setSearchMessage(""); };
  const setSearchQuery = (value: string) => { cancelTarget(); setQuery(value); };
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const read = () => {
      const account = element.querySelector<HTMLElement>("[data-settings-account-search]");
      if (account) setAccountAvailability(account.dataset.settingsAccountSearch || "unknown");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-settings-account-search"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (tab === "sync") { setConflictsOpen(true); onTab("account"); }
  }, [tab]);
  const searchTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = settingsSearch.filter(([page, title, words]) =>
    preferencePages.some(item => item.id === page) &&
    (title !== "云端同步" || cloudSync != null) && (title !== "自动备份" || automaticBackup != null) &&
    (title !== "凭据存储" || !localMobile) && (title !== "我的设备" || accountAvailability !== "signedOut") &&
    (title !== "软件更新" || softwareUpdate != null) && (title !== "同步冲突" || syncConflicts != null) &&
    searchTerms.every(term => `${title} ${words} ${preferencePages.find(item => item.id === page)?.label}`.toLocaleLowerCase().includes(term)));
  const searching = searchTerms.length > 0;
  searchActive.current = searching;
  const openAbout = () => {
    cancelTarget();
    setQuery("");
    onTab("about");
    root.current?.querySelector<HTMLElement>('#preferences-panel-about')?.scrollTo(0, 0);
    if (!mobile) root.current?.querySelector<HTMLButtonElement>('#preferences-tab-about')?.focus();
  };
  const jumpTo = (page: PreferencesTab, selector: string) => {
    const intent = { page, selector, id: ++targetSerial.current, expires: Date.now() + 5000 }; targetOwner.current = intent; setPendingTarget(intent); setSearchMessage("正在定位设置…"); setQuery(""); onTab(page);
    if (selector === '.preferences-conflicts > summary') setConflictsOpen(true);
  };
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ tab: PreferencesTab; message: string } | null>(null);
  const current = preferencePages.find(page => page.id === activeTab);
  const home = mobile && activeTab === "home";
  useEffect(() => {
    if (tab === "data" || tab === "backup") setVisitedData(true);
  }, [tab]);
  useLayoutEffect(() => {
    live.current = true;
    close.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      const element = root.current;
      if (event.defaultPrevented || !live.current || !element?.isConnected || element.hidden || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (dismissInnermostMenu()) return;
        if (targetOwner.current) { cancelTarget(); searchInput.current?.focus(); return; }
        if (searchActive.current) { setQuery(""); searchInput.current?.focus(); } else backHandler.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
        .filter(node => node.tabIndex >= 0 && !node.closest("[hidden],[inert]") && node.getClientRects().length > 0);
      const first = nodes[0], last = nodes.at(-1), outside = !nodes.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault(); event.stopPropagation(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); event.stopPropagation(); first?.focus();
      }
    };
    // Bubble after nested import/menu handlers so Escape closes the innermost surface.
    document.addEventListener("keydown", keyboard);
    return () => {
      live.current = false;
      document.removeEventListener("keydown", keyboard);
      const candidates = [returnFocus, ...document.querySelectorAll<HTMLElement>('.desktop-settings,.mobile-home-settings,.folder-footer [aria-label="设置"],.notes-header [aria-label="显示选项"]')];
      // Parent inert attributes are removed in the same React commit.
      queueMicrotask(() => candidates.find(node => node?.isConnected && node !== document.body && !node.matches(":disabled") && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden],[inert],.access-sync,.preferences-backdrop"))?.focus({ preventScroll: true }));
    };
  }, []);
  const previousTab = useRef(tab);
  useLayoutEffect(() => {
    if (previousTab.current !== tab) {
      if (mobile) {
        if (tab === "home") root.current?.querySelector<HTMLButtonElement>(`[data-preferences-page="${previousTab.current}"]`)?.focus();
        else heading.current?.focus({ preventScroll: true });
      }
      previousTab.current = tab;
    }
  }, [tab, mobile]);
  useLayoutEffect(() => {
    if (!pendingTarget) return;
    const intent = pendingTarget;
    const timer = window.setTimeout(() => {
      if (!live.current || targetOwner.current?.id !== intent.id) return;
      targetOwner.current = null; setPendingTarget(null);
      setSearchMessage("设置尚未加载完成，请检查当前页面的加载状态后重新查找。");
    }, Math.max(0, intent.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pendingTarget]);
  useLayoutEffect(() => {
    const intent = pendingTarget, element = root.current;
    if (!intent || !element || searching || activeTab !== intent.page) return;
    const current = () => live.current && targetOwner.current?.id === intent.id && targetSerial.current === intent.id;
    const finish = (target: HTMLElement, notice = "") => {
      if (!current()) return;
      for (let parent = target.parentElement; parent && parent !== element; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      if (target.matches('[aria-expanded="false"]:not([aria-haspopup])')) target.click();
      const focusable = target.matches('[role="radiogroup"]')
        ? target.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? target
        : target;
      if (!focusable.matches('button,input,select,summary,[tabindex]')) focusable.tabIndex = -1;
      target.scrollIntoView({ block: "center" }); focusable.focus({ preventScroll: true });
      targetOwner.current = null; setPendingTarget(null); setSearchMessage(notice);
    };
    const probe = () => {
      if (!current()) return;
      const target = element.querySelector<HTMLElement>(intent.selector);
      if (intent.page === "backup") {
        const backup = element.querySelector<HTMLElement>(".local-backup-settings");
        if (backup && !backup.closest("[hidden],[inert]")) {
          const state = backup.dataset.backupState;
          if (state === "blocked") { finish(backup, "请先完成录音或当前数据操作，并确认资料库访问权限，再操作导入与备份。"); return; }
          if (state === "unconfirmed") { finish(backup, "当前备份状态未确认，请先重新读取；显示的是上次读取结果。"); return; }
          if (state === "loading") return;
          if (!target && intent.selector === ".local-backup-apple") { finish(backup, "此平台暂不支持 Apple 备忘录导入，请在 Mac 主窗口操作。"); return; }
        }
      }
      if (target && !target.matches(":disabled") && !target.closest("[hidden],[inert]") && target.getClientRects().length) { finish(target); return; }
      const account = element.querySelector<HTMLElement>("[data-settings-account-search]");
      if (intent.page === "account" && account) {
        const state = account.dataset.settingsAccountSearch;
        if (state === "error") {
          finish(account, "账户状态读取失败，未能定位设置。请在账户页重试读取后重新查找。");
        } else if (state === "signedOut" && intent.selector === ".account-device-group") {
          const login = account.querySelector<HTMLElement>(".account-primary");
          finish(login || account, "请先登录账户，再查看我的设备。");
        } else if (state === "signedIn" || state === "signedOut") {
          // Credentials/other state-dependent targets may be unavailable even
          // after a successful account status read. Never wait forever for one.
          finish(account, "此账户状态下该设置暂不可用，请查看当前账户操作。");
        }
      }
    };
    const observer = new MutationObserver(probe);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "inert", "disabled", "data-settings-account-search", "data-backup-state"] });
    const interrupt = (event: Event) => {
      if (event.type === "pointerdown" || (event instanceof KeyboardEvent && event.key === "Tab")) cancelTarget();
    };
    element.addEventListener("pointerdown", interrupt, true);
    element.addEventListener("keydown", interrupt, true);
    probe();
    return () => { observer.disconnect(); element.removeEventListener("pointerdown", interrupt, true); element.removeEventListener("keydown", interrupt, true); };
  }, [pendingTarget, activeTab, searching]);
  const targetTab = useRef(activeTab);
  useLayoutEffect(() => {
    if (targetTab.current !== activeTab && targetOwner.current && targetTab.current === targetOwner.current.page) cancelTarget();
    targetTab.current = activeTab;
  }, [activeTab]);
  const apply = async (action: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true; setSaving(true); setSaveError(null);
    try { await action(); }
    catch (cause) { if (live.current) setSaveError({ tab, message: cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "更改未保存，请重试" }); }
    finally { working.current = false; if (live.current) setSaving(false); }
  };
  const appearance = appearanceOf(settings);
  const changeAppearance = (patch: Partial<typeof appearance>) => apply(() => onSettings({ appearance: { ...appearance, ...patch } }));
  const summary = (id: string) => id === "settings" ? ({ system: "跟随系统", light: "浅色", dark: "深色" }[appearance.schemePreference]) : id === "notes" ? ({ updated: "编辑日期", created: "创建日期", title: "标题" }[settings.sort || "updated"]) : "";
  return (
    <div className={`preferences-backdrop ${mobile ? "preferences-mobile" : "preferences-desktop"}`}>
      <section ref={root} className="preferences" role="dialog" aria-modal="true" aria-labelledby="preferences-title" data-preferences-tab={activeTab}>
        <header className="preferences-header">
          {mobile && !home && <button type="button" className="preferences-back" aria-label="返回设置" onClick={onBack}><ChevronLeft /><span>设置</span></button>}
          <h2 ref={heading} tabIndex={-1} id="preferences-title">{mobile && !home ? current?.label : "设置"}</h2>
          <button ref={close} className="preferences-close" type="button" aria-label="关闭设置" onClick={onClose}>{mobile ? "完成" : <X size={19} />}</button>
        </header>
        <div className="preferences-body">
          {(!mobile || home) && <nav className="preferences-navigation" aria-label="设置分类" role={mobile ? undefined : "tablist"} aria-orientation={mobile ? undefined : "vertical"}>
            {preferencePages.map(({ id, label, icon, desktopIcon }, index) => <button key={id} id={`preferences-tab-${id}`} type="button" role={mobile ? undefined : "tab"} data-preferences-page={id}
              aria-selected={mobile ? undefined : activeTab === id} aria-controls={mobile ? undefined : id === "backup" ? "preferences-panel-data" : `preferences-panel-${id}`}
              tabIndex={mobile || activeTab === id ? 0 : -1} onClick={() => { cancelTarget(); setQuery(""); onTab(id); }} onKeyDown={event => {
                if (mobile) return;
                const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % preferencePages.length : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + preferencePages.length - 1) % preferencePages.length : event.key === "Home" ? 0 : event.key === "End" ? preferencePages.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault(); cancelTarget(); setQuery(""); onTab(preferencePages[next].id);
                root.current?.querySelector<HTMLButtonElement>(`#preferences-tab-${preferencePages[next].id}`)?.focus();
              }}>{(() => { const Icon = mobile ? icon : desktopIcon; return <Icon size={20} />; })()}<span>{label}</span>{mobile && <><small>{summary(id)}</small><ChevronRight size={17} /></>}</button>)}
            <p className="preferences-navigation-note">{mobile ? "备忘录和附件保存在此设备中。" : "CyberNote"}</p>
          </nav>}
          <div className={`preferences-workspace${home ? " is-home" : ""}`}>
            <div className="preferences-toolbar">
              {!mobile && <div className="preferences-breadcrumb" aria-label="当前位置"><span>设置</span><ChevronRight size={14} aria-hidden="true" /><span>{current?.label || "外观与字号"}</span></div>}
              <div className="preferences-search"><Search size={15} aria-hidden="true" /><input ref={searchInput} type="search" aria-label="查找设置" placeholder="查找设置" value={query} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => {
                if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); }
                if (event.key === "Enter" && searching && results[0]) { event.preventDefault(); jumpTo(results[0][0], results[0][3]); }
              }} />{query && <button type="button" aria-label="清除查找" onClick={() => { setQuery(""); searchInput.current?.focus(); }}><X size={14} /></button>}</div>
              {softwareUpdateBadge?.(openAbout)}
            </div>
            {searchMessage && <p className="preferences-search-notice" role="status">{searchMessage}</p>}
            {searching && <section className="preferences-search-results" aria-label="设置查找结果"><p role="status">{results.length ? `找到 ${results.length} 项设置` : "未找到设置，请尝试其他关键词。"}</p><div className="preferences-list">{results.map(([page, title, , selector]) => <button type="button" key={title} onClick={() => jumpTo(page, selector)}><span>{title}<small>{title === "我的设备" && accountAvailability !== "signedIn" ? "登录后查看 · 打开账户确认当前状态" : preferencePages.find(item => item.id === page)?.label}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</div></section>}
          <div className="preferences-content" hidden={home || searching} inert={home || searching}>
            {saveError?.tab === tab && <div className="preferences-error"><span role="alert">{saveError.message}</span><button type="button" onClick={() => setSaveError(null)}>关闭提示</button></div>}
            <div id="preferences-panel-settings" className="preferences-panel preferences-settings" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "外观与字号" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-settings"} hidden={activeTab !== "settings"} inert={activeTab !== "settings"}>
              <div aria-busy={saving} className="preferences-form">
                <div className="preferences-group">
                  <label className="preferences-row"><span>主题<small>用于整个工作区及原生工具栏背景</small></span><PreferenceSelect label="主题" mobile={mobile} disabled={saving} value={appearance.themeId} options={themeOptions} onChange={themeId => void changeAppearance({ themeId: themeId as ThemeId })} /></label>
                  <div className="preferences-row"><span>外观<small>系统菜单遵循系统明暗样式</small></span><PreferenceSegments label="外观" value={appearance.schemePreference} options={appearanceOptions} disabled={saving} onChange={schemePreference => void changeAppearance({ schemePreference: schemePreference as SchemePreference })} /></div>
                </div>
                <div className="preferences-group">
                  <div className="preferences-row"><span>界面字体大小<small>调整侧栏、列表和操作文字</small></span><PreferenceSegments label="界面字体大小" value={fontSizeOption(settings.interfaceFontSize).value} options={fontSizeOptions} disabled={saving} onChange={interfaceFontSize => void apply(() => onSettings({ interfaceFontSize: interfaceFontSize as FontSize }))} /></div>
                  <div className="preferences-row"><span>编辑器字体大小<small>仅调整备忘录正文</small></span><PreferenceSegments label="编辑器字体大小" value={fontSizeOption(settings.editorFontSize).value} options={fontSizeOptions} disabled={saving} onChange={editorFontSize => void apply(() => onSettings({ editorFontSize: editorFontSize as FontSize }))} /></div>
                  <details className="preferences-preview"><summary>字号预览</summary><div className="preferences-interface-preview" aria-label="界面字号预览"><span>工作项目</span><small>12 个备忘录</small></div><div className="preferences-editor-preview" style={{ fontSize: fontSizeOption(settings.editorFontSize).editor }} aria-label="编辑器字号预览"><strong>让记录更自然</strong><p>把想法写下来，留给下一次灵感。</p></div></details>
                </div>
              </div>
              <PreferencesInterfaceDetails value={settings.interfaceDetails} mobile={mobile} disabled={saving} onSettings={onSettings} />
              <p className="preferences-footnote" role="status">{saving ? "正在保存…" : "更改保存后立即生效"}</p>
            </div>
            <div id="preferences-panel-about" className="preferences-panel preferences-settings" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "关于" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-about"} hidden={activeTab !== "about"} inert={activeTab !== "about"}>
              {activeTab === "about" && softwareUpdate != null && <section data-settings-slot="update" aria-label="检查和管理更新">{softwareUpdate}</section>}
              <section className="preferences-build-info" aria-label="版本信息">
                <h4>版本信息</h4>
                <dl>
                  <div><dt>发行版本</dt><dd>CyberNote {displayVersion(buildInfo.releaseVersion || buildInfo.version)}{buildInfo.mode === "development" ? " · 开发预览" : ""}{releaseIdentityNotice && <small>{releaseIdentityNotice}</small>}</dd></div>
                  <div><dt>构建时间</dt><dd>{buildInfo.builtAt ? <time dateTime={buildInfo.builtAt}>{buildInfo.builtAt.replace("T", " ").replace("Z", " UTC")}</time> : "开发预览（未生成安装包）"}</dd></div>
                  <div><dt>源码版本</dt><dd title={`${buildInfo.sourceRevision} · ${buildInfo.sourceFingerprint}`}>{buildInfo.sourceRevision === "unavailable" ? "独立预览环境，未注入构建标识" : <><code>{buildInfo.sourceRevision.slice(0, 12)}{buildInfo.sourceDirty ? "+modified" : ""}</code><code>SHA256 {buildInfo.sourceFingerprint}</code></>}</dd></div>
                </dl>
              </section>
            </div>
            <div id="preferences-panel-notes" className="preferences-panel preferences-settings" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "备忘录" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-notes"} hidden={activeTab !== "notes"} inert={activeTab !== "notes"}>
              <div aria-busy={saving} className="preferences-form">
                <div className="preferences-group"><h4>列表</h4>
                  <div className="preferences-row"><span>排序方式</span><PreferenceSegments label="排序方式" disabled={saving} value={settings.sort || "updated"} options={[{value:"updated",label:"编辑日期"},{value:"created",label:"创建日期"},{value:"title",label:"标题"}]} onChange={sort => void apply(() => onSettings({ sort }))} /></div>
                </div>
                <PreferencesPresentation settings={settings} disabled={saving} save={patch => void apply(() => onSettings(patch))} />
                <div className="preferences-group"><h4>桌面列表</h4>
                  <div className="preferences-row"><span>{mobile ? "桌面按日期分组" : "按日期分组"}</span><PreferenceSegments label="按日期分组" value={settings.groupDates === false ? "off" : "on"} options={offOnOptions} disabled={saving} onChange={value => void apply(() => onSettings({ groupDates: value === "on" }))} /></div>
                </div>
                <div className="preferences-group"><div className="preferences-row"><span>锁定备忘录<small>重新锁定所有已打开的锁定备忘录</small></span><button className="preferences-lock-action" type="button" aria-disabled={saving} onClick={() => void apply(onCloseLocks)}>全部关闭</button></div></div>
              </div>
              <p className="preferences-footnote" role="status">{saving ? "正在保存…" : "更改保存后立即生效"}</p>
            </div>
            <div id="preferences-panel-account" className="preferences-panel preferences-settings preferences-account" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "账户与同步" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-account"} hidden={activeTab !== "account"} inert={activeTab !== "account"}>
              {accountUIAvailable && activeTab === "account" && account}
              {syncConflicts != null && <details className="preferences-conflicts preferences-list" open={conflictsOpen} onToggle={event => { const open = event.currentTarget.open; if (open !== conflictsOpen) setConflictsOpen(open); }}><summary>同步冲突<span>查看与解决版本冲突</span><ChevronRight size={16} aria-hidden="true" /></summary>{activeTab === "account" && conflictsOpen && <div className="preferences-conflict-slot">{syncConflicts}</div>}</details>}
              {activeTab === "account" && cloudSync != null && <section data-settings-slot="cloud" className="preferences-module-slot" aria-label="云端同步">{cloudSync}</section>}
            </div>
            <div id="preferences-panel-agent" className="preferences-panel preferences-agent" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "Agent 接入" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-agent"} hidden={activeTab !== "agent"} inert={activeTab !== "agent"}>{tab === "agent" && agent}</div>
            <div id="preferences-panel-data" className="preferences-panel preferences-data" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? current?.label : undefined} aria-labelledby={mobile ? undefined : `preferences-tab-${activeTab === "backup" ? "backup" : "data"}`} hidden={activeTab !== "data" && activeTab !== "backup"} inert={activeTab !== "data" && activeTab !== "backup"}>{(visitedData || tab === "data" || tab === "backup") && data}{activeTab === "backup" && automaticBackup != null && <section data-settings-slot="backup" className="preferences-module-slot preferences-backup-slot" aria-label="自动备份">{automaticBackup}</section>}</div>
          </div>
          </div>
        </div>
      </section>
    </div>
  );
}
