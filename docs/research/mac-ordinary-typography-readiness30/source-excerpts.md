# 准备30：固定源码相关片段

行号属于input-manifest.json中的当前文件身份；不是历史截图包源码身份。只摘取字体与普通表单边界，不运行或修改产品。

## src/style.css 行1–65

```text
1: :root {
2:   font-family:
3:     -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
4:     "Noto Sans CJK SC", Arial, sans-serif;
5:   color: #262626;
6:   background: #fff;
7:   font-synthesis: none;
8:   --paper: #fff;
9:   --sidebar: #f8f8f8;
10:   --grouped: #f2f2f7;
11:   --ink: #262626;
12:   --secondary: #8a8a8a;
13:   --tertiary: #b5b5b5;
14:   --accent: #dca400;
15:   --selection: #dedede;
16:   --line: #dedede;
17:   --glass: rgba(255, 255, 255, 0.82);
18:   --menu: rgba(247, 247, 247, 0.94);
19:   --danger: #ff3b30;
20:   font-size: 14px;
21:   -webkit-font-smoothing: antialiased;
22:   font-weight: 400;
23:   text-rendering: optimizeLegibility;
24: }
25: * {
26:   box-sizing: border-box;
27: }
28: html,
29: body,
30: #root {
31:   width: 100%;
32:   height: 100%;
33:   margin: 0;
34:   overflow: hidden;
35: }
36: button,
37: input,
38: textarea,
39: select {
40:   font: inherit;
41:   color: inherit;
42: }
43: button {
44:   border: 0;
45:   background: none;
46:   cursor: pointer;
47:   padding: 0;
48:   touch-action: manipulation;
49:   -webkit-tap-highlight-color: transparent;
50: }
51: button:disabled {
52:   opacity: 0.3;
53:   cursor: default;
54: }
55: button:focus-visible,
56: input:focus-visible {
57:   outline: 2px solid #e8b72e;
58:   outline-offset: 2px;
59: }
60: svg {
61:   flex-shrink: 0;
62:   stroke-width: 1.7;
63: }
64: input {
65:   border: 0;
```

## src/style.css 行1810–1840

```text
1810:     min-width: 80px;
1811:   }
1812:   .format-button {
1813:     font-size: 13px;
1814:     padding: 0 5px;
1815:   }
1816:   .desktop-search .search-box {
1817:     padding: 0 9px;
1818:   }
1819:   .share-group {
1820:     gap: 0;
1821:   }
1822:   .editor-header .icon-button svg {
1823:     width: 20px;
1824:   }
1825: }
1826: @media (max-width: 699px) {
1827:   :root {
1828:     font-size: 17px;
1829:     --accent: #c69e00;
1830:     -webkit-font-smoothing: antialiased;
1831:   }
1832:   .app.mobile {
1833:     display: block;
1834:     background: var(--grouped);
1835:     font-size: 17px;
1836:   }
1837:   .mobile .sidebar,
1838:   .mobile .notes-pane,
1839:   .mobile .editor-pane {
1840:     position: absolute;
```

## src/smart-folders.css 行1–100

```text
1: .smart-form-backdrop {
2:   position: fixed;
3:   inset: 0;
4:   z-index: 90;
5:   display: flex;
6:   align-items: center;
7:   justify-content: center;
8:   background: #0005;
9: }
10: .smart-form {
11:   position: relative;
12:   color: var(--text, #202020);
13:   background: var(--panel, #f7f7f7);
14:   border: 1px solid #aaa7;
15:   border-radius: 12px;
16:   box-shadow: 0 24px 70px #0005;
17:   max-height: calc(100% - 48px);
18:   overflow: auto;
19: }
20: .smart-form fieldset {
21:   border: 0;
22:   padding: 0;
23:   margin: 0;
24:   min-width: 0;
25: }
26: .smart-mac .smart-form {
27:   width: min(680px, calc(100% - 48px));
28:   padding: 20px;
29: }
30: .smart-mac h2 {
31:   font-size: 16px;
32:   font-weight: 700;
33:   margin: 0 0 12px;
34: }
35: .smart-name {
36:   display: flex;
37:   align-items: center;
38:   gap: 8px;
39:   font-size: 13px;
40: }
41: .smart-name input {
42:   flex: 1;
43:   min-width: 0;
44:   height: 26px;
45:   border: 1px solid #bcbcbc;
46:   border-radius: 5px;
47:   background: var(--surface, #fff);
48:   padding: 2px 7px;
49:   color: inherit;
50: }
51: .smart-form input:focus {
52:   outline: 3px solid #e5b80077;
53:   outline-offset: 1px;
54: }
55: .smart-make {
56:   margin: 13px 0;
57:   font-size: 13px;
58: }
59: .smart-make label {
60:   display: flex;
61:   gap: 7px;
62:   align-items: center;
63: }
64: .smart-make input {
65:   accent-color: #e5ad00;
66:   width: 14px;
67:   height: 14px;
68:   margin: 0;
69: }
70: .smart-make p {
71:   margin: 4px 0 0 22px;
72:   color: #777;
73:   font-size: 12px;
74: }
75: .smart-combine {
76:   display: flex;
77:   align-items: center;
78:   gap: 5px;
79:   font-size: 13px;
80:   margin: 13px 0 15px;
81: }
82: .smart-form select {
83:   font: inherit;
84:   border: 1px solid #ccc;
85:   border-radius: 5px;
86:   padding: 2px 22px 2px 7px;
87:   height: 25px;
88:   background: var(--surface, #f0f0f0);
89:   color: inherit;
90:   max-width: 100%;
91: }
92: .smart-rule {
93:   display: flex;
94:   align-items: flex-start;
95:   gap: 8px;
96:   min-height: 42px;
97:   padding: 10px 0 6px;
98:   border-bottom: 1px solid #bcbcbc;
99: }
100: .smart-rules {
```

## src/smart-folders.css 行490–578

```text
490:   .smart-mac .smart-form {
491:     width: calc(100% - 20px);
492:     padding: 14px;
493:   }
494:   .smart-rule {
495:     flex-wrap: wrap;
496:   }
497:   .smart-rule-buttons {
498:     margin-left: auto;
499:   }
500: }
501: 
502: /* Ordinary Mac creation uses the compact sheet; smart/edit/mobile retain their layout. */
503: .smart-mac .smart-form.smart-ordinary {
504:   width: min(400px, calc(100% - 40px));
505:   padding: 19px;
506:   background: var(--paper, #fff);
507:   border-color: transparent;
508:   border-radius: 26px;
509: }
510: .smart-mac .smart-ordinary h2 {
511:   font-size: 13px;
512:   line-height: 16px;
513:   margin-bottom: 20px;
514: }
515: .smart-mac .smart-ordinary .smart-name {
516:   gap: 6px;
517: }
518: .smart-mac .smart-ordinary .smart-name input {
519:   height: 24px;
520:   padding-inline: 5px;
521: }
522: .smart-mac .smart-ordinary .smart-name input:focus {
523:   border-color: transparent;
524:   outline: 3.5px solid #f6d499;
525:   outline-offset: -0.5px;
526: }
527: .smart-mac .smart-ordinary .smart-name input:focus::selection {
528:   background: #fceac1;
529:   color: #202020;
530: }
531: .smart-mac .smart-ordinary .smart-make {
532:   margin: 16px 0 0;
533: }
534: .smart-mac .smart-ordinary .smart-make label {
535:   gap: 6px;
536:   line-height: 16px;
537: }
538: .smart-mac .smart-ordinary .smart-make input {
539:   width: 16px;
540:   height: 16px;
541: }
542: .smart-mac .smart-ordinary .smart-make input:not(:checked) {
543:   appearance: none;
544:   -webkit-appearance: none;
545:   background: var(--ordinary-checkbox, #e6e6e6);
546:   border: 0;
547:   border-radius: 5px;
548: }
549: .smart-mac .smart-ordinary .smart-make p {
550:   margin: 2px 0 0 20px;
551:   font-size: 13px;
552:   line-height: 16px;
553: }
554: .smart-mac .smart-ordinary footer {
555:   margin-top: 16px;
556:   border-top: 0.5px solid #bcbcbc;
557:   padding-top: 16.5px;
558: }
559: .smart-mac .smart-ordinary footer button {
560:   height: 24px;
561:   background: var(--ordinary-button, #ececec);
562:   border-color: transparent;
563: }
564: .smart-mac .smart-ordinary footer button.smart-primary {
565:   background: #fdb82a;
566: }
567: .dark .smart-mac .smart-ordinary {
568:   --ordinary-button: #3a3a3c;
569:   --ordinary-checkbox: #48484a;
570:   --surface: #2c2c2e;
571:   color: var(--ink);
572: }
573: .dark .smart-mac .smart-ordinary footer button:not(.smart-primary) {
574:   color: inherit;
575: }
576: .dark .smart-mac .smart-ordinary .smart-make p {
577:   color: #aaa;
578: }
```

## src/SmartFolderForm.tsx 行1–70

```text
1: import { useEffect, useRef, useState } from "react";
2: import {
3:   Check,
4:   X,
5:   Plus,
6:   Minus,
7:   ChevronDown,
8:   Hash,
9:   Pin,
10:   Calendar,
11:   ListChecks,
12:   Paperclip,
13:   Folder as FolderIcon,
14:   Lock,
15:   StickyNote,
16: } from "lucide-react";
17: import { validTagName } from "./note-tags";
18: import {
19:   addDraftRule,
20:   nextDraftRuleType,
21:   draftQuery,
22:   folderDraft,
23:   newTagRule,
24:   type DraftRule,
25:   type FolderDraft,
26: } from "./smart-draft";
27: import type { Folder, SmartFolder, TagMode } from "./types";
28: import "./smart-folders.css";
29: 
30: const types = [
31:   "标签",
32:   "创建日期",
33:   "编辑日期",
34:   "共享",
35:   "@提及",
36:   "核对清单",
37:   "附件",
38:   "文件夹",
39:   "快速备忘录",
40:   "置顶备忘录",
41:   "锁定备忘录",
42: ];
43: const modes: { value: TagMode; desktop: string; mobile: string }[] = [
44:   { value: "allSelected", desktop: "所有已选", mobile: "所有已选标签" },
45:   { value: "anySelected", desktop: "任何已选", mobile: "任何已选标签" },
46:   { value: "anyTag", desktop: "任何标签", mobile: "任何标签" },
47:   {
48:     value: "noTags",
49:     desktop: "仅不含标签的备忘录",
50:     mobile: "仅不含标签的备忘录",
51:   },
52: ];
53: function TagTokens({
54:   rule,
55:   catalog,
56:   onChange,
57: }: {
58:   rule: DraftRule;
59:   catalog: readonly string[];
60:   onChange: (names: string[]) => void;
61: }) {
62:   const [input, setInput] = useState(""),
63:     [open, setOpen] = useState(false),
64:     [active, setActive] = useState(0);
65:   const options = catalog.filter(
66:     (n) => !rule.names.includes(n) && n.includes(input.replace(/^#/, "")),
67:   );
68:   const name = input.replace(/^#/, ""),
69:     canCreate =
70:       validTagName(name) &&
```

## src/SmartFolderForm.tsx 行290–365

```text
290:     </div>
291:   );
292:   const combination = (
293:     <select
294:       aria-label="组合过滤条件"
295:       value={target.combine}
296:       onChange={(e) =>
297:         setTarget({ ...target, combine: e.target.value as "all" | "any" })
298:       }
299:     >
300:       <option value="all">全部</option>
301:       <option value="any">任意</option>
302:     </select>
303:   );
304:   if (committedId.current)
305:     return (
306:       <div
307:         className={`smart-form-backdrop ${mobile ? "smart-mobile" : "smart-mac"}`}
308:       >
309:         <section
310:           role="dialog"
311:           aria-modal="true"
312:           aria-label="同步文件夹"
313:           className="smart-form"
314:         >
315:           <h2>文件夹已经保存</h2>
316:           <p role="status">{error || "等待列表同步。"}</p>
317:           <footer>
318:             <button type="button" disabled={busy} onClick={onCancel}>
319:               关闭
320:             </button>
321:             <button
322:               type="button"
323:               disabled={busy}
324:               className="smart-primary"
325:               onClick={() => void submit()}
326:             >
327:               {busy ? "正在同步…" : "重试同步"}
328:             </button>
329:           </footer>
330:         </section>
331:       </div>
332:     );
333:   return (
334:     <div
335:       className={`smart-form-backdrop ${mobile ? "smart-mobile" : "smart-mac"}`}
336:       onClick={(e) => e.stopPropagation()}
337:     >
338:       <section
339:         role="dialog"
340:         aria-modal="true"
341:         aria-label={
342:           panel
343:             ? "过滤条件"
344:             : folder
345:               ? "编辑智能文件夹"
346:               : draft.smart
347:                 ? "新建智能文件夹"
348:                 : "新建文件夹"
349:         }
350:         className={`smart-form ${panel ? "smart-filter-panel" : ""} ${!mobile && !folder && !draft.smart ? "smart-ordinary" : ""}`}
351:       >
352:         <fieldset disabled={busy}>
353:           {mobile ? (
354:             <>
355:               <div
356:                 className={`smart-mobile-feedback ${error ? "has-error" : ""}`}
357:               >
358:                 <header className="smart-mobile-header">
359:                   <button type="button" aria-label="取消" onClick={cancel}>
360:                     <X />
361:                   </button>
362:                   <strong>
363:                     {panel
364:                       ? "过滤条件"
365:                       : folder
```

## src/SmartFolderForm.tsx 行580–650

```text
580:               )}
581:             </>
582:           ) : (
583:             <form
584:               onSubmit={(e) => {
585:                 e.preventDefault();
586:                 void submit();
587:               }}
588:             >
589:               <h2>
590:                 {folder
591:                   ? "编辑智能文件夹"
592:                   : draft.smart
593:                     ? "新建智能文件夹"
594:                     : "新建文件夹"}
595:               </h2>
596:               <label className="smart-name">
597:                 名称：
598:                 <input
599:                   autoFocus
600:                   value={draft.name}
601:                   aria-label="名称"
602:                   onFocus={(e) => e.target.select()}
603:                   onChange={(e) => update({ name: e.target.value })}
604:                 />
605:               </label>
606:               {!folder && (
607:                 <div className="smart-make">
608:                   <label>
609:                     <input
610:                       type="checkbox"
611:                       checked={draft.smart}
612:                       onChange={(e) =>
613:                         update({
614:                           smart: e.target.checked,
615:                           name:
616:                             draft.name === "新建文件夹" ||
617:                             draft.name === "新建智能文件夹"
618:                               ? e.target.checked
619:                                 ? "新建智能文件夹"
620:                                 : "新建文件夹"
621:                               : draft.name,
622:                         })
623:                       }
624:                     />
625:                     制作智能文件夹
626:                   </label>
627:                   <p>使用标签和其他过滤方式整理。</p>
628:                 </div>
629:               )}
630:               {draft.smart && (
631:                 <>
632:                   <div className="smart-combine">
633:                     包含匹配下列 {combination} 过滤条件的备忘录：
634:                   </div>
635:                   <div className="smart-rules">
636:                     {draft.rules.map((r) => (
637:                       <div className="smart-rule" key={r.key}>
638:                         <select
639:                           aria-label="过滤条件类型"
640:                           value={r.type}
641:                           onChange={(e) =>
642:                             row(r.key, {
643:                               type: e.target.value as "tags" | "pinned",
644:                             })
645:                           }
646:                         >
647:                           {types.map((t) => (
648:                             <option
649:                               key={t}
650:                               value={
```

## src/App.tsx 行1–55

```text
1: import {
2:   useCallback,
3:   useEffect,
4:   useLayoutEffect,
5:   useRef,
6:   useState,
7:   type CSSProperties,
8:   type ReactNode,
9:   type PointerEvent as ReactPointerEvent,
10: } from "react";
11: import { type Editor, type JSONContent } from "@tiptap/react";
12: import { editorSaveSnapshot } from "./editor-save-snapshot";
13: import {
14:   attachmentRecordedAt,
15:   type RecordingResult,
16: } from "./recording-metadata";
17: import { TagComposition } from "./tag-composition";
18: import { SmartFolderForm, type FolderFormHandle } from "./SmartFolderForm";
19: import {
20:   MobileQuickFolderIcon,
21:   MobileClosedFolderIcon,
22:   MobileAddFolderIcon,
23: } from "./MobileFolderIcons";
24: import { draftQuery, type FolderDraft } from "./smart-draft";
25: import {
26:   isPhysicalOwner,
27:   matchesSmart,
28:   projectFolders,
29:   sortNotes,
30: } from "./smart-folders";
31: import {
32:   documentTags,
33:   projectTags,
34:   tagSelectionAfterAccess,
35: } from "./note-tags";
36: import { SaveRevisions } from "./save-revisions";
37: import { SidebarPreference } from "./sidebar-preference";
38: import { secureId } from "./secure-id";
39: import { enqueueSave, type SaveOutcome } from "./save-queue";
40: import {
41:   TrustedSynchronization,
42:   type SynchronizationResult,
43: } from "./trusted-synchronization";
44: import {
45:   AttachmentSubmission,
46:   documentReferencesAttachment,
47: } from "./attachment-submission";
48: import {
49:   rebindAttachmentTarget,
50:   type AttachmentTarget,
51: } from "./attachment-target";
52: type PickerTarget = AttachmentTarget<Editor, SelectionBookmark>;
53: type PickerBatch = {
54:   target: PickerTarget;
55:   operationIds: string[];
```

## src/App.tsx 行4578–4632

```text
4578:               }}
4579:             />
4580:           );
4581:         })}
4582:         {mobile &&
4583:           current &&
4584:           !current.deletedAt &&
4585:           (!current.locked || unlocked.has(current.id)) &&
4586:           menu !== "format" &&
4587:           (editing ? tools() : tools(true))}
4588:         {saving > 0 && (
4589:           <div className="save-status" aria-live="polite">
4590:             正在保存…
4591:           </div>
4592:         )}
4593:       </main>
4594:       {renderMenu()}
4595:       {folderForm && (
4596:         <SmartFolderForm
4597:           mobile={mobile}
4598:           folder={folderForm.folder}
4599:           catalog={tags.catalog.map(([name]) => name)}
4600:           onCancel={() => setFolderForm(null)}
4601:           onHandle={(handle) => {
4602:             folderFormHandle.current = handle;
4603:           }}
4604:           onSave={saveFolderDraft}
4605:           onRefresh={async (id) => {
4606:             const data = await metadataRefreshRef.current();
4607:             const folder = data?.folders.find((f) => f.id === id);
4608:             if (folder?.kind !== "smart")
4609:               throw Error("智能文件夹已不存在，当前草稿仍保留。");
4610:             return folder;
4611:           }}
4612:         />
4613:       )}
4614:       {(synchronizing || accessSuspended.length > 0) && (
4615:         <div className="access-cover" role="status">
4616:           <div>
4617:             {syncError ? (
4618:               <>
4619:                 同步失败，备忘录内容暂时隐藏。<p>{syncError}</p>
4620:                 <button onClick={() => void synchronizeRef.current()}>
4621:                   重试同步
4622:                 </button>
4623:               </>
4624:             ) : (
4625:               "正在确认保存与锁定状态…"
4626:             )}
4627:           </div>
4628:         </div>
4629:       )}
4630:       {modal && (
4631:         <div
4632:           className="modal-backdrop"
```

## src/main.tsx 行1–14

```text
1: // Tiptap uses ES2023 array methods; Android 11 can ship Chromium 91.
2: import "core-js/actual/array/find-last";
3: import "core-js/actual/array/find-last-index";
4: import "core-js/actual/array/at";
5: import "core-js/actual/structured-clone";
6: import React from "react";
7: import { createRoot } from "react-dom/client";
8: import App from "./App";
9: import "./style.css";
10: createRoot(document.getElementById("root")!).render(
11:   <React.StrictMode>
12:     <App />
13:   </React.StrictMode>,
14: );
```
