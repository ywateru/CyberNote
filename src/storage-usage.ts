import type { DataManagementSnapshot, ManagedFile } from "./data-management";

export const storageCategories = [
  { id: "image", label: "图片", color: "#FF9F0A" },
  { id: "audio", label: "录音", color: "#FF453A" },
  { id: "video", label: "视频", color: "#AF52DE" },
  { id: "attachments", label: "其他附件", color: "#007AFF" },
  { id: "database", label: "数据库", color: "#30B0C7" },
  { id: "logs", label: "辅助日志", color: "#8E8E93" },
  { id: "other", label: "其他文件与目录", color: "#AEAEB2" },
] as const;
export type StorageCategory = (typeof storageCategories)[number]["id"];
export type StorageView = "overview" | "all" | StorageCategory;
export type StorageGroup = (typeof storageCategories)[number] & {
  files: ManagedFile[];
  bytes: number;
  paths: number;
  unknown: number;
};
export function storageCategory(file: ManagedFile): StorageCategory {
  if (file.category === "database") return "database";
  if (file.category === "wal" || file.category === "shm") return "logs";
  if (!file.attachment) return "other";
  if (["image", "audio", "video"].includes(file.attachment.kind))
    return file.attachment.kind as "image" | "audio" | "video";
  return "attachments";
}

/** Backends append duplicate registrations after primary filesystem rows. Keep
 * those registrations visible while counting the first physical path once. */
export function storageUsage(snapshot: DataManagementSnapshot) {
  const groups: StorageGroup[] = storageCategories.map((category) => ({
    ...category,
    files: [],
    bytes: 0,
    paths: 0,
    unknown: 0,
  }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  const paths = new Map<string, StorageCategory>();
  let knownBytes = 0,
    unknownPaths = 0;
  for (const file of snapshot.files) {
    const first = !paths.has(file.relativePath);
    const category = paths.get(file.relativePath) ?? storageCategory(file);
    const group = byId.get(category)!;
    group.files.push(file);
    if (!first) continue;
    paths.set(file.relativePath, category);
    group.paths++;
    if (file.size === null) {
      group.unknown++;
      unknownPaths++;
    } else {
      group.bytes += file.size;
      knownBytes += file.size;
    }
  }
  return {
    groups,
    knownBytes,
    unknownPaths,
    paths: paths.size,
    duplicateRecords: snapshot.files.length - paths.size,
    consistent: knownBytes === snapshot.totals.totalBytes,
  };
}
export const legacyStorageViews: Record<string, StorageView> = {
  all: "all",
  image: "image",
  audio: "audio",
  video: "video",
  file: "attachments",
  unowned: "other",
};
export function isStorageView(value: string): value is StorageView {
  return (
    value === "overview" ||
    value === "all" ||
    storageCategories.some((category) => category.id === value)
  );
}
