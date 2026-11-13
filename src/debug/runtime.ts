import { catalog, type Command } from "./catalog";
import type {
  DebugAdapter,
  DebugArgs,
  DebugErrorCode,
  DebugSnapshotOptions,
  DebugAPI,
} from "./protocol";
function fail(code: DebugErrorCode, message: string): never {
  throw Object.assign(new Error(message), { code });
}
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
function validate(command: Command, value: unknown): DebugArgs {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return fail("INVALID_ARGUMENT", "Arguments must be serializable JSON");
  }
  if (!plain(value) || !serialized || serialized.length > 2_000_000)
    fail("INVALID_ARGUMENT", "Arguments must be a bounded plain object");
  for (const key of Object.keys(value))
    if (!Object.prototype.hasOwnProperty.call(command.args, key))
      fail("INVALID_ARGUMENT", `Unknown argument: ${key}`);
  for (const [key, field] of Object.entries(command.args)) {
    const v = value[key];
    if (v === undefined) {
      if (field.required) fail("INVALID_ARGUMENT", `Missing ${key}`);
      continue;
    }
    if (v === null && field.nullable) continue;
    if (
      field.type === "array"
        ? !Array.isArray(v)
        : field.type === "object"
          ? !plain(v)
          : typeof v !== field.type
    )
      fail("INVALID_ARGUMENT", `Invalid ${key}`);
    if (
      typeof v === "number" &&
      (!Number.isFinite(v) || (v < 0 && key !== "seconds"))
    )
      fail("INVALID_ARGUMENT", `Invalid ${key}`);
    if (typeof v === "string" && v.length > 100_000)
      fail("INVALID_ARGUMENT", `Oversized ${key}`);
    if (field.enum && !field.enum.includes(v))
      fail("INVALID_ARGUMENT", `Invalid ${key}`);
  }
  const invalid = (message: string): never => fail("INVALID_ARGUMENT", message);
  const object = (input: unknown, keys: readonly string[]) => {
    if (!plain(input) || Object.keys(input).some((key) => !keys.includes(key)))
      invalid("Unknown or invalid nested fields");
    return input as Record<string, unknown>;
  };
  if (command.id === "settings.update") {
    const patch = object(value.settings, [
      "theme",
      "view",
      "sort",
      "groupDates",
      "sidebarWidth",
      "listWidth",
      "macSidebarVisible",
      "interfaceFontSize",
      "editorFontSize",
      "interfaceDetails",
    ]);
    if (!Object.keys(patch).length) invalid("Empty settings patch");
    for (const [key, v] of Object.entries(patch)) {
      if (key === "interfaceDetails") {
        try { parseInterfaceDetails(v); } catch { invalid("Invalid interface details"); }
        continue;
      }
      const values: Record<string, readonly unknown[]> = {
        theme: ["system", "light", "dark"],
        interfaceFontSize: ["tiny", "small", "medium", "large", "huge"],
        editorFontSize: ["tiny", "small", "medium", "large", "huge"],
        view: ["list", "gallery"],
        sort: ["updated", "created", "title"],
      };
      if (
        Object.prototype.hasOwnProperty.call(values, key)
          ? !values[key].includes(v)
          : ["groupDates", "macSidebarVisible"].includes(key)
            ? typeof v !== "boolean"
            : typeof v !== "number" ||
              !Number.isFinite(v) ||
              v < 120 ||
              v > 1200
      )
        invalid(`Invalid setting: ${key}`);
    }
  }
  if (command.id === "folder.updateDraft") {
    const draft = object(value.draft, ["name", "smart", "combine", "rules"]);
    if (!Object.keys(draft).length) invalid("Empty draft patch");
    if (
      draft.name !== undefined &&
      (typeof draft.name !== "string" || draft.name.length > 200)
    )
      invalid("Invalid folder name");
    if (draft.smart !== undefined && typeof draft.smart !== "boolean")
      invalid("Invalid smart flag");
    if (
      draft.combine !== undefined &&
      !["all", "any"].includes(String(draft.combine))
    )
      invalid("Invalid combination");
    if (draft.rules !== undefined) {
      if (!Array.isArray(draft.rules) || draft.rules.length > 16)
        invalid("Invalid rules");
      for (const rule of draft.rules as unknown[]) {
        const r = object(rule, ["key", "type", "mode", "names", "pinned"]);
        if (
          !Number.isSafeInteger(r.key) ||
          Number(r.key) < 0 ||
          !["tags", "pinned", "creationDate"].includes(String(r.type)) ||
          !["allSelected", "anySelected", "anyTag", "noTags"].includes(
            String(r.mode),
          ) ||
          typeof r.pinned !== "boolean" ||
          !Array.isArray(r.names) ||
          r.names.length > 64 ||
          r.names.some((n) => typeof n !== "string" || n.length > 200)
        )
          invalid("Invalid draft rule");
      }
    }
  }
  if (command.id === "attachment.submit") {
    if (
      !Array.isArray(value.files) ||
      !value.files.length ||
      value.files.length > 8
    )
      invalid("Provide one to eight synthetic files");
    let total = 0;
    for (const item of value.files as unknown[]) {
      const f = object(item, ["name", "mime", "text", "base64"]);
      if (
        typeof f.name !== "string" ||
        !f.name ||
        f.name.length > 200 ||
        /[\\/]/.test(f.name) ||
        typeof f.mime !== "string" ||
        f.mime.length > 128 ||
        (typeof f.text !== "string" && typeof f.base64 !== "string") ||
        (f.text !== undefined && f.base64 !== undefined)
      )
        invalid("Invalid synthetic file");
      let size = 0;
      if (f.base64 !== undefined) {
        if (
          typeof f.base64 !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            f.base64,
          )
        )
          invalid("Invalid base64");
        size = atob(f.base64 as string).length;
      } else size = new TextEncoder().encode(f.text as string).length;
      if (size > 1_000_000 || (total += size) > 1_500_000)
        invalid("Synthetic file size limit exceeded");
    }
  }
  if (command.id === "recording.action") {
    if (
      value.action === "skip"
        ? value.seconds === undefined || value.milliseconds !== undefined
        : value.action === "seek"
          ? value.milliseconds === undefined || value.seconds !== undefined
          : value.seconds !== undefined || value.milliseconds !== undefined
    )
      invalid("Unexpected or missing recording action parameters");
  }
  if (
    command.id === "editor.select" &&
    (!Number.isSafeInteger(value.from) ||
      !Number.isSafeInteger(value.to) ||
      Number(value.from) > Number(value.to))
  )
    invalid("Invalid editor selection");
  return value;
}
function element(selector: string, interactive = true): HTMLElement {
  let found: NodeListOf<Element>;
  try {
    found = document.querySelectorAll(selector);
  } catch {
    return fail("INVALID_ARGUMENT", "Invalid selector");
  }
  if (found.length !== 1 || !(found[0] instanceof HTMLElement))
    fail("UNAVAILABLE", "Selector must identify exactly one HTML element");
  const el = found[0] as HTMLElement;
  if (
    interactive &&
    (!el.getClientRects().length ||
      getComputedStyle(el).visibility === "hidden" ||
      el.closest("[inert]") ||
      el.matches(":disabled,[aria-disabled=true]"))
  )
    fail("UNAVAILABLE", "Control is hidden, disabled or inert");
  return el;
}
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export function registerDebug(getAdapter: () => DebugAdapter): () => void {
  if (!import.meta.env.DEV || import.meta.env.VITE_NOTES_DEBUG !== "1")
    return () => {};
  let disposed = false,
    active = 0;
  const idleWaiters = new Set<() => void>();
  const sampleOpportunity = (remainingMs: number) => new Promise<void>((resolve, reject) => {
    let settled = false;
    let raf: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (cancelled = false) => {
      if (settled) return;
      settled = true;
      if (raf !== undefined) cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
      idleWaiters.delete(cancel);
      if (cancelled) reject(Object.assign(new Error("Debug application is unmounted"), { code: "UNAVAILABLE" }));
      else resolve();
    };
    const cancel = () => finish(true);
    idleWaiters.add(cancel);
    raf = requestAnimationFrame(() => finish());
    // A timer is a sampling opportunity, never evidence of idle or paint.
    timer = setTimeout(() => finish(), Math.min(50, remainingMs));
  });
  const live = () => {
    if (disposed) fail("UNAVAILABLE", "Debug application is unmounted");
    return getAdapter();
  };
  const api: DebugAPI = Object.freeze({
    version: 1 as const,
    list: () =>
      catalog.map((row) =>
        structuredClone({
          ...row,
          available:
            row.mode !== "unsupported" &&
            (row.mode === "dom" ||
              Object.prototype.hasOwnProperty.call(live().handlers, row.id)),
          arguments: row.args,
        }),
      ),
    async execute(command: string, args: DebugArgs = {}) {
      live();
      const entry = catalog.find((row) => row.id === command);
      if (!entry) fail("UNKNOWN_COMMAND", `Unknown debug command: ${command}`);
      const value = validate(entry, args);
      if (entry.mode === "unsupported") fail("UNSUPPORTED", entry.description);
      const adapter = live(),
        serial = adapter.state().failure.serial;
      active++;
      try {
        let result: unknown;
        if (entry.mode === "dom") {
          const el = element(value.selector as string);
          if (command === "dom.click") el.click();
          else if (command === "dom.fill") {
            if (!(
              el instanceof HTMLInputElement ||
              el instanceof HTMLTextAreaElement
            ))
              fail(
                "INVALID_ARGUMENT",
                "Fill requires input/textarea; editor uses semantic commands",
              );
            const proto =
              el instanceof HTMLInputElement
                ? HTMLInputElement.prototype
                : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(
              el,
              value.value,
            );
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            el.focus();
            el.dispatchEvent(
              new KeyboardEvent("keydown", { ...value, bubbles: true }),
            );
            el.dispatchEvent(
              new KeyboardEvent("keyup", { ...value, bubbles: true }),
            );
          }
          result = { dispatched: true };
        } else {
          const handler = adapter.handlers[command];
          if (!handler) fail("UNAVAILABLE", `Unavailable command: ${command}`);
          result = await handler(value);
          if (result === false)
            fail(
              "UNAVAILABLE",
              "Application command could not be applied in the current state",
            );
        }
        await frame();
        await frame();
        const failure = live().state().failure;
        if (failure.serial !== serial) fail("APP_ERROR", failure.message);
        return {
          version: 1 as const,
          command,
          result: result === undefined ? null : structuredClone(result),
        };
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          [
            "INVALID_ARGUMENT",
            "UNKNOWN_COMMAND",
            "UNAVAILABLE",
            "UNSUPPORTED",
            "TIMEOUT",
            "APP_ERROR",
          ].includes(String(error.code))
        )
          throw error;
        fail(
          "APP_ERROR",
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : String(error),
        );
      } finally {
        active--;
      }
    },
    snapshot(options: DebugSnapshotOptions = {}) {
      live();
      if (
        !plain(options) ||
        Object.keys(options).some(
          (k) => !["selector", "maxChars", "maxNodes"].includes(k),
        )
      )
        fail("INVALID_ARGUMENT", "Invalid snapshot options");
      const selector = options.selector ?? "#root",
        maxChars = options.maxChars ?? 16_000,
        maxNodes = options.maxNodes ?? 160;
      if (
        typeof selector !== "string" ||
        typeof maxChars !== "number" ||
        typeof maxNodes !== "number" ||
        !Number.isSafeInteger(maxChars) ||
        maxChars < 128 ||
        maxChars > 100_000 ||
        !Number.isSafeInteger(maxNodes) ||
        maxNodes < 1 ||
        maxNodes > 1000
      )
        fail("INVALID_ARGUMENT", "Invalid snapshot bounds");
      const target = element(selector, false),
        html = target.outerHTML,
        all = [target, ...target.querySelectorAll("*")];
      const ids = new Map<string, string>();
      const normalizedHTML = html.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (id) => {
          if (!ids.has(id)) ids.set(id, `uuid-${ids.size + 1}`);
          return ids.get(id)!;
        },
      );
      const nodes = all.slice(0, maxNodes).map((node, index) => {
        const r = node.getBoundingClientRect(),
          style = getComputedStyle(node);
        return {
          index,
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute("role"),
          label: node.getAttribute("aria-label"),
          text: (node.textContent ?? "").slice(0, 256),
          visible:
            r.width > 0 &&
            r.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
          rect: Object.fromEntries(
            ["x", "y", "width", "height"].map((k) => [
              k,
              Math.round((r[k as keyof DOMRect] as number) * 100) / 100,
            ]),
          ),
          computed: Object.fromEntries(
            [
              "display",
              "position",
              "font-family",
              "font-size",
              "font-weight",
              "line-height",
              "color",
              "background-color",
              "padding",
              "gap",
              "border-radius",
              "opacity",
            ].map((key) => [key, style.getPropertyValue(key)]),
          ),
        };
      });
      return {
        version: 1,
        selector,
        html: html.slice(0, maxChars),
        normalizedHTML: normalizedHTML.slice(0, maxChars),
        text: (target.textContent ?? "").slice(0, maxChars),
        htmlTruncated: html.length > maxChars,
        nodesTruncated: all.length > maxNodes,
        normalization: [
          "UUID tokens mapped bijectively in occurrence order; text/styles retained",
          "rect rounded to 0.01px",
        ],
        nodes,
        editorJSON: live().state().editorJSON,
        viewport: { width: innerWidth, height: innerHeight },
        theme: document.documentElement.dataset.theme,
      };
    },
    async waitForIdle(options: { timeoutMs?: number } = {}) {
      if (
        !plain(options) ||
        Object.keys(options).some((k) => k !== "timeoutMs")
      )
        fail("INVALID_ARGUMENT", "Invalid idle options");
      const timeout = options.timeoutMs ?? 8000;
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30000)
        fail("INVALID_ARGUMENT", "Invalid timeoutMs");
      const start = performance.now(), deadline = start + timeout;
      let stable = 0;
      while (performance.now() < deadline) {
        const state = live().state();
        if (performance.now() >= deadline) break;
        // A retained failure is terminal only after actual retry work settles.
        // pendingDocs alone is not work: a failed, un-retried save still fails.
        if (active || state.busy || state.save.saving) {
          stable = 0;
          await sampleOpportunity(deadline - performance.now());
          continue;
        }
        if (state.save.failed)
          fail(
            "APP_ERROR",
            "Save has failed; original pending content remains",
          );
        if (state.error) fail("APP_ERROR", state.error);
        if (!active && !state.busy && !state.save.pending && !state.save.saving)
          stable++;
        else stable = 0;
        if (stable >= 3)
          return {
            version: 1,
            idle: true,
            elapsedMs: Math.round(performance.now() - start),
            save: state.save,
          };
        await sampleOpportunity(deadline - performance.now());
      }
      fail("TIMEOUT", `Application did not become idle in ${timeout}ms`);
    },
  });
  Object.defineProperty(window, "__NOTES_DEBUG__", {
    value: api,
    configurable: true,
  });
  return () => {
    disposed = true;
    for (const cancel of idleWaiters) cancel();
    if (window.__NOTES_DEBUG__ === api) delete window.__NOTES_DEBUG__;
  };
}
import { parseInterfaceDetails } from "../interface-details";
