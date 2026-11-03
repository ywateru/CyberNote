import type { JSONContent } from "@tiptap/react";
import type { ScanSession } from "../plugins/tauri-plugin-notes-scan/guest-js";
import { documentsEqual } from "./document-equality";

export type OcrSource =
  { kind: "image" } | { kind: "camera" } | { kind: "file"; file: File };
export type OcrState = {
  phase:
    | "choose"
    | "processing"
    | "recognized"
    | "empty"
    | "failed"
    | "confirming"
    | "saved"
    | "cleanup-pending"
    | "cancelling"
    | "cancelled";
  text: string;
  error: string;
};
export interface OcrNativePorts {
  begin(): Promise<ScanSession>;
  get(sessionId: string): Promise<ScanSession>;
  select(sessionId: string, source: OcrSource): Promise<ScanSession>;
  recognize(sessionId: string, token: string): Promise<ScanSession>;
  finish(sessionId: string): Promise<ScanSession>;
  acknowledge(sessionId: string): Promise<unknown>;
  cancel(sessionId: string): Promise<unknown>;
}
export const ocrError = (error: unknown): string => {
  if (typeof error === "object" && error && "message" in error)
    return String(error.message);
  return String(error);
};
const missingSession = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "session_missing";

/** One original target, one OCR result, one document transaction and ACK. Native
 * sessions remain temporary; successful body ACK alone permits acknowledge. */
export class OcrHost<Target extends { noteId: string }> {
  state: OcrState = { phase: "choose", text: "", error: "" };
  accepting = true;
  detached = false;
  sessionId?: string;
  insertedDocument?: JSONContent;
  documentAck = false;
  cleaned = false;
  private processing?: Promise<void>;
  private confirming?: Promise<void>;
  private cancelling?: Promise<void>;
  constructor(
    readonly operationId: string,
    readonly target: Target,
    private ports: {
      native: OcrNativePorts;
      validate(): Promise<void>;
      insert(text: string, inserted: (document: JSONContent) => void): void;
      awaitDocumentAck(operation: OcrHost<Target>): Promise<void>;
      update(state: OcrState): void;
    },
  ) {}
  private publish(
    phase: OcrState["phase"],
    error = "",
    text = this.state.text,
  ) {
    this.state = { phase, text, error };
    if (!this.detached) this.ports.update(this.state);
  }
  private admitted() {
    if (!this.accepting || this.detached)
      throw Error("原文字识别会话已关闭，不会插入其他备忘录");
  }
  private session(value: ScanSession) {
    if (
      !value ||
      value.version !== 1 ||
      value.mode !== "text" ||
      !value.sessionId ||
      !["draft", "ready"].includes(value.state) ||
      (this.sessionId && value.sessionId !== this.sessionId)
    )
      throw Error("文字识别会话身份或状态不匹配");
    this.sessionId = value.sessionId;
    return value;
  }
  process(source: OcrSource): Promise<void> {
    if (this.processing) return this.processing;
    if (!this.accepting || this.detached || this.state.phase !== "choose")
      return Promise.reject(Error("此文字识别操作不能重新选择，请取消后重试"));
    this.publish("processing", "", "");
    const work = (async () => {
      try {
        let session = this.session(
          this.sessionId
            ? await this.ports.native.get(this.sessionId)
            : await this.ports.native.begin(),
        );
        this.admitted();
        if (session.state !== "draft")
          throw Error("原识别会话已完成，请取消后重新选择");
        session = this.session(
          await this.ports.native.select(session.sessionId, source),
        );
        this.admitted();
        if (source.kind !== "camera") {
          if (session.state !== "draft") throw Error("所选图片识别状态不匹配");
          const file = session.files.find((file) =>
            file.mime.startsWith("image/"),
          );
          if (!file) throw Error("所选图片没有可识别的图像");
          session = this.session(
            await this.ports.native.recognize(session.sessionId, file.token),
          );
          this.admitted();
          session = this.session(
            await this.ports.native.finish(session.sessionId),
          );
          this.admitted();
        }
        if (session.state !== "ready" || !session.ocr)
          throw Error("设备尚未完成文字识别");
        const result = session.ocr;
        if (result.status === "failed")
          throw result.error || Error("设备文字识别失败");
        if (result.status === "empty") {
          if (result.text?.trim()) throw Error("空识别结果包含了不一致的文字");
          this.publish("empty", "", "");
        } else if (
          result.status === "recognized" &&
          typeof result.text === "string" &&
          result.text.trim()
        )
          this.publish("recognized", "", result.text);
        else throw Error("设备返回了无效的文字识别结果");
      } catch (error) {
        if (!this.accepting || this.detached) return;
        const cancelled =
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "cancelled";
        if (cancelled && source.kind === "camera" && this.sessionId) {
          // Camera cancellation may already remove its draft. Establish absence
          // through the same native session before allowing a fresh selection.
          try {
            this.session(await this.ports.native.get(this.sessionId));
          } catch (lookupError) {
            if (missingSession(lookupError)) this.sessionId = undefined;
            else {
              this.publish("failed", ocrError(lookupError));
              return;
            }
          }
          if (!this.accepting || this.detached) return;
        }
        this.publish(cancelled ? "choose" : "failed", ocrError(error));
      }
    })();
    this.processing = work;
    void work
      .finally(() => {
        if (this.processing === work) this.processing = undefined;
      })
      .catch(() => {});
    return work;
  }
  acknowledgeDocument(noteId: string, document: JSONContent) {
    if (
      noteId === this.target.noteId &&
      this.insertedDocument &&
      documentsEqual(this.insertedDocument, document)
    )
      this.documentAck = true;
  }
  confirm(): Promise<void> {
    if (this.confirming) return this.confirming;
    if (
      this.detached ||
      (!this.insertedDocument &&
        (!this.accepting ||
          this.state.phase !== "recognized" ||
          !this.state.text.trim()))
    )
      return Promise.reject(Error("没有可插入的实际识别文字"));
    const work = (async () => {
      this.publish(this.documentAck ? "saved" : "confirming");
      try {
        if (!this.insertedDocument) {
          await this.ports.validate();
          this.admitted();
          this.ports.insert(this.state.text, (document) => {
            this.insertedDocument = document;
          });
          if (!this.insertedDocument)
            throw Error("编辑器未接受识别文字，请重试");
        }
        if (!this.documentAck) await this.ports.awaitDocumentAck(this);
        if (!this.documentAck)
          throw Error("识别文字尚未确认保存，请保持窗口打开并重试保存");
        this.publish("saved");
        await this.cleanupSaved();
      } catch (error) {
        this.publish(
          this.documentAck ? "cleanup-pending" : "failed",
          ocrError(error),
        );
        throw error;
      }
    })();
    this.confirming = work;
    void work
      .finally(() => {
        if (this.confirming === work) this.confirming = undefined;
      })
      .catch(() => {});
    return work;
  }
  private async cleanupSaved() {
    if (this.cleaned) return;
    if (!this.documentAck || !this.sessionId)
      throw Error("正文尚未确认保存，不能清理原识别会话");
    try {
      await this.ports.native.acknowledge(this.sessionId);
    } catch (error) {
      if (!missingSession(error)) throw error;
    }
    this.cleaned = true;
    this.accepting = false;
    this.publish("saved", "", "");
  }
  seal() {
    this.accepting = false;
  }
  cancel(): Promise<void> {
    this.seal();
    if (this.cancelling) return this.cancelling;
    this.publish("cancelling");
    const work = (async () => {
      await this.processing?.catch(() => {});
      await this.confirming?.catch(() => {});
      if (this.documentAck) {
        await this.cleanupSaved();
        return;
      }
      if (this.insertedDocument)
        throw Error(
          "识别文字已在待保存正文中，请重试保存；不会删除正文或重复插入",
        );
      if (this.sessionId && !this.cleaned) {
        try {
          await this.ports.native.cancel(this.sessionId);
        } catch (error) {
          if (!missingSession(error)) throw error;
        }
      }
      this.cleaned = true;
      this.publish("cancelled", "", "");
    })().catch((error) => {
      this.publish(
        this.documentAck ? "cleanup-pending" : "failed",
        ocrError(error),
      );
      throw error;
    });
    this.cancelling = work;
    void work
      .finally(() => {
        if (this.cancelling === work) this.cancelling = undefined;
      })
      .catch(() => {});
    return work;
  }
  async close() {
    this.seal();
    await this.processing?.catch(() => {});
    await this.confirming?.catch(() => {});
    if (this.insertedDocument && !this.documentAck) await this.confirm();
    await this.cancel();
  }
}

export function ocrParagraphs(text: string): JSONContent[] {
  if (!text.trim()) throw Error("没有可插入的识别文字");
  return text.split(/\r\n|\r|\n/).map((line) => ({
    type: "paragraph",
    ...(line ? { content: [{ type: "text", text: line }] } : {}),
  }));
}
