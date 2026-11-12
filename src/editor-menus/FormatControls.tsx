import { useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Check,
  List,
  ListMinus,
  ListOrdered,
  IndentDecrease,
  IndentIncrease,
  Quote,
  X,
} from "lucide-react";
import { MenuItem as MenuRow } from "../Menu";
import IconButton from "./IconButton";
import { executeEditorCommand } from "./editor-commands";
export default function FormatControls({
  editor,
  mobile,
  run,
  onClose,
}: {
  editor: Editor | null;
  mobile: boolean;
  run: (command: (editor: Editor) => unknown) => void;
  onClose: () => void;
}) {
  const [colors, setColors] = useState(false);
  const marks = [
    {
      label: "粗体",
      mark: "bold",
      icon: <Bold />,
      command: (e: Editor) => executeEditorCommand(e, "bold"),
    },
    {
      label: "斜体",
      mark: "italic",
      icon: <Italic />,
      command: (e: Editor) => executeEditorCommand(e, "italic"),
    },
    {
      label: "下划线",
      mark: "underline",
      icon: <Underline />,
      command: (e: Editor) => executeEditorCommand(e, "underline"),
    },
    {
      label: "删除线",
      mark: "strike",
      icon: <Strikethrough />,
      command: (e: Editor) => executeEditorCommand(e, "strikethrough"),
    },
  ];
  const markRow = (
    <div className="format-mark-row">
      <div className="format-control-group">
        {marks.map((x) => (
          <IconButton
            key={x.mark}
            label={x.label}
            active={editor?.isActive(x.mark)}
            onClick={() => run(x.command)}
          >
            {x.icon}
          </IconButton>
        ))}
      </div>
      <div className="format-control-group format-color-group">
        <IconButton
          label="高亮"
          active={editor?.isActive("highlight")}
          onClick={() =>
            run((e) => e.commands.toggleHighlight({ color: "#e8c1f0" }))
          }
        >
          <Highlighter />
        </IconButton>
        <button
          className="format-color"
          aria-label="选择高亮颜色"
          aria-expanded={colors}
          onClick={() => setColors(!colors)}
        >
          <span />
        </button>
      </div>
    </div>
  );
  const styles = (
    <div className="type-styles">
      {[
        { label: "标题", level: 1 },
        { label: "小标题", level: 2 },
        { label: "副标题", level: 3 },
        { label: "正文", level: 0 },
        { label: "等宽样式", level: -1 },
      ].map(({ label, level }) => {
        const active =
          level > 0
            ? editor?.isActive("heading", { level })
            : editor?.isActive(level === 0 ? "paragraph" : "codeBlock");
        return (
          <button
            key={label}
            className={`format-style style-${level} ${active ? "selected" : ""}`}
            aria-pressed={!!active}
            onClick={() =>
              run((e) =>
                level > 0
                  ? e.commands.setHeading({ level: level as 1 | 2 | 3 })
                  : level === 0
                    ? e.commands.setParagraph()
                    : e.commands.toggleCodeBlock(),
              )
            }
          >
            {label}
            {!mobile && active && <Check size={16} />}
          </button>
        );
      })}
    </div>
  );
  const lists = [
    {
      label: "项目符号列表",
      icon: <List />,
      active: editor?.isActive("bulletList", { listStyle: "bullet" }),
      command: (e: Editor) => executeEditorCommand(e, "listBullet"),
    },
    {
      label: "短划线列表",
      icon: <ListMinus />,
      active: editor?.isActive("bulletList", { listStyle: "dash" }),
      command: (e: Editor) => executeEditorCommand(e, "listDash"),
    },
    {
      label: "编号列表",
      icon: <ListOrdered />,
      active: editor?.isActive("orderedList"),
      command: (e: Editor) => executeEditorCommand(e, "listNumber"),
    },
  ];
  const indent = (e: Editor, inward: boolean) =>
    inward
      ? e.commands.sinkListItem(
          e.isActive("taskItem") ? "taskItem" : "listItem",
        )
      : e.commands.liftListItem(
          e.isActive("taskItem") ? "taskItem" : "listItem",
        );
  return (
    <div className="format-content">
      {mobile && (
        <div className="format-panel-header">
          <strong>格式</strong>
          <button aria-label="关闭格式" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      )}
      {!mobile && markRow}
      {styles}
      {mobile && markRow}
      {colors && (
        <div className="highlight-colors">
          {["#e8c1f0", "#f6bfd4", "#fac69c", "#fae780", "#b3dfbd"].map(
            (color) => (
              <button
                key={color}
                aria-label={`高亮 ${color}`}
                style={{ background: color }}
                onClick={() =>
                  run((e) => e.commands.toggleHighlight({ color }))
                }
              />
            ),
          )}
        </div>
      )}
      <div className="format-list-row">
        <div className="format-control-group">
          {lists.map((x) =>
            mobile ? (
              <IconButton
                key={x.label}
                label={x.label}
                active={x.active}
                onClick={() => run(x.command)}
              >
                {x.icon}
              </IconButton>
            ) : (
              <MenuRow
                key={x.label}
                icon={x.icon}
                checked={x.active}
                onClick={() => run(x.command)}
              >
                {x.label}
              </MenuRow>
            ),
          )}
        </div>
        <div className="format-control-group format-indent-group">
          <IconButton
            label="减少缩进"
            onClick={() => run((e) => indent(e, false))}
          >
            <IndentDecrease />
          </IconButton>
          <IconButton
            label="增加缩进"
            onClick={() => run((e) => indent(e, true))}
          >
            <IndentIncrease />
          </IconButton>
        </div>
        {mobile ? (
          <IconButton
            label="块引用"
            active={editor?.isActive("blockquote")}
            onClick={() => run((e) => executeEditorCommand(e, "blockquote"))}
          >
            <Quote />
          </IconButton>
        ) : (
          <MenuRow
            icon={<Quote />}
            checked={editor?.isActive("blockquote")}
            onClick={() => run((e) => executeEditorCommand(e, "blockquote"))}
          >
            块引用
          </MenuRow>
        )}
      </div>
    </div>
  );
}
