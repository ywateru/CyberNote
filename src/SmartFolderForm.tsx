import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentKeyboardNavigation, nativeMainKeyboardAvailable } from "./native-keyboard";
import { OrdinaryFolderKeyboard } from "./ordinary-folder-keyboard";
import { insertOrdinaryFolderOptionTab } from "./ordinary-folder-option";
import {
  Check,
  X,
  Plus,
  Minus,
  ChevronDown,
  Hash,
  Pin,
  Calendar,
  ListChecks,
  Paperclip,
  Folder as FolderIcon,
  Lock,
  StickyNote,
} from "lucide-react";
import { validTagName } from "./note-tags";
import {
  addDraftRule,
  nextDraftRuleType,
  draftQuery,
  folderDraft,
  newTagRule,
  type DraftRule,
  type FolderDraft,
} from "./smart-draft";
import type { Folder, SmartFolder, TagMode } from "./types";
import "./smart-folders.css";

const types = [
  "标签",
  "创建日期",
  "编辑日期",
  "共享",
  "@提及",
  "核对清单",
  "附件",
  "文件夹",
  "快速备忘录",
  "置顶备忘录",
  "锁定备忘录",
];
const modes: { value: TagMode; desktop: string; mobile: string }[] = [
  { value: "allSelected", desktop: "所有已选", mobile: "所有已选标签" },
  { value: "anySelected", desktop: "任何已选", mobile: "任何已选标签" },
  { value: "anyTag", desktop: "任何标签", mobile: "任何标签" },
  {
    value: "noTags",
    desktop: "仅不含标签的备忘录",
    mobile: "仅不含标签的备忘录",
  },
];
function TagTokens({
  rule,
  catalog,
  onChange,
}: {
  rule: DraftRule;
  catalog: readonly string[];
  onChange: (names: string[]) => void;
}) {
  const [input, setInput] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const options = catalog.filter(
    (n) => !rule.names.includes(n) && n.includes(input.replace(/^#/, "")),
  );
  const name = input.replace(/^#/, ""),
    canCreate =
      validTagName(name) &&
      !rule.names.includes(name) &&
      !options.includes(name);
  const candidates = [...(canCreate ? [name] : []), ...options];
  const pick = (name: string) => {
    onChange([...rule.names, name]);
    setInput("");
    setActive(0);
    setOpen(false);
  };
  return (
    <div className="smart-token-anchor">
      <div className="smart-token-input" onClick={() => setOpen(true)}>
        {rule.names.map((name) => (
          <span className="smart-token" key={name}>
            #{name}
            <button
              type="button"
              aria-label={`移除标签 ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(rule.names.filter((n) => n !== name));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label="标签"
          value={input}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, candidates.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && candidates[active]) pick(candidates[active]);
            }
          }}
        />
      </div>
      {open && candidates.length > 0 && (
        <div role="listbox" className="smart-tag-options">
          {candidates.map((n, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              key={n}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(n)}
            >
              <Hash size={14} />
              {canCreate && i === 0 ? `创建新标签 “${n}”` : `#${n}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export interface FolderFormHandle {
  cancel(): void;
}
export function SmartFolderForm({
  mobile,
  folder,
  catalog,
  onCancel,
  onSave,
  onRefresh,
  onHandle,
}: {
  mobile: boolean;
  folder?: Folder;
  catalog: readonly string[];
  onCancel: () => void;
  onSave: (
    draft: FolderDraft,
    committedId?: string,
  ) => Promise<{ id?: string; complete: boolean }>;
  onRefresh: (id: string) => Promise<SmartFolder>;
  onHandle: (handle: FolderFormHandle | null) => void;
}) {
  const [draft, setDraft] = useState(() => folderDraft(folder)),
    [panel, setPanel] = useState<FolderDraft | null>(null),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [warning, setWarning] = useState(false),
    [busy, setBusy] = useState(false);
  const [tagInputFor, setTagInputFor] = useState<number | null>(null);
  const busyRef = useRef(false),
    committedId = useRef<string | undefined>(undefined),
    draftRef = useRef(draft),
    panelRef = useRef(panel);
  draftRef.current = draft;
  panelRef.current = panel;
  const ordinaryForm = useRef<HTMLFormElement>(null);
  const ordinaryKeyboard = useRef<OrdinaryFolderKeyboard | null>(null);
  const keyboardActive = nativeMainKeyboardAvailable() && !mobile && !folder && !draft.smart && !busy;
  const keyboardActiveRef = useRef(keyboardActive);
  keyboardActiveRef.current = keyboardActive;
  useLayoutEffect(() => {
    if (!keyboardActive || !ordinaryForm.current) return;
    const controller = new OrdinaryFolderKeyboard(
      ordinaryForm.current,
      () => keyboardActiveRef.current && !busyRef.current,
      currentKeyboardNavigation,
      () => setError("无法切换输入位置，请重试。"),
    );
    ordinaryKeyboard.current = controller;
    return () => {
      controller.dispose();
      if (ordinaryKeyboard.current === controller) ordinaryKeyboard.current = null;
    };
  }, [keyboardActive]);
  const cancel = () => {
    if (busyRef.current) return;
    if (panelRef.current) {
      setPanel(null);
      setError("");
    } else onCancel();
  };
  useEffect(() => {
    onHandle({ cancel });
    return () => onHandle(null);
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.preventDefault();
        if (warning) setWarning(false);
        else cancel();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const update = (change: Partial<FolderDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setError("");
  };
  const target = panel ?? draft,
    setTarget = (d: FolderDraft) => {
      if (panel) setPanel(d);
      else setDraft(d);
      setError("");
    };
  const row = (key: number, change: Partial<DraftRule>) =>
    setTarget({
      ...target,
      rules: target.rules.map((r) =>
        r.key === key ? ({ ...r, ...change } as DraftRule) : r,
      ),
    });
  const validate = (d: FolderDraft) => {
    if (d.smart) draftQuery(d);
    if (!d.name.trim()) throw Error("请输入文件夹名称");
  };
  const submit = async () => {
    if (busyRef.current) return;
    try {
      validate(draft);
    } catch (e) {
      setError((e as Error).message);
      if (
        draft.smart &&
        draft.rules.some(
          (r) =>
            r.type === "tags" &&
            (r.mode === "allSelected" || r.mode === "anySelected") &&
            !r.names.length,
        )
      )
        setWarning(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await onSave(draft, committedId.current);
      if (result.id) committedId.current = result.id;
      if (!result.complete)
        setError("文件夹已经保存，正在等待列表同步。请重试同步。");
    } catch (e) {
      setError(
        (e as { message?: string }).message || "保存失败，草稿仍保留。请重试。",
      );
      setConflict((e as { code?: string }).code === "smart_conflict");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (!draft.id || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setDraft(folderDraft(await onRefresh(draft.id)));
      setConflict(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const errorView = error && (
    <div role="alert" className="smart-error">
      {error}
      {conflict && (
        <button type="button" onClick={() => void refresh()}>
          载入最新定义
        </button>
      )}
    </div>
  );
  const combination = (
    <select
      aria-label="组合过滤条件"
      value={target.combine}
      onChange={(e) =>
        setTarget({ ...target, combine: e.target.value as "all" | "any" })
      }
    >
      <option value="all">全部</option>
      <option value="any">任意</option>
    </select>
  );
  if (committedId.current)
    return (
      <div
        className={`smart-form-backdrop ${mobile ? "smart-mobile" : "smart-mac"}`}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="同步文件夹"
          className="smart-form"
        >
          <h2>文件夹已经保存</h2>
          <p role="status">{error || "等待列表同步。"}</p>
          <footer>
            <button type="button" disabled={busy} onClick={onCancel}>
              关闭
            </button>
            <button
              type="button"
              disabled={busy}
              className="smart-primary"
              onClick={() => void submit()}
            >
              {busy ? "正在同步…" : "重试同步"}
            </button>
          </footer>
        </section>
      </div>
    );
  return (
    <div
      className={`smart-form-backdrop ${mobile ? "smart-mobile" : "smart-mac"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={
          panel
            ? "过滤条件"
            : folder
              ? "编辑智能文件夹"
              : draft.smart
                ? "新建智能文件夹"
                : "新建文件夹"
        }
        className={`smart-form ${panel ? "smart-filter-panel" : ""} ${!mobile && !folder && !draft.smart ? "smart-ordinary" : ""}`}
      >
        <fieldset disabled={busy}>
          {mobile ? (
            <>
              <div
                className={`smart-mobile-feedback ${error ? "has-error" : ""}`}
              >
                <header className="smart-mobile-header">
                  <button type="button" aria-label="取消" onClick={cancel}>
                    <X />
                  </button>
                  <strong>
                    {panel
                      ? "过滤条件"
                      : folder
                        ? "编辑智能文件夹"
                        : "新建文件夹"}
                  </strong>
                  <button
                    type="button"
                    className="smart-mobile-confirm"
                    aria-label={panel ? "确认过滤条件" : "保存文件夹"}
                    onClick={() => {
                      if (panel) {
                        try {
                          validate(panel);
                          setDraft(panel);
                          setPanel(null);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      } else void submit();
                    }}
                  >
                    <Check />
                  </button>
                </header>
                {errorView}
              </div>
              {panel ? (
                <div className="smart-mobile-filter-body">
                  <div className="smart-mobile-combine">
                    包含匹配 {combination} 过滤条件的备忘录。
                  </div>
                  <h3>已启用的过滤条件</h3>
                  {target.rules.map((r) => (
                    <div className="smart-mobile-card" key={r.key}>
                      <div className="smart-mobile-rule-heading">
                        {r.type === "tags" ? (
                          <Hash className="smart-tag-icon" />
                        ) : (
                          <Pin className="smart-pin-icon" />
                        )}
                        <span>
                          {r.type === "tags"
                            ? `${r.names.length}个标签`
                            : "置顶备忘录"}
                        </span>
                        <select
                          aria-label={
                            r.type === "tags" ? "标签模式" : "置顶模式"
                          }
                          value={r.type === "tags" ? r.mode : String(r.pinned)}
                          onChange={(e) => {
                            if (e.target.value === "off")
                              setTarget({
                                ...target,
                                rules: target.rules.filter(
                                  (x) => x.key !== r.key,
                                ),
                              });
                            else
                              row(
                                r.key,
                                r.type === "tags"
                                  ? { mode: e.target.value as TagMode }
                                  : { pinned: e.target.value === "true" },
                              );
                          }}
                        >
                          {r.type === "tags" ? (
                            modes.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.mobile}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="true">包含</option>
                              <option value="false">不包含</option>
                            </>
                          )}
                          <option value="off">关</option>
                        </select>
                      </div>
                      {r.type === "tags" &&
                        (r.mode === "allSelected" ||
                          r.mode === "anySelected") && (
                          <div className="smart-mobile-tags">
                            <button
                              type="button"
                              aria-label="添加标签"
                              onClick={() =>
                                setTagInputFor((value) =>
                                  value === r.key ? null : r.key,
                                )
                              }
                            >
                              <Plus size={17} />
                            </button>
                            {[...new Set([...catalog, ...r.names])].map((n) => (
                              <button
                                type="button"
                                className={
                                  r.names.includes(n) ? "selected" : ""
                                }
                                key={n}
                                onClick={() =>
                                  row(r.key, {
                                    names: r.names.includes(n)
                                      ? r.names.filter((x) => x !== n)
                                      : [...r.names, n],
                                  })
                                }
                              >
                                #{n}
                              </button>
                            ))}
                            {tagInputFor === r.key && (
                              <TagTokens
                                rule={r}
                                catalog={catalog}
                                onChange={(names) => row(r.key, { names })}
                              />
                            )}
                          </div>
                        )}
                    </div>
                  ))}
                  <h3>其他过滤条件</h3>
                  <div className="smart-mobile-card smart-mobile-other">
                    {!target.rules.some((r) => r.type === "tags") && (
                      <button
                        type="button"
                        onClick={() =>
                          setTarget({
                            ...target,
                            rules: [...target.rules, newTagRule(Date.now())],
                          })
                        }
                      >
                        <Hash />
                        标签<span>关⌃</span>
                      </button>
                    )}
                    {!target.rules.some((r) => r.type === "pinned") && (
                      <button
                        type="button"
                        onClick={() =>
                          setTarget({
                            ...target,
                            rules: [
                              ...target.rules,
                              { ...newTagRule(Date.now()), type: "pinned" },
                            ],
                          })
                        }
                      >
                        <Pin />
                        置顶备忘录<span>关⌃</span>
                      </button>
                    )}
                    {[
                      [Calendar, "创建日期"],
                      [Calendar, "已编辑"],
                      [ListChecks, "核对清单"],
                      [Paperclip, "附件"],
                      [FolderIcon, "文件夹"],
                      [StickyNote, "快速备忘录"],
                      [Lock, "锁定备忘录"],
                    ].map(([Icon, label]) => {
                      const I = Icon as typeof Calendar;
                      return (
                        <button
                          disabled
                          type="button"
                          key={String(label)}
                          title="此过滤条件尚未接入本地规则"
                        >
                          <I />
                          {String(label)}
                          <span>暂不支持</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="smart-mobile-name">
                  <input
                    autoFocus
                    aria-label="名称"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPanel({
                        ...draft,
                        smart: true,
                        rules: draft.rules.map((r) => ({
                          ...r,
                          names: [...r.names],
                        })),
                      });
                      setError("");
                    }}
                  >
                    过滤条件{" "}
                    <span>
                      {draft.smart
                        ? `${draft.rules.length}项`
                        : "制作智能文件夹"}
                      <ChevronDown />
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <form
              ref={ordinaryForm}
              onKeyDown={(event) => ordinaryKeyboard.current?.handle(event.nativeEvent)}
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h2>
                {folder
                  ? "编辑智能文件夹"
                  : draft.smart
                    ? "新建智能文件夹"
                    : "新建文件夹"}
              </h2>
              <label className="smart-name">
                名称：
                <input
                  autoFocus
                  value={draft.name}
                  aria-label="名称"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => update({ name: e.target.value })}
                  onKeyDown={(event) => {
                    if (!keyboardActive || busyRef.current || warning) return;
                    if (insertOrdinaryFolderOptionTab(event.nativeEvent, event.currentTarget) === "failed")
                      setError("无法完成输入，请检查名称后重试。");
                  }}
                />
              </label>
              {!folder && (
                <div className="smart-make">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.smart}
                      onChange={(e) =>
                        update({
                          smart: e.target.checked,
                          name:
                            draft.name === "新建文件夹" ||
                            draft.name === "新建智能文件夹"
                              ? e.target.checked
                                ? "新建智能文件夹"
                                : "新建文件夹"
                              : draft.name,
                        })
                      }
                    />
                    制作智能文件夹
                  </label>
                  <p>使用标签和其他过滤方式整理。</p>
                </div>
              )}
              {draft.smart && (
                <>
                  <div className="smart-combine">
                    包含匹配下列 {combination} 过滤条件的备忘录：
                  </div>
                  <div className="smart-rules">
                    {draft.rules.map((r) => (
                      <div className="smart-rule" key={r.key}>
                        <select
                          aria-label="过滤条件类型"
                          value={r.type}
                          onChange={(e) =>
                            row(r.key, {
                              type: e.target.value as "tags" | "pinned",
                            })
                          }
                        >
                          {types.map((t) => (
                            <option
                              key={t}
                              value={
                                t === "标签"
                                  ? "tags"
                                  : t === "置顶备忘录"
                                    ? "pinned"
                                    : t === "创建日期"
                                      ? "creationDate"
                                      : t
                              }
                              disabled={
                                (t !== "标签" && t !== "置顶备忘录") ||
                                draft.rules.some(
                                  (other) =>
                                    other.key !== r.key &&
                                    other.type ===
                                      (t === "标签"
                                        ? "tags"
                                        : t === "置顶备忘录"
                                          ? "pinned"
                                          : t === "创建日期"
                                            ? "creationDate"
                                            : t),
                                )
                              }
                            >
                              {t}
                              {t !== "标签" && t !== "置顶备忘录"
                                ? "（暂不支持）"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={
                            r.type === "tags"
                              ? "标签模式"
                              : r.type === "creationDate"
                                ? "创建日期模式"
                                : "置顶模式"
                          }
                          disabled={r.type === "creationDate"}
                          value={
                            r.type === "tags"
                              ? r.mode
                              : r.type === "creationDate"
                                ? "today"
                                : String(r.pinned)
                          }
                          onChange={(e) =>
                            row(
                              r.key,
                              r.type === "tags"
                                ? { mode: e.target.value as TagMode }
                                : { pinned: e.target.value === "true" },
                            )
                          }
                        >
                          {r.type === "tags" ? (
                            modes.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.desktop}
                              </option>
                            ))
                          ) : r.type === "creationDate" ? (
                            <option value="today">今天（暂不支持保存）</option>
                          ) : (
                            <>
                              <option value="true">包含</option>
                              <option value="false">不包含</option>
                            </>
                          )}
                        </select>
                        {r.type === "tags" &&
                          (r.mode === "allSelected" ||
                            r.mode === "anySelected") && (
                            <TagTokens
                              rule={r}
                              catalog={catalog}
                              onChange={(names) => row(r.key, { names })}
                            />
                          )}
                        <div className="smart-rule-buttons">
                          <button
                            type="button"
                            aria-label="移除过滤条件"
                            disabled={draft.rules.length === 1}
                            onClick={() =>
                              update({
                                rules: draft.rules.filter(
                                  (x) => x.key !== r.key,
                                ),
                              })
                            }
                          >
                            <Minus />
                          </button>
                          <button
                            type="button"
                            aria-label="添加过滤条件"
                            disabled={!nextDraftRuleType(draft)}
                            onClick={() => setDraft(addDraftRule(draft, r.key))}
                          >
                            <Plus />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {errorView}
              <footer>
                <button type="button" onClick={cancel}>
                  取消
                </button>
                <button className="smart-primary" type="submit">
                  {busy ? "正在保存…" : committedId.current ? "重试同步" : "好"}
                </button>
              </footer>
            </form>
          )}
        </fieldset>
        {warning && (
          <div className="smart-warning-backdrop">
            <div
              role="alertdialog"
              aria-label="“标签”过滤条件不完整"
              className="smart-warning"
            >
              <strong>“标签”过滤条件不完整</strong>
              <p>必须为“标签”过滤条件选择至少一个标签。</p>
              <button
                className="smart-primary"
                onClick={() => setWarning(false)}
              >
                好
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
