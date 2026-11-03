import * as scan from "../plugins/tauri-plugin-notes-scan/guest-js";
import type { OcrNativePorts } from "./ocr-host";

export const MAX_OCR_IMAGE_BYTES = 20 * 1024 * 1024;
/** Only a File returned by the user image picker enters the bounded Mac bridge.
 * No renderer-supplied path, image preview or permanent attachment is published. */
export function selectedOcrImage(file: File): Promise<string> {
  if (!file.size || file.size > MAX_OCR_IMAGE_BYTES)
    return Promise.reject(Error("请选择不超过20 MiB的非空图片"));
  if (!file.type.startsWith("image/"))
    return Promise.reject(Error("请选择图片文件"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || Error("无法读取所选图片"));
    reader.onabort = () => reject(Error("所选图片读取已取消"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(Error("所选图片编码无效"));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0 || !reader.result.slice(0, comma).endsWith(";base64")) {
        reject(Error("所选图片编码无效"));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
export const ocrNative: OcrNativePorts = {
  begin: () => scan.begin("text"),
  get: scan.get,
  select: async (sessionId, source) =>
    source.kind === "camera"
      ? scan.openCamera(sessionId)
      : source.kind === "image"
        ? scan.pickImage(sessionId)
        : scan.ingestImage(sessionId, await selectedOcrImage(source.file)),
  recognize: scan.recognize,
  finish: scan.finish,
  acknowledge: scan.acknowledge,
  cancel: scan.cancel,
};
