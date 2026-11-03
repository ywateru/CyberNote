# APP-001 FIX-01 开发者自测

日期：2026-11-03。对应任务：`docs/plan/tasks/app-001-fix-01.md`。本记录是开发者回归证据，**不是独立验收通过，也不证明像素级一致**。原 FIX-00 / schema / QA 证据保持冻结。

## 本次实现

1. Mac 画廊单击选择、双击在当前主窗口展开，保留侧栏；返回保留已挂载的画廊、文件夹与卡片。独立窗口只能通过显式菜单打开；640px 的独立窗口保持桌面布局。切换显示模式清除旧展开状态。
2. 移动端使用横向样式的底部格式面板；打开前保存 noteId、Editor 实例和 ProseMirror SelectionBookmark，并随实际事务映射。面板命令恢复目标选区但不调用 focus；X 恢复选区与键盘，Android Back 关闭面板、收键盘并保留当前笔记。换笔记清除目标。X/Back 是项目约定，原录屏未证明这些触点。
3. 七种纸张按空白独占首行、其余三行两列排列，补齐中网格，选择立即保存。纸张用于绘画编辑画布和保存的 drawing 节点，不给普通正文整页加纹理。Rust 写入与归档接受 grid-medium。
4. 样式标签和顺序已修正；短划线是 bulletList 的 listStyle 属性，块引用使用结构节点。表格转文本使用单次文档替换，单元格内换行、列 Tab、行 LF 和末行 LF 保留，完整转换区块选中，一次 Undo 恢复原表格。
5. 清单勾选为黄色底白勾，正文不自动删除线。Enter 建项与空项退出保持 Tiptap 结构；保存 checked 状态。
6. 仅 revision=0、仍为单个空标题/段落的新笔记，在首次显式 text/plain 粘贴时将整段转成正文段落。直接键入仍是标题，Enter 后正文；HTML、既有文档不走该分支。修正 StarterKit trailingNode 的焦点后自动追加空段落行为，避免首次粘贴条件被其自身提前破坏。

## 安装版回归

### Mac

最终 `.app` 由 `pnpm mac:build` 构建。只使用克隆应用 `com.local.notesclone` 的合成 FIX01 文件夹；未改系统原版 Notes 数据。

- `mac-plain-paste.png`：新笔记显式纯文本粘贴“纯文本修正对照\n第二行正文”，AX 和 SQLite 均为两个 paragraph。
- `mac-typed-title.png`：直接键入 Title Reference → Return → 正文；SQLite 为 h1 + paragraph。另在正文选择“第二行正文”后经格式菜单加粗，目标正确。
- `mac-table-before.png` / `mac-table-converted.png` / `mac-table-converted.ax.txt` / `mac-table-undo.png`：真实 2×2 表格，首格两个段落 A1 / A2，第二格 C，下一行 B2 / 空格；转换为 `A1\nA2\tC\nB2\t\n`，整个转换区块选中，一次 Cmd+Z 恢复原表格。
- `mac-gallery-before.png` / `mac-gallery-open.png` / `mac-gallery-return.png`：最终构建启动即画廊，双击 Table Boundary 在同一主窗打开且侧栏保留，返回同一 FIX01 卡片列表。
- `mac-gallery-separate.png`：右键 Table Boundary → 单独打开，URL noteId 为 c093dfaf-7994-43b7-b708-caf65c85a5b5，640px 窗口有桌面格式/表格工具栏；关闭后主窗仍是 FIX01 画廊。
- `mac-checklist.png`：First task / Second task 两项，第一项勾选、黄色白勾、无删除线。Enter 生成第二项，再次空项 Enter 退出。AX 最终 Value=1；SQLite checked=true。最初 AX 差量状态延迟显示 0，后经完整状态和实际保存 JSON 排除。
- `mac-saved-documents.json` 保存上述四份合成笔记的 SQLite 只读结果；其中表格笔记为 Undo 后的原表格。

最终图库复测中曾因截图后复用旧 AX 索引点到其他合成卡片，重新获取完整 AX 后按目标名称重跑，最终指定 noteId 和主窗状态已核对；不是生产功能缺陷。

### Android

最终 APK 用 `adb install -r` 更新到 emulator-5580：Android 11 / API 30 / arm64 / Chrome 91 WebView。`node scripts/android-fix01.mjs` 最终完整运行通过，见 `android/result.json` 与 `checks/android-tests.log`。

- 脚本通过真实安装版 Tauri/Rust 工作区取证；正文夹具用生产编辑器 enter 命令建立，不以其证明 Android 回车键或 IME 组合输入。
- 先由 Android 原生触摸建立 WebView 焦点，再设置正文中 Beta 的明确选区；系统 `dumpsys input_method` 确认初始 IME 显示。
- 打开格式面板：实际面板出现，Editor 失焦，IME 隐藏；样式五项顺序为 标题 / 小标题 / 副标题 / 正文 / 等宽样式。
- 面板加粗：只有 Beta 获得 bold，anchor/head 保留，面板仍开，Editor 保持失焦，IME 仍隐藏。
- X：面板关闭，Editor 聚焦，选区相同，原生 IME 显示。
- 短划线：实际文档 bulletList.listStyle=dash；再切回普通段落并测试块引用，isActive(blockquote)=true。
- Android 系统 Back：关闭面板、Editor 失焦、IME 隐藏，仍停留 page-editor。
- 纸张界面有七项，实际选择中网格；绘画画布显示 21px 双向网格。由截图确认画布内坐标，用 adb 原生 swipe 输入笔画。
- 完成绘画后 Rust 工作区包含非空 drawing.strokes 与 paperStyle=grid-medium；强制结束进程、冷启动、经文件夹列表重开后，整个 Note（含 revision）与前值相等，Editor 文档相等，drawing-node 背景为双层 `21px 21px, 21px 21px`。
- WebView 异常数组为空。截图和每阶段 JSON 位于 `android/`；before.json / after.json 为实际 Rust 保存结果。

回归脚本最初的几轮夹具问题已修正：调试协议按键没有生成 Enter 编辑事务、未由原生触摸建立焦点、调试协议触摸未产生笔画、双层 CSS 背景的断言原先只预期一层。最终运行全部通过；这些中间失败不作为应用通过或原版行为证据。脚本会新增独立合成笔记，不清空已有数据。

## 静态与状态测试

- `pnpm mac:build` / `pnpm android:build --debug`：均通过；各自执行前端 TypeScript + Vite build。已知 Vite 大块体积提示仍存在。
- `pnpm test:editor`：生产扩展 schema 与 Rust manifest 一致，65 个共享文档样例；额外使用真实 ProseMirror schema / state / history 与无 DOM dispatch adapter 验证表格转换精确文本、周围段落、完整选择、一次 Undo / Redo 以及表格外返回 false。它不替代安装版交互测试。
- Rust 离线测试：16 passed、0 failed、1 个子进程专用 worker 默认 ignored；可靠性父测试实际执行六个子进程退出点。新增七种纸张 + dash + drawing 的保存、重开、导出、导入、再次重开一致性。
- `cargo fmt --check`、`cargo clippy --offline --all-targets -- -D warnings`、修改文件 Prettier 检查均通过。
- 暂存差异空白检查对源码与其余文档通过；原始 `mac-table-converted.ax.txt` 的三行末尾 Tab 是待验证表格边界数据，原样保留并在空白检查中单独排除。
- 完整安装矩阵、七种纸张逐项 UI 选择、更多多选/IME/手势边界交由独立验收；本轮没有重复完整独立 QA 矩阵。

## 源码与产物

`build-manifest.json` 记录最终构建时所有受版本控制的生产输入和新增生产文件的 SHA-256、聚合算法、Mac 可执行文件和 APK 指纹。最终构建后未改生产代码或配置；后续只改测试脚本、README 和本记录。两份安装产物保留在清单给出的本机路径，不进 Git。

- Mac executable SHA-256：`fc9f522fa6f0eedfc77854280b3bee34d26c784cd8b839dd535881eed57a8eae`
- Android APK SHA-256：`9e170f3b07e2b1493e4f555b23845a533ea72d9d98e3981563f60ad9f9814204`
- 生产源聚合 SHA-256：`43e8227f030d36b66b71720211de73424b5156f7ebdff5eb4b7fecf8e505e087`

## 仍未宣称通过

本轮只交付 FIX-01 修正候选。图标、字形、材质、全部间距、系统菜单、动画和全应用像素一致性未通过；未集成扫描插件；不触及 FIX-03 锁定/缓存安全范围。Mac 与 Android GUI 已释放给父任务及独立验收。
