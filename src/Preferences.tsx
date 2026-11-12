import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { Database, X, ChevronLeft, ChevronRight, Type, Notebook, RefreshCw, Archive, Folder, PanelsTopLeft, NotebookText, HardDrive, Upload } from "lucide-react";
import { fontSizeOptions, fontSizeOption, type FontSize } from "./font-size";
import type { Settings } from "./types";
import "./Preferences.css";
import PreferencesInterfaceDetails from "./PreferencesInterfaceDetails";
import { buildInfo } from "./build-info";

export const preferencePages = [
  { id: "settings", label: "外观与字号", icon: Type, desktopIcon: PanelsTopLeft },
  { id: "notes", label: "备忘录", icon: Notebook, desktopIcon: NotebookText },
  { id: "sync", label: "设备同步", icon: RefreshCw, desktopIcon: RefreshCw },
  { id: "data", label: "存储空间", icon: Database, desktopIcon: HardDrive },
  { id: "backup", label: "导入与备份", icon: Archive, desktopIcon: Upload },
] as const;
export type PreferencesTab = typeof preferencePages[number]["id"] | "home";
export function isPreferencesTab(value: unknown): value is PreferencesTab {
  return value === "home" || preferencePages.some(page => page.id === value);
}
const appearanceOptions = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const;

function PreferenceChoices<T extends string>({ label, value, options, onChange, disabled, appearance = false }: {
  label: string; value: T; options: readonly { value: T; label: string }[];
  onChange: (value: T) => void; disabled: boolean; appearance?: boolean;
}) {
  return <div role="radiogroup" aria-label={label} className={appearance ? "preferences-appearance-choices" : "preferences-font-choices"}>
    {options.map((option, index) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
      aria-disabled={disabled} tabIndex={value === option.value ? 0 : -1}
      className={appearance ? `preferences-appearance-card preferences-appearance-${option.value}` : "preferences-font-choice"}
      onClick={() => { if (!disabled) onChange(option.value); }}
      onKeyDown={event => {
        const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + options.length - 1) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        if (disabled) return;
        (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
        onChange(options[next].value);
      }}>
      {appearance && <span className="preferences-appearance-sample" aria-hidden="true"><i /><i /></span>}
      <span>{option.label}</span>
    </button>)}
  </div>;
}

export default function Preferences({ tab, onTab, onClose, onBack, settings, onSettings, onCloseLocks, returnFocus, data, synchronization, mobile }: {
  tab: PreferencesTab;
  onTab: (tab: PreferencesTab) => void;
  onClose: () => void;
  onBack: () => void;
  settings: Settings;
  onSettings: (settings: Partial<Settings>) => Promise<unknown>;
  onCloseLocks: () => Promise<unknown>;
  returnFocus: HTMLElement | null;
  data: ReactNode;
  synchronization: ReactNode;
  mobile: boolean;
}) {
  const root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const live = useRef(false), backHandler = useRef(onBack), working = useRef(false);
  backHandler.current = onBack;
  const [visitedData, setVisitedData] = useState(tab === "data" || tab === "backup");
  const [visitedSync, setVisitedSync] = useState(tab === "sync");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const current = preferencePages.find(page => page.id === tab);
  const home = mobile && tab === "home";
  useEffect(() => {
    if (tab === "data" || tab === "backup") setVisitedData(true);
    if (tab === "sync") setVisitedSync(true);
  }, [tab]);
  useLayoutEffect(() => {
    live.current = true;
    close.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      const element = root.current;
      if (event.defaultPrevented || !live.current || !element?.isConnected || element.hidden || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); backHandler.current(); return;
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
  const apply = async (action: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true; setSaving(true); setError("");
    try { await action(); }
    catch (cause) { if (live.current) setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "更改未保存，请重试"); }
    finally { working.current = false; if (live.current) setSaving(false); }
  };
  const summary = (id: string) => id === "settings" ? ({ system: "跟随系统", light: "浅色", dark: "深色" }[settings.theme || "system"]) : id === "notes" ? ({ updated: "编辑日期", created: "创建日期", title: "标题" }[settings.sort || "updated"]) : "";
  return (
    <div className={`preferences-backdrop ${mobile ? "preferences-mobile" : "preferences-desktop"}`}>
      <section ref={root} className="preferences" role="dialog" aria-modal="true" aria-labelledby="preferences-title" data-preferences-tab={tab}>
        <header className="preferences-header">
          {mobile && !home && <button type="button" className="preferences-back" aria-label="返回设置" onClick={onBack}><ChevronLeft /><span>设置</span></button>}
          <h2 ref={heading} tabIndex={-1} id="preferences-title">{mobile && !home ? current?.label : "设置"}</h2>
          <button ref={close} className="preferences-close" type="button" aria-label="关闭设置" onClick={onClose}>{mobile ? "完成" : <X size={19} />}</button>
        </header>
        <div className="preferences-body">
          {(!mobile || home) && <nav className="preferences-navigation" aria-label="设置分类" role={mobile ? undefined : "tablist"} aria-orientation={mobile ? undefined : "vertical"}>
            {preferencePages.map(({ id, label, icon, desktopIcon }, index) => <button key={id} id={`preferences-tab-${id}`} type="button" role={mobile ? undefined : "tab"} data-preferences-page={id}
              aria-selected={mobile ? undefined : tab === id} aria-controls={mobile ? undefined : id === "backup" ? "preferences-panel-data" : `preferences-panel-${id}`}
              tabIndex={mobile || tab === id ? 0 : -1} onClick={() => onTab(id)} onKeyDown={event => {
                if (mobile) return;
                const next = event.key === "ArrowDown" || event.key === "ArrowRight" ? (index + 1) % preferencePages.length : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (index + preferencePages.length - 1) % preferencePages.length : event.key === "Home" ? 0 : event.key === "End" ? preferencePages.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault(); onTab(preferencePages[next].id);
                root.current?.querySelector<HTMLButtonElement>(`#preferences-tab-${preferencePages[next].id}`)?.focus();
              }}>{(() => { const Icon = mobile ? icon : desktopIcon; return <Icon size={20} />; })()}<span>{label}</span>{mobile && <><small>{summary(id)}</small><ChevronRight size={17} /></>}</button>)}
            <p className="preferences-navigation-note">{mobile ? "备忘录和附件保存在此设备中。" : "CyberNote"}</p>
          </nav>}
          <div className="preferences-content" hidden={home} inert={home}>
            {error && <p className="preferences-error" role="alert">{error}</p>}
            <div id="preferences-panel-settings" className="preferences-panel preferences-settings" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "外观与字号" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-settings"} hidden={tab !== "settings"} inert={tab !== "settings"}>
              <h3 className="preferences-page-title">外观与字号</h3>
              <fieldset disabled={mobile && saving} aria-busy={saving} className="preferences-form">
                <div className="preferences-group preferences-appearance-group">
                  {mobile ? <label className="preferences-row"><span>外观</span><select aria-label="外观" value={settings.theme || "system"} onChange={event => void apply(() => onSettings({ theme: event.target.value as Settings["theme"] }))}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label> : <>
                    <h4>外观</h4>
                    <PreferenceChoices label="外观" value={settings.theme || "system"} options={appearanceOptions} disabled={saving} appearance onChange={theme => void apply(() => onSettings({ theme }))} />
                  </>}
                </div>
                <div className="preferences-group preferences-interface-group">
                  {mobile ? <label className="preferences-row"><span>界面字体大小</span><select aria-label="界面字体大小" value={fontSizeOption(settings.interfaceFontSize).value} onChange={event => void apply(() => onSettings({ interfaceFontSize: event.target.value as FontSize }))}>{fontSizeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <>
                    <div className="preferences-choice-heading"><h4>界面字号</h4><span>{fontSizeOption(settings.interfaceFontSize).label}</span></div>
                    <PreferenceChoices label="界面字体大小" value={fontSizeOption(settings.interfaceFontSize).value} options={fontSizeOptions} disabled={saving} onChange={interfaceFontSize => void apply(() => onSettings({ interfaceFontSize }))} />
                  </>}
                  {mobile && <p className="preferences-help">调整界面文字、图标和间距。</p>}
                  <div className="preferences-interface-preview" aria-label="界面字号预览"><Folder size={20} /><span>工作项目</span><small>12 个备忘录</small></div>
                </div>
                <div className="preferences-group preferences-editor-group">
                  {mobile ? <label className="preferences-row"><span>编辑器字体大小</span><select aria-label="编辑器字体大小" value={fontSizeOption(settings.editorFontSize).value} onChange={event => void apply(() => onSettings({ editorFontSize: event.target.value as FontSize }))}>{fontSizeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <>
                    <div className="preferences-choice-heading"><h4>编辑器字号</h4><span>{fontSizeOption(settings.editorFontSize).label}</span></div>
                    <PreferenceChoices label="编辑器字体大小" value={fontSizeOption(settings.editorFontSize).value} options={fontSizeOptions} disabled={saving} onChange={editorFontSize => void apply(() => onSettings({ editorFontSize }))} />
                  </>}
                  <div className="preferences-editor-preview" style={{ fontSize: fontSizeOption(settings.editorFontSize).editor }} aria-label="编辑器字号预览"><strong>让记录更自然</strong><p>把想法写下来，留给下一次灵感。</p></div>
                </div>
              </fieldset>
              <PreferencesInterfaceDetails value={settings.interfaceDetails} mobile={mobile} disabled={saving} onSettings={onSettings} />
              <p className="preferences-footnote">更改立即生效</p>
              <section className="preferences-build-info" aria-label="版本信息">
                <h4>版本信息</h4>
                <dl>
                  <div><dt>版本</dt><dd>CyberNote {buildInfo.version}{buildInfo.mode === "development" ? " · 开发预览" : ""}</dd></div>
                  <div><dt>构建时间</dt><dd>{buildInfo.builtAt ? <time dateTime={buildInfo.builtAt}>{buildInfo.builtAt.replace("T", " ").replace("Z", " UTC")}</time> : "开发预览（未生成安装包）"}</dd></div>
                  <div><dt>源码版本</dt><dd title={`${buildInfo.sourceRevision} · ${buildInfo.sourceFingerprint}`}>{buildInfo.sourceRevision === "unavailable" ? "独立预览环境，未注入构建标识" : <><code>{buildInfo.sourceRevision.slice(0, 12)}{buildInfo.sourceDirty ? "+modified" : ""}</code><code>SHA256 {buildInfo.sourceFingerprint}</code></>}</dd></div>
                </dl>
              </section>
            </div>
            <div id="preferences-panel-notes" className="preferences-panel preferences-settings" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "备忘录" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-notes"} hidden={tab !== "notes"} inert={tab !== "notes"}>
              <h3 className="preferences-page-title">备忘录</h3>
              <fieldset disabled={saving} className="preferences-form">
                <div className="preferences-group"><h4>列表</h4>
                  <label className="preferences-row"><span>排序方式</span><select aria-label="排序方式" value={settings.sort || "updated"} onChange={event => void apply(() => onSettings({ sort: event.target.value as Settings["sort"] }))}><option value="updated">编辑日期</option><option value="created">创建日期</option><option value="title">标题</option></select></label>
                </div>
                <div className="preferences-group"><h4>{mobile ? "桌面列表选项" : "显示"}</h4>{mobile && <p className="preferences-help">这些选项用于桌面，手机首页始终以画廊显示。</p>}
                  <label className="preferences-row"><span>{mobile ? "桌面显示方式" : "显示方式"}</span><select aria-label={mobile ? "桌面显示方式" : "显示方式"} value={settings.view || "list"} onChange={event => void apply(() => onSettings({ view: event.target.value as Settings["view"] }))}><option value="list">列表</option><option value="gallery">画廊</option></select></label>
                  <label className="preferences-row preferences-check"><span>{mobile ? "桌面按日期分组" : "按日期分组"}</span><input type="checkbox" checked={settings.groupDates !== false} onChange={event => void apply(() => onSettings({ groupDates: event.target.checked }))} /></label>
                </div>
                <div className="preferences-group"><h4>锁定备忘录</h4><button type="button" onClick={() => void apply(onCloseLocks)}>关闭所有已锁定的备忘录</button><p className="preferences-help">已打开的锁定备忘录将重新锁定。</p></div>
              </fieldset>
              <p className="preferences-footnote">更改立即生效</p>
            </div>
            <div id="preferences-panel-sync" className="preferences-panel preferences-sync" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? "设备同步" : undefined} aria-labelledby={mobile ? undefined : "preferences-tab-sync"} hidden={tab !== "sync"} inert={tab !== "sync"}>{(visitedSync || tab === "sync") && synchronization}</div>
            <div id="preferences-panel-data" className="preferences-panel preferences-data" role={mobile ? "region" : "tabpanel"} aria-label={mobile ? current?.label : undefined} aria-labelledby={mobile ? undefined : `preferences-tab-${tab === "backup" ? "backup" : "data"}`} hidden={tab !== "data" && tab !== "backup"} inert={tab !== "data" && tab !== "backup"}>{(visitedData || tab === "data" || tab === "backup") && data}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
