import type { JSONContent } from "@tiptap/react";

// Compare the acyclic JSON records accepted by the document schema. Object key
// order is transport detail; array order, every own key and every value matter.
// Do not normalize through the schema here: defaults could hide missing fields.
export function documentsEqual(left: JSONContent, right: JSONContent): boolean {
  return valuesEqual(left, right);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length)
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        valuesEqual(a[key], b[key]),
    )
  );
}
