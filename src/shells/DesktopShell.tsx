import type { RefObject } from "react";
import { PanelLeft, Maximize2, Minimize2 } from "lucide-react";
import type { ResolvedPresentation } from "../presentation/resolver";

export default function DesktopShell({ resolved: r, blocked, drawer, trigger, toggleDrawer, focus, exitFocus }: {
  resolved: ResolvedPresentation; blocked: boolean; drawer: boolean; trigger: RefObject<HTMLButtonElement | null>;
  toggleDrawer(): void; focus(): void; exitFocus(): void;
}) {
  if (r.interactionMode !== "desktop" || !r.capabilities.temporaryFocus) return null;
  return <nav className="presentation-toolbar" aria-label="工作区布局" inert={blocked}>
    <button ref={trigger} hidden={!r.capabilities.directoryDrawer} type="button" aria-label="打开文件夹抽屉" aria-expanded={drawer}
      onClick={toggleDrawer}><PanelLeft size={16} /><span>文件夹</span></button>
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={r.effectiveNavigation === "focus" ? exitFocus : focus}
      aria-label={r.effectiveNavigation === "focus" ? "退出专注" : "临时专注"}>
      {r.effectiveNavigation === "focus" ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span>{r.effectiveNavigation === "focus" ? "退出专注" : "专注"}</span>
    </button>
  </nav>;
}
