import { readFile } from 'node:fs/promises';

export function compareSnapshots(before, after, { tolerance = 0.5 } = {}) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 10) throw Error('Rect tolerance must be between 0 and 10');
  const changes = [];
  for (const key of ['html', 'normalizedHTML', 'text', 'editorJSON']) {
    if (key in before && key in after && JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push({ field: key });
  }
  const visit = (a, b, path) => {
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > tolerance) changes.push({ field: path, before: a, after: b, delta: b - a }); }
    else if (a && b && typeof a === 'object' && typeof b === 'object') for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) visit(a[key], b[key], path + '.' + key);
    else if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: path, before: a, after: b });
  };
  for (const key of ['rect', 'rects', 'computed', 'nodes']) if (key in before || key in after) visit(before[key], after[key], key);
  return { equal: changes.length === 0, tolerance, changes: changes.slice(0, 40), truncated: changes.length > 40, normalization: 'Snapshots retain text/order/styles; only API-specified volatile IDs/timestamps are normalized. No geometry or text is erased here.' };
}

export async function compareScreenshots(page, first, second, { threshold = 0 } = {}) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw Error('Screenshot threshold must be an integer 0..255');
  const a = await readFile(first), b = await readFile(second);
  return page.evaluate(async ({ a, b, threshold }) => {
    const decode = async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; image.close(); return { width: canvas.width, height: canvas.height, pixels };
    };
    const first = await decode(a), second = await decode(b);
    if (first.width !== second.width || first.height !== second.height) return { equal: false, dimensionMismatch: true, first: { width: first.width, height: first.height }, second: { width: second.width, height: second.height } };
    let differentPixels = 0, maximumChannelDelta = 0;
    for (let i = 0; i < first.pixels.length; i += 4) { let changed = false; for (let c = 0; c < 4; c++) { const delta = Math.abs(first.pixels[i + c] - second.pixels[i + c]); maximumChannelDelta = Math.max(maximumChannelDelta, delta); if (delta > threshold) changed = true; } if (changed) differentPixels++; }
    return { equal: differentPixels === 0, width: first.width, height: first.height, threshold, differentPixels, differenceRatio: differentPixels / (first.width * first.height), maximumChannelDelta };
  }, { a: [...a], b: [...b], threshold });
}
