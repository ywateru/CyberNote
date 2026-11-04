import type { Editor } from "@tiptap/react";
import type { Note, Settings } from "./types";
import type {
  ToolbarState,
  MenuEntry,
  MenuCommand,
  Action,
} from "./native-toolbar";

const item = (
  command: MenuCommand,
  label: string,
  enabled = true,
  selected = false,
): MenuEntry => ({ kind: "item", command, label, enabled, selected });
const separator: MenuEntry = { kind: "separator" };
export function toolbarState(input: {
  layout: ToolbarState["layout"];
  sidebar: boolean;
  settings: Settings;
  folderTitle: string;
  folderCount: number;
  query: string;
  searchAck: number;
  available: boolean;
  editable: boolean;
  current?: Note;
  editor: Editor | null;
}): Omit<ToolbarState, "revision"> {
  const {
    layout,
    sidebar,
    settings,
    folderTitle,
    folderCount,
    query,
    searchAck,
    available,
    editable,
    current,
    editor,
  } = input;
  const active = (name: string, attrs?: Record<string, unknown>) =>
    editable && !!editor?.isActive(name, attrs);
  const action = (action: Action, enabled = available, selected = false) => ({
    action,
    enabled,
    selected,
  });
  const browsing = layout === "galleryBrowse",
    independent = layout === "independentNote";
  const actions = [
    ...(!independent
      ? [
          action("newFolder"),
          action("toggleSidebar", available, sidebar),
          ...(layout !== "galleryExpanded" ? [action("viewOptions")] : []),
        ]
      : []),
    ...(layout === "galleryExpanded" ? [action("backToGallery")] : []),
    action("newNote"),
    ...(!browsing
      ? [
          action("format", editable),
          action("checklist", editable, active("taskList")),
          action("table", editable, active("table")),
          action("attachment", editable),
          action("share", editable),
          action("more", available && !!current && !current.deletedAt),
        ]
      : []),
  ];
  const viewItems: MenuEntry[] = [
    item(
      settings.view === "gallery" ? "viewList" : "viewGallery",
      settings.view === "gallery" ? "列表视图" : "画廊视图",
      available,
    ),
    separator,
    {
      kind: "submenu",
      label: "排序方式",
      items: [
        item("sortDefault", "默认（编辑日期）", available, !settings.sort),
        separator,
        item(
          "sortModified",
          "编辑日期",
          available,
          settings.sort === "updated",
        ),
        item("sortCreated", "创建日期", available, settings.sort === "created"),
        item("sortTitle", "标题", available, settings.sort === "title"),
      ],
    },
    item("groupByDate", "按日期分组", available, settings.groupDates !== false),
    separator,
    item("viewAttachments", "查看附件", false),
  ];
  const format: MenuEntry[] = [
    item("bold", "粗体", editable, active("bold")),
    item("italic", "斜体", editable, active("italic")),
    item("underline", "下划线", editable, active("underline")),
    item("strikethrough", "删除线", editable, active("strike")),
    item("highlight", "高亮", editable, active("highlight")),
    {
      kind: "submenu",
      label: "颜色",
      items: [
        item("colorDefault", "无高亮", editable, !active("highlight")),
        ...(
          [
            ["colorPurple", "紫色", "#e8c1f0"],
            ["colorPink", "粉色", "#f6bfd4"],
            ["colorOrange", "橙色", "#fac69c"],
            ["colorMint", "薄荷色", "#b3dfbd"],
            ["colorBlue", "蓝色", "#bad6f3"],
          ] as const
        ).map(([command, label, color]) =>
          item(command, label, editable, active("highlight", { color })),
        ),
      ],
    },
    separator,
    item("styleTitle", "标题", editable, active("heading", { level: 1 })),
    item("styleHeading", "小标题", editable, active("heading", { level: 2 })),
    item(
      "styleSubheading",
      "副标题",
      editable,
      active("heading", { level: 3 }),
    ),
    item("styleBody", "正文", editable, active("paragraph")),
    item("styleMonospaced", "等宽样式", editable, active("codeBlock")),
    item(
      "listBullet",
      "项目符号列表",
      editable,
      active("bulletList", { listStyle: "bullet" }),
    ),
    item(
      "listDash",
      "短划线列表",
      editable,
      active("bulletList", { listStyle: "dash" }),
    ),
    item("listNumber", "编号列表", editable, active("orderedList")),
    separator,
    item("blockquote", "块引用", editable, active("blockquote")),
  ];
  const menus: ToolbarState["menus"] = [
    ...(!independent && layout !== "galleryExpanded"
      ? [{ owner: "viewOptions" as const, items: viewItems }]
      : []),
    ...(!browsing
      ? [
          { owner: "format" as const, items: format },
          ...(active("table")
            ? [
                {
                  owner: "table" as const,
                  items: [item("convertTableToText", "转换为文本", editable)],
                },
              ]
            : []),
          {
            owner: "attachment" as const,
            items: [
              item("choosePhotoVideo", "选取照片或视频…", editable),
              item("recordAudio", "录音", editable),
              item("attachFile", "附加文件…", editable),
              item("recognizeImageText", "从图片识别文本…", editable),
              separator,
              item("takePhoto", "拍照", false),
              item("scanDocument", "扫描文稿", false),
              item("addSketch", "添加速绘", false),
            ],
          },
          {
            owner: "more" as const,
            items: [
              item(
                "pinNote",
                current?.pinned ? "取消置顶备忘录" : "置顶备忘录",
                editable,
                !!current?.pinned,
              ),
              item(
                "lockNote",
                current?.locked ? "移除锁定" : "锁定备忘录",
                editable,
              ),
              separator,
              item("findInNote", "在备忘录中查找", editable),
              item("moveNote", "移到…", editable),
              item("recentNotes", "最近备忘录", false),
              {
                kind: "submenu" as const,
                label: "数学结果",
                items: [
                  item("mathInsert", "插入结果", false),
                  item("mathSuggest", "建议结果", false),
                  item("mathOff", "关", false),
                ],
              },
              {
                kind: "submenu" as const,
                label: "附件视图",
                items: [
                  item("attachmentsSmall", "全部设为小尺寸", false),
                  item("attachmentsLarge", "全部设为大尺寸", false),
                ],
              },
              separator,
              item("deleteNote", "删除备忘录", editable),
            ],
          },
        ]
      : []),
  ];
  return {
    layout,
    columns: {
      sidebarVisible: sidebar && !independent,
      sidebarWidth: settings.sidebarWidth || 228,
      listWidth: settings.listWidth || 280,
    },
    folderTitle,
    folderCount,
    tableFocused: active("table"),
    actions,
    menus,
    search: independent
      ? null
      : { enabled: available, value: query, acknowledgedEvent: searchAck },
    glassStyle: "regular",
  };
}
