import { invoke } from "@tauri-apps/api/core";
import type {
  BackupConfigPatch,
  BackupStatus,
  BackupVersion,
  LocalBackupHost,
  RestorePreview,
  RestoreResult,
} from "./contracts";

export type ExpectedSession = {
  sessionId: string;
  epoch: number;
  noteEpoch?: number | null;
};
export type LocalBackupClientOptions = {
  /** E.g. () => accessGate.expected(); never refresh/retry a rejected Token. */
  expected(): ExpectedSession;
  /** App's shared cancel/flush/recording/quit guard. Runs before each write. */
  beforeOperation(): Promise<void>;
  /** Apply the existing importArchive delivery with App's hydrate/fallback path. */
  afterRestore(delivery: unknown): Promise<void>;
  chooseDirectory?(): Promise<string | null>;
  revealDirectory?(directory: string): Promise<void>;
};

/** Invoke adapter owns neither a Session nor a scheduler. Native authorization
 * remains mandatory even when beforeOperation succeeds in the renderer. */
export function createLocalBackupClient(
  options: LocalBackupClientOptions,
): LocalBackupHost {
  const call = <T>(command: string, args: Record<string, unknown> = {}) =>
    invoke<T>(command, { ...args, expected: options.expected() });
  const guarded = async <T>(
    command: string,
    args: Record<string, unknown> = {},
  ) => {
    const expected = options.expected();
    await options.beforeOperation();
    const current = options.expected();
    if (
      current.sessionId !== expected.sessionId ||
      current.epoch !== expected.epoch ||
      current.noteEpoch !== expected.noteEpoch
    )
      throw Error("授权状态已变化，请重新操作本地备份");
    return invoke<T>(command, { ...args, expected });
  };
  return {
    status: () => call<BackupStatus>("local_backup_status"),
    configure: async (patch: BackupConfigPatch) => {
      return guarded<BackupStatus>("local_backup_configure", { patch });
    },
    backupNow: async () => {
      return guarded<BackupVersion>("local_backup_now");
    },
    prepareRestore: async (name: string) => {
      return guarded<RestorePreview>("local_backup_prepare_restore", { name });
    },
    restore: async (confirmation: string) => {
      const result = await guarded<RestoreResult>("local_backup_restore", {
        confirmation,
      });
      // A hydration failure cannot erase the native commit or trigger an import
      // retry. The UI consumes the confirmation and offers read-only refresh.
      try {
        await options.afterRestore(result.delivery);
      } catch (cause) {
        return {
          ...result,
          refreshError:
            cause && typeof cause === "object" && "message" in cause
              ? String(cause.message)
              : String(cause),
        };
      }
      return result;
    },
    chooseDirectory: options.chooseDirectory,
    revealDirectory: options.revealDirectory,
  };
}
