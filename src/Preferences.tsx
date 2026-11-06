import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Settings as SettingsIcon, Database, X } from "lucide-react";
import type { Settings } from "./types";
import "./Preferences.css";
export type PreferencesTab = "settings" | "data";
export default function Preferences({
  tab,
  onTab,
  onClose,
  settings,
  onSettings,
  onCloseLocks,
  returnFocus,
  data,
  mobile,
}: {
  tab: PreferencesTab;
  onTab: (tab: PreferencesTab) => void;
  onClose: () => void;
  settings: Settings;
  onSettings: (settings: Partial<Settings>) => Promise<unknown>;
  onCloseLocks: () => Promise<unknown>;
  returnFocus: HTMLElement | null;
  data: ReactNode;
  mobile: boolean;
}) {
  const root = useRef<HTMLElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const live = useRef(false),
    closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const [visitedData, setVisitedData] = useState(tab === "data");
  useEffect(() => {
    if (tab === "data") setVisitedData(true);
  }, [tab]);
  useLayoutEffect(() => {
    live.current = true;
    close.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      const element = root.current;
      if (
        !live.current ||
        !element?.isConnected ||
        element.hidden ||
        !element.getClientRects().length ||
        getComputedStyle(element).visibility === "hidden"
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHandler.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
        ),
      ].filter(
        (node) =>
          !node.closest("[hidden],[inert]") && node.getClientRects().length > 0,
      );
      const first = nodes[0],
        last = nodes.at(-1),
        outside = !nodes.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        event.stopPropagation();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || outside)
      ) {
        event.preventDefault();
        event.stopPropagation();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      live.current = false;
      document.removeEventListener("keydown", keyboard, true);
      const candidates = [
        returnFocus,
        ...document.querySelectorAll<HTMLElement>(
          '.mobile-home-settings,.folder-footer [aria-label="设置"],.notes-header [aria-label="显示选项"],.folder-footer [aria-label="新建备忘录"]',
        ),
      ];
      candidates
        .find(
          (node) =>
            node?.isConnected &&
            node !== document.body &&
            node !== document.documentElement &&
            !node.matches(":disabled") &&
            node.getClientRects().length &&
            getComputedStyle(node).visibility !== "hidden" &&
            !node.closest("[hidden],[inert],.access-sync,.preferences-backdrop"),
        )
        ?.focus({ preventScroll: true });
    };
  }, []);
  const tabs: PreferencesTab[] = ["settings", "data"];
  return (
    <div className="preferences-backdrop">
      <section
        ref={root}
        className="preferences"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        data-preferences-tab={tab}
      >
        <header className="preferences-header">
          <h2 id="preferences-title">“备忘录”设置</h2>
          <button
            ref={close}
            className="preferences-close"
            type="button"
            aria-label="关闭设置"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div
          className="preferences-tabs"
          role="tablist"
          aria-label="设置与数据"
        >
          {tabs.map((value) => (
            <button
              key={value}
              id={`preferences-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={`preferences-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => onTab(value)}
              onKeyDown={(event) => {
                const index = tabs.indexOf(value);
                const next =
                  event.key === "ArrowRight"
                    ? tabs[(index + 1) % tabs.length]
                    : event.key === "ArrowLeft"
                      ? tabs[(index + tabs.length - 1) % tabs.length]
                      : event.key === "Home"
                        ? tabs[0]
                        : event.key === "End"
                          ? tabs.at(-1)
                          : undefined;
                if (!next) return;
                event.preventDefault();
                event.stopPropagation();
                onTab(next);
                root.current
                  ?.querySelector<HTMLButtonElement>(`#preferences-tab-${next}`)
                  ?.focus();
              }}
            >
              {value === "settings" ? (
                <SettingsIcon size={25} />
              ) : (
                <Database size={25} />
              )}
              <span>{value === "settings" ? "设置" : "数据"}</span>
            </button>
          ))}
        </div>
        <div
          id="preferences-panel-settings"
          className="preferences-panel preferences-settings"
          role="tabpanel"
          aria-labelledby="preferences-tab-settings"
          hidden={tab !== "settings"}
          inert={tab !== "settings"}
        >
          <div className="preferences-form">
            <div className="preferences-group">
              <label className="preferences-row">
                <span>外观：</span>
                <select
                  aria-label="外观"
                  value={settings.theme || "system"}
                  onChange={(event) =>
                    void onSettings({
                      theme: event.target.value as Settings["theme"],
                    })
                  }
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <label className="preferences-row">
                <span>排序方式：</span>
                <select
                  aria-label="排序方式"
                  value={settings.sort || "updated"}
                  onChange={(event) =>
                    void onSettings({
                      sort: event.target.value as Settings["sort"],
                    })
                  }
                >
                  <option value="updated">编辑日期</option>
                  <option value="created">创建日期</option>
                  <option value="title">标题</option>
                </select>
              </label>
              <label className="preferences-row">
                <span>{mobile ? "桌面显示方式：" : "显示方式："}</span>
                <select
                  aria-label={mobile ? "桌面显示方式" : "显示方式"}
                  value={settings.view || "list"}
                  onChange={(event) =>
                    void onSettings({
                      view: event.target.value as Settings["view"],
                    })
                  }
                >
                  <option value="list">列表</option>
                  <option value="gallery">画廊</option>
                </select>
              </label>
              <div className="preferences-row">
                <span />
                <label className="preferences-check">
                  <input
                    type="checkbox"
                    checked={settings.groupDates !== false}
                    onChange={(event) =>
                      void onSettings({ groupDates: event.target.checked })
                    }
                  />
                  {mobile ? "桌面按日期分组" : "按日期分组"}
                </label>
              </div>
            </div>
            <div className="preferences-group">
              <div className="preferences-row">
                <span>锁定备忘录：</span>
                <button type="button" onClick={() => void onCloseLocks()}>
                  关闭所有已锁定的备忘录
                </button>
              </div>
            </div>
            <p className="preferences-footnote">
              所有备忘录和附件保存在此设备中。
            </p>
          </div>
        </div>
        <div
          id="preferences-panel-data"
          className="preferences-panel preferences-data"
          role="tabpanel"
          aria-labelledby="preferences-tab-data"
          hidden={tab !== "data"}
          inert={tab !== "data"}
        >
          {(visitedData || tab === "data") && data}
        </div>
      </section>
    </div>
  );
}
