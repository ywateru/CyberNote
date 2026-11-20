import type { Editor } from "@tiptap/core";
import { useLayoutEffect, type RefObject } from "react";
import {
  Table,
  Camera,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Image,
  Lock,
  NotebookPen,
  Paperclip,
  PenTool,
  Pin,
  PinOff,
  ScanLine,
  ScanText,
  Search,
  Settings as SettingsIcon,
  Share,
  SquarePen,
  Trash2,
  Undo2,
  Volume2,
  List,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import type { Folder as FolderData, Note, Settings } from "../types";
import { MenuSurface, MenuSubmenu, MenuItem as MenuRow } from "../Menu";
import { isPhysicalOwner } from "../smart-folders";
import { canConvertTextToTable } from "../editor-actions";
import { readNoteText } from "../bridge";
import { executeEditorCommand } from "./editor-commands";
import FormatControls from "./FormatControls";

type Modal = (type: string, value?: string) => void;
type MediaProps = {
  locked: boolean;
  attach(accept?: string): void;
  camera(): void;
  record(): void;
  ocr(): void;
  draw(): void;
  notice(text: string): void;
  fail(error: unknown): void;
  close(): void;
};
type TableProps = { editor: Editor | null; mobile: boolean; close(): void };
type NoteProps = {
  selected: Note | undefined;
  folders: FolderData[];
  unlocked: Set<string>;
  mobile: boolean;
  menu: string;
  patch(action: Record<string, unknown>): Promise<void>;
  modal: Modal;
  separate(note: Note): void;
  find(): void;
  attachments(): void;
  flush(): Promise<void>;
  notice(text: string): void;
  fail(error: unknown): void;
  share(): void;
  deleted(): void;
  close(): void;
};
type ViewProps = {
  attachmentBrowser: boolean;
  view: "list" | "gallery";
  sort: Settings["sort"];
  settings: Settings;
  mobile: boolean;
  separate: boolean;
  chooseView(view: "list" | "gallery"): void;
  attachments(): void;
  update(patch: Settings): void;
  modal: Modal;
  close(): void;
};
type FolderProps = { folder: FolderData | undefined; modal: Modal };
type AppProps = {
  archiveBusy: boolean;
  recording: boolean;
  archive(mode: "export" | "import"): void;
  modal: Modal;
};
export type AppMenusProps = {
  surface: {
    menu: string | null;
    mobile: boolean;
    target: string | null;
    revision?: number;
    element: RefObject<HTMLDivElement | null>;
    point: { x: number; y: number } | null;
    layoutKey: string;
    close(format: boolean): void;
    action(): void;
  };
  format: {
    editor: Editor | null;
    run(command: (editor: Editor) => unknown): void;
    close(): void;
  };
  media: MediaProps;
  table: TableProps;
  note: NoteProps;
  view: ViewProps;
  folder: FolderProps;
  app: AppProps;
};

function MediaMenu({
  locked,
  attach,
  camera,
  record,
  ocr,
  draw,
  notice,
  fail,
  close,
}: MediaProps) {
  return (
    <>
      <MenuRow
        disabled={locked}
        icon={<FileText size={19} />}
        onClick={() => {
          attach("");
          close();
        }}
      >
        附加文件
      </MenuRow>
      <MenuRow
        disabled={locked}
        icon={<Volume2 size={19} />}
        onClick={() => {
          try {
            record();
          } catch (error) {
            fail(error);
          }
        }}
      >
        录音
      </MenuRow>
      <div className="menu-divider" />
      <MenuRow
        disabled={locked}
        icon={<Image size={19} />}
        onClick={() => {
          attach("image/*,video/*");
          close();
        }}
      >
        选取照片或视频
      </MenuRow>
      <MenuRow
        disabled={locked}
        icon={<Camera size={19} />}
        onClick={() => {
          camera();
          close();
        }}
      >
        拍照或录像
      </MenuRow>
      <MenuRow
        disabled={locked}
        icon={<ScanLine size={19} />}
        onClick={() => {
          close();
          notice("当前可拍摄并插入文稿照片；自动裁边与扫描归档尚待实现。");
          camera();
        }}
      >
        扫描文稿
      </MenuRow>
      <MenuRow
        disabled={locked}
        icon={<ScanText size={19} />}
        onClick={() => {
          close();
          try {
            ocr();
          } catch (error) {
            fail(error);
          }
        }}
      >
        扫描文本
      </MenuRow>
      <div className="menu-divider" />
      <MenuRow
        disabled={locked}
        icon={<PenTool size={19} />}
        onClick={() => {
          close();
          draw();
        }}
      >
        添加绘画
      </MenuRow>
    </>
  );
}

function TableMenu({ editor, mobile, close }: TableProps) {
  return (
    <>
      {!editor?.isActive("table") ? (
        <MenuRow
          icon={<Table size={18} />}
          disabled={!canConvertTextToTable(editor)}
          onClick={() => {
            if (
              editor &&
              executeEditorCommand(editor, "convertTextToTable") &&
              !mobile
            )
              editor.commands.focus();
            close();
          }}
        >
          将所选文字转换为表格
        </MenuRow>
      ) : (
        <>
          <MenuRow
            onClick={() => {
              if (editor) {
                executeEditorCommand(editor, "convertTableToText");
                if (!mobile) editor.commands.focus();
              }
              close();
            }}
          >
            转换为文本
          </MenuRow>
          <div className="menu-divider" />
          <MenuRow onClick={() => editor?.chain().focus().addRowAfter().run()}>
            在下面添加行
          </MenuRow>
          <MenuRow onClick={() => editor?.chain().focus().addRowBefore().run()}>
            在上面添加行
          </MenuRow>
          <MenuRow
            onClick={() => editor?.chain().focus().addColumnAfter().run()}
          >
            在后面添加列
          </MenuRow>
          <MenuRow
            onClick={() => editor?.chain().focus().addColumnBefore().run()}
          >
            在前面添加列
          </MenuRow>
          <div className="menu-divider" />
          <MenuRow
            danger
            onClick={() => editor?.chain().focus().deleteRow().run()}
          >
            删除行
          </MenuRow>
          <MenuRow
            danger
            onClick={() => editor?.chain().focus().deleteColumn().run()}
          >
            删除列
          </MenuRow>
          <MenuRow
            danger
            onClick={() => {
              editor?.chain().focus().deleteTable().run();
              close();
            }}
          >
            删除表格
          </MenuRow>
        </>
      )}
    </>
  );
}

function NoteMenu({
  selected: n,
  folders,
  unlocked,
  mobile,
  menu,
  patch,
  modal,
  separate,
  find,
  attachments,
  flush,
  notice,
  fail,
  share,
  deleted,
  close,
}: NoteProps) {
  if (!n) return null;
  return (
    <>
      {n.deletedAt ? (
        <>
          <MenuRow
            icon={<Undo2 size={18} />}
            onClick={() => patch({ type: "restoreNote", id: n.id })}
          >
            恢复
          </MenuRow>
          <MenuRow
            danger
            icon={<Trash2 size={18} />}
            onClick={() => modal("purge")}
          >
            永久删除
          </MenuRow>
        </>
      ) : (
        <>
          <MenuRow
            icon={n.pinned ? <PinOff size={19} /> : <Pin size={19} />}
            onClick={() =>
              patch({ type: "patchNote", id: n.id, pinned: !n.pinned })
            }
          >
            {n.pinned ? "取消置顶" : "置顶"}
          </MenuRow>
          <MenuRow
            icon={<Lock size={19} />}
            onClick={() =>
              n.locked
                ? unlocked.has(n.id)
                  ? patch({ type: "removeLock", id: n.id })
                  : modal("unlock")
                : modal("lock")
            }
          >
            {n.locked ? "移除锁定" : "锁定"}
          </MenuRow>
          {!mobile && (
            <MenuRow
              icon={<NotebookPen size={19} />}
              onClick={() => {
                close();
                separate(n);
              }}
            >
              单独打开
            </MenuRow>
          )}
          <div className="menu-divider" />
          <MenuRow
            icon={<Search size={18} />}
            onClick={() => {
              find();
              close();
            }}
          >
            在备忘录中查找
          </MenuRow>
          <MenuSubmenu
            label="移动到"
            icon={<Folder size={18} />}
            defaultOpen={menu === "move"}
          >
            {folders.filter(isPhysicalOwner).map((folder) => (
              <MenuRow
                key={folder.id}
                icon={<Folder size={18} />}
                checked={folder.id === n.folderId}
                disabled={folder.id === n.folderId}
                onClick={() => {
                  void patch({
                    type: "patchNote",
                    id: n.id,
                    folderId: folder.id,
                  });
                }}
              >
                {folder.name}
              </MenuRow>
            ))}
          </MenuSubmenu>
          <MenuRow icon={<Grid2X2 size={18} />} onClick={attachments}>
            附件视图
          </MenuRow>
          <MenuRow
            icon={<Copy size={18} />}
            onClick={() => {
              flush()
                .then(() => readNoteText(n.id))
                .then((data) => navigator.clipboard.writeText(data.text))
                .then(() => notice("已复制"))
                .catch(fail);
              close();
            }}
          >
            拷贝备忘录
          </MenuRow>
          <MenuRow icon={<Share size={18} />} onClick={share}>
            发送副本
          </MenuRow>
          <div className="menu-divider" />
          <MenuRow
            danger
            icon={<Trash2 size={18} />}
            onClick={async () => {
              await patch({ type: "deleteNote", id: n.id });
              deleted();
            }}
          >
            删除
          </MenuRow>
        </>
      )}
    </>
  );
}

function ViewMenu({
  attachmentBrowser,
  view,
  sort,
  settings,
  mobile,
  separate,
  chooseView,
  attachments,
  update,
  modal,
  close,
}: ViewProps) {
  return (
    <>
      <MenuRow
        icon={<List size={18} />}
        checked={!attachmentBrowser && view === "list"}
        onClick={() => {
          chooseView("list");
          close();
        }}
      >
        列表
      </MenuRow>
      <MenuRow
        icon={<Grid2X2 size={18} />}
        checked={!attachmentBrowser && view === "gallery"}
        onClick={() => {
          chooseView("gallery");
          close();
        }}
      >
        画廊
      </MenuRow>
      <div className="menu-divider" />
      {!separate && (
        <MenuRow
          icon={<Paperclip size={18} />}
          checked={attachmentBrowser}
          onClick={attachments}
        >
          查看附件
        </MenuRow>
      )}
      {[
        { key: "updated", text: "按编辑日期排序" },
        { key: "created", text: "按创建日期排序" },
        { key: "title", text: "按标题排序" },
      ].map((s) => (
        <MenuRow
          key={s.key}
          checked={sort === s.key}
          onClick={() => {
            update({ sort: s.key as Settings["sort"] });
            close();
          }}
        >
          {s.text}
        </MenuRow>
      ))}
      <MenuRow
        checked={settings.groupDates !== false}
        onClick={() => {
          update({ groupDates: settings.groupDates === false });
          close();
        }}
      >
        按日期分组
      </MenuRow>
      {!mobile && <>
        <div className="menu-divider" />
        <MenuRow icon={<SettingsIcon size={18} />} onClick={() => modal("data")}>
          数据管理
        </MenuRow>
        <MenuRow
          icon={<SettingsIcon size={18} />}
          onClick={() => modal("settings")}
        >
          设置
        </MenuRow>
      </>}
    </>
  );
}

function FolderMenu({ folder, modal }: FolderProps) {
  return (
    <>
      <MenuRow
        icon={<SquarePen size={18} />}
        onClick={() => modal("renameFolder", folder?.name)}
      >
        {folder?.kind === "smart" ? "编辑智能文件夹" : "重新命名"}
      </MenuRow>
      <MenuRow
        icon={<FolderPlus size={18} />}
        onClick={() => modal("newFolder")}
      >
        新建文件夹
      </MenuRow>
      <MenuRow
        danger
        icon={<Trash2 size={18} />}
        onClick={() =>
          modal(folder?.kind === "smart" ? "deleteSmartFolder" : "deleteFolder")
        }
      >
        删除文件夹
      </MenuRow>
    </>
  );
}

function ApplicationMenu({ archiveBusy, recording, archive, modal }: AppProps) {
  return (
    <>
      <MenuRow
        icon={<FolderPlus size={18} />}
        onClick={() => modal("newFolder")}
      >
        新建文件夹
      </MenuRow>
      <MenuRow
        icon={<ArrowDownToLine size={18} />}
        disabled={archiveBusy || recording}
        onClick={() => archive("export")}
      >
        导出本地备份
      </MenuRow>
      <MenuRow
        icon={<ArrowUpFromLine size={18} />}
        disabled={archiveBusy || recording}
        onClick={() => archive("import")}
      >
        导入本地备份
      </MenuRow>
      <MenuRow icon={<SettingsIcon size={18} />} onClick={() => modal("data")}>
        数据管理
      </MenuRow>
      <MenuRow
        icon={<SettingsIcon size={18} />}
        onClick={() => modal("settings")}
      >
        设置
      </MenuRow>
    </>
  );
}

/** Menu contents own grouping, rendering and local commands. Session owns
 * visibility/bookmarks; injected domain actions retain business admission. */
export default function AppMenus(props: AppMenusProps) {
  const { surface, format } = props,
    { menu, mobile } = surface;
  useLayoutEffect(() => {
    if (mobile || menu !== "note") return;
    const element = surface.element.current;
    if (!element) return;
    const place = () => {
      const margin = 8;
      const target = document.querySelector<HTMLElement>(
        `.note-row[data-note-id="${CSS.escape(surface.target || "")}"]`,
      );
      const rect = target?.getBoundingClientRect();
      const point = surface.point || {
        x: rect ? Math.max(margin, rect.left + 16) : margin,
        y: rect ? Math.max(margin, rect.top + Math.min(rect.height, 32)) : 52,
      };
      element.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`;
      element.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`;
      const menuRect = element.getBoundingClientRect();
      element.style.left = `${Math.max(margin, Math.min(point.x, window.innerWidth - menuRect.width - margin))}px`;
      element.style.top = `${Math.max(margin, Math.min(point.y, window.innerHeight - menuRect.height - margin))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      for (const property of ["left", "top", "max-width", "max-height"])
        element.style.removeProperty(property);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [
    mobile,
    menu,
    surface.point,
    surface.target,
    surface.layoutKey,
    surface.element,
  ]);
  if (!menu) return null;
  return (
    <MenuSurface
      key={`${menu}:${surface.target}:${menu === "format" ? "" : surface.revision}`}
      onClose={() => surface.close(menu === "format")}
      autoFocus={menu !== "format"}
      dismissOnOutside={!(mobile && menu === "format")}
      onAction={surface.action}
      ref={surface.element}
      className={`popover menu-${menu === "move" ? "note" : menu} ${mobile && menu === "format" ? "mobile-format-panel" : ""}`}
      role={menu === "format" && mobile ? "dialog" : "menu"}
      aria-label={menu === "format" ? "格式" : undefined}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          event.preventDefault();
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          event.preventDefault();
      }}
    >
      {menu === "format" && (
        <FormatControls
          editor={format.editor}
          mobile={mobile}
          run={format.run}
          onClose={format.close}
        />
      )}
      {menu === "media" && <MediaMenu {...props.media} />}
      {menu === "table" && <TableMenu {...props.table} />}
      {["more", "note", "move"].includes(menu) && (
        <NoteMenu {...props.note} menu={menu} />
      )}
      {menu === "view" && <ViewMenu {...props.view} />}
      {menu === "folder" && <FolderMenu {...props.folder} />}
      {menu === "app" && <ApplicationMenu {...props.app} />}
    </MenuSurface>
  );
}
