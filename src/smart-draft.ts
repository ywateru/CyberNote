import { validTagName } from "./note-tags";
import { parseSmartQuery, SmartInvalid } from "./smart-folders";
import type { Folder, SmartQuery, TagMode } from "./types";

interface DraftCache {
  key: number;
  mode: TagMode;
  names: string[];
  pinned: boolean;
}
export type DraftRule = DraftCache &
  (
    | { type: "tags" }
    | { type: "pinned" }
    | { type: "creationDate"; period: "today" }
  );
export interface FolderDraft {
  id?: string;
  expectedDefinitionRevision?: number;
  name: string;
  smart: boolean;
  combine: "all" | "any";
  rules: DraftRule[];
}
export function newTagRule(key = 0): DraftRule {
  return { key, type: "tags", mode: "allSelected", names: [], pinned: true };
}
export function folderDraft(folder?: Folder): FolderDraft {
  return {
    ...(folder?.kind === "smart"
      ? { id: folder.id, expectedDefinitionRevision: folder.definitionRevision }
      : {}),
    name: folder?.name ?? "新建文件夹",
    smart: folder?.kind === "smart",
    combine: folder?.kind === "smart" ? folder.query.combine : "all",
    rules:
      folder?.kind === "smart"
        ? folder.query.rules.map((r, key) => ({
            ...newTagRule(key),
            ...r,
            ...(r.type === "tags" && "names" in r
              ? { names: [...r.names] }
              : {}),
          }))
        : [newTagRule()],
  };
}
export function draftQuery(draft: FolderDraft): SmartQuery {
  if (draft.rules.some((r) => r.type === "creationDate"))
    throw new SmartInvalid(
      "“创建日期”过滤条件尚未接入本地规则，请改为已支持的过滤条件。草稿仍保留。",
    );
  if (
    draft.rules.some(
      (r) =>
        r.type === "tags" &&
        (r.mode === "allSelected" || r.mode === "anySelected") &&
        !r.names.length,
    )
  )
    throw new SmartInvalid("必须为“标签”过滤条件选择至少一个标签。");
  if (draft.rules.some((r) => r.names.some((n) => !validTagName(n))))
    throw new SmartInvalid("标签名称无效");
  return parseSmartQuery({
    version: 1,
    combine: draft.combine,
    rules: draft.rules.map((r) =>
      r.type === "pinned"
        ? { type: "pinned", value: r.pinned }
        : {
            type: "tags",
            mode: r.mode,
            ...(r.mode === "allSelected" || r.mode === "anySelected"
              ? { names: r.names }
              : {}),
          },
    ),
  });
}
export function nextDraftRuleType(
  draft: FolderDraft,
): DraftRule["type"] | undefined {
  const used = new Set(draft.rules.map((r) => r.type));
  return (["tags", "creationDate", "pinned"] as const).find(
    (type) => !used.has(type),
  );
}
export function addDraftRule(draft: FolderDraft, after: number): FolderDraft {
  const type = nextDraftRuleType(draft);
  if (!type) return draft;
  const base = newTagRule(Math.max(-1, ...draft.rules.map((r) => r.key)) + 1);
  const next: DraftRule =
    type === "creationDate"
      ? { ...base, type, period: "today" }
      : { ...base, type };
  const rules = [...draft.rules];
  rules.splice(rules.findIndex((r) => r.key === after) + 1, 0, next);
  return { ...draft, rules };
}
