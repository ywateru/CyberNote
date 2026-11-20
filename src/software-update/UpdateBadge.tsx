import { displayVersion } from "../build-info";
import { ArrowUp, X } from "lucide-react";
import { updateMessage } from "./SoftwareUpdateSettings";
import { useSoftwareUpdate } from "./useSoftwareUpdate";

export function UpdateBadge({ openAbout }: { openAbout: () => void }) {
  const update = useSoftwareUpdate();
  const status = update.status;
  if (!status?.release || !status.preferences.showBadge || status.preferences.quietUntil > Date.now() / 1000) return null;

  const downloading = status.phase === "downloading" || status.phase === "verifying";
  const canDownload = status.phase === "available" || status.retry === "download";
  const canInstall = status.installMode === "replace_restart" && (status.phase === "ready" || status.retry === "install");
  const label = downloading ? updateMessage(status) : status.phase === "error" ? "更新未完成" : "更新";
  const dismiss = () => {
    void update.configure({ quietUntil: Math.floor(Date.now() / 1000) + 3 * 86400 });
  };
  return <div className="preferences-update-badge">
    <button type="button" className="preferences-update-action" title={`${displayVersion(status.release.version)} · ${updateMessage(status)}`}
      onClick={() => {
        openAbout();
        if (update.busy) return;
        if (canDownload) void update.download();
        else if (canInstall) void update.install();
      }}>
      <span className="preferences-update-pill"><ArrowUp size={12} aria-hidden="true" />{label}</span>
    </button>
    <button type="button" className="preferences-update-hide" aria-label="隐藏更新徽标三天"
      title="隐藏更新徽标三天" disabled={update.busy} onClick={event => {
        event.currentTarget.closest(".preferences-toolbar")?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        dismiss();
      }}><X size={12} aria-hidden="true" /></button>
  </div>;
}
