import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Undo2,
  Redo2,
  PenTool,
  Highlighter,
  Eraser,
  Grid2X2,
  Scan,
} from "lucide-react";
import { MenuSurface, MenuItem } from "./Menu";
import type { DrawingStroke } from "./types";
import "./DrawingPanel.css";
import { drawingBounds } from "./drawing-transfer";

const papers = [
  ["plain", "空白"],
  ["lines-small", "密横线"],
  ["lines-medium", "中横线"],
  ["lines-large", "疏横线"],
  ["grid-small", "密网格"],
  ["grid-medium", "中网格"],
  ["grid-large", "疏网格"],
] as const;
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
// WKWebView reports trackpad pinches as GestureEvents; Chromium uses Ctrl+wheel.
type TrackpadGestureEvent = Event & {
  clientX: number;
  clientY: number;
  scale: number;
};
const clampScale = (scale: number) => Math.min(8, Math.max(0.15, scale));
export default function DrawingPanel({
  initial,
  paperStyle,
  onCancel,
  onDone,
}: {
  initial: DrawingStroke[];
  paperStyle: string;
  onCancel: () => void;
  onDone: (strokes: DrawingStroke[], paperStyle: string) => void;
}) {
  const [strokes, setStrokes] = useState(initial),
    [undone, setUndone] = useState<DrawingStroke[]>([]);
  const [paper, setPaper] = useState(paperStyle),
    [showPaper, setShowPaper] = useState(false);
  const [color, setColor] = useState("#1c1c1e"),
    [width, setWidth] = useState(4);
  const [tool, setTool] = useState<DrawingStroke["tool"]>("pen");
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view),
    size = useRef({ width: 600, height: 300 });
  const svg = useRef<SVGSVGElement>(null),
    paperButton = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, Point>()),
    active = useRef<number | null>(null);
  const before = useRef({ strokes, undone }),
    navigating = useRef(false);
  const gesture = useRef<{
    center: Point;
    distance: number;
    view: View;
  } | null>(null);
  const id = useId().replace(/:/g, "");
  const updateView = (value: View) => {
    viewRef.current = value;
    setView(value);
  };
  const fit = () => {
    const { width, height } = size.current;
    const bounds = drawingBounds(strokes);
    const scale = Math.min(width / bounds.width, height / bounds.height);
    updateView({
      x: (width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (height - bounds.height * scale) / 2 - bounds.y * scale,
      scale,
    });
  };
  useLayoutEffect(() => {
    const element = svg.current!;
    let first = true;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      const old = size.current;
      size.current = { width: box.width, height: box.height };
      if (first) {
        first = false;
        fit();
      } else
        updateView({
          ...viewRef.current,
          x: viewRef.current.x + (box.width - old.width) / 2,
          y: viewRef.current.y + (box.height - old.height) / 2,
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = svg.current!;
    let trackpad: { center: Point; view: View } | null = null;
    const local = (event: { clientX: number; clientY: number }): Point => {
      const box = element.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const zoom = (start: View, from: Point, to: Point, scale: number) => {
      updateView({
        scale,
        x: to.x - ((from.x - start.x) * scale) / start.scale,
        y: to.y - ((from.y - start.y) * scale) / start.scale,
      });
    };
    const wheel = (event: WheelEvent) => {
      // React's delegated wheel listener is passive. Own the canvas gesture so
      // a pinch cannot zoom the whole page or a pan scroll the note behind it.
      event.preventDefault();
      if (pointers.current.size || trackpad) return;
      const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.current.width : 1;
      const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.current.height : 1;
      const dx = event.deltaX * unitX, dy = event.deltaY * unitY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const start = viewRef.current;
      if (event.ctrlKey) {
        const center = local(event);
        zoom(start, center, center, clampScale(start.scale * Math.exp(-dy * 0.01)));
      } else {
        updateView({ ...start, x: start.x - dx, y: start.y - dy });
      }
    };
    const gestureStart = (event: Event) => {
      event.preventDefault();
      if (pointers.current.size) return;
      trackpad = { center: local(event as TrackpadGestureEvent), view: viewRef.current };
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const native = event as TrackpadGestureEvent;
      if (!trackpad || pointers.current.size || !Number.isFinite(native.scale) || native.scale <= 0) return;
      // WebKit's scale is cumulative from gesturestart, not an incremental delta.
      zoom(trackpad.view, trackpad.center, local(native), clampScale(trackpad.view.scale * native.scale));
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      trackpad = null;
    };
    const reset = () => { trackpad = null; };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("gesturestart", gestureStart, { passive: false });
    element.addEventListener("gesturechange", gestureChange, { passive: false });
    element.addEventListener("gestureend", gestureEnd, { passive: false });
    window.addEventListener("blur", reset);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("gesturestart", gestureStart);
      element.removeEventListener("gesturechange", gestureChange);
      element.removeEventListener("gestureend", gestureEnd);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !showPaper) {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onCancel, showPaper]);
  const point = (e: PointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const coords = (p: Point): [number, number] => [
    (p.x - viewRef.current.x) / viewRef.current.scale,
    (p.y - viewRef.current.y) / viewRef.current.scale,
  ];
  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  };
  const finish = (e: PointerEvent<SVGSVGElement>, cancel = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    if (cancel && active.current === e.pointerId) {
      setStrokes(before.current.strokes);
      setUndone(before.current.undone);
    }
    if (active.current === e.pointerId) active.current = null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size >= 2)
      gesture.current = { ...pair(), view: viewRef.current };
    else gesture.current = null;
    if (!pointers.current.size) navigating.current = false;
  };
  const spacing = paper.endsWith("small")
    ? 18
    : paper.endsWith("large")
      ? 36
      : 26;
  return (
    <div
      className="drawing-overlay"
      role="dialog"
      aria-label="速绘"
      aria-modal="true"
    >
      <header>
        <button onClick={onCancel}>取消</button>
        <div>
          <button
            className="icon-button"
            aria-label="撤销笔画"
            disabled={!strokes.length}
            onClick={() => {
              setUndone((v) => [...v, strokes[strokes.length - 1]]);
              setStrokes((v) => v.slice(0, -1));
            }}
          >
            <Undo2 />
          </button>
          <button
            className="icon-button"
            aria-label="重做笔画"
            disabled={!undone.length}
            onClick={() => {
              setStrokes((v) => [...v, undone[undone.length - 1]]);
              setUndone((v) => v.slice(0, -1));
            }}
          >
            <Redo2 />
          </button>
          <button
            ref={paperButton}
            className="icon-button"
            aria-label="横线与网格"
            aria-expanded={showPaper}
            onClick={() => setShowPaper(!showPaper)}
          >
            <Grid2X2 />
          </button>
          <button className="icon-button" aria-label="适合画布" onClick={fit}>
            <Scan />
          </button>
        </div>
        <button onClick={() => onDone(strokes, paper)}>完成</button>
      </header>
      {showPaper && (
        <MenuSurface
          aria-label="速绘背景"
          anchor={paperButton.current}
          onClose={() => setShowPaper(false)}
        >
          {papers.map(([value, label]) => (
            <MenuItem
              key={value}
              checked={paper === value}
              icon={<Grid2X2 size={18} />}
              onClick={() => {
                setPaper(value);
                setShowPaper(false);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </MenuSurface>
      )}
      <div className="drawing-surface">
        <svg
          ref={svg}
          aria-label="绘图画布"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, point(e));
            if (pointers.current.size >= 2) {
              if (active.current !== null) {
                setStrokes(before.current.strokes);
                setUndone(before.current.undone);
                active.current = null;
              }
              navigating.current = true;
              gesture.current = { ...pair(), view: viewRef.current };
              return;
            }
            if (navigating.current) return;
            before.current = { strokes, undone };
            active.current = e.pointerId;
            setStrokes([
              ...strokes,
              {
                tool,
                color,
                width:
                  width * (tool === "marker" ? 4 : tool === "eraser" ? 5 : 1),
                points: [coords(point(e))],
              },
            ]);
            setUndone([]);
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, point(e));
            if (gesture.current && pointers.current.size >= 2) {
              const now = pair(),
                start = gesture.current;
              const scale = clampScale((start.view.scale * now.distance) / start.distance);
              updateView({
                scale,
                x:
                  now.center.x -
                  ((start.center.x - start.view.x) * scale) / start.view.scale,
                y:
                  now.center.y -
                  ((start.center.y - start.view.y) * scale) / start.view.scale,
              });
              return;
            }
            if (active.current !== e.pointerId || navigating.current) return;
            const p = coords(point(e));
            setStrokes((v) =>
              v.map((s, i) =>
                i === v.length - 1 ? { ...s, points: [...s.points, p] } : s,
              ),
            );
          }}
          onPointerUp={(e) => finish(e)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
        >
          <defs>
            <pattern
              id={id}
              width={spacing}
              height={spacing}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={
                  paper.startsWith("grid")
                    ? `M ${spacing} 0 H 0 V ${spacing}`
                    : `M 0 ${spacing} H ${spacing}`
                }
                fill="none"
                stroke="var(--drawing-grid)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <g
            data-drawing-transform
            transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          >
            {paper !== "plain" && (
              <rect
                x="-100000"
                y="-100000"
                width="200000"
                height="200000"
                fill={`url(#${id})`}
              />
            )}
            {strokes.map((s, i) => (
              <polyline
                key={i}
                points={s.points.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={s.tool === "eraser" ? "var(--paper)" : s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={s.tool === "marker" ? 0.35 : 1}
              />
            ))}
          </g>
        </svg>
      </div>
      <div className="drawing-view-hint" aria-live="polite">
        触屏 / 触摸板双指缩放与移动 · {Math.round(view.scale * 100)}%
      </div>
      <footer>
        <div className="drawing-instruments">
          {(
            [
              { value: "pen", label: "笔", icon: <PenTool /> },
              { value: "marker", label: "荧光笔", icon: <Highlighter /> },
              { value: "eraser", label: "橡皮", icon: <Eraser /> },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              className={`icon-button ${tool === t.value ? "active" : ""}`}
              aria-label={t.label}
              aria-pressed={tool === t.value}
              onClick={() => setTool(t.value)}
            >
              {t.icon}
            </button>
          ))}
          <input
            type="range"
            aria-label="笔画粗细"
            min={1}
            max={12}
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </div>
        <div className="drawing-colors">
          {[
            "#1c1c1e",
            "#636366",
            "#007aff",
            "#ff3b30",
            "#ffcc00",
            "#34c759",
            "#af52de",
          ].map((c) => (
            <button
              key={c}
              aria-label={`颜色 ${c}`}
              className={color === c ? "selected" : ""}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            aria-label="自定义颜色"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </footer>
    </div>
  );
}
