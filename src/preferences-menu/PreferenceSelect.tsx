import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MenuSurface, NativeMenuContext } from "../Menu";
import "./PreferenceSelect.css";

/** A settings-only adapter: shared menu placement/lifetime, scoped material,
 * explicit radio keyboard semantics. Never uses the native desktop menu bridge. */
export function PreferenceSelect<T extends string>({
  label,
  value,
  options,
  mobile,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  mobile: boolean;
  disabled?: boolean;
  onChange(value: T): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const close = (restore: boolean) => {
    setOpen(false);
    if (
      (restore || surface.current?.contains(document.activeElement)) &&
      trigger.current?.isConnected &&
      !trigger.current.matches(":disabled") &&
      !trigger.current.closest("[hidden],[inert]")
    )
      trigger.current.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    setOpen(false);
  }, [mobile, disabled]);
  useLayoutEffect(() => {
    if (!open || mobile || disabled) return;
    const menu = surface.current;
    const items = menu?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled)',
    );
    const selected =
      menu?.querySelector<HTMLButtonElement>(
        '[aria-checked="true"]:not(:disabled)',
      ) ?? items?.[0];
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest" });
    typed.current = { text: "", at: 0 };
    // Retained Preferences pages become hidden rather than unmounting.
    const observer = new MutationObserver(() => {
      if (
        !trigger.current?.isConnected ||
        trigger.current.closest("[hidden],[inert]")
      )
        close(false);
    });
    for (
      let parent = trigger.current?.parentElement;
      parent;
      parent = parent.parentElement
    )
      observer.observe(parent, {
        attributes: true,
        attributeFilter: ["hidden", "inert"],
      });
    return () => observer.disconnect();
  }, [open, mobile, disabled]);
  if (mobile)
    return (
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  return (
    <span className="preferences-picker">
      <button
        ref={trigger}
        type="button"
        className="preferences-select-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>
          {options.find((option) => option.value === value)?.label ?? value}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <NativeMenuContext.Provider value={false}>
          <MenuSurface
            inline
            ref={surface}
            id={id}
            className="preferences-select-menu"
            aria-label={label}
            anchor={trigger.current}
            returnFocus={trigger.current}
            autoFocus={false}
            onClose={close}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
                return;
              }
              if (event.key === "Tab") {
                // Return to the trigger before the normal tab traversal. Let
                // Preferences' existing document focus trap handle its edges.
                close(true);
                return;
              }
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitemradio"]:not(:disabled)',
                ),
              ];
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : event.key === "ArrowDown"
                      ? (index + 1) % items.length
                      : event.key === "ArrowUp"
                        ? (index - 1 + items.length) % items.length
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                event.stopPropagation();
                items[next]?.focus({ preventScroll: true });
                items[next]?.scrollIntoView({ block: "nearest" });
              } else if (
                event.key.length === 1 &&
                event.key !== " " &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey
              ) {
                const now = Date.now();
                typed.current = {
                  text:
                    (now - typed.current.at < 700 ? typed.current.text : "") +
                    event.key.toLocaleLowerCase(),
                  at: now,
                };
                const match = items.find((item) =>
                  item.textContent
                    ?.trim()
                    .toLocaleLowerCase()
                    .startsWith(typed.current.text),
                );
                if (match) {
                  event.preventDefault();
                  event.stopPropagation();
                  match.focus({ preventScroll: true });
                  match.scrollIntoView({ block: "nearest" });
                }
              }
            }}
          >
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                role="menuitemradio"
                className="menu-row"
                aria-checked={option.value === value}
                tabIndex={-1}
                disabled={option.disabled}
                onClick={() => {
                  close(true);
                  onChange(option.value);
                }}
              >
                <span className="preferences-select-check" aria-hidden="true">
                  {option.value === value && <Check size={13} />}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </MenuSurface>
        </NativeMenuContext.Provider>
      )}
    </span>
  );
}
