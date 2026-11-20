import { useRef } from "react";

export function PreferenceSegments<T extends string | number>({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  return <div ref={group} role="radiogroup" aria-label={label} className="preferences-segments">
    {options.map((option, index) => <button key={option.value} type="button" role="radio" value={option.value}
      aria-checked={value === option.value} aria-disabled={disabled}
      tabIndex={value === option.value ? 0 : -1}
      onClick={() => { if (!disabled && value !== option.value) onChange(option.value); }}
      onKeyDown={event => {
        let next: number;
        switch (event.key) {
          case "ArrowRight": case "ArrowDown": next = (index + 1) % options.length; break;
          case "ArrowLeft": case "ArrowUp": next = (index + options.length - 1) % options.length; break;
          case "Home": next = 0; break;
          case "End": next = options.length - 1; break;
          default: return;
        }
        event.preventDefault();
        if (disabled) return;
        (group.current?.children[next] as HTMLElement | undefined)?.focus({ preventScroll: true });
        if (value !== options[next].value) onChange(options[next].value);
      }}>{option.label}</button>)}
  </div>;
}

export const offOnOptions = [
  { value: "off", label: "关闭" },
  { value: "on", label: "开启" },
] as const;
