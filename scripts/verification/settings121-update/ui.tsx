import React from "react";
import { createRoot } from "react-dom/client";
import {
  SoftwareUpdateProvider,
  SoftwareUpdateSettings,
  UpdateBadge,
  type SoftwareUpdateClient,
  type UpdateStatus,
} from "../../../src/software-update";
import "../../../src/themes/tokens.css";
const query = new URLSearchParams(location.search);
const mode = query.get("mode") ?? "available";
const scheme = query.get("scheme") ?? "light";
document.documentElement.dataset.themeId = "classic";
document.documentElement.dataset.scheme = scheme;
document.documentElement.classList.toggle("dark", scheme === "dark");
const base: UpdateStatus = {
  currentVersion: "0.1.0",
  phase: mode === "empty" ? "no_release" : "available",
  downloaded: 0,
  total: 36054282,
  preferences: {
    checkOnStartup: true,
    automaticChecks: true,
    intervalMinutes: 360,
    channel: "stable",
    showBadge: true,
    quietUntil: 0,
  },
  release:
    mode === "empty"
      ? null
      : {
          version: "0.2.0",
          notes:
            "## 更新说明\n\n保存与录音改进。\n<script>alert('must stay text')</script>",
          url: "https://github.com/ywateru/CyberNote/releases/tag/v0.2.0",
          package: "CyberNote-macos-arm64.zip",
          size: 36054282,
          platform: "macos",
          architecture: "arm64",
        },
  installReport: null,
  lastChecked: 1795068000,
  error: null,
  retry: null,
  installMode: mode === "android" ? "download_only" : "replace_restart",
  installReason:
    mode === "android"
      ? "Actions 发布 APK 未签名，Android 系统安装器不能安装。需要兼容签名的 APK，不绕过系统签名检查。"
      : "ad-hoc 签名，未公证；确认后替换并重启，保留旧包，启动未确认时保留旧包及记录，需安全退出后恢复。",
};
let state = structuredClone(base);
const calls: string[] = [];
Object.assign(window, { fixtureCalls: calls });
const clone = () => structuredClone(state);
let attempts = 0;
let configureAttempts = 0;
const client: SoftwareUpdateClient = {
  status: async () => clone(),
  configure: async (patch) => {
    calls.push(`configure:${JSON.stringify(patch)}`);
    if (mode.startsWith("configure-error") && configureAttempts++ === 0) {
      state.retry = mode.endsWith("download")
        ? "download"
        : mode.endsWith("install")
          ? "install"
          : null;
      state.error = state.retry ? "checksum_mismatch" : null;
      throw Error("preferences_changed_externally");
    }
    state.error = null;
    state.retry = null;
    state.preferences = { ...state.preferences, ...patch };
    return clone();
  },
  check: async () => {
    calls.push("check");
    state.phase = mode === "empty" ? "no_release" : "available";
    return clone();
  },
  download: async () => {
    calls.push("download");
    state.phase = "downloading";
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 180));
      state.downloaded = (state.total * i) / 5;
    }
    if (mode === "error" && attempts++ === 0) {
      state.phase = "error";
      state.error = "checksum_mismatch";
      state.retry = "download";
      throw Error("checksum_mismatch");
    }
    state.error = null;
    state.retry = null;
    state.phase = "ready";
    return clone();
  },
  install: async () => {
    calls.push("install");
    state.phase = "awaiting_confirmation";
    await new Promise((r) => setTimeout(r, 200));
    state.phase = "error";
    state.error = "host_install_guard_unavailable";
    state.retry = "install";
    return clone();
  },
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SoftwareUpdateProvider client={mode === "native" ? undefined : client}>
      <div className="preferences-workspace">
        <style>{`body{margin:0;padding:24px;background:var(--grouped);color:var(--ink);font:14px -apple-system,BlinkMacSystemFont,sans-serif}main{max-width:680px;margin:auto;background:var(--paper);padding:0 20px}header{max-width:720px;margin:0 auto 10px;display:flex;justify-content:space-between;align-items:center}h1{font-size:20px}*{box-sizing:border-box}@media(max-width:520px){body{padding:12px}main{padding:0 12px}}`}</style>
        <header>
          <h1>软件更新</h1>
          <UpdateBadge openAbout={() => document.querySelector("section")?.scrollIntoView()} />
        </header>
        <main>
          <SoftwareUpdateSettings />
        </main>
      </div>
    </SoftwareUpdateProvider>
  </React.StrictMode>,
);
