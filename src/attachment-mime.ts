/** Inspect generic/absent provider MIME values without changing the original bytes. */
export function attachmentMime(declared: string, base64: string): string {
  const mime = declared.split(";")[0].trim().toLowerCase();
  if (
    mime &&
    ![
      "application/octet-stream",
      "binary/octet-stream",
      "text/plain",
      "application/xml",
      "text/xml",
    ].includes(mime)
  )
    return mime;
  const head = atob(base64.slice(0, 16384));
  if (head.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (head.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (/^GIF8[79]a/.test(head)) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
    return "image/webp";
  if (head.startsWith("BM")) return "image/bmp";
  if (head.startsWith("II*\0") || head.startsWith("MM\0*")) return "image/tiff";
  if (head.startsWith("\0\0\x01\0")) return "image/x-icon";
  if (head.slice(4, 8) === "ftyp") {
    const brands = head.slice(8, 40);
    if (/avif|avis/.test(brands)) return "image/avif";
    if (/heic|heix|hevc|hevx/.test(brands)) return "image/heic";
    if (/mif1|msf1/.test(brands)) return "image/heif";
  }
  const xml = head
    .replace(/^\xef\xbb\xbf/, "")
    .replace(
      /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?/i,
      "",
    );
  if (/^\s*<svg(?:\s|>)/i.test(xml)) return "image/svg+xml";
  if (head.startsWith("%PDF-")) return "application/pdf";
  return mime || "application/octet-stream";
}
