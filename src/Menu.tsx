import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import "./Menu.css";
import { presentNativeMenu } from "./native-menu";
export const NativeMenuContext = createContext(false);

type MenuLayer = { element: HTMLElement; close: (restore: boolean) => void };
const menuLayers: MenuLayer[] = [];
function deepestMenu(menuOnly = false): MenuLayer | undefined {
  const layers = menuLayers.filter(layer =>
    layer.element.isConnected &&
    !layer.element.closest("[hidden]") &&
    (!menuOnly || layer.element.getAttribute("role") === "menu"),
  );
  let top = layers.at(-1);
  // A parent layout effect can run after its inline submenu's effect.
  // Actual containment determines the innermost layer in that case.
  while (top) {
    const parent = top;
    const child = layers.find(layer => layer !== parent && parent.element.contains(layer.element));
    if (!child) break;
    top = child;
  }
  return top;
}
/** Android Back has no DOM key event. Use the same visible layer ownership as
 * Escape, so a submenu/ordinary menu does not close a persistent format panel. */
export function dismissInnermostMenu(): boolean {
  // Format uses MenuSurface for material/placement but is a dialog. Its Back
  // transition belongs to the session, including the explicit close reason.
  const layer = deepestMenu(true);
  if (!layer) return false;
  layer.close(true);
  return true;
}

type MenuProps = Omit<ComponentProps<"div">, "onClose"> & {
  onClose: (restoreFocus: boolean) => void;
  onAction?: () => void;
  point?: { x: number; y: number };
  anchor?: HTMLElement | null;
  topInset?: number;
  autoFocus?: boolean;
  dismissOnOutside?: boolean;
  inline?: boolean;
  returnFocus?: HTMLElement | null;
  ref?: Ref<HTMLDivElement>;
};
/** Shared material, placement and keyboard/outside-click behavior for all menus.
 * Actions retain their own editor ownership and authorization checks. */
export function MenuSurface({
  onClose,
  onAction,
  point,
  anchor,
  topInset = 0,
  autoFocus = true,
  dismissOnOutside = true,
  inline = false,
  returnFocus,
  ref,
  className = "",
  children,
  role = "menu",
  ...props
}: MenuProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const nativeMenus = useContext(NativeMenuContext);
  const [fallback, setFallback] = useState(false);
  const native = nativeMenus && role === "menu" && autoFocus && !fallback;
  const current = useRef({ onClose, point, anchor, topInset });
  current.current = { onClose, point, anchor, topInset };
  useLayoutEffect(() => {
    const element = root.current!;
    if (props.hidden) return;
    const previous =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    const buttons = () => [
      ...element.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled):not([aria-disabled="true"])',
      ),
    ].filter(button => button.closest('[role="menu"]') === element);
    const place = () => {
      const { point, anchor, topInset } = current.current;
      if (!point && !anchor) return;
      const bounds = anchor?.getBoundingClientRect();
      const x = point?.x ?? bounds!.left;
      const y = point?.y ?? bounds!.bottom + 5;
      const inset = Math.max(
        topInset,
        parseFloat(
          getComputedStyle(
            element.closest(".app") ?? document.body,
          ).getPropertyValue("--native-top"),
        ) || 0,
      );
      element.style.position = "fixed";
      element.style.left = `${Math.max(8, Math.min(x, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(inset + 8, Math.min(y, innerHeight - element.offsetHeight - 8))}px`;
    };
    place();
    if (!native && autoFocus && role === "menu")
      (buttons()[0] ?? element).focus({ preventScroll: true });
    const close = (restore: boolean) => {
      current.current.onClose(restore);
      if (
        restore &&
        previous?.isConnected &&
        !previous.closest("[hidden], [inert], .access-sync")
      )
        previous.focus({ preventScroll: true });
    };
    const layer = { element, close };
    menuLayers.push(layer);
    const outside = (event: Event) => {
      if (!dismissOnOutside) return;
      if (
        !(event.target instanceof Node) ||
        (!element.contains(event.target) &&
          !current.current.anchor?.contains(event.target))
      )
        close(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || deepestMenu()?.element !== element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (role !== "menu") return;
      if (event.key === "Tab") {
        close(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const all = buttons();
      const index = all.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? all.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + all.length) %
              all.length;
      all[next]?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("contextmenu", outside, true);
    document.addEventListener("keydown", keyboard);
    if (!native) window.addEventListener("blur", outside);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      const index = menuLayers.indexOf(layer);
      if (index >= 0) menuLayers.splice(index, 1);
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("contextmenu", outside, true);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("blur", outside);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [autoFocus, dismissOnOutside, role, returnFocus, native, props.hidden]);
  useLayoutEffect(() => {
    if (!native || !root.current) return;
    const previous =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    return presentNativeMenu(
      root.current,
      (restore) => {
        if (restore) current.current.onClose(true);
        if (
          restore &&
          previous?.isConnected &&
          !previous.closest("[hidden], [inert], .access-sync")
        )
          previous.focus({ preventScroll: true });
      },
      () => setFallback(true),
    );
  }, [native]);
  const surface = (
    <div
      {...props}
      ref={(element) => {
        root.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      role={role}
      data-menu-layer={anchor?.closest(".preferences, .modal-backdrop, .drawing-overlay, .recording-backdrop, .smart-form-backdrop, .ocr-backdrop") ? "modal" : "ordinary"}
      tabIndex={-1}
      className={`popover unified-menu ${native ? "native-menu-surface" : ""} ${className}`}
      onClick={(event) => {
        props.onClick?.(event);
        const item = (event.target as HTMLElement).closest<HTMLElement>(
          '[role="menuitem"]',
        );
        if (
          item &&
          !item.matches(":disabled") &&
          !item.hasAttribute("aria-haspopup")
        )
          (onAction ?? (() => current.current.onClose(false)))();
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          event.preventDefault();
        props.onMouseDown?.(event);
      }}
    >
      {children}
    </div>
  );
  const host = anchor?.closest(".app") ?? document.querySelector(".app");
  return host && role === "menu" && !inline ? createPortal(surface, host) : surface;
}
/** The same surface/rows also describe native submenus, even while collapsed. */
export function MenuSubmenu({ children, label, icon, defaultOpen = false }: { children: ReactNode; label: string; icon?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const parent = trigger.current!.getBoundingClientRect(), menu = surface.current!;
      const inset = parseFloat(getComputedStyle(trigger.current!.closest(".app") ?? document.body).getPropertyValue("--native-top")) || 0;
      menu.style.left = `${Math.max(8, Math.min(parent.right + 3 + menu.offsetWidth > innerWidth ? parent.left - menu.offsetWidth - 3 : parent.right + 3, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(inset + 8, Math.min(parent.top, innerHeight - menu.offsetHeight - 8))}px`;
    };
    place(); window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place); observer.observe(surface.current!); observer.observe(trigger.current!);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  const focusFirst = () => surface.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  return <div data-menu-submenu ref={wrapper}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && !wrapper.current?.contains(document.activeElement)) setOpen(false); }}>
    <MenuItem ref={trigger} icon={icon} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(true)}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setOpen(true); requestAnimationFrame(focusFirst); }
      }}>{label}<ChevronRight className="submenu-chevron" size={16} /></MenuItem>
    <MenuSurface inline ref={surface} hidden={!open} className="submenu-surface" aria-label={label}
      autoFocus={false} dismissOnOutside={false} onClose={() => { setOpen(false); trigger.current?.focus(); }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      }}>{children}</MenuSurface>
  </div>;
}
export function MenuItem({
  children,
  icon,
  checked = false,
  danger = false,
  className = "",
  ...props
}: ComponentProps<"button"> & {
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      role="menuitem"
      data-checked={checked || undefined}
      className={`menu-row ${danger ? "danger" : ""} ${className}`}
    >
      <span className="menu-label">{children}</span>
      {(checked || icon) && (
        <span className="menu-icon">
          {checked ? <Check size={17} /> : icon}
        </span>
      )}
    </button>
  );
}
