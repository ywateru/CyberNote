export function validTagName(name) {
    return (typeof name === "string" &&
        /^[A-Za-z0-9_\-\u3400-\u4dbf\u4e00-\u9fff]{1,64}$/.test(name) &&
        /[A-Za-z\u3400-\u4dbf\u4e00-\u9fff]/.test(name));
}
// Spans end at every unmarked/non-text child, different name, or parent.
// Formatting may split one tag over several adjacent text children.
export function visitTagSpans(doc, visit) {
    const walk = (parent) => {
        let name, text = "", legal = true, nodes = [];
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
            if (child.type !== "text" || !mark || next !== name)
                finish();
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
            }
            else {
                if (mark)
                    visit([child], next, false);
                walk(child);
            }
        }
        finish();
    };
    walk(doc);
}
export function documentTags(doc) {
    const names = new Set();
    visitTagSpans(doc, (_nodes, name, legal) => {
        if (legal && typeof name === "string")
            names.add(name);
    });
    return [...names].sort();
}
export function projectTags(workspace, suspended = []) {
    const notes = new Map();
    const counts = new Map();
    const blocked = new Set([
        ...suspended,
        ...(workspace.access?.suspended || []),
    ]);
    for (const note of workspace.notes) {
        if (note.deletedAt || blocked.has(note.id) || note.locked)
            continue;
        const names = documentTags(note.document);
        notes.set(note.id, names);
        for (const name of names)
            counts.set(name, (counts.get(name) || 0) + 1);
    }
    return {
        notes,
        catalog: [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    };
}
export function tagSelectionAfterAccess(name, workspace, suspended) {
    return name !== null &&
        projectTags(workspace, suspended).catalog.some(([candidate]) => candidate === name)
        ? name
        : null;
}
