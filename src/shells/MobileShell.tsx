import { ChevronLeft, Folder, LayoutGrid, List, MoreHorizontal, Settings } from "lucide-react";
import type { CollectionView } from "../presentation/model";
import IconButton from "../editor-menus/IconButton";
/** Mobile collection header owns compact navigation and collection controls;
 * the content/editor remains in WorkspaceShell's permanent sibling slots. */
export default function MobileShell({ view, choose, title, back, folders, settings, options }: {
  view: CollectionView; choose(view: CollectionView): void; title: string; back?: () => void;
  folders(): void; settings(): void; options(): void;
}) {
  return <>
    {back && <button className="back-button" aria-label="返回全部笔记" onClick={back}><ChevronLeft /></button>}
    <h1 className="notes-large-title" title={title}>{title}</h1>
    <div className="mobile-home-actions">
      <button type="button" className="mobile-collection-choice" aria-label={view === "gallery" ? "切换为手机列表" : "切换为手机画廊"}
    onClick={() => choose(view === "gallery" ? "list" : "gallery")}>
        {view === "gallery" ? <List aria-hidden="true" /> : <LayoutGrid aria-hidden="true" />}
      </button>
      <IconButton label="显示选项" onClick={options}><MoreHorizontal /></IconButton>
      <IconButton label="文件夹" onClick={folders}><Folder /></IconButton>
      <IconButton label="设置" className="mobile-home-settings" onClick={settings}><Settings /></IconButton>
    </div>
  </>;
}
