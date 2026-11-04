# Sidebar drag selection 08 — author STOP

Only product change: `src/App.tsx` adds `e.preventDefault()` as the first ResizeHandle pointerdown statement. Original drag state, capture, width delta, min/max, onChange and onEnd remain byte-identical. CSS and native toolbar match HEAD. Product patch and exact source hashes are retained.

The finite check reuses the existing AST/transpile production execution approach: it executes the complete actual ResizeHandle declaration and both actual App JSX call sites in a real React server render, with React useRef. Host capture/settings are controlled. Cancelable Node Events show baseline `defaultPrevented=false` and candidate `true`, before pointer capture. Both sidebar and list checks passed: inactive/post-end events ignored, positive/negative movement, both bounds, end callback, next drags, and unrelated settings retained. This is execution of production code rather than a duplicated drag algorithm.

Sidebar changed widths: 248, 213, 180, 360; ended widths: 248, 180, 360. List changed widths: 300, 265, 220, 440; ended widths: 300, 220, 440. Baseline and candidate produce identical width/capture results. Both checks and `pnpm build` exited 0; raw build warning is preserved.

These controlled events do not exercise a browser DOM or actual default text-selection gesture, and do not verify an existing editor selection. Root must verify the exact new Mac package with Computer Use for drag both directions, absence of new interface selection, retained body/editor selection and sidebar/menu recovery. No GUI, ADB, platform build, shared target/cache operation, stage, commit or Android rebuild was performed. Author stops after sealing; independent review follows.
