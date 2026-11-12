# SESSION96 独立审查

2026-11-09。审查人 `/root/table95_verify`，非开发作者。基线 `1d44be34`，开发提交 `b1e23f180fb0575b76a911f990c88433b8146ac5`。工作树 `/private/tmp/cybernote-modernization`，审查开始时 clean；本轮不修改产品源码、不 native build/ADB。

## Findings

### F1 — P2 / blocking：Android 返回跳过正文组件的菜单，错误关闭底层格式面板

- 设计：`docs/architecture/editor-session.md` 转换表“展开/关闭菜单”要求菜单叠在手机格式面板上时关闭只退最内层，不能意外关闭格式；`src/editor-session/README.md` 声明 MenuSurface 统一最内层 Back/Escape。
- 代码：`src/App.tsx:2387` 只有 App 的 `editorSession.menu` 非空时才调用 `dismissInnermostMenu()`；否则 `:2388` 直接关闭格式，后续分支还可能开始正文/页面返回。`src/Editor.tsx` 中 DrawingView、`TableControls` 和 `AttachmentMenuProvider` 的菜单用自身局部状态创建 MenuSurface，不会设置 session.menu。
- 真实 App 复现：手机编辑页含速绘；打开格式面板；在正文速绘触发实际 contextmenu（与长按调用同一个 showMenu）；出现“速绘操作”共享菜单，此时 `panel=format`、`session.menu=null`。调用生产 Android Back handler（debug `app.back`），结果 `panel=none`、格式已关闭，而顶层“速绘操作”仍可见。不是模拟 reducer 的推断。
- 影响：长按速绘或其他正文局部菜单时，返回不作用于当前菜单；破坏持久格式面板和最内关闭约定。新全局菜单栈的实际 App 接线不完整。
- 修正要求：Android Back 的菜单关闭应查询真实活动 MenuSurface 栈，不能以 App 自有 menu 字符串为前提；保持模态/访问等既有优先级，不让一次 Back 同时关闭多个层。补速绘和至少另一个正文局部菜单回归，普通 App 菜单/二级菜单及格式自身关闭仍通过。
- 证据：`scripts/verification/check-session96-independent.mjs`，`artifacts/session96-independent/result.json`、`browser.log`、`drawing-context-back.png`。脚本默认记录已知故障，修正后用 `--expect-fixed`，预期顶层速绘菜单关闭且格式仍存在。

## 已核对的职责与边界

- `EditorSession` 实际持有 body/format/drawing/menu/recording presentation、创建与 Done 代次、书签与 Editor 事务订阅，不是向 App setState 转发的空壳。hook 创建/订阅/清理实例，platform 仅聚焦获准的确切 Editor，通用 `.tiptap` 定时聚焦已移除。
- App 仍拥有 SearchEditorGate、访问/同步/保存队列、录音票据、源 owner 与附件提交 ACK；会话没有 `setEditable(true)`，未增加竞争授权源。桌面录音状态与正文/面板独立，recordClosed 按原 owner 匹配；原保存/撤权/取消守卫仍在原路径。
- 格式与普通菜单是独立状态；格式书签按真实 transaction mapping 更新，selectionSet 则跟随新选择。close reason 现在决定 confirm 聚焦/请求键盘，与 Back/导航保持浏览分开。
- Android Kotlin 明确取消已登记的延迟 Runnable，hide/WebView替换/pause/destroy 增代次，延迟执行检查 generation、同 WebView 和存活/连接/焦点。此处只完成源码检查，未编译 Android 或证明系统 IME 行为。
- 仍保留编辑命令链 `.focus()` 与领域自己的焦点入口；这些属于真实命令/门禁原路径，不是新建的任意 DOM 查询或双状态源。未据此提出无实证重构要求。

## 独立验证

- `node scripts/verification/check-session96-independent.mjs`：实际 React App/Chrome + 生产 Android Back handler，复现 F1；隔离 backend，非系统 ADB/IME。
- `node scripts/verification/check-session96-focus-independent.mjs`：2 项通过。
  1. 延迟的真实 create handler 已持久创建收据，但期间切到 note-b 后，成功返回不能跳回新笔记或发出 NotesKeyboard.show；pendingFocus 为 null，新记录仍保留。
  2. 格式中选中 beta，再对实际 Editor/PM dispatch insert-before transaction，书签正确映射；粗体仍作用于原 beta，格式持续开启，并通过真实 App 保存入口写入隔离 backend。
- 独立焦点/书签结果：`artifacts/session96-independent/focus-result.json`、`focus-browser.log`、`focus-bookmark.png`。初次测试读取 pmViewDesc.view（该版本无此属性）失败，改用 Tiptap 原生安装的 DOM.editor.view 后通过；未改产品。速绘初次 Playwright 通用 contextmenu 事件构造未打开菜单，改为 DOM 原生 MouseEvent 后复现，未把测试构造失败算成产品故障。
- 只读核对作者 state8/App13、quick-home46、recording17、notes9、sync-navigation41及5组回归证据；这些不记为本次独立运行。sync report 的 sourceHead 是开发基线但含 before/after 同一源码指纹及 dirty paths，不能当成整包原生运行证明。
- 本轮未重复全套 suite，无 OS IME、AppKit第一响应者、真实录音或 Rust Store 声明。上述原生门槛继续 FINAL101。

## 结论

**blocked**。F1 修正并独立复验后才可合入 SESSION96 并继续 MODULES98。除 F1 外暂未发现有直接证据的 blocking 问题；本结论不关闭 FINAL101 的真实双端门槛或 TABLE95 的原生 hover R1。

## F1 独立复审（2026-11-09）

修正范围 `45a8c80e..bdc668571ede7e426e0ed3fe73913554caf82512`，复审开始工作树 clean。以下结论取代上面的初审 blocked；初审记录保留供追溯。

**pass（源码整合）**。F1 已关闭，未发现新的 blocking，SESSION96 可以整合并接续 MODULES98。

- 修正接线：`src/App.tsx:2387` 无条件查询真实菜单注册表，成功关闭立即结束这次 Back，不再依赖 App 的 menu 字符串；`src/Menu.tsx:19`、`:38` 仅将可连接、非 hidden 的 `role=menu` 作为此入口的候选。速绘/表格/附件局部菜单均被覆盖。格式自身是 dialog，因此继续由 `src/App.tsx:2389` 的 `session.closeFormat("back")` 处理关闭原因。
- 网络/模态顺序：源码对比确认 `src/App.tsx:2381` 同步冻结取消、图片预览、目录表单、OCR、设置及其他 modal 分支均原样在菜单分支之前。未把菜单优先于同步屏障或模态，也没有在此次修正扩大异步取消行为。该项为源码审查，未重新声称完整同步场景实测。
- 独立运行原真实 App 速绘复现：`node scripts/verification/check-session96-independent.mjs --expect-fixed` 通过。速绘菜单出现时 `session.menu=null`、`panel=format`，Back 后菜单消失而格式保持、仍在当前编辑页。补充的下一次无普通菜单 Back 验证 `panel=none`、`lastClose=back`、仍 note-a/editor；从菜单关闭前计数的 NotesKeyboard spy 仅见 `hide`，没有 `show`。修正后截图另存，保留初审故障截图。
- 独立运行作者的局部菜单测试：`node scripts/check-session96-menu-back.mjs` 10 项通过。表格行菜单和附件菜单分别覆盖叠格式/无格式、session.menu=null、关闭不导航、格式下一次关闭原因、文档不变及无浏览器异常。本项是审查人独立执行作者脚本，不记作新写的 10 项测试。
- 证据：`artifacts/session96-independent/recheck-result.json`、`recheck-browser-independent.log`、`drawing-context-back-fixed.png`；`artifacts/session96-menu-back/result.json`、`menus-dismissed.png`；`artifacts/session96-independent/local-menu-independent.log`。复核源码版本为完整 `bdc668571ede7e426e0ed3fe73913554caf82512`。两个进程均正常完成清理并以 0 退出。

本轮只补相关边界，没有重复大 suite，没有修改产品源码、native build 或 ADB。真实 React App/Chrome 和生产 Android Back handler 已验证，但隔离 IPC/NotesKeyboard spy 不等同于系统 IME。Android 实际键盘、Mac 原生焦点/录音与 TABLE95 原生 hover R1 仍须 FINAL101 实包验证；本 pass 不关闭这些门槛。
