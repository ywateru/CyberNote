import { useSoftwareUpdate } from "./useSoftwareUpdate";
import { updateMessage } from "./SoftwareUpdateSettings";
import "./software-update.css";
/** Content for Preferences.softwareUpdateBadge, which is inside the host button.
 * Never render interactive descendants. The host owns navigation and focus. */
export function UpdateBadge() {
  const { status: s } = useSoftwareUpdate();
  const visible =
    s?.release &&
    s.preferences.showBadge &&
    s.preferences.quietUntil <= Date.now() / 1000;
  return (
    <span
      className="software-update-badge"
      title={
        visible ? `${s.release!.version} · ${updateMessage(s)}` : undefined
      }
    >
      {visible
        ? s.phase === "downloading"
          ? updateMessage(s)
          : s.phase === "error"
            ? "更新未完成"
            : s.phase === "ready"
              ? "更新已下载"
              : "有可用更新"
        : "更新"}
    </span>
  );
}
