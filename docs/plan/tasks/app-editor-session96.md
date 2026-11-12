---
id: app-editor-session96
scope: editor-session
status: done
depends-on: [app-table-interactions95]
---

## objective

把浏览、正文编辑、格式面板、速绘、录音与菜单的交互切换集中到独立会话模块，统一焦点、输入法意图与面板开关；将当前 App.tsx 中对应状态和转换逻辑迁出，并保留现有持久化、录音归属、表格与双端行为。

前置 TABLE95 源码已由 32aa0d36 独立复审接受并回填主目录，允许进入会话迁移；TABLE95 的原生 hover R1 留在 FINAL101，不因本阶段启动而关闭。

## context

docs/architecture/editor-session.md、docs/ui/android-quick-home.md、docs/ui/drawing-editor.md、docs/ui/recording-desktop.md、docs/ui/table-editing.md、docs/plan/cybernote-modernization-state.md。

## path

新增 src/editor-session/（状态转换、React hook、书签生命周期、平台 focus/IME 适配）；App.tsx 中对应状态/handler/入口；SearchEditorHost/Editor 的事件接线；Android MainActivity 的旧延迟键盘请求取消；调试状态和相关交互测试。原保存队列、访问门禁、录音控制器的业务事务保留，不把所有业务都塞进新 hook。

## verification

- 提供明确状态转换和不变量测试，并在真实 App 中覆盖新建与延迟导航、普通正文、格式持续选区、关闭原因、速绘完成/取消、菜单及嵌套菜单、录音跨笔记归属、访问/同步屏障。
- native keyboard bridge spy 区分 show/hide 与真正 OS 键盘；旧请求在导航/速绘后失效，无延迟 show 越过 hide。
- `pnpm build`、test:mobile-editor、test:drawing、test:note-move-menu、test:recording-refresh、test:native-toolbar，以及 debug 的 quick-home/录音/访问相关组。先检查命令现有范围再选择，不重复无关大回归。
- 独立审查确认 App 的散落 focus/blur/keyboard 与状态组合已真实迁入，不能以转发 setState 的空壳 hook 宣称完成。最终实际 Mac/Android 在 FINAL101 验证。

## develop handoff（2026-11-09）

基线 `1d44be34`。开发迁移已实现，等待独立审查，尚不声明合并或真机通过。

- `src/editor-session/` 持有实际交互状态、创建/Done 代次、Editor 事务订阅和书签、导航/屏障失效、平台焦点及 IME 意图；App 移除重复状态与通用延迟 `.tiptap` 聚焦。正文/面板/普通菜单/录音呈现分别建模。
- 保留原保存、访问门禁、录音捕获 owner 与提交守卫；没有会话 `setEditable(true)`。桌面录音仍可跨笔记编辑。DrawingPanel 手势代码未变。
- Android MainActivity 的待 show 可取消；hide、WebView 替换、pause、destroy 增加代次并移除 Runnable。没有进行原生编译或 ADB 安装。
- MenuSurface 统一最内层 Back/Escape，手机格式与普通菜单保持独立。quick-home 的旧按钮数、menuitem、设置分类及重复 data-note-id 选择器已按基线现有 UI 更新，未改产品设置页。

验证：`pnpm build`；现有 mobile-editor、drawing、note-move-menu、recording-refresh、native-toolbar；quick-home（46 项）、recording（17 项）、notes（9 项）；新增 state（8 组）与真实 App/键盘桥 spy（13 项）；sync-window-navigation（41 项）的真实 DOM/焦点/同步取消回放回归。日志与截图：`artifacts/session96*.log`、`artifacts/session96/`、`artifacts/session96-quick-home/`、`artifacts/session96-recording/`、`artifacts/session96-notes/`、`artifacts/session96-sync-navigation/report.json`。

限制：Web IPC/录音及键盘桥为隔离 fixture/spy；不证明 Rust/OS/TCC/麦克风。触屏、触摸板 wheel/WebKit gesture 自动化通过，实体触摸板 pinch 未实测；真正 Android IME 和 Mac 原生焦点须 FINAL101 实包验证。TABLE95 未复现原生 hover 仍属 FINAL101，不在本次迁移中关闭。

## F1 develop fix（2026-11-09，待独立复审）

独审提交 `45a8c80e` 后修正：Android Back 在保留网络/模态优先级后，无条件先查询真实 MenuSurface 菜单层，不再依赖 session.menu。注册表区分实际 `role=menu` 与格式 `dialog`；关闭局部菜单后停止当前 Back，下一次由会话执行明确的格式 Back 转换。无速绘特判。

- 原独立复现 `node scripts/verification/check-session96-independent.mjs --expect-fixed` 通过，证据 `artifacts/session96-independent/recheck-result.json`、`recheck-browser.log`。
- 新增 `node scripts/check-session96-menu-back.mjs` 10 项通过：表格/附件局部菜单各覆盖叠格式与无格式、session.menu=null、关闭不导航、下一次格式 Back、文档不变。证据 `artifacts/session96-menu-back/result.json`、`menus-dismissed.png`。表格选区通过真实 Editor 命令明确建立，本测试验证菜单/Back，不把初次 touch tap 未落入 cell 的测试设置问题算成产品失败。
- `test:mobile-editor`、`test:note-move-menu`、`test:menu-lifetimes`、`pnpm build` 通过；日志 `artifacts/session96-f1-{mobile,move,lifetimes,build}.log`。没有 native build/ADB，原生限制仍留 FINAL101。
