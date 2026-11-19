export type UpdatePreferences = {
  checkOnStartup: boolean;
  automaticChecks: boolean;
  intervalMinutes: number;
  channel: "stable" | "preview";
  showBadge: boolean;
  quietUntil: number;
};
export type UpdateRelease = {
  version: string;
  notes: string;
  url: string;
  package: string;
  size: number;
  platform: string;
  architecture: string;
};
export type UpdatePhase =
  | "idle"
  | "checking"
  | "no_release"
  | "up_to_date"
  | "available"
  | "downloading"
  | "verifying"
  | "ready"
  | "staging"
  | "awaiting_confirmation"
  | "restarting"
  | "error";
export type UpdateStatus = {
  currentVersion: string;
  preferences: UpdatePreferences;
  phase: UpdatePhase;
  release: UpdateRelease | null;
  downloaded: number;
  total: number;
  lastChecked: number | null;
  error: string | null;
  retry: "check" | "download" | "install" | null;
  installMode: "replace_restart" | "download_only" | "unsupported";
  installReason: string;
  installReport: string | null;
};
export interface SoftwareUpdateClient {
  status(): Promise<UpdateStatus>;
  configure(patch: Partial<UpdatePreferences>): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
}
