# notes-ui 原生顶部控件候选

独立 Tauri 2 插件；本阶段没有接入主应用。macOS 使用公开 AppKit、NSImage 系统符号和 macOS 26+ NSGlassEffectView。旧系统使用 NSVisualEffectView HeaderView，诊断返回 legacyHeader；不声明旧材质与原版一致。非 macOS 命令返回 unsupported。

## 宿主契约

注册 `.plugin(tauri_plugin_notes_ui::init())`。Rust 可通过 `NotesUiExt` 对显式 `Window` 调用 bind/update/inspect/unbind；guest API 见 guest-js/index.ts。前端实例只接受当前 window label，绑定得到 UUID bindingId。更新须使用同一窗口/绑定以及严格递增 revision；销毁旧实例后重新 bind 使用新 UUID。

顶部只管理自己加入的视图，不修改宿主 NSWindow toolbar/title/decorations，也不读写 Store。宿主隐藏重复 DOM 工具栏，并按 `native.reservedTop`（52 pt）为正文留出空间；分栏宽度与 sidebarVisible 必须同步真实宿主布局。独立窗使用 independentNote，不显示三栏文件夹标题。

```ts
const toolbar = new NotesToolbar();
const unlisten = await toolbar.listen(event => routeIntentToThisWindow(event));
const bound = await toolbar.bind(initialState);
// 状态提交串行化；合并搜索事件后递增 revision，再调用 update。
await toolbar.update(nextState);
const diagnostic = await toolbar.inspect();
// 窗口组件销毁：先解除绑定，再解除事件监听。
await toolbar.unbind();
unlisten();
```

`routeIntentToThisWindow` 与状态变量由宿主实现；以上不是可单独运行的笔记应用。按钮只产生意图，不绕过原应用保存/编辑/授权命令。宿主应保存当前编辑器 selection bookmark，并在格式命令执行时恢复；原生按钮拒绝 first responder，但本阶段未完成真实编辑器选区回归。

事件 `notes-ui://intent` 明确发送到 `EventTarget::Window { label }`，包含 windowLabel、bindingId、stateRevision、sequence 和类型化 intent。前端使用 `getCurrentWindow().listen`，并再次过滤 label+bindingId。Rust 的 WebviewWindow::listen 目标与 Window::listen 不同，Rust 宿主应监听 Window 或 listen_any 后严格路由。省略动作即隐藏；disabled 动作/菜单不发意图。菜单命令为固定枚举，不接受任意 selector 或 JS。格式菜单目前为标准 NSMenu，尚未复制原版字体按钮横排弹层。

搜索字段不保存最近搜索；输入法 marked text 不发查询更新。宿主必须合并最新搜索事件的 value，并把 acknowledgedEvent 设为该 sequence；落后的状态返回 stale_search。组字期间改变文字返回 search_composition。相同文字不调用 setter，以保留选区。并发状态更新须由宿主排队；本阶段未验证中文组字、搜索 Return/Escape 和更新竞态。

## 权限

宿主 capability 仅授予自己创建的窗口，例如 windows: ["main", "note-*"]，permissions: ["notes-ui:default", "core:event:allow-listen", "core:event:allow-unlisten"]。notes-ui:default 仅允许 bind/update/unbind/inspect；命令从 Tauri 注入当前 Window 再核对 windowLabel，不能凭参数绑定其他窗口。不要把权限开放给远程页面。状态仅含标题、计数、动作、菜单和搜索，不传正文、密码或密钥。

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

真实运行发现并修复 BOOL→JSON integer 导致 bind 响应解析失败的问题；active/fullSizeContent 现在明确 JSON boolean。两窗实际绑定与有限意图/更新已有日志。一次 cua.getApp(.app) 调用挂起 1762 秒后被中断，无法取得受控截图；事件日志有输入记录，但不把工具挂起期间的动作归因于完成的受控测试。未完成搜索、选区、缩放、溢出、关闭重开、非 Mac 编译或像素/RGB差分，均 unknown。正式主应用接入和像素验收属于 FIX02；不能把编译成功、glassRegular 诊断或符号校准当作 UI 完全一致。
