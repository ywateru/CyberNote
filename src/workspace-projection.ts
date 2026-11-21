import { documentTags } from "./note-tags";
import {
  matchesSmart,
  sortNotes,
  type FolderProjection,
  type SmartFacts,
} from "./smart-folders";
import type { Note, Settings, Workspace } from "./types";

export interface WorkspaceTagProjection {
  notes: Map<string, readonly string[]>;
  catalog: [string, number][];
}

export interface WorkspaceProjection {
  ordered: Note[];
  tags: WorkspaceTagProjection;
  folders: Map<string, FolderProjection>;
}

/** Build the list, tag catalog and folder views from one sorted note pass.
 * Document-derived facts are still reused by the document caches; this avoids
 * sorting and walking the same library once per derived view on every edit. */
export function projectWorkspace(
  workspace: Workspace,
  suspended: readonly string[] = [],
  sort: Settings["sort"] = "updated",
): WorkspaceProjection {
  const blocked = new Set([
    ...suspended,
    ...(workspace.access?.suspended || []),
  ]);
  const ordered = sortNotes(workspace.notes, sort);
  const facts = new Map<string, SmartFacts>();
  const tagNotes = new Map<string, readonly string[]>();
  const counts = new Map<string, number>();

  for (const note of ordered) {
    const tags = note.locked ? null : documentTags(note.document);
    const eligible = note.deletedAt === null && !blocked.has(note.id);
    facts.set(note.id, {
      eligible,
      pinned: note.pinned,
      tags,
    });
    // Tag projection historically used a truthy deletedAt check while folder
    // eligibility required null. Preserve both contracts in one pass.
    if (note.deletedAt || blocked.has(note.id) || note.locked || !tags)
      continue;
    tagNotes.set(note.id, tags);
    for (const name of tags)
      counts.set(name, (counts.get(name) || 0) + 1);
  }

  const folders = new Map<string, FolderProjection>();
  const add = (id: string, notes: readonly Note[], revision?: number) => {
    const ids = notes.map((note) => note.id);
    folders.set(id, {
      ids,
      count: ids.length,
      firstId: ids[0] ?? null,
      ...(revision === undefined ? {} : { definitionRevision: revision }),
    });
  };
  add(
    "all",
    ordered.filter((note) => note.deletedAt === null),
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

  return {
    ordered,
    tags: {
      notes: tagNotes,
      catalog: [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    },
    folders,
  };
}
