import type { JSONContent } from "@tiptap/core";
import type { Workspace } from "./types";

// Documents are treated as immutable snapshots: App replaces the object when
// content changes. Keeping the per-document result avoids rescanning every
// unchanged note on each keystroke, tag filter or smart-folder projection.
const tagsByDocument = new WeakMap<JSONContent, string[]>();

export function validTagName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    /^[A-Za-z0-9_\-\u3400-\u4dbf\u4e00-\u9fff]{1,64}$/.test(name) &&
    /[A-Za-z\u3400-\u4dbf\u4e00-\u9fff]/.test(name)
  );
}

// Spans end at every unmarked/non-text child, different name, or parent.
// Formatting may split one tag over several adjacent text children.
export function visitTagSpans(
  doc: JSONContent,
  visit: (nodes: readonly JSONContent[], name: unknown, legal: boolean) => void,
) {
  const walk = (parent: JSONContent) => {
    let name: unknown,
      text = "",
      legal = true,
      nodes: JSONContent[] = [];
    const finish = () => {
      if (nodes.length)
        visit(nodes, name, legal && validTagName(name) && text === `#${name}`);
      name = undefined;
      text = "";
      legal = true;
      nodes = [];
    };
    for (const child of parent.content || []) {
      const tags = child.marks?.filter((m) => m.type === "noteTag") || [];
      const mark = tags[0];
      const next = mark?.attrs?.name;
      if (child.type !== "text" || !mark || next !== name) finish();
      if (child.type === "text" && mark) {
        nodes.push(child);
        name = next;
        text += child.text || "";
        legal =
          legal &&
          tags.length === 1 &&
          Object.keys(mark.attrs || {}).length === 1 &&
          !child.marks?.some((m) => m.type === "link" || m.type === "code") &&
          parent.type !== "codeBlock";
      } else {
        if (mark) visit([child], next, false);
        walk(child);
      }
    }
    finish();
  };
  walk(doc);
}

export function documentTags(doc: JSONContent): string[] {
  const cached = tagsByDocument.get(doc);
  if (cached) return cached;
  const names = new Set<string>();
  visitTagSpans(doc, (_nodes, name, legal) => {
    if (legal && typeof name === "string") names.add(name);
  });
  const result = [...names].sort();
  tagsByDocument.set(doc, result);
  return result;
}

export function projectTags(
  workspace: Workspace,
  suspended: readonly string[] = [],
) {
  const notes = new Map<string, readonly string[]>();
  const counts = new Map<string, number>();
  const blocked = new Set([
    ...suspended,
    ...(workspace.access?.suspended || []),
  ]);
  for (const note of workspace.notes) {
    if (note.deletedAt || blocked.has(note.id) || note.locked) continue;
    const names = documentTags(note.document);
    notes.set(note.id, names);
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return {
    notes,
    catalog: [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}

export function tagSelectionAfterAccess(
  name: string | null,
  workspace: Workspace,
  suspended: readonly string[],
): string | null {
  return name !== null &&
    projectTags(workspace, suspended).catalog.some(
      ([candidate]) => candidate === name,
    )
    ? name
    : null;
}
