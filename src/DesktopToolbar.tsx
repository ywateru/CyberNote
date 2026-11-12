import { MenuSurface, MenuItem } from "./Menu";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  desktopToolbarLayout,
  type DesktopTool,
} from "./desktop-toolbar-layout";
export type DesktopToolbarAction = {
  id: DesktopTool;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
};
export default function DesktopToolbar({
  scale,
  actions,
  search,
  settings,
  hitScale = 1,
  iconScale = 1,
}: {
  scale: number;
  actions: DesktopToolbarAction[];
  search: ReactNode;
  settings: ReactNode;
  hitScale?: number;
  iconScale?: number;
}) {
  const root = useRef<HTMLDivElement>(null),
    popup = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = root.current!;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = desktopToolbarLayout(
    width,
    scale,
    actions.map((action) => action.id),
    true, hitScale, iconScale,
  );
  return (
    <div className="desktop-toolbar" ref={root} data-labels={layout.labels}>
      <div className="desktop-toolbar-actions">
        {actions
          .filter((action) => layout.visible.includes(action.id))
          .map((action) => (
            <button
              key={action.id}
              type="button"
              className={`desktop-tool ${action.active ? "active" : ""} ${action.id === "share" ? "share-start" : ""}`}
              aria-label={action.label}
              title={action.label}
              aria-pressed={action.active}
              aria-expanded={action.expanded}
              aria-haspopup={action.expanded !== undefined ? "menu" : undefined}
              disabled={action.disabled}
              style={{ width: layout.widths[action.id] }}
              onClick={action.onClick}
            >
              {action.id === "format" ? <span>格式</span> : action.icon}
            </button>
          ))}
        {layout.overflow.length > 0 && (
          <div className="desktop-tool-overflow">
            <button
              ref={popup}
              type="button"
              className="desktop-tool"
              aria-label="其他工具"
              title="其他工具"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <MoreHorizontal />
            </button>
            {open && (
              <MenuSurface
                onClose={() => setOpen(false)}
                anchor={popup.current}
                returnFocus={popup.current}
                role="menu"
                aria-label="其他工具"
                className="desktop-tool-menu"
              >
                {actions
                  .filter((action) => layout.overflow.includes(action.id))
                  .map((action) => (
                    <MenuItem
                      type="button"
                      role="menuitem"
                      key={action.id}
                      disabled={action.disabled}
                      onClick={() => {
                        setOpen(false);
                        action.onClick();
                      }}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </MenuItem>
                  ))}
              </MenuSurface>
            )}
          </div>
        )}
      </div>
      <div className="desktop-search" style={{ width: layout.searchWidth }}>
        {search}
      </div>
      {settings}
    </div>
  );
}
