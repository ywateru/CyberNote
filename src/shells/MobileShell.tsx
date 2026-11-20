import { ChevronLeft, Folder, MoreHorizontal } from "lucide-react";
import IconButton from "../editor-menus/IconButton";
/** Mobile collection header owns one navigation entry and one display-options
 * entry. Collection/sort changes live in the menu; settings lives with folders. */
export default function MobileShell({ title, back, folders, options }: {
  title: string; back?: () => void; folders(): void; options(): void;
}) {
  return <>
    {back ? (
      <button className="back-button mobile-collection-back" aria-label="返回全部笔记" onClick={back}>
        <ChevronLeft aria-hidden="true" /><span>笔记</span>
      </button>
    ) : (
      <IconButton label="文件夹" className="mobile-folder-navigation" onClick={folders}><Folder /></IconButton>
    )}
    <h1 className="notes-large-title" title={title}>{title}</h1>
    <div className="mobile-home-actions">
      <IconButton label="显示选项" onClick={options}><MoreHorizontal /></IconButton>
    </div>
  </>;
}
