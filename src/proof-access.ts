// Fixed, opt-in timing adapter. Vite removes this entire module from production.
// It can hold only real save execution and real workspace/text response delivery;
// it cannot write React state, editor content, command arguments, or result data.
import type {
  invoke as Invoke,
  InvokeArgs,
  InvokeOptions,
} from "@tauri-apps/api/core";
import type { AccessEvent } from "./types";
type InvokeFn = typeof Invoke;
type Hold = { id: string; release: () => void };
let raw: InvokeFn;
let saveArmed = false,
  readArmed = false,
  dropCommit = false;
const saves: Hold[] = [],
  reads: Hold[] = [];
const requestIds = new WeakMap<object, string>();
let label: HTMLElement | undefined;
function record(stage: string, data: Record<string, unknown> = {}) {
  if (label)
    label.textContent = `${stage} · save ${saves.length} / read ${reads.length}`;
  return raw("proof_access_record", { event: { stage, ...data } }).catch(
    console.error,
  );
}
function release(items: Hold[], stage: string) {
  for (const item of items.splice(0))
    void record(stage, { requestId: item.id }).then(item.release);
}
function hold(items: Hold[], id: string, stage: string) {
  return new Promise<void>((resolve) => {
    items.push({ id, release: resolve });
    void record(stage, { requestId: id });
  });
}
export function proofVerdict(
  value: unknown,
  accepted: boolean,
  mode: string,
  error?: unknown,
) {
  void record(accepted ? "gate-accepted" : "gate-rejected", {
    requestId:
      value !== null && typeof value === "object"
        ? requestIds.get(value)
        : undefined,
    action: mode,
    code: (error as { code?: string } | undefined)?.code,
    success: accepted,
  });
}
export function proofReceive(event: AccessEvent) {
  void record(`event-${event.phase}`, {
    operationId: event.operationId,
    epoch: event.access.epoch,
    participantWindows: (
      event as AccessEvent & { participantWindows?: string[] }
    ).participantWindows,
  });
  // Release is driven by observed protocol stages, never an assumed sleep.
  if (event.phase === "prepare")
    void record("prepare-release-ready", {
      operationId: event.operationId,
    }).then(() => release(saves, "save-release-after-prepare"));
  if (event.phase === "commit") {
    queueMicrotask(() => release(reads, "read-release-after-commit"));
    if (dropCommit) {
      dropCommit = false;
      void record("commit-delivery-dropped", {
        operationId: event.operationId,
        covered: !!document.querySelector(".access-cover"),
        editorCount: document.querySelectorAll(".tiptap").length,
      });
      return false;
    }
  }
  return true;
}
export function createProofInvoker(invoke: InvokeFn): InvokeFn {
  raw = invoke;
  const install = () => {
    const panel = document.createElement("aside");
    panel.id = "access-boundary-proof";
    panel.style.cssText =
      "position:fixed;z-index:2147483647;bottom:8px;left:8px;background:#fff5c4;border:2px solid #664c00;padding:5px;max-width:600px;font:12px sans-serif;color:#111";
    label = document.createElement("div");
    label.textContent = "FIX03 proof adapter · real requests";
    panel.append(label);
    const button = (text: string, action: () => void) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.style.margin = "3px";
      b.onclick = action;
      panel.append(b);
    };
    button("暂停下次保存至prepare", () => {
      saveArmed = true;
      void record("save-armed");
    });
    button("暂停下次读取响应至commit", () => {
      readArmed = true;
      void record("read-armed");
    });
    button("释放保存", () => release(saves, "save-release-manual"));
    button("释放读取", () => release(reads, "read-release-manual"));
    button("丢弃下次commit通知", () => {
      dropCommit = true;
      void record("commit-drop-armed");
    });
    button("记录DOM", () => {
      const editors = [...document.querySelectorAll(".tiptap")];
      void record("dom", {
        editorCount: editors.length,
        hasPrivate: editors.some((e) => e.textContent?.includes("PRIVATE")),
        covered: !!document.querySelector(".access-cover"),
        url: location.pathname + location.search,
      });
    });
    document.body.append(panel);
    void record("adapter-ready", { url: location.pathname + location.search });
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  return (async (
    command: string,
    args: InvokeArgs = {},
    options?: InvokeOptions,
  ) => {
    if (
      ![
        "workspace_action",
        "load_workspace",
        "read_note_text",
        "register_save_intent",
        "acknowledge_access",
      ].includes(command)
    )
      return raw(command, args, options);
    const payload = args as Record<string, unknown>;
    const action = payload.action as Record<string, unknown> | undefined;
    const id = crypto.randomUUID();
    const metadata = {
      requestId: id,
      command,
      action: action?.type,
      noteId: action?.id || payload.noteId || payload.id,
      operationId: payload.operationId,
    };
    await record("request-arrived", metadata);
    if (
      command === "workspace_action" &&
      action?.type === "saveNote" &&
      saveArmed
    ) {
      saveArmed = false;
      await hold(saves, id, "save-held-before-execution");
    }
    await record("execution-start", metadata);
    try {
      const result = await raw(command, args, options);
      if (result !== null && typeof result === "object")
        requestIds.set(result, id);
      const value = result as {
        revision?: number;
        access?: { epoch: number; operationId: string | null };
      };
      await record("execution-complete", {
        ...metadata,
        revision: value?.revision,
        epoch: value?.access?.epoch,
        success: true,
      });
      if (["load_workspace", "read_note_text"].includes(command) && readArmed) {
        readArmed = false;
        await hold(reads, id, "read-held-after-real-result");
      }
      await record("delivery", metadata);
      return result;
    } catch (e) {
      await record("command-error", {
        ...metadata,
        code: (e as { code?: string }).code,
        success: false,
      });
      throw e;
    }
  }) as InvokeFn;
}
