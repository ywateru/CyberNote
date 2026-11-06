import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FileInput, X } from "lucide-react";
import {
  appleImportTerminal,
  cancelAppleNotesImport,
  readAppleNotesImport,
  scanAppleNotes,
  startAppleNotesImport,
  type AppleImportSnapshot,
} from "./apple-notes-import";
import "./AppleNotesImport.css";
export type AppleNotesImportHandle = {
  open: () => void;
  scan: () => Promise<void>;
  start: (keys?: string[]) => Promise<void>;
  cancel: () => Promise<void>;
  inspect: () => {
    open: boolean;
    state: AppleImportSnapshot | null;
    selected: string[];
    error: string;
  };
};
export default function AppleNotesImport({
  active,
  blocked,
  accessKey,
  onPrepare,
  onFinish,
  onHandle,
}: {
  active: boolean;
  blocked: boolean;
  accessKey: string;
  onPrepare: () => Promise<void>;
  onFinish: (changed: boolean) => Promise<void>;
  onHandle: (handle: AppleNotesImportHandle | null) => void;
}) {
  const [opened, setOpened] = useState(false),
    [state, setState] = useState<AppleImportSnapshot | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const stateRef = useRef(state),
    openedRef = useRef(opened),
    mounted = useRef(true),
    generation = useRef(0),
    owned = useRef(false),
    pending = useRef(false),
    authority = useRef(accessKey),
    first = useRef<HTMLButtonElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  stateRef.current = state;
  openedRef.current = opened;
  const finishRef = useRef<(changed: boolean) => Promise<void>>(async () => {});
  const finish = useCallback(
    async (changed: boolean) => {
      if (!owned.current) return;
      owned.current = false;
      await onFinish(changed);
    },
    [onFinish],
  );
  finishRef.current = finish;
  const apply = useCallback(
    async (next: AppleImportSnapshot, ticket: number) => {
      if (!mounted.current || ticket !== generation.current) return;
      const current = stateRef.current;
      if (
        current?.id === next.id &&
        ((appleImportTerminal(current) && !appleImportTerminal(next)) ||
          (current.phase === "cancelling" && !appleImportTerminal(next)))
      )
        return;
      stateRef.current = next;
      setState(next);
      if (next.phase === "preview" && current?.phase !== "preview")
        setSelected(
          next.items.filter((i) => i.status === "ok").map((i) => i.key),
        );
      if (appleImportTerminal(next))
        await finish(
          next.phase === "complete" &&
            next.results.some(
              (r) =>
                r.status === "imported" ||
                r.status === "imported_with_warnings",
            ),
        );
    },
    [finish],
  );
  const scan = useCallback(async () => {
    if (pending.current || owned.current) throw Error("已有导入任务正在进行");
    const ticket = ++generation.current;
    pending.current = true;
    setError("");
    setState(null);
    stateRef.current = null;
    try {
      await onPrepare();
      owned.current = true;
      const next = await scanAppleNotes();
      if (!mounted.current || ticket !== generation.current) {
        const cancelled = await cancelAppleNotesImport(next.id);
        await finish(cancelled.phase === "complete");
        return;
      }
      await apply(next, ticket);
    } catch (e) {
      if (mounted.current && ticket === generation.current)
        setError(String(e instanceof Error ? e.message : "无法读取系统备忘录"));
      await finish(false);
    } finally {
      pending.current = false;
    }
  }, [onPrepare, apply, finish]);
  const cancel = useCallback(async () => {
    const current = stateRef.current;
    if (!current) {
      ++generation.current;
      return;
    }
    if (appleImportTerminal(current)) return;
    try {
      const next = await cancelAppleNotesImport(current.id);
      await apply(next, generation.current);
    } catch {
      await finish(false);
    }
  }, [apply, finish]);
  const start = useCallback(
    async (keys?: string[]) => {
      const current = stateRef.current;
      if (!current || current.phase !== "preview" || pending.current)
        throw Error("请先读取并选择来源笔记");
      pending.current = true;
      setError("");
      try {
        await apply(
          await startAppleNotesImport(current.id, keys || selected),
          generation.current,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "无法开始复制");
      } finally {
        pending.current = false;
      }
    },
    [apply, selected],
  );
  const open = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpened(true);
    setError("");
  }, []);
  const close = useCallback(async () => {
    await cancel();
    setOpened(false);
    returnFocus.current?.focus();
  }, [cancel]);
  useEffect(() => {
    if (
      !state ||
      !["scanning", "importing", "saving", "cancelling"].includes(state.phase)
    )
      return;
    let alive = true;
    const ticket = generation.current;
    const timer = window.setTimeout(() => {
      void readAppleNotesImport(state.id)
        .then(async (next) => {
          if (alive) await apply(next, ticket);
        })
        .catch(async () => {
          if (alive) {
            setError("导入任务状态已改变，请重新读取来源。");
            await cancel();
          }
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [state, apply, cancel]);
  useEffect(() => {
    if (opened) first.current?.focus();
  }, [opened]);
  useEffect(() => {
    if ((!active || authority.current !== accessKey) && openedRef.current) {
      void close();
    }
    authority.current = accessKey;
  }, [active, accessKey, close]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++generation.current;
      const id = stateRef.current?.id;
      if (id && owned.current)
        void cancelAppleNotesImport(id).finally(() => finishRef.current(false));
    };
  }, []);
  useEffect(() => {
    onHandle({
      open,
      scan,
      start,
      cancel,
      inspect: () => ({
        open: openedRef.current,
        state: stateRef.current,
        selected,
        error,
      }),
    });
    return () => onHandle(null);
  }, [onHandle, open, scan, start, cancel, selected, error]);
  const ready = state?.items.filter((i) => i.status === "ok").length || 0;
  const busy =
    !!state &&
    ["scanning", "importing", "saving", "cancelling"].includes(state.phase);
  const counts = {
    imported: state?.results.filter((r) => r.status === "imported").length || 0,
    retained:
      state?.results.filter((r) => r.status === "imported_with_warnings")
        .length || 0,
    existing: state?.results.filter((r) => r.status === "existing").length || 0,
    skipped: state?.results.filter((r) => r.status === "skipped").length || 0,
  };
  return (
    <section className="apple-import-section" aria-label="从 Apple 备忘录导入">
      <h3>数据导入</h3>
      <button
        className="apple-import-entry"
        disabled={blocked && !owned.current}
        onClick={open}
      >
        <FileInput size={20} />
        <span>
          <strong>从 Apple 备忘录导入</strong>
          <small>复制笔记与附件，保留系统备忘录中的原件</small>
        </span>
        <ChevronRight size={17} />
      </button>
      {opened && (
        <div
          className="apple-import-panel"
          role="region"
          aria-label="Apple 备忘录导入"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              void close();
            }
          }}
        >
          <div className="apple-import-heading">
            <h4>从 Apple 备忘录导入</h4>
            <button
              type="button"
              aria-label="关闭 Apple 备忘录导入"
              onClick={() => void close()}
            >
              <X size={17} />
            </button>
          </div>
          <p>
            将所选笔记复制到本应用。原笔记保持不变；再次读取相同内容会自动跳过，源内容变化时保留为新副本。
          </p>
          {(!state || appleImportTerminal(state)) && (
            <button
              ref={first}
              className="apple-import-primary"
              disabled={pending.current || (blocked && !owned.current)}
              onClick={() => void scan()}
            >
              {state ? "重新读取来源" : "读取系统备忘录"}
            </button>
          )}
          {busy && (
            <div className="apple-import-progress" role="status">
              <span>
                {state?.phase === "scanning"
                  ? "正在读取账户、文件夹和笔记列表…"
                  : state?.phase === "saving"
                    ? "正在保存到本应用…"
                    : state?.phase === "cancelling"
                      ? "正在取消…"
                      : `正在复制笔记 ${state?.completed} / ${state?.total}`}
              </span>
              <progress
                max={state?.total || 1}
                value={
                  state?.phase === "scanning" ? undefined : state?.completed
                }
              />
              <button
                disabled={state?.phase === "cancelling"}
                onClick={() => void cancel()}
              >
                取消
              </button>
            </div>
          )}
          {state?.phase === "preview" && (
            <>
              <div className="apple-import-summary">
                <span>
                  可复制 {ready} 条，锁定或不可读 {state.items.length - ready}{" "}
                  条
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.length === ready && ready > 0}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? state.items
                              .filter((i) => i.status === "ok")
                              .map((i) => i.key)
                          : [],
                      )
                    }
                  />
                  全选
                </label>
              </div>
              {state.truncated && (
                <p className="apple-import-warning">
                  本次仅列出前 5000 条，请分批复制。
                </p>
              )}
              <div className="apple-import-items">
                {state.items.map((item) => (
                  <label className="apple-import-item" key={item.key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.key)}
                      disabled={item.status !== "ok"}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, item.key]
                            : prev.filter((key) => key !== item.key),
                        )
                      }
                    />
                    <span>
                      <strong>{item.title || "未命名备忘录"}</strong>
                      <small>{item.folder || item.reason}</small>
                      {item.reason && item.folder && (
                        <small className="apple-import-warning">
                          {item.reason}
                        </small>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="apple-import-actions">
                <button onClick={() => void cancel()}>取消</button>
                <button
                  className="apple-import-primary"
                  disabled={!selected.length}
                  onClick={() => void start()}
                >
                  复制所选 {selected.length} 条
                </button>
              </div>
            </>
          )}
          {state?.phase === "complete" && (
            <>
              <p className="apple-import-result" role="status">
                <Check size={17} />
                已复制 {counts.imported + counts.retained} 条（其中{" "}
                {counts.retained} 条的部分格式仅在原始记录中保留），已存在{" "}
                {counts.existing} 条，跳过 {counts.skipped} 条
              </p>
              <details>
                <summary>查看结果详情</summary>
                <div className="apple-import-items">
                  {state.results.map((result, index) => (
                    <div
                      className="apple-import-result-item"
                      key={`${result.key}-${index}`}
                    >
                      <strong>
                        {state.items.find((i) => i.key === result.key)?.title ||
                          "备忘录"}
                      </strong>
                      <small>
                        {result.status === "imported"
                          ? "已完整复制"
                          : result.status === "existing"
                            ? "相同内容已存在"
                            : result.status === "skipped"
                              ? result.reason
                              : "已复制，部分格式仅保存在原始记录"}
                      </small>
                      {result.warnings.map((w) => (
                        <small className="apple-import-warning" key={w}>
                          {w}
                        </small>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
              <p>
                原始 HTML 与来源信息保存在每条笔记末尾的“Apple
                备忘录原始记录.json”文件，可随完整备份导出。
              </p>
            </>
          )}
          {(error || state?.error || state?.phase === "cancelled") && (
            <p className="apple-import-warning" role="status">
              {error || state?.error || "已取消，源笔记保持不变。"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
