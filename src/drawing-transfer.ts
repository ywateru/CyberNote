import type { DrawingStroke } from "./types";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { accessGate, native } from "./bridge";

export function validStrokes(value: unknown): value is DrawingStroke[] {
  let points = 0;
  return (
    Array.isArray(value) &&
    value.length <= 10000 &&
    value.every(
      (s) =>
        s &&
        ["pen", "marker", "eraser"].includes(s.tool) &&
        /^#[0-9a-f]{6}$/i.test(s.color) &&
        Number.isFinite(s.width) &&
        s.width > 0 &&
        s.width <= 100 &&
        Array.isArray(s.points) &&
        (points += s.points.length) <= 200000 &&
        s.points.every(
          (p: unknown) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every(
              (n) =>
                typeof n === "number" &&
                Number.isFinite(n) &&
                Math.abs(n) <= 1000000,
            ),
        ),
    )
  );
}
export function drawingBounds(strokes: DrawingStroke[]) {
  let x = 0,
    y = 0,
    right = 600,
    bottom = 300;
  for (const s of strokes)
    for (const [px, py] of s.points) {
      const pad = s.width / 2 + 8;
      x = Math.min(x, px - pad);
      y = Math.min(y, py - pad);
      right = Math.max(right, px + pad);
      bottom = Math.max(bottom, py + pad);
    }
  return { x, y, width: right - x, height: bottom - y };
}
export function drawingSVG(strokes: DrawingStroke[]) {
  if (!validStrokes(strokes)) throw Error("速绘数据无效或过大");
  const bounds = drawingBounds(strokes);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${bounds.width * 2}" height="${bounds.height * 2}"><metadata id="cybernote-drawing">${btoa(JSON.stringify(strokes))}</metadata>${strokes.map((s) => `<polyline points="${s.points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${s.tool === "eraser" ? "#ffffff" : s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.tool === "marker" ? 0.35 : 1}"/>`).join("")}</svg>`;
}
// Keep the vector fallback scoped to the source authority; revoked drawings cannot be pasted.
let clipboard: { svg: string; allowed: () => boolean } | null = null;
export async function copyDrawing(
  strokes: DrawingStroke[],
  allowed: () => boolean,
) {
  if (!allowed()) throw Error("速绘已不可用");
  const svg = drawingSVG(strokes);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(svg);
    } catch {
      /* WebViews may expose no system clipboard grant. */
    }
  }
  if (allowed()) clipboard = { svg, allowed };
}
export async function pasteDrawing(): Promise<DrawingStroke[]> {
  let svg = "";
  if (navigator.clipboard?.readText) {
    try {
      svg = await navigator.clipboard.readText();
    } catch {
      /* Use app clipboard on mobile WebViews. */
    }
  }
  if (!svg) svg = clipboard?.allowed() ? clipboard.svg : "";
  if (clipboard?.svg === svg && !clipboard.allowed()) {
    clipboard = null;
    throw Error("源速绘已不可用，请重新复制");
  }
  if (svg.length > 16 * 1024 * 1024) throw Error("剪贴板速绘过大");
  const data =
    /<metadata id="cybernote-drawing">([A-Za-z0-9+/=]+)<\/metadata>/.exec(
      svg,
    )?.[1];
  if (!data) throw Error("请先复制一幅速绘");
  const strokes: unknown = JSON.parse(atob(data));
  if (!validStrokes(strokes)) throw Error("剪贴板中的速绘数据无效");
  return strokes;
}
export async function exportDrawing(
  strokes: DrawingStroke[],
  noteId: string,
  allowed: () => boolean,
) {
  if (!allowed()) throw Error("速绘已不可用");
  const svg = drawingSVG(strokes);
  if (!native) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "速绘.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const expected = accessGate.expected(noteId);
  const path = await save({
    defaultPath: "速绘.svg",
    filters: [{ name: "SVG 矢量图", extensions: ["svg"] }],
  });
  if (!path || !allowed()) return;
  await invoke("export_drawing", { noteId, svg, path, expected });
}
