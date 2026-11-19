import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { ChevronDown, Folder, MoreHorizontal, RotateCcw } from "lucide-react";
import { PreferenceSelect } from "./preferences-menu/PreferenceSelect";
import type { Settings } from "./types";
import {
  defaultInterfaceDetails,
  interfaceDetailRanges,
  interfaceDetailVariables,
  parseInterfaceDetails,
  type InterfaceDetails,
} from "./interface-details";

export default function PreferencesInterfaceDetails({
  value,
  mobile,
  disabled,
  onSettings,
}: {
  value: unknown;
  mobile: boolean;
  disabled: boolean;
  onSettings: (patch: Partial<Settings>) => Promise<unknown>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [initial] = useState(() => {
    try {
      return { details: parseInterfaceDetails(value), error: "" };
    } catch (cause) {
      return { details: null, error: (cause as Error).message };
    }
  });
  // Keep a local acknowledged value while this control awaits its persistence
  // receipt; incoming external settings are reconciled below.
  const [confirmed, setConfirmed] = useState(initial.details);
  const [preview, setPreview] = useState(initial.details);
  const [error, setError] = useState(initial.error);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<{
    signature: string;
    seen: unknown;
    observed: boolean;
    external?: InterfaceDetails;
  } | null>(null);
  const rejected = useRef<{
    signature: string;
    seen: unknown;
    observed: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    try {
      const next = parseInterfaceDetails(value),
        signature = JSON.stringify(next);
      if (busy.current) {
        if (attempt.current && signature === attempt.current.signature) {
          attempt.current.seen = value;
          attempt.current.observed = true;
        } else if (attempt.current) {
          // A different parent value is newer authority, not this request's
          // optimistic echo. Preserve it until either receipt settles.
          attempt.current.external = next;
        }
        return;
      }
      const failed = rejected.current;
      if (failed && signature === failed.signature) {
        if (!failed.observed) {
          failed.seen = value;
          failed.observed = true;
          return;
        }
        if (failed.seen === value) return;
      }
      rejected.current = null;
      setConfirmed(next);
      setPreview(next);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [value]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // React renders this page for one mounted Preferences lifetime. Remount after
  // reload reads persisted settings; hiding a category retains confirmed state.
  const save = async (input: unknown) => {
    if (busy.current || disabled) return;
    let next: InterfaceDetails;
    try {
      next = parseInterfaceDetails(input);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    attempt.current = {
      signature: JSON.stringify(next),
      seen: undefined,
      observed: false,
    };
    busy.current = true;
    setSaving(true);
    setError("");
    setPreview(next);
    try {
      await onSettings({ interfaceDetails: next });
      rejected.current = null;
      if (live.current) {
        const latest = attempt.current?.external ?? next;
        setConfirmed(latest);
        setPreview(latest);
      }
    } catch (cause) {
      rejected.current = attempt.current;
      if (live.current) {
        const latest = attempt.current?.external ?? confirmed;
        setConfirmed(latest);
        setPreview(latest);
        setError(
          `界面细节未保存：${cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "请重试"}`,
        );
      }
    } finally {
      attempt.current = null;
      busy.current = false;
      if (live.current) setSaving(false);
    }
  };
  const percent = (
    key: "iconScale" | "desktopHitScale" | "mobileHitScale" | "radiusScale",
    label: string,
  ) => {
    const range = interfaceDetailRanges[key];
    return (
      <label className="preferences-detail-control">
        <span>
          {label}
          <output>{confirmed ? `${confirmed[key]}%` : "不可用"}</output>
        </span>
        <input
          type="range"
          aria-label={label}
          min={range.min}
          max={range.max}
          step="1"
          value={confirmed?.[key] ?? range.min}
          disabled={disabled || saving || !confirmed}
          onChange={(event) =>
            void save({ ...confirmed, [key]: Number(event.target.value) })
          }
        />
        <small>
          {range.min}%–{range.max}%
        </small>
      </label>
    );
  };
  return (
    <section className="preferences-interface-details preferences-list" aria-label="界面细节">
      <button
        type="button"
        className="preferences-details-toggle"
        aria-label="界面细节"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>界面细节<small>图标、操作区域与菜单</small></span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div
        id={id}
        hidden={!open}
        className="preferences-details-content"
        aria-busy={saving}
      >
        <p className="preferences-help">
          分别调整图标和操作区域。手机操作区域最短边始终至少 44px。
        </p>
        {error && (
          <p role="alert" className="preferences-details-error">
            {error}
          </p>
        )}
        {percent("iconScale", "图标大小")}
        {percent(mobile ? "mobileHitScale" : "desktopHitScale", "操作区域")}
        <label className="preferences-detail-control">
          <span>菜单间距</span>
          <PreferenceSelect label="菜单间距" mobile={mobile} value={confirmed?.menuSpacing ?? "standard"}
            disabled={disabled || saving || !confirmed}
            options={[{value:"compact",label:"紧凑"},{value:"standard",label:"标准"},{value:"comfortable",label:"宽松"}]}
            onChange={menuSpacing => void save({ ...confirmed, menuSpacing })} />
        </label>
        {percent("radiusScale", "圆角")}
        {preview && (
          <div
            className="preferences-details-example"
            aria-label="界面细节即时示例"
            style={interfaceDetailVariables(preview, mobile)}
          >
            <div className="preferences-details-example-card">
              <Folder aria-hidden="true" />
              <span>工作项目</span>
              <button type="button" aria-label="示例操作">
                <MoreHorizontal />
              </button>
            </div>
            <div className="preferences-details-example-menu">
              <button type="button">
                <Folder />
                移动到文件夹
              </button>
              <button type="button">
                <RotateCcw />
                恢复上次操作
              </button>
            </div>
          </div>
        )}
        <p className="preferences-help">
          菜单间距与圆角作用于应用内菜单，系统菜单遵循系统样式。
        </p>
        <button
          type="button"
          className="preferences-details-reset"
          disabled={disabled || saving}
          onClick={() => void save(defaultInterfaceDetails)}
        >
          <RotateCcw />
          恢复界面细节默认值
        </button>
        <p role="status" className="preferences-help">
          {saving ? "正在保存…" : ""}
        </p>
      </div>
    </section>
  );
}
