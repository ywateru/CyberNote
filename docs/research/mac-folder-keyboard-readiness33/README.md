# Mac 文件夹表单键盘导航接入准备33

状态：READY STOP。2026-11-05，Asia/Shanghai。范围仅只读调研及无窗口系统属性查询；产品、系统偏好、窗口和设备均未更改。本研究不接收 task31 的文字绘制实现，也不代表 Tab 差异已经修复。

## 结论与证据

本机在 **2026-11-05 06:00:45.537933 +08:00** 直接查询 `NSApplication.isFullKeyboardAccessEnabled`，结果为 **false**。查询在主线程执行，查询前后自身窗口数均为0、应用 active 均为 false，进程 exit0，无 stderr。原始命令与输出见 [query-result.json](query-result.json)，查询源见 [query-keyboard.m](query-keyboard.m)，编译命令见 [query-compile.json](query-compile.json)。未调用激活、创建窗口、启动事件循环或写入设置的 API。

固定依赖为 Tauri 2.12.5、tauri-runtime-wry 2.12.3、wry 0.57.1、tao 0.37.2、objc2-web-kit 0.3.2（`src-tauri/Cargo.lock`）。本地 wry 0.57.1 的 `src/wkwebview/mod.rs:559` 在 macOS 初始化中无条件将 `tabFocusesLinks` 设为 YES。该赋值没有读取上述系统属性。它处于配置构建之后，传入自定义 `WKWebViewConfiguration` 也会经过这一步，所以仅在 builder 提供一个预先设为 false 的配置不能抵消这条后续赋值。

本机 SDK 的 `WKPreferences.h:60–66` 说明，YES 让 Tab 进入链接和表单控件，Option 临时反转这一策略。`NSApplication.h:376–380` 说明该系统属性对应“系统设置 → 键盘 → 键盘导航”，不保证等同于“辅助功能 → 键盘 → 全键盘控制”；属性读取便宜，应直接读取，KVO 不提供更改通知。全局 defaults 中某个键不存在不能推导该属性值。

原版 [original31/03](../mac-ordinary-original31/03-after-tab.ax.txt) 与 [04](../mac-ordinary-original31/04-after-shift-tab.ax.txt) 的有限序列中，Tab 和 Shift+Tab 后名称仍为全选；准确 Mac12 runtime29/10 的已有记录则进入 checkbox。**系统 false + wry 强制 YES 是与已见差异一致的具体机制证据，仍是待产品实验确认的解释**。查询时点不等同于原版截图时点；本次没有重新运行原版或克隆，也没有读取其运行中 WKPreferences，因此不能把时间相隔的两项观察写成同一时刻的因果实证。

## 当前接缝

| 入口 | 已核事实 | 最小使用边界 |
|---|---|---|
| `WebviewWindow::with_webview` | Tauri `src/webview/webview_window.rs:2498` 转发至 Webview 的对应 API | 在已创建的真实 WebView 上操作，避开初始化时 wry 覆盖 |
| `PlatformWebview::inner()` | Tauri `src/webview/mod.rs:204` 返回真实 WKWebView 指针；同文件文档给出 macOS 类型转换示例 | 指针仅在回调和主线程所有权范围内使用，不跨线程缓存 |
| runtime dispatcher | `tauri-runtime-wry/src/lib.rs:1552` 将回调送入 WebviewMessage；`:3891` 在运行时事件处理处提供原生视图 | 调用返回不能视为原生设置已经完成；需要有明确完成/失败契约 |
| 当前 notes-ui 插件 | `macos.rs:226` 当前只取得 NSWindow 并调用 ObjC `notes_ui_bind`；`build.rs` 只链接 AppKit/Foundation/QuartzCore | 尚无 WKWebView 参数，也无 WebKit 原生偏好接入，不能直接在现有 NSWindow 指针上假定视图类型 |
| 当前宿主 | `src-tauri/src/lib.rs:430–431` 仅 macOS 注册 notes-ui；插件已有主线程调度和窗口清理生命周期 | 根任务尚未选定由宿主还是插件拥有新接入；本研究不代替该决定 |

上述行号及原文摘录见 [source-excerpts.json](source-excerpts.json)，精确输入字节身份见 [protected-inputs.before.json](protected-inputs.before.json)。当前产品路径与固定版本依赖源内的有界搜索未发现已有 `tabFocusesLinks` 或 `isFullKeyboardAccessEnabled` 配置；这是本次搜索范围的结论，不是所有配置或所有版本的不存在证明。没有读取正在修改的 `src/smart-folders.css`。

## 后续最小候选

后续单独实现任务可先在 macOS 的构建后 WKWebView 回调中，通过公开 `WKPreferences.tabFocusesLinks` 设置与**当次直接查询**的系统键盘导航属性相符的值。优先使用 Tauri 提供的 WKWebView 入口，避免遍历 NSWindow 子视图或依赖私有 WebKit key。插件如采用 ObjC 路径，需要显式 WebKit 桥接和链接；如采用 Rust 类型接口，需要对应的 macOS 依赖/feature。这里不选定最终路径，也不增加事件监视器。

只在创建窗口时读取会把旧值固定到该窗口生命周期，不能作为完整方案。最终接入必须说明何时重新直接读取，以覆盖同一应用内 Control-F7 或系统设置改变、窗口重新激活后的行为；不得用 KVO、静态缓存或缺失 defaults 键代替实时值。不得把 Tab 在 DOM 中无条件吞掉作为系统策略同步：那将掩盖开启键盘导航时应保留的控制路径。Option 临时反转交由原生 WebKit 语义，不自行写反转逻辑。

`false` 只说明原生 Tab 策略，不单独保证名称自动全选、Shift+Tab、控件顺序或焦点环与原版一致。若同步原生策略后仍不一致，应先保留真实运行证据，再确定是否需要局部表单处理；本次不预先修改表单或扩大到所有窗口。

后续验证应有明确的有限矩阵：系统关闭/开启分别对比普通与智能表单；名称完整/部分选择、Tab/Shift+Tab、Option-Tab；同一进程内 Control-F7 切换后再操作、离开并重新激活；Enter/Escape、输入与组合输入保持；原生搜索与独立窗口无回归。切换系统状态需要另行安排并恢复，本次没有自行改变设置。Android/iOS 不受这项 macOS API 接入影响，不能外推移动端结论。

## 官方来源与访问限制

访问日期2026-11-05。Apple 文档 URL：

- [NSApplication.isFullKeyboardAccessEnabled](https://developer.apple.com/documentation/appkit/nsapplication/isfullkeyboardaccessenabled)
- [WKPreferences.tabFocusesLinks](https://developer.apple.com/documentation/webkit/wkpreferences/tabfocuseslinks)

网页工具取得了标题和 JavaScript 提示，跟随官方 Markdown 链接均返回400 unsupported content-type，**没有取得官网正文**。本报告对 API 语义的正文核查依据为本机 Apple SDK 头文件，保留其精确 hash 和行号；未将网页标题/搜索摘要冒充正文。访问返回摘要见 [official-access.json](official-access.json)。

## 完整性与限制

[protected-inputs.after.json](protected-inputs.after.json) 与 [integrity-result.json](integrity-result.json) 复核20项已保护输入字节未变。只新增本目录文件；没有执行产品构建、测试、GUI、ADB、Git、下载或依赖安装。目录索引 [files.sha256.json](files.sha256.json) 包含其余交付文件的字节数与 SHA-256，索引自身的 SHA 由交接消息另行提供。

READY STOP：等待根任务调度 task31 的不同作者独立审查。
