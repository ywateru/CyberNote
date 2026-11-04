# Mac keyboard policy35 — SOURCE-READY STOP（整体 partial）

2026-11-05，Asia/Shanghai。仅在隔离目录 `/private/tmp/apple-notes-mac-keyboard35-01` 实施，分配分支 `task/mac-keyboard-policy35`，分配 base `e687ea6ceaa02c57e511c4a97a6187cba5f5acf0`。作者没有执行 Git、Computer Use、ADB、可见窗口操作或系统设置修改；root 负责提交，另作者独立复核。自有编译输出目录为 `/private/tmp/apple-notes-mac-keyboard35-target-01`，Cargo 均 locked/offline，未下载、改锁或使用共享 target。

## 结果和范围

候选让每个构建完成的真实 WKWebView，采用当次直接读取的 `NSApp.isFullKeyboardAccessEnabled` 作为公开 `WKPreferences.tabFocusesLinks`。通过插件的 `on_webview_ready → with_webview` 在同一回调取显式 `inner()` 和 `ns_window()`，没有查找窗口子视图、猜测原生类型或新增宿主调用。

单独的原生 controller 在初始注册、所属 NSWindow 变为 key、应用重新激活且该窗口为 key、以及该窗口下一次 Tab keyDown 分发前重读。local monitor 只按所属窗口、事件类型和 Tab keyCode 过滤，原样返回 NSEvent；不读取修饰键来反转策略，不保存按键，不改 DOM 或表单焦点。系统 getter 不缓存，不使用 defaults/KVO。

controller 弱持有 WKWebView/NSWindow，强持有自己的 local monitor 和三个通知令牌，独立于工具栏绑定和显隐。WillClose、Rust Destroyed、插件 drop 做幂等清理。原生校验主线程、实际 WK 类型、真实所属窗口与重复标识；安装调度失败和回调内实际安装失败分别记录，只有回调内原生返回成功才输出完成。原生异常在 C ABI 内转为失败状态，通知/导航边界失败输出通用诊断，不记录按键内容。

改动仅六条产品路径，详见 [product-files.json](product-files.json) 和 [product.diff](product.diff)：插件 `src/lib.rs`、`src/macos.rs`、`macos/keyboard.m`、`build.rs`、`Cargo.toml`、`README.md`。root 已批准为 Mac target 的同一已锁定 Tauri 显式启用 wry feature；这是 `with_webview` 的编译前提。没有版本、锁文件、宿主或前端变更。Android 不编译原生 helper 或链接 WebKit。

## 有限验证

|检查|结果|证据及边界|
|---|---|---|
|Mac 插件独立默认 lib 离线编译|exit0，36.10秒|[rust-check.log](rust-check.log)，验证显式 Mac wry 特性与 FFI 接入可编译|
|现有插件 Rust lib 检查|16 passed，0 failed；编译31.76秒|[rust-test.log](rust-test.log)，既有绑定/路由/搜索契约回归，不代替新系统策略运行|
|Android aarch64 lib 离线编译|exit0，39.51秒|[android-check.log](android-check.log)，五项已有非 Mac dead-code warning保留|
|Android normal 依赖与 build 输出|无 wry/objc2 normal依赖、无 keyboard/framework 指令|[android-normal-dependencies.log](android-normal-dependencies.log)、[build-boundaries.json](build-boundaries.json)|
|clang 严格语法和受控程序编译|exit0，`-Wall -Wextra -Werror`|[native-compile.log](native-compile.log)，空输出表示编译无诊断|
|生产 helper 的原生受控机制|27 项通过|[native-mechanism.m](native-mechanism.m)、[native-mechanism.log](native-mechanism.log)|
|Rust 格式|exit0|`cargo fmt --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml -- --check`|

原生机制程序直接 include 本次生产 `keyboard.m`，创建真实但不显示的两个 NSWindow/WKWebView，使用 nonPersistentDataStore，不加载页面、不读产品/原版数据库。测试用 NSApplication 子类明确模拟系统 getter false/true 并统计读取次数；用 NSEvent 子类明确提供事件所属窗口/类型/keyCode/flags；用窗口子类的受控 key 状态和手动发布的真实通知中心事件覆盖通知边界。**这些输入是测试边界，不是实际系统设置切换、真实窗口激活或物理按键送达。**

27 项包括：真实 WKPreferences 初始 false 和后续 true/false；每个触发点直接重读；重复注册不增令牌；其他窗口通知和 Tab、非 Tab、keyUp 不触发本视图读取；Tab/Shift/Option 返回同一事件且不反转；错误目标/空标识/重复身份/非主线程明确拒绝；关闭、窗口 label 定向销毁、全清理幂等；令牌移除、弱指针清空，以及 controller 不被 monitor/observer block 留存；两个窗口全程不显示、URL 为 nil。

## 已保留的失败与限制

最初用系统工厂 NSEvent 构造事件的离屏尝试失败，日志为 [native-mechanism-first-failure.log](native-mechanism-first-failure.log) 和 [native-mechanism-second-failure.log](native-mechanism-second-failure.log)，分别使用 deferred/nondeferred 隐藏窗口，均到第10项 Tab 检查失败。追加的 [native-event-diagnostic.log](native-event-diagnostic.log) 记录 windowNumber/eventWindowNumber 均0、event.window 不等于所属窗口、原事件 identity 保留、getter 未新增读取。这说明测试环境没有为隐藏窗口提供事件归属；生产过滤按约拒绝，未据此扩大捕获范围或修改产品补偿。最初两次测试源版本未分别封存；最终受控源明确替换为事件子类，不把其结果冒充系统工厂路径通过。

local monitor 的实际 AppKit 注册产生了非空令牌，生产 handler 边界已受控验证；**真正通过 NSApplication 分发到 monitor 的按键和 WebKit 焦点移动没有在这里实测**。原生日志中的 IOPM 和 launchservices 环境提示保留；程序最终 exit0。不创建可见窗口来消除这些限制。

root 新封存的原版 ordinary Option-Tab 观察表明名称被一个 `\t` 字符替换，随后 Escape 取消未保存（原版证据索引 SHA-256 `52cd20318cf8bc6fd95a823d41118221b5503245b8220526f86f7e34fbf6860a`）。本作者只读取该序列的01 AX文本，不重新操作原版。35 保留公开 WebKit 修饰键语义，仅实现全局系统策略同步，**不宣称 Option 插入行为已复刻**。该局部行为须另做窄接入与原版对照。

正式准确 Mac 包中的 ordinary/smart 名称 Tab/Shift+Tab、部分选择与输入、组字、Enter/Escape、原生搜索、独立窗口和同进程真实系统开关变化均未实测；当前未获授权改变系统开关。若同步策略后普通 Tab 仍不同，应保留产品证据再定位，不能从本受控检查推出与原版完全相同。整体交互与像素目标继续 partial。

## 来源和完整性

本机 Apple SDK 与固定 Tauri 入口的精确 hash/行号原文见 [source-boundaries.json](source-boundaries.json)。SDK 明确要求直接访问系统属性、KVO 不通知；WKPreferences 的公开说明将 Option 临时反转交由原生处理；NSEvent 说明 local monitor 位于 NSApplication 分发前，嵌套 tracking loop 消费的事件不经过该入口。当前普通/智能 HTML 表单路径仍需真实包验证；不扩展到菜单 tracking loop 的全局捕获。

初始12项输入见 [inputs.before.json](inputs.before.json)。[integrity-result.json](integrity-result.json) 记录保护的6项输入（插件/宿主锁、宿主清单/源码和既有研究）未变，插件目录与主树未修改的插件基线按字节仅差批准六路径。任务文档在 START 后由root更新，当前副本与主树任务相同，另保存 [task.current.md](task.current.md)，不将其误报为作者产品越界或全部输入未变。构建输出身份及 Mac/Android 条件边界另记录于 [build-boundaries.json](build-boundaries.json)。

交接为 SOURCE-READY STOP。root 提交后由不同作者独审，再安排准确新包与实际对比。本目录索引为 [evidence-index.json](evidence-index.json)，不包含索引自身。
