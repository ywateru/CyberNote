# notes-ui 原生顶部控件候选

独立 Tauri 2 插件；本阶段没有接入主应用。macOS 使用公开 AppKit、NSImage 系统符号和 macOS 26+ NSGlassEffectView。旧系统使用 NSVisualEffectView HeaderView，诊断返回 legacyHeader；不声明旧材质与原版一致。非 macOS 命令返回 unsupported。

## 宿主契约

注册 `.plugin(tauri_plugin_notes_ui::init())`。Rust 可通过 `NotesUiExt` 对显式 `Window` 调用 bind/update/inspect/unbind/focus_search；guest API 见 guest-js/index.ts。前端实例只接受当前 window label，绑定得到 UUID bindingId。更新须使用同一窗口/绑定以及严格递增 revision；销毁旧实例后重新 bind 使用新 UUID。

顶部只管理自己加入的视图，不修改宿主 NSWindow toolbar/title/decorations，也不读写 Store。宿主隐藏重复 DOM 工具栏，并按 `native.reservedTop`（52 pt）为正文留出空间；分栏宽度与 sidebarVisible 必须同步真实宿主布局。独立窗使用 independentNote，不显示三栏文件夹标题。

```ts
const toolbar = new NotesToolbar();
const unlisten = await toolbar.listen(event => routeIntentToThisWindow(event));
const bound = await toolbar.bind(initialState);
// 状态提交串行化；合并搜索事件后递增 revision，再调用 update。
await toolbar.update(nextState);
const diagnostic = await toolbar.inspect();
// 宿主搜索菜单 / Option+Cmd+F（Mac 所属窗口）：
await toolbar.focusSearch();
// 窗口组件销毁：先停止宿主队列；注销失败也必须解除事件监听。
try { await toolbar.unbind(); } finally { unlisten(); }
```

`routeIntentToThisWindow` 与状态变量由宿主实现；以上不是可单独运行的笔记应用。按钮只产生意图，不绕过原应用保存/编辑/授权命令。宿主应保存当前编辑器 selection bookmark，并在格式命令执行时恢复；原生按钮拒绝 first responder，但本阶段未完成真实编辑器选区回归。

事件 `notes-ui://intent` 明确发送到 `EventTarget::Window { label }`，包含 windowLabel、bindingId、stateRevision、sequence 和类型化 intent。前端使用 `getCurrentWindow().listen`，并再次过滤 label+bindingId。Rust 的 WebviewWindow::listen 目标与 Window::listen 不同，Rust 宿主应监听 Window 或 listen_any 后严格路由。省略动作即隐藏；disabled 动作/菜单不发意图。菜单命令为固定枚举，不接受任意 selector 或 JS。格式现在使用横排首行的原生 NSPopover，其余菜单仍为 NSMenu；实际主窗和像素验收未运行。

guest `NotesToolbar.listen` 在 bind 响应前尚无 UUID，会过滤早期事件；上面的简短示意不涵盖这个竞态。正式宿主须在 bind 前用当前 Window.listen 做有界缓存，回包后仅重放自身 windowLabel+bindingId 的事件，再按 sequence 去重；还须管理 update 响应前的 revision 上下文。绑定初始活动状态取 `native.active`。不可通过删除身份过滤规避竞态。

搜索字段不保存最近搜索；输入法 marked text 不发查询更新。宿主必须合并最新搜索事件的 value，并把 acknowledgedEvent 设为该 sequence；落后的状态返回 stale_search。组字期间改变文字返回 search_composition。相同文字不调用 setter，以保留选区。并发状态更新须由宿主排队；本阶段未验证中文组字、搜索 Return/Escape 和更新竞态。

## 格式弹层与画廊几何候选

2026-11-03 子步只修改本插件，未接入主应用，也没有启动 demo 或操作 GUI。几何来源为研究提交 `649c24e` 的 `docs/research/macos-toolbar-geometry/analysis.md`、`measurements.json` 与原图。测量是带误差的可见面/文字墨迹，不是 Notes 内部 frame；原图窗口激活未知。

`galleryBrowse` 明确表示没有打开笔记的画廊：只接受 newFolder/toggleSidebar/viewOptions/newNote 四类动作，不能混入返回或编辑动作；宿主同时只保留这些动作所属菜单。其标题从侧栏右边起算，显示选项与新建组成一组，搜索宽度按可用区域变化。`galleryExpanded` 表示打开笔记：提供 backToGallery 时绘制36pt返回圆，标题/计数起点比浏览状态右移44pt，编辑工具整体靠右；不提供返回动作则不留该占位。`threeColumn` 与 independentNote 维持各自语义。按钮可见面的起点为 y8、高36pt；编辑全组161pt、共享全组80pt，常规间距18/18/16pt，搜索右距8pt。画廊浏览的搜索前间距为33pt，不能套用编辑态公式。窄窗仍使用溢出动作，宽度取实际 contentView，不限定1088pt。

`menus.owner = format` 现在只接受固定格式命令。面板首行按粗体/斜体/下划线/删除线/高亮/颜色排列，下方按标题/小标题/副标题/正文/等宽、项目符号/短划线/编号、分隔后的块引用排列。只渲染宿主提供的命令；颜色菜单同样由已有 colorDefault/Purple/Pink/Orange/Mint/Blue 枚举与 enabled/selected 状态驱动，不自动写编辑器或发成功提示。示例 state.json 含完整候选条目。完整菜单内容尺寸起点176×325pt；系统 NSPopover 的实际边框、箭头、内边距、材质与字体必须在正式包另验，不能从 contentSize 声称原图外包络相同。未观测的颜色子菜单外观也未宣称复刻。

格式按钮和颜色项携带创建时 revision；点击再次核对当前 format 动作、条目 enabled、revision，按钮还需属于当前显示的弹层。状态更新及 dispose 强制关闭弹层并取消正在跟踪的颜色菜单，异步溢出入口复核 revision。所有格式动作仍产生 `{kind: 'menu', owner: 'format', command}`，由原有窗口/绑定/版本权限链发送；没有新的 IPC、权限或任意执行入口。

格式按钮拒绝 first responder，代码不调用焦点或选区 setter。宿主须为每个 state revision 保存 noteId、授权 token、Editor 实例及选区 bookmark，在命令返回时重新验证并恢复选区。AppKit 显示浮层本身的焦点、中文组字、键盘导航、菜单选区与 Undo/Redo 行为仍为 not-run；静态代码不能证明实际选区不变。语义相同的宿主状态不应重复 update，因为更新会关闭弹层/菜单。插件定向检查见 `verification/format-gallery/README.md`。

## 搜索聚焦入口

`NotesToolbar.focusSearch(): Promise<BindingInfo>` 对应固定 IPC `focus_search`，Rust 宿主调用 `NotesUiExt::notes_ui().focus_search(window, binding_id)`。沿用调用方 Window、精确 windowLabel 与当前绑定 UUID 校验，在主线程解析该窗口绑定并检查搜索存在且 enabled 后，请求该绑定的 NSSearchField 成为 first responder。返回同一 bindingId、revision 与当前原生诊断，不更新查询、不递增 revision、不重绑、不主动发搜索意图。

若搜索控件或它的当前 field editor 已是 first responder，方法直接成功，包含正在组字的重复请求。其他情况仅调用 `makeFirstResponder`，不主动调用文字/选区 setter，不缓存选区，不设定首次光标位置，也不调用 activate/orderFront 或切换 key window。AppKit 因获得 first responder 而产生的实际光标/选区行为尚未实测，不能据此承诺选区不变或与原版相同。

明确错误包含 `search_missing`、`search_disabled`、`stale_binding`、`window_closed`、`focus_failed`，并沿用 `invalid_binding`、`window_mismatch`、`unsupported` 和线程/原生错误。未 bind 的 guest 实例在 invoke 前返回 `not_bound`。窗口关闭清理先发生时可能返回 `stale_binding`；保留控制器但视图已脱离窗口时返回 `window_closed`。

FIX02 正式 Mac 宿主须将所属窗口的全局搜索菜单及 Option+Cmd+F 路由到该方法；Cmd+F 的笔记内查找继续独立。新增 API 不会自动改动主应用菜单或快捷键。原 Notes 的全局列表搜索使用 Option+Cmd+F，Cmd+Shift+F 对应查找和替换；早期插件及宿主记录中的 Cmd+Shift+F 是历史候选行为，不代表原版快捷键一致。当前 Rust 菜单单独修正为 `CmdOrCtrl+Alt+F`，尚须以该新输入构建后实际验证，不能由旧包的聚焦结果推定通过。浏览器预览保留原有独立快捷键。

早期插件阶段的两窗焦点、实际输入、中文组字、重复调用、关闭与重绑 GUI 验证状态仍以 `docs/verification/app-001-native-toolbar-plugin/focus-search/README.md` 为准。正式包后续的有限搜索编辑几何观察单独见 `docs/verification/app-001-fix-02-visual-01/runtime-search-editor-01/selfcheck.md`：该包仍使用旧快捷键，长查询视口与焦点颜色尚未通过，不能作为此次快捷键纠正的运行证据。

## 权限

宿主 capability 仅授予自己创建的窗口，例如 windows: ["main", "note-*"]，permissions: ["notes-ui:default", "core:event:allow-listen", "core:event:allow-unlisten"]。notes-ui:default 允许 bind/update/unbind/inspect/focus_search（含 allow-focus-search）；命令从 Tauri 注入当前 Window 再核对 windowLabel，不能凭参数绑定其他窗口。不要把权限开放给远程页面。状态仅含标题、计数、动作、菜单和搜索，不传正文、密码或密钥。

常见错误：invalid_state（未知字段、非法数字/长度/菜单）、invalid_binding、window_mismatch、already_bound、stale_binding、stale_state、stale_search、search_composition、symbol_unavailable、unsupported；其他主线程/原生失败返回 thread/window/native/dispatch/state。错误值均为 {code,message}。native 返回 material、reservedTop、真实 contentWidth、active、overflowActions、searchSequence、fullSizeContent、symbolFallbacks、windowNumber、scaleFactor。

## 构建与真实示例

```sh
cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --target-dir plugins/tauri-plugin-notes-scan/target
cargo build --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --features desktop-demo --example toolbar_demo --target-dir plugins/tauri-plugin-notes-scan/target
plugins/tauri-plugin-notes-scan/target/debug/examples/toolbar_demo > docs/verification/app-001-native-toolbar-plugin/demo-runtime.txt 2>&1
```

复用 target 只是编译缓存，不依赖扫描插件源码。desktop-demo 启用真实 Wry 和本地 data URL。tauri::test::mock_context 只提供空 Context/asset helper；运行时和 NSWindow 都是 Wry，不是 MockRuntime。示例打开 native-toolbar-demo（1088×660）和 native-toolbar-independent（740×520）两个合成窗口，无笔记存储/远程网络/JS IPC。viewOptions→画廊及返回、sidebar、table、search 有最小宿主状态响应，其余只输出事件。HTML 分栏为静态对照，不能作为应用布局通过证据。

日志每个 binding/state 行含真实 windowNumber、bindingId、revision；每个 intent 行含明确窗口身份。开发者日志保存在 docs/verification/app-001-native-toolbar-plugin/demo-runtime.txt。示例没有内建 inspect/unbind/rebind 操作入口；独立验证可按 guest/Rust API 写专门宿主探针，未执行这些操作前保留 unknown。关闭时 C 的 NSWindowWillClose 清理自有视图/监听/回调，Rust RunEvent::Destroyed 清理绑定表；程序退出也有 on_drop 清理。当前没有分配计数或关闭日志来证明释放次数，关闭/重开内存验证仍 unknown。

## 本阶段边界

真实运行发现并修复 BOOL→JSON integer 导致 bind 响应解析失败的问题；active/fullSizeContent 现在明确 JSON boolean。两窗实际绑定与有限意图/更新已有日志。一次 cua.getApp(.app) 调用挂起 1762 秒后被中断，无法取得受控截图；事件日志有输入记录，但不把工具挂起期间的动作归因于完成的受控测试。未完成搜索、选区、缩放、溢出、关闭重开或像素/RGB差分，均 unknown。正式主应用接入和像素验收属于 FIX02；不能把编译成功、glassRegular 诊断或符号校准当作 UI 完全一致。

## 非 Mac 头部编译补证（历史基线）

2026-11-03：使用已安装 aarch64-linux-android 目标和现有 scan target，离线 locked 的 `cargo check --lib` 通过（4.08秒）。编译输入仅 src/lib.rs + src/model.rs，未纳入 macos.rs/toolbar.m；插件 build-script 未输出 AppKit/Foundation/QuartzCore 链接，Android normal dependencies 无 Apple framework 包。5项 dead-code warning 来自非Mac分支未用的Mac绑定状态/权限助手，不影响通过。

bind/update/inspect/unbind 先做自身参数校验，对有效调用均返回 `{code:"unsupported",message:"此原生顶部模块仅支持 macOS"}`。此为编译与源码契约验证，未执行Android invoke；不声称此模块提供手机原生顶部栏。guest严格TypeScript检查再次通过。所有代码/Cargo/锁相对adc544a未变化，证据见 docs/verification/app-001-native-toolbar-plugin/android-compile-audit.json、android-check.txt、android-build-script-output.txt、android-module-inputs.txt 和 android-normal-dependencies.txt。

2026-11-03 focusSearch 后续候选的接口、8项Rust检查、strict TS、Wry构建和Android条件编译记录单独保存在 `docs/verification/app-001-native-toolbar-plugin/focus-search/`；本段 adc544a/7760bb7 的历史日志不替代新候选的运行证据。新入口在非Mac同样先校验调用窗口及UUID，对有效调用明确返回 unsupported；Android invoke仍未运行。
