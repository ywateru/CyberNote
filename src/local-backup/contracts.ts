import type { ReactNode } from "react";
import type { ArchiveResult } from "../data-management";

export type BackupHours = 0 | 1 | 6 | 24 | 168;
export type BackupKeep = 3 | 7 | 14 | 30;
export type BackupConfig = {
  version: 1;
  hours: BackupHours;
  keep: BackupKeep;
  directory: string;
};
export type BackupConfigPatch = Partial<
  Pick<BackupConfig, "hours" | "keep" | "directory">
>;
export type BackupReason = "manual" | "automatic" | "beforeRestore";
export type BackupVersion = {
  name: string;
  manifest: {
    format: "cybernote-local-backup";
    version: 1;
    id: string;
    appVersion: string;
    libraryId: string;
    createdAtMs: number;
    reason: BackupReason;
    archiveBytes: number;
    sha256: string;
  };
};
export type BackupStatus = {
  config: BackupConfig;
  directory: string;
  dataDirectory: string;
  libraryId: string;
  versions: BackupVersion[];
  issues: { name: string; message: string }[];
  automaticSuspended: boolean;
  lastError: { code: string; message: string } | null;
  nextDueAtMs: number | null;
};
export type ArchivePreview = {
  notes: number;
  folders: number;
  attachments: number;
  summary: string;
};
export type RestorePreview = {
  version: BackupVersion;
  archive: ArchivePreview;
  confirmation: string;
  expiresAtMs: number;
};
export type RestoreResult = { recovery: BackupVersion; delivery: unknown };

/** Host methods use the shared App save/recording guards. No UI value grants access.
 * restore must apply/hydrate the native mutation delivery before resolving. */
export interface LocalBackupHost {
  status(): Promise<BackupStatus>;
  configure(patch: BackupConfigPatch): Promise<BackupStatus>;
  backupNow(): Promise<BackupVersion>;
  prepareRestore(name: string): Promise<RestorePreview>;
  restore(confirmation: string): Promise<RestoreResult>;
  chooseDirectory(): Promise<string | null>;
  revealDirectory?(directory: string): Promise<void>;
}

export type EncryptedImportPreview = {
  confirmation: string;
  archive: ArchivePreview;
  expiresAtMs: number;
};
/** File selection, cancel+flush, recording checks, full archive validation and
 * barrier commit belong to App. Passwords remain ephemeral, never preferences.
 * prepareImport must authenticate/decrypt/validate before any live-library write.
 * confirmImport must make a recovery snapshot and hydrate the committed result. */
export interface EncryptedArchiveHost {
  export(password: string): Promise<ArchiveResult>;
  prepareImport(password: string): Promise<EncryptedImportPreview | null>;
  confirmImport(confirmation: string): Promise<ArchiveResult>;
  discardImport(confirmation: string): Promise<void>;
}
export type LocalBackupSettingsProps = {
  active: boolean;
  /** Includes recording, quit, access transitions and another archive operation. */
  blocked: boolean;
  /** Host changes this on library/session/access-generation changes. */
  accessKey: string;
  host: LocalBackupHost;
  onArchive(mode: "export" | "import"): Promise<ArchiveResult>;
  /** false in Preferences.automaticBackup when DataManagement owns these rows. */
  showArchiveControls?: boolean;
  appleImport?: ReactNode;
  encryptedArchive?: EncryptedArchiveHost;
};
