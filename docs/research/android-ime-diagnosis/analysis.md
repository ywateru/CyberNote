# Android 候选长停留有限只读诊断

2026-11-03。产品源码只读 `git show 20c3014:<path>`；依赖为本地锁定 Tiptap 3.32.2 / prosemirror-view 1.42.9。未运行设备、GUI 或产品测试，未写编辑器状态、未改产品/依赖。本文件给出候选机制和最小后续取证范围，不是根因修复验收。

**已确认依赖有 Android 5 秒闲置结束 composition 的逻辑；现有长停留快照与该路径相符，但没有 timer 调用栈和长周期逐事件日志，不能锁定唯一根因。正常保存完成回包并没有重新灌入正文，现有证据不足以将双写归因于 App 自动保存重载。**

## 确认的代码路径

路径下文以 `node_modules/.pnpm/prosemirror-view@1.42.9/node_modules/prosemirror-view/` 为 PM 根：

1. `src/browser.ts:22` 按 userAgent 的 Android 字样启用 android 分支；本次没有重读设备 UA，设备配置沿用验证任务所述 Android WebView 91。
2. `src/input.ts:524–562` 明注“Drop active composition after 5 seconds of inactivity on Android”；`timeoutComposition = browser.android ? 5000 : -1`。compositionstart 与 compositionupdate 共用处理器，每次收到都会重新安排超时。这是最后一次此类事件后的闲置 5 秒，**不是**从首次键入累计 5 秒。
3. `src/input.ts:585–587` 清旧 timer，并 `setTimeout(() => endComposition(view), delay)`。实际入口 `dist/index.js:3608/3648/3671` 同样存在，不只 TS 源码有此逻辑。
4. `src/input.ts:618–629` 的 endComposition 在 Android 且 domObserver.flushingSoon≥0 时提前返回；否则 forceFlush 后 clearComposition，脏 docView 或 restarting 分支会 dispatch selection 或 updateState。
5. `src/input.ts:590–596` clearComposition 将 PM input.composing 设 false、更新 compositionEndedAt、把 compositionNodes 的父视图标脏，**没有清 compositionNode**。相对地，真实 DOM compositionend 的处理器 `:572–582` 才在 still-composing 分支显式把 compositionNode 设 null，并另排20ms结束任务。因此 composing=false 且 compositionNode 仍有拼音并不证明 IME 已提交，反而与内部 clear 路径一致；storedMarks 引发的 clearComposition 也可能产生此组合。
6. `src/index.ts:157–159` storedMarks 可独立清 composition；`:191–215` 的普通 view 更新可能同步 DOM 选区；`src/viewdesc.ts:788` 只在 view.composing 时获取和保护 localComposition。候选机制是超时先撤销 PM 组字保护，随后更新/合并文本 DOM 或选区改变，WebView 原生 composing span 与 PM 状态失步，选词再以新插入落地。现有证据没有捕获实际节点替换、原生 span 或触发栈，所以后半段只能列为待证假设。

## 已有真实证据与时间线

证据来自 `docs/verification/qa-android-ime/run-20c3014/`，本次只读：

| 周期 | 真实记录 | 可得结论 |
| --- | --- | --- |
| 较长停留 | native-actions.jsonl 记录 10:28:22.538Z 五次键入；ime-inline-nihao-marked-read.json 在10:28:33.346Z 为 composing=false、compositionNode=`ni hao‸`、DOM与PM doc均保留拼音；候选 tap 记于10:29:00.257Z；committed 快照变为 `ni hao‸你好` | 真实失败已发生。操作日志与读取相隔10.808秒，候选选择更晚；但没有每键 DOM 事件时刻，不能将最后update+5000ms的触发点精确重建。 |
| 快速输入 | ime-fast-marked/committed 的 passive events：compositionstart at3361877.9；最后拼音 compositionupdate at3364650.8；候选“你好”compositionupdate at3365405.5；compositionend at3365435（同一performance毫秒时钟） | 键入阶段2772.9ms；最后拼音update到候选update仅754.7ms；各段远小于5秒。日志中 PM composing 始终true直到真实compositionend。 |
| 快速替换 | 此轮开始 DOM已含旧失败留下的 `ni hao‸你好`；新增后缀从 `ni hao‸` 被候选替换为 `你好`，最终 `ni hao‸你好你好` | 仅证明本轮新增后缀正确替换，不应声称最终整篇无拼音或回滚修复旧失败。 |

长停留文件没有独立记录“何时从 true 变 false”、真实 DOM compositionend 是否曾提前发生、timer 是否因 flushingSoon 提前返回、是否发生 storedMarks 或 editor重建。上述缺口限制因果结论。

## 20c3014 的 App 保存与重建边界

- `src/Editor.tsx:261–264` 每次 Tiptap update 立即取 JSON 调 saveDoc，没有 composition 暂停条件。Tiptap core `src/Editor.ts:766–779` 在 docChanged 且内容不同才发 update，不过滤 composition，所以预编辑文字可能作为中间文档进入保存队列；这可以解释快照中 PM doc 有拼音，但单独不能解释候选双写。
- `src/App.tsx:379–435` saveDoc 即时保存 pending 文档和 React显示，再串行保存。成功回包 `:419–423` **只更新 revision**，没有 setContent、hydrate 或 editor.destroy。`src/bridge.ts:170–182` 传递并验证 save结果，没有操作编辑器DOM或选区。
- `src/App.tsx:257–291` hydrate 只有在无pending且外来正文不同才增加 externalVersions；`:2353` 的 Editor key包含noteId/access session与epoch/externalVersion，不含普通note revision。访问身份变化可销毁editor（`:527–530`）；显式同步或外部内容变化可重建。这些是真实替代路径，但当前IME证据没有记录其发生。
- Tiptap React `src/useEditor.ts:219–242` 空deps通常复用实例，options变化走setOptions；core `src/Editor.ts:287–305` setOptions设置props并updateState当前state，不把options.content重新灌入正文。不能把React rerender本身等同于setContent。不过这仍可能触发普通view更新；是否与超时后DOM变化相关需要真实事务与节点证据。

## 最小下一步判别范围

保持真实Trime候选选择，分别在最后compositionupdate后小于4秒和大于6秒提交；记录同一editor/view实例身份、compositionstart/update/end、beforeinput/input、PM composing/compositionNode、DOM文本节点身份、DOM/PM选区和doc transaction。额外只读追踪endComposition/clearComposition的调用时刻与栈，可区分5000ms timer、storedMarks与其他路径。记录mount/destroy、hydrate/externalVersion及保存回包时刻，可排除重建与更新混淆。不得用设composing、dispatchEvent或直接插入中文替代真实输入法。

修复任务应先证明哪个边界结束PM composition、是否改变真实预编辑节点，再决定依赖适配或App改动；本诊断没有建议直接删除库超时或把问题笼统修成“保存延迟”。

维护者讨论、相似用户报告和已纳入锁定版本的一个历史修复见[有限上游核查](upstream-notes.md)。这些来源用于约束兜底与候选观察点，不替代本项目真实运行时间线。
