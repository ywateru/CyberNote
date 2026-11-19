import { useEffect, useId, useRef, useState } from "react";
export function CloudSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const choose = (i: number) => {
    const option = options[i];
    if (option) onChange(option.value);
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div
      className="cloud-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <select
        className="cloud-select-mobile"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="cloud-select-desktop">
        <button
          className="settings121-text"
          ref={button}
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            setIndex(
              Math.max(
                0,
                options.findIndex((o) => o.value === value),
              ),
            );
            setOpen((v) => !v);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
              setIndex((i) =>
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (i +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
              );
            }
            if (open && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              choose(index);
            }
          }}
          aria-activedescendant={open ? `${id}-${index}` : undefined}
        >
          {options.find((o) => o.value === value)?.label ?? "请选择"}
          <span aria-hidden="true">⌄</span>
        </button>
        {open && (
          <div
            id={id}
            role="listbox"
            aria-label={label}
            className="cloud-select-menu"
          >
            {options.map((o, i) => (
              <button
                id={`${id}-${i}`}
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                tabIndex={-1}
                data-highlighted={index === i}
                onPointerMove={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {o.label}
                <span aria-hidden="true">{o.value === value ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
