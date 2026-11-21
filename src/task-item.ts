import TaskItem, { type TaskItemOptions } from "@tiptap/extension-task-item";
import { getRenderedAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const visuallyHidden =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

function checkboxLabel(
  node: ProseMirrorNode,
  checked: boolean,
  a11y: TaskItemOptions["a11y"],
) {
  return (
    a11y?.checkboxLabel?.(node, checked) ||
    `Task item checkbox for ${node.textContent || "empty task item"}`
  );
}

/**
 * The stock NodeView lets the native checkbox publish its own state before the
 * editor transaction succeeds. During IME input or a stale position that can
 * leave the visible checkmark disagreeing with the document. This view keeps
 * the DOM checkbox derived from the current ProseMirror node and validates the
 * node at the live position before every change.
 */
export const StableTaskItem = TaskItem.extend({
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const listItem = document.createElement("li");
      const checkboxWrapper = document.createElement("label");
      const checkboxStyler = document.createElement("span");
      const checkbox = document.createElement("input");
      const content = document.createElement("div");

      checkboxStyler.style.cssText = visuallyHidden;
      checkboxWrapper.contentEditable = "false";
      checkbox.type = "checkbox";

      const sync = (currentNode: ProseMirrorNode) => {
        const checked = currentNode.attrs.checked === true;
        const label = checkboxLabel(
          currentNode,
          checked,
          this.options.a11y,
        );
        listItem.dataset.checked = String(checked);
        checkbox.checked = checked;
        checkbox.setAttribute("aria-label", label);
        checkboxStyler.textContent = label;
      };

      listItem.setAttribute("data-type", this.name);
      sync(node);

      checkbox.addEventListener("mousedown", (event) =>
        event.preventDefault(),
      );
      checkbox.addEventListener("change", () => {
        const position = typeof getPos === "function" ? getPos() : undefined;
        if (typeof position !== "number" || editor.isDestroyed) {
          sync(node);
          return;
        }
        const current = editor.state.doc.nodeAt(position);
        if (!current || current.type.name !== this.name) {
          sync(node);
          return;
        }

        const checked = checkbox.checked;
        // Do not let the browser's optimistic toggle outlive a rejected or
        // remapped transaction. The NodeView update publishes the real value.
        sync(current);

        if (!editor.isEditable && !this.options.onReadOnlyChecked) return;
        if (!editor.isEditable) {
          const onReadOnlyChecked = this.options.onReadOnlyChecked;
          if (!onReadOnlyChecked?.(current, checked)) sync(current);
          return;
        }
        if (current.attrs.checked === checked) return;

        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(position, undefined, {
            ...current.attrs,
            checked,
          }),
        );
        if (!editor.view.composing) editor.view.focus();
      });

      Object.entries(this.options.HTMLAttributes).forEach(([key, value]) => {
        listItem.setAttribute(key, String(value));
      });
      checkboxWrapper.append(checkbox, checkboxStyler);
      listItem.append(checkboxWrapper, content);
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        listItem.setAttribute(key, String(value));
      });

      let previousKeys = new Set(Object.keys(HTMLAttributes));
      return {
        dom: listItem,
        contentDOM: content,
        update: (updatedNode) => {
          if (updatedNode.type !== this.type) return false;

          sync(updatedNode);
          const next = getRenderedAttributes(
            updatedNode,
            editor.extensionManager.attributes,
          );
          const nextKeys = new Set(Object.keys(next));

          previousKeys.forEach((key) => {
            if (nextKeys.has(key) || key === "data-type") return;
            if (key in this.options.HTMLAttributes)
              listItem.setAttribute(
                key,
                String(this.options.HTMLAttributes[key]),
              );
            else listItem.removeAttribute(key);
          });
          Object.entries(next).forEach(([key, value]) => {
            if (value === null || value === undefined) {
              if (key in this.options.HTMLAttributes)
                listItem.setAttribute(
                  key,
                  String(this.options.HTMLAttributes[key]),
                );
              else listItem.removeAttribute(key);
            } else listItem.setAttribute(key, String(value));
          });
          previousKeys = nextKeys;
          return true;
        },
      };
    };
  },
});
