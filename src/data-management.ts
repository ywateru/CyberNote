export type ManagedFile = {
  relativePath: string;
  category: "database" | "wal" | "shm" | "attachment" | "import" | "other";
  size: number | null;
  modifiedAt: number | null;
  exists: boolean;
  status: "file" | "directory" | "missing" | "unreadable" | "symlink" | "other";
  attachment?: {
    id: string;
    noteId: string;
    kind: string;
    mime: string;
    displayName: string | null;
    declaredSize: number;
    referenced: boolean | null;
    exportable: boolean;
  };
};
export type DataManagementSnapshot = {
  version: 1;
  // Separate rebuildable cache. Existing totals still describe Store files only.
  mediaCache?: { version: 1; bytes: number; files: number; quota: number };
  capturedAt: number;
  rootPath: string;
  files: ManagedFile[];
  totals: {
    databaseBytes: number;
    auxiliaryBytes: number;
    attachmentBytes: number;
    otherBytes: number;
    totalBytes: number;
    declaredAttachmentBytes: number;
  };
  counts: {
    notes: number;
    folders: number;
    attachments: number;
    physicalFiles: number;
    missingAttachments: number;
  };
  warnings: string[];
};
export type ArchiveResult =
  { status: "success" | "cancelled" } | { status: "error"; message: string };
export const formatFileSize = (value: number | null) => {
  if (value === null) return "未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  const units = ["MB", "GB", "TB", "PB"];
  let exponent = 2;
  while (exponent < 5 && value >= 1024 ** (exponent + 1)) exponent++;
  return `${(value / 1024 ** exponent).toFixed(2)} ${units[exponent - 2]}`;
};
export const formatFileTime = (value: number | null) =>
  value === null
    ? "未知"
    : new Date(value).toLocaleString("zh-CN", { hour12: false });

export function validateDataManagement(
  value: DataManagementSnapshot,
): DataManagementSnapshot {
  const integer = (v: unknown): v is number =>
    Number.isSafeInteger(v) && (v as number) >= 0;
  const optionalInteger = (v: unknown) => v === null || integer(v);
  if (
    !value ||
    value.version !== 1 ||
    !integer(value.capturedAt) ||
    typeof value.rootPath !== "string" ||
    !value.rootPath ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.warnings) ||
    value.warnings.some((x) => typeof x !== "string") ||
    !value.totals ||
    !value.counts
  )
    throw Error("数据管理快照格式无效");
  if (value.mediaCache !== undefined && (!value.mediaCache || value.mediaCache.version !== 1 ||
      !integer(value.mediaCache.bytes) || !integer(value.mediaCache.files) || !integer(value.mediaCache.quota)))
    throw Error("缩略图缓存统计无效");
  for (const key of [
    "databaseBytes",
    "auxiliaryBytes",
    "attachmentBytes",
    "otherBytes",
    "totalBytes",
    "declaredAttachmentBytes",
  ] as const)
    if (!integer(value.totals[key])) throw Error("数据管理大小统计无效");
  for (const key of [
    "notes",
    "folders",
    "attachments",
    "physicalFiles",
    "missingAttachments",
  ] as const)
    if (!integer(value.counts[key])) throw Error("数据管理文件统计无效");
  for (const file of value.files) {
    if (
      !file ||
      typeof file.relativePath !== "string" ||
      !file.relativePath ||
      !["database", "wal", "shm", "attachment", "import", "other"].includes(
        file.category,
      ) ||
      ![
        "file",
        "directory",
        "missing",
        "unreadable",
        "symlink",
        "other",
      ].includes(file.status) ||
      typeof file.exists !== "boolean" ||
      !optionalInteger(file.size) ||
      !optionalInteger(file.modifiedAt)
    )
      throw Error("数据管理文件信息无效");
    const a = file.attachment;
    if (
      a &&
      (typeof a.id !== "string" ||
        !a.id ||
        typeof a.noteId !== "string" ||
        !a.noteId ||
        typeof a.kind !== "string" ||
        typeof a.mime !== "string" ||
        !(a.displayName === null || typeof a.displayName === "string") ||
        !integer(a.declaredSize) ||
        !(a.referenced === null || typeof a.referenced === "boolean") ||
        typeof a.exportable !== "boolean")
    )
      throw Error("数据管理附件信息无效");
  }
  return value;
}

export const fileOperationError = (cause: unknown): string => {
  if (
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
  )
    return cause.message;
  return String(cause);
};
