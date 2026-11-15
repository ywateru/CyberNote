import { MenuSurface, MenuItem } from "./Menu";
import { useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { CellSelection, TableMap, selectedRect } from "@tiptap/pm/tables";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { ChevronDown, MoreHorizontal, MoreVertical } from "lucide-react";

type Axis = "row" | "column";
type Box = { left: number; top: number; width: number; height: number };
type Geometry = {
  cellPos: number;
  tablePos: number;
  table: ProseMirrorNode;
  row: Box;
  column: Box;
  cell: Box;
  rowCount: number;
  columnCount: number;
  viewport: Box;
};

// These controls live outside contenteditable: they never become note content.
// All edits still use ProseMirror's table selection, commands and history.
export default function TableControls({ editor }: { editor: Editor }) {
  const root = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const axis = useRef<Axis | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [selected, setSelected] = useState<Axis | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement | null>(null);
  const menuTarget = useRef<{ pos: number; table: ProseMirrorNode } | null>(
    null,
  );

  useLayoutEffect(() => {
    const host = root.current!.parentElement!;
    // Keep this mounted view for cleanup; editor.view becomes unavailable after destroy.
    const editorView = editor.view;
    let frame = 0;
    const update = () => {
      if (editor.isDestroyed || !editor.isEditable || !active.current) {
        setGeometry(null);
        return;
      }
      const { selection, doc } = editor.state;
      const $cell =
        selection instanceof CellSelection
          ? selection.$anchorCell
          : (() => {
              for (let d = selection.$from.depth; d > 0; d--)
                if (
                  ["cell", "header_cell"].includes(
                    selection.$from.node(d).type.spec.tableRole,
                  )
                )
                  return doc.resolve(selection.$from.before(d));
              return null;
            })();
      if (!$cell) {
        axis.current = null;
        setSelected(null);
        setMenu(false);
        setGeometry(null);
        return;
      }
      if (!(selection instanceof CellSelection)) {
        axis.current = null;
        setSelected(null);
        setMenu(false);
      }
      const table = $cell.node(-1),
        start = $cell.start(-1);
      const map = TableMap.get(table),
        cell = map.findCell($cell.pos - start);
      const tableDOM = editorView.nodeDOM(start - 1) as HTMLElement | null;
      const tableElement = tableDOM?.matches("table")
        ? tableDOM
        : tableDOM?.querySelector("table");
      if (!tableElement) {
        setGeometry(null);
        return;
      }
      if (
        menuTarget.current &&
        (menuTarget.current.pos !== start - 1 ||
          !menuTarget.current.table.eq(table))
      ) {
        menuTarget.current = null;
        setMenu(false);
      }
      const origin = host.getBoundingClientRect();
      const box = (rect: DOMRect): Box => ({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      });
      const cellDOM = editorView.nodeDOM($cell.pos) as HTMLElement | null;
      if (!cellDOM) {
        setGeometry(null);
        return;
      }
      // CellSelection expands around merged cells; its full rectangle is the
      // actual extent that add/delete commands will operate on.
      const range =
        selection instanceof CellSelection
          ? map.rectBetween(
              selection.$anchorCell.pos - start,
              selection.$headCell.pos - start,
            )
          : cell;
      const union = (kind: Axis): Box => {
        const extent = axis.current === kind ? range : cell;
        const offsets = new Set<number>();
        for (
          let r = kind === "row" ? extent.top : 0;
          r < (kind === "row" ? extent.bottom : map.height);
          r++
        )
          for (
            let c = kind === "column" ? extent.left : 0;
            c < (kind === "column" ? extent.right : map.width);
            c++
          )
            offsets.add(map.map[r * map.width + c]);
        const rects = [...offsets].map((pos) =>
          (
            editorView.nodeDOM(start + pos) as HTMLElement
          ).getBoundingClientRect(),
        );
        const left = Math.min(...rects.map((r) => r.left)),
          top = Math.min(...rects.map((r) => r.top));
        return {
          left: left - origin.left,
          top: top - origin.top,
          width: Math.max(...rects.map((r) => r.right)) - left,
          height: Math.max(...rects.map((r) => r.bottom)) - top,
        };
      };
      const wrapper = tableElement.closest(".tableWrapper") ?? tableElement;
      setGeometry({
        cellPos: $cell.pos,
        tablePos: start - 1,
        table,
        row: union("row"),
        column: union("column"),
        cell: box(cellDOM.getBoundingClientRect()),
        rowCount: range.bottom - range.top,
        columnCount: range.right - range.left,
        viewport: box(wrapper.getBoundingClientRect()),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const activate = () => {
      active.current = true;
      schedule();
    };
    const outside = (event: PointerEvent) => {
      if (
        root.current?.contains(event.target as Node) ||
        menuRef.current?.contains(event.target as Node)
      )
        return;
      if (editorView.dom.contains(event.target as Node)) {
        activate();
        return;
      }
      active.current = false;
      axis.current = null;
      setSelected(null);
      setMenu(false);
      setGeometry(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current || menuRef.current) return;
      if (
        !root.current?.contains(event.target as Node) &&
        !editorView.dom.contains(event.target as Node)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setMenu(false);
      if (menuRef.current) arrowRef.current?.focus();
      else {
        axis.current = null;
        setSelected(null);
        editor.commands.setTextSelection(editor.state.selection.from);
        editorView.focus();
      }
    };
    editor.on("transaction", schedule);
    editor.on("focus", activate);
    editor.on("update", schedule);
    editorView.dom.addEventListener("pointerdown", activate);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    observer.observe(editorView.dom);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("transaction", schedule);
      editor.off("focus", activate);
      editor.off("update", schedule);
      editorView.dom.removeEventListener("pointerdown", activate);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [editor]);

  const select = (kind: Axis, anchor: HTMLButtonElement) => {
    if (
      !geometry ||
      !editor.isEditable ||
      !editor.state.doc.nodeAt(geometry.tablePos)?.eq(geometry.table)
    )
      return;
    if (selected === kind && menu) {
      setMenu(false);
      return;
    }
    menuAnchor.current = anchor;
    menuTarget.current = { pos: geometry.tablePos, table: geometry.table };
    const $cell = editor.state.doc.resolve(geometry.cellPos);
    axis.current = kind;
    setSelected(kind);
    setMenu(true);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        kind === "row"
          ? CellSelection.rowSelection($cell)
          : CellSelection.colSelection($cell),
      ),
    );
  };
  const edit = (action: "before" | "after" | "delete") => {
    const target = menuTarget.current;
    if (
      !editor.isEditable ||
      !selected ||
      !target ||
      !editor.state.doc.nodeAt(target.pos)?.eq(target.table)
    ) {
      setMenu(false);
      return;
    }
    const selection = editor.state.selection;
    if (
      !(selection instanceof CellSelection) ||
      selection.$anchorCell.before(-1) !== target.pos
    ) {
      setMenu(false);
      return;
    }
    const chain = editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr);
        return true;
      });
    const range = selectedRect(editor.state);
    if (
      action === "delete" &&
      (selected === "row"
        ? range.bottom - range.top === range.map.height
        : range.right - range.left === range.map.width)
    )
      chain.deleteTable();
    else if (selected === "row") {
      if (action === "before") chain.addRowBefore();
      else if (action === "after") chain.addRowAfter();
      else chain.deleteRow();
    } else {
      if (action === "before") chain.addColumnBefore();
      else if (action === "after") chain.addColumnAfter();
      else chain.deleteColumn();
    }
    chain.run();
    editor.view.dispatch(closeHistory(editor.state.tr));
    axis.current = null;
    setSelected(null);
    setMenu(false);
  };
  const rect = geometry && selected ? geometry[selected] : null;
  return (
    <div ref={root} className="table-controls" contentEditable={false}>
      {geometry && (
        <>
          {(["column", "row"] as const).map((kind) => {
            const box = geometry[kind],
              chosen = selected === kind;
            const center = box.left + box.width / 2;
            if (
              kind === "column" &&
              (center < geometry.viewport.left ||
                center > geometry.viewport.left + geometry.viewport.width)
            )
              return null;
            return (
              <div
                key={kind}
                className={`table-axis-handle ${kind} ${chosen ? "chosen" : ""}`}
                style={
                  kind === "column"
                    ? {
                        left: chosen ? box.left : box.left + box.width / 2 - 15,
                        top: box.top,
                        width: chosen ? box.width : 30,
                      }
                    : {
                        left: geometry.viewport.left,
                        top: chosen ? box.top : box.top + box.height / 2 - 15,
                        height: chosen ? box.height : 30,
                      }
                }
              >
                <button
                  type="button"
                  aria-label={kind === "row" ? "选择行" : "选择列"}
                  aria-pressed={chosen}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-haspopup="menu"
                  aria-expanded={chosen && menu}
                  onClick={(event) => select(kind, event.currentTarget)}
                >
                  {kind === "row" ? <MoreVertical /> : <MoreHorizontal />}
                </button>
                {chosen && (
                  <button
                    ref={arrowRef}
                    type="button"
                    className="table-axis-arrow"
                    aria-label={kind === "row" ? "行操作" : "列操作"}
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(event) => {
                      menuAnchor.current = event.currentTarget;
                      setMenu(!menu);
                    }}
                  >
                    <ChevronDown />
                  </button>
                )}
              </div>
            );
          })}
          {rect && (
            <div
              className={`table-selection-outline ${selected}`}
              style={{
                ...rect,
                clipPath: `inset(-8px ${Math.max(-8, rect.left + rect.width - geometry.viewport.left - geometry.viewport.width)}px -8px ${Math.max(-8, geometry.viewport.left - rect.left)}px)`,
              }}
            >
              <i
                style={
                  selected === "column"
                    ? {
                        left: -5,
                        top:
                          geometry.cell.top +
                          geometry.cell.height -
                          rect.top -
                          5,
                      }
                    : {
                        left:
                          geometry.cell.left +
                          geometry.cell.width -
                          rect.left -
                          5,
                        top: -5,
                      }
                }
              />
              <i
                style={
                  selected === "column"
                    ? {
                        right: -5,
                        top:
                          geometry.cell.top +
                          geometry.cell.height -
                          rect.top -
                          5,
                      }
                    : {
                        left:
                          geometry.cell.left +
                          geometry.cell.width -
                          rect.left -
                          5,
                        bottom: -5,
                      }
                }
              />
            </div>
          )}
          {menu && rect && (
            <MenuSurface
              key={`${selected}:${geometry.cellPos}`}
              ref={menuRef}
              onClose={() => setMenu(false)}
              anchor={menuAnchor.current}
              returnFocus={menuAnchor.current}
              aria-label={selected === "row" ? "行操作" : "列操作"}
              className="table-axis-menu"
            >
              <MenuItem onClick={() => edit("before")}>
                {selected === "row" ? "在上面添加行" : "在左侧添加列"}
              </MenuItem>
              <MenuItem onClick={() => edit("after")}>
                {selected === "row" ? "在下面添加行" : "在右侧添加列"}
              </MenuItem>
              <hr />
              <MenuItem onClick={() => edit("delete")}>
                {selected === "row"
                  ? `删除${geometry.rowCount}行`
                  : `删除${geometry.columnCount}列`}
              </MenuItem>
            </MenuSurface>
          )}
        </>
      )}
    </div>
  );
}
