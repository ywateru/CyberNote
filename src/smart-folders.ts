import { normalizeAppearanceSettings } from "./themes/appearance";
import { documentTags, validTagName } from "./note-tags";
import type {
  Folder,
  Note,
  Settings,
  SmartQuery,
  SmartRule,
  Workspace,
} from "./types";

export class SmartInvalid extends Error {
  code = "smart_invalid";
  constructor(message = "智能文件夹数据无效或版本不受支持") {
    super(message);
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SmartInvalid();
  return value as Record<string, unknown>;
}
function closed(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new SmartInvalid();
}
const bytes = (value: string) => new TextEncoder().encode(value).length;
export function parseSmartQuery(value: unknown): SmartQuery {
  const q = record(value);
  closed(q, ["version", "combine", "rules"]);
  if (
    q.version !== 1 ||
    typeof q.combine !== "string" ||
    (q.combine !== "all" && q.combine !== "any") ||
    !Array.isArray(q.rules) ||
    q.rules.length < 1 ||
    q.rules.length > 2
  )
    throw new SmartInvalid();
  const seen = new Set<string>();
  const rules: SmartRule[] = q.rules.map((raw) => {
    const r = record(raw);
    if (seen.has(String(r.type)))
      throw new SmartInvalid("同一种过滤条件只能使用一次");
    seen.add(String(r.type));
    if (r.type === "pinned") {
      closed(r, ["type", "value"]);
      if (typeof r.value !== "boolean") throw new SmartInvalid();
      return { type: "pinned", value: r.value };
    }
    if (r.type !== "tags") throw new SmartInvalid();
    if (r.mode === "anyTag" || r.mode === "noTags") {
      closed(r, ["type", "mode"]);
      return { type: "tags", mode: r.mode };
    }
    closed(r, ["type", "mode", "names"]);
    if (
      (r.mode !== "allSelected" && r.mode !== "anySelected") ||
      !Array.isArray(r.names) ||
      !r.names.length ||
      r.names.length > 128 ||
      !r.names.every(validTagName) ||
      new Set(r.names).size !== r.names.length
    )
      throw new SmartInvalid();
    return { type: "tags", mode: r.mode, names: [...r.names] };
  });
  const result: SmartQuery = {
    version: 1,
    combine: q.combine,
    rules,
  };
  if (bytes(JSON.stringify(result)) > 64 * 1024) throw new SmartInvalid();
  return result;
}
export function parseFolder(value: unknown): Folder {
  const f = record(value),
    common = ["id", "name", "parentId", "kind", "sortOrder", "createdAt"];
  closed(
    f,
    f.kind === "smart" ? [...common, "query", "definitionRevision"] : common,
  );
  if (
    typeof f.id !== "string" ||
    !f.id ||
    typeof f.name !== "string" ||
    !f.name.trim() ||
    bytes(f.name.trim()) > 4096 ||
    !Number.isSafeInteger(f.sortOrder) ||
    !Number.isSafeInteger(f.createdAt) ||
    (f.parentId !== undefined &&
      f.parentId !== null &&
      typeof f.parentId !== "string")
  )
    throw new SmartInvalid("文件夹实体无效");
  const fields = {
    id: f.id,
    name: f.name,
    sortOrder: f.sortOrder as number,
    createdAt: f.createdAt as number,
  };
  if (f.kind === "smart") {
    if (
      f.parentId !== null ||
      ["default", "quick", "trash", "all"].includes(f.id) ||
      !Number.isSafeInteger(f.definitionRevision) ||
      Number(f.definitionRevision) < 1
    )
      throw new SmartInvalid();
    return {
      ...fields,
      kind: "smart",
      parentId: null,
      query: parseSmartQuery(f.query),
      definitionRevision: f.definitionRevision as number,
    };
  }
  if (
    !["default", "quick", "trash", "normal"].includes(String(f.kind)) ||
    f.id === "all" ||
    (["default", "quick", "trash"].includes(f.id)
      ? f.kind !== f.id || f.parentId != null
      : f.kind !== "normal")
  )
    throw new SmartInvalid();
  return {
    ...fields,
    kind: f.kind as "default" | "quick" | "trash" | "normal",
    parentId: (f.parentId as string | null | undefined) ?? null,
  };
}
export function validateWorkspace(value: Workspace): Workspace {
  const folders = value.folders.map(parseFolder),
    ids = new Set(folders.map((f) => f.id));
  if (ids.size !== folders.length) throw new SmartInvalid("文件夹身份重复");
  return { ...value, folders, settings: normalizeAppearanceSettings(value.settings) };
}
export const isPhysicalOwner = (folder: Folder | undefined) =>
  !!folder && ["default", "quick", "normal"].includes(folder.kind);
export interface SmartFacts {
  pinned: boolean;
  tags: readonly string[] | null;
  eligible: boolean;
}
// Same three-valued truth table as Rust: unknown tags cannot satisfy ALL;
// a known true rule can still satisfy ANY. No plain-text tag guessing.
export function matchesSmart(query: SmartQuery, facts: SmartFacts): boolean {
  if (!facts.eligible) return false;
  const values = query.rules.map((rule) => {
    if (rule.type === "pinned") return facts.pinned === rule.value;
    if (facts.tags === null) return null;
    if ("names" in rule)
      return rule.mode === "allSelected"
        ? rule.names.every((name) => facts.tags!.includes(name))
        : rule.names.some((name) => facts.tags!.includes(name));
    return rule.mode === "anyTag"
      ? facts.tags.length > 0
      : facts.tags.length === 0;
  });
  return query.combine === "all"
    ? values.every((v) => v === true)
    : values.some((v) => v === true);
}
export function sortNotes(
  notes: readonly Note[],
  sort: Settings["sort"] = "updated",
) {
  return [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (sort === "title"
        ? a.title.localeCompare(b.title, "zh")
        : sort === "created"
          ? b.createdAt - a.createdAt
          : b.updatedAt - a.updatedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
export interface FolderProjection {
  ids: string[];
  count: number;
  firstId: string | null;
  definitionRevision?: number;
}
export function projectFolders(
  workspace: Workspace,
  suspended: readonly string[] = [],
  sort: Settings["sort"] = "updated",
): Map<string, FolderProjection> {
  const blocked = new Set([
    ...suspended,
    ...(workspace.access?.suspended || []),
  ]);
  const ordered = sortNotes(workspace.notes, sort);
  const facts = new Map(
    ordered.map((note) => [
      note.id,
      {
        eligible: note.deletedAt === null && !blocked.has(note.id),
        pinned: note.pinned,
        tags: note.locked ? null : documentTags(note.document),
      },
    ]),
  );
  const result = new Map<string, FolderProjection>();
  const add = (id: string, notes: readonly Note[], revision?: number) => {
    const ids = notes.map((n) => n.id);
    result.set(id, {
      ids,
      count: ids.length,
      firstId: ids[0] ?? null,
      ...(revision === undefined ? {} : { definitionRevision: revision }),
    });
  };
  add(
    "all",
    ordered.filter((n) => n.deletedAt === null),
  );
  for (const folder of workspace.folders)
    add(
      folder.id,
      ordered.filter((note) =>
        folder.kind === "smart"
          ? matchesSmart(folder.query, facts.get(note.id)!)
          : note.folderId === folder.id,
      ),
      folder.kind === "smart" ? folder.definitionRevision : undefined,
    );
  return result;
}
