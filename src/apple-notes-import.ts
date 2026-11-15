import { invoke } from "@tauri-apps/api/core";
import { accessGate, native } from "./bridge";
import { AccessChanged } from "./access-client";
export type AppleImportItem = {
  key: string;
  title: string;
  folder: string;
  status: "ok" | "locked" | "unreadable";
  reason: string;
};
export type AppleImportResult = {
  key: string;
  status: "imported" | "imported_with_warnings" | "existing" | "skipped";
  reason: string;
  warnings: string[];
  noteId: string | null;
};
export type AppleImportSnapshot = {
  id: string;
  phase:
    | "scanning"
    | "preview"
    | "importing"
    | "saving"
    | "cancelling"
    | "cancelled"
    | "complete"
    | "error";
  completed: number;
  total: number;
  items: AppleImportItem[];
  results: AppleImportResult[];
  error: string;
  truncated: boolean;
  commit: unknown;
};
const jobs = new Map<string, ReturnType<typeof accessGate.expected>>();
export const appleImportTerminal = (state: AppleImportSnapshot) =>
  ["complete", "cancelled", "error"].includes(state.phase);
export function parseAppleImport(value: unknown): AppleImportSnapshot {
  if (!value || typeof value !== "object") throw Error("导入任务返回无效");
  const v = value as AppleImportSnapshot;
  if (
    typeof v.id !== "string" ||
    !v.id ||
    ![
      "scanning",
      "preview",
      "importing",
      "saving",
      "cancelling",
      "cancelled",
      "complete",
      "error",
    ].includes(v.phase) ||
    !Number.isSafeInteger(v.completed) ||
    !Number.isSafeInteger(v.total) ||
    v.completed < 0 ||
    v.total < 0 ||
    v.total > 5000 ||
    v.completed > v.total ||
    typeof v.error !== "string" ||
    typeof v.truncated !== "boolean" ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.results) ||
    v.items.length > 5000 ||
    v.results.length > 5000
  )
    throw Error("导入任务返回无效");
  const keys = new Set<string>();
  for (const item of v.items) {
    if (
      !item ||
      typeof item.key !== "string" ||
      keys.has(item.key) ||
      typeof item.title !== "string" ||
      typeof item.folder !== "string" ||
      typeof item.reason !== "string" ||
      !["ok", "locked", "unreadable"].includes(item.status)
    )
      throw Error("来源预览无效");
    keys.add(item.key);
  }
  for (const r of v.results)
    if (
      !r ||
      typeof r.key !== "string" ||
      !["imported", "imported_with_warnings", "existing", "skipped"].includes(
        r.status,
      ) ||
      typeof r.reason !== "string" ||
      !Array.isArray(r.warnings) ||
      r.warnings.some((w) => typeof w !== "string") ||
      (r.noteId !== null && typeof r.noteId !== "string")
    )
      throw Error("导入结果无效");
  return v;
}
async function command(
  name: string,
  args: Record<string, unknown> = {},
): Promise<AppleImportSnapshot> {
  if (!native) throw Error("请在 Mac 应用中从 Apple 备忘录导入");
  const stamp = accessGate.stamp();
  const expected = accessGate.expected();
  const state = parseAppleImport(await invoke(name, { ...args, expected }));
  if (name === "apple_notes_scan") {
    jobs.set(state.id, expected);
    while (jobs.size > 16) jobs.delete(jobs.keys().next().value!);
  }
  const now = accessGate.stamp();
  if (
    stamp.generation !== now.generation ||
    stamp.sessionId !== now.sessionId ||
    stamp.epoch !== now.epoch
  ) {
    if (name === "apple_notes_scan")
      await invoke("apple_notes_cancel", { id: state.id, expected }).catch(
        () => {},
      );
    throw new AccessChanged();
  }
  return state;
}
export const scanAppleNotes = () => command("apple_notes_scan");
export const readAppleNotesImport = (id: string) =>
  command("apple_notes_status", { id });
export const startAppleNotesImport = (id: string, keys: string[]) =>
  command("apple_notes_start", { id, keys });
// Cancellation is still bound by the native job's original owner and token; it
// remains usable after access revocation to terminate only this caller's work.
export async function cancelAppleNotesImport(
  id: string,
): Promise<AppleImportSnapshot> {
  const expected = jobs.get(id);
  if (!expected) throw Error("导入任务已失效");
  return parseAppleImport(await invoke("apple_notes_cancel", { id, expected }));
}
