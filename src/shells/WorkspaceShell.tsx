import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import type { ResolvedPresentation } from "../presentation/resolver";
import DesktopShell from "./DesktopShell";
import "./shells.css";

/** One permanent host for both modes. Changing chrome never reparents an
 * Editor child: its slot and React ancestry are identical at every breakpoint. */
export default function WorkspaceShell({ resolved, rootRef, routeKey, blocked, focus, exitFocus, children, ...props }: ComponentProps<"div"> & {
  resolved: ResolvedPresentation; rootRef: RefObject<HTMLDivElement | null>; routeKey: string; blocked: boolean;
  focus(): void; exitFocus(): void;
}) {
  const [drawer, setDrawer] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => { setDrawer(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => { if (drawer) closeDrawer(); }, [routeKey, resolved.effectiveNavigation, resolved.interactionMode]);
  useEffect(() => {
    if (!drawer || blocked) return;
    const region = rootRef.current?.querySelector<HTMLElement>(".sidebar");
    const nodes = () => [...region?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []].filter(e => e.getClientRects().length > 0 && !e.closest("[inert],[hidden]"));
    nodes()[0]?.focus({ preventScroll: true });
    const keyboard = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeDrawer(); }
      if (e.key === "Tab") {
        const items = nodes(), first = items[0], last = items.at(-1);
        if (e.shiftKey && (document.activeElement === first || !region?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !region?.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [drawer, blocked, rootRef]);
  return <div {...props} ref={rootRef}
    data-presentation={resolved.effectiveNavigation} data-density={resolved.density}
    data-collection={resolved.collectionView} data-drawer={drawer && !blocked ? "open" : "closed"}
    style={{ ...props.style, "--presentation-spacing": resolved.spacingScale, "--presentation-columns": resolved.effectiveColumns } as React.CSSProperties}>
    <DesktopShell resolved={resolved} blocked={blocked} drawer={drawer} trigger={trigger}
      toggleDrawer={() => drawer ? closeDrawer() : setDrawer(true)} focus={focus} exitFocus={exitFocus} />
    {drawer && !blocked && <button className="directory-scrim" aria-label="关闭文件夹抽屉" onClick={closeDrawer} />}
    {children}
  </div>;
}
