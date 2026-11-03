# Mac 原生图标与玻璃工具栏研究

日期：2026-11-03。范围：公开 AppKit API、本机 SDK 和当前已锁定依赖。没有操作 GUI、运行系统 Notes、改生产代码或复制 Notes 内部资源。本文件说明可行路径，不表示外观已与原版一致。

## 结论与建议顺序

1. **图标可先独立替换。** Mac 运行时调用 `NSImage(systemSymbolName:accessibilityDescription:)`，明确指定字号、字重和 symbol scale。可以返回透明 PNG 的 alpha 作为 WebView 图标 mask，也可以直接用于原生按钮。本机离屏探针已成功生成候选图标。
2. **Mac 26 的胶囊材质应优先用原生工具栏/控件验证。** 本机 SDK 有公开 `NSGlassEffectView`、`NSGlassEffectContainerView`；现有 `objc2-app-kit` 已包含绑定。旧 `NSVisualEffectView` 的 blur/vibrancy 与这两个 API 不同，不能把旧材质换个圆角就当作原版玻璃。
3. **优先小范围原生化，保持编辑器和数据链路。** 先替换图标并测量，再做只包含顶部工具栏的 native view 原型，对比激活、失活、按压和明暗状态。不要一次把整个 WKWebView 包进玻璃：编辑纸张应白底，玻璃应局限于控件/浮层；原生层级变化还需验证焦点、输入法、窗口缩放、菜单锚点和点击区域。
4. Android 仍按录屏单独绘制图标和面板。Mac 的运行时 API、输出缓存和组件分支仅在 macOS 使用，不将此探针产生的系统图像作为 Android 生产资产。

## 本机实证

| 项目 | 观察结果 |
|---|---|
| 编译 SDK | `MacOSX.sdk` 解析为 `/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`；SDKSettings 的 Version=26.5 |
| Swift | Apple Swift 6.3.3，arm64；使用 xcrun swiftc 编译离屏探针成功 |
| 运行环境 | 项目已记录 macOS 26.4；探针未创建 NSApplication/NSWindow，也未连接正在验证的应用 |
| 原生类 | `NSClassFromString` 对 NSGlassEffectView、NSGlassEffectContainerView、NSBackgroundExtensionView 均返回存在 |
| 图标 | 下表14个候选名称均返回 NSImage；配置17pt / regular / medium 后 `isTemplate=true` |
| 栅格 | 明确创建32×32pt、64×64px的NSBitmapImageRep，图像透明alpha边界有效；不是仅修改PNG DPI声明 |

探针位于 `/tmp/notes-native-ui-probe/probe.swift`，可执行文件 `probe`；结果 `symbols.json`、`raster-check.json` 和每个符号的 PNG 同目录。只用于本次研究，未加入应用。`/tmp` 不保证长期保留；下面保留了关键方法和参数，正式实现需要自己的可复现验证。

| 候选名称 | 配置后NSImage逻辑尺寸（pt） | 候选用途，尚未逐图确认原版采用此名 |
|---|---:|---|
| square.and.pencil | 21×20 | 新建 |
| folder | 23×18 | 文件夹 |
| folder.badge.plus | 26×19 | 添加文件夹 |
| sidebar.left | 24×18 | 显隐侧栏 |
| list.bullet.circle | 19×19 | 列表候选 |
| checklist | 23×19 | 核对清单 |
| tablecells | 24×18 | 表格 |
| paperclip | 20×21 | 附件 |
| square.and.arrow.up | 19×22 | 共享 |
| ellipsis | 18×6 | 更多 |
| magnifyingglass | 21×19 | 搜索 |
| note.text | 21×18 | 笔记候选 |
| square.and.pencil.circle | 19×19 | 其他新建候选 |
| character.cursor.ibeam | 21×20 | 文本候选 |

**17pt并不表示外框17×17pt。** 符号的原生宽高随字形变化。不要统一拉伸成24×24方形；保留原生比例、统一控件命中框，测量视觉边界与基线。原版各处可能使用不同字号/字重/scale，上表只是可行性测试，不是匹配结论。

## 图标实现边界

公开API在本机 `AppKit.framework/Headers/NSImage.h`：系统符号构造从macOS11起可用；`imageWithSymbolConfiguration:`同样从11起；配置支持pointSize/weight/scale，颜色配置支持monochrome/hierarchical/palette。未知或当前系统不存在的名称可返回nil，需显式错误或已标记的替代图标。

建议的Mac调用链：

```text
MacIcon组件(kind, pointSize, weight, scale)
  → Tauri命令（仅允许固定映射的图标名和受限尺寸）
  → 主线程NSImage + NSImageSymbolConfiguration
  → 显式像素尺寸的NSBitmapImageRep/PNG
  → {pngBase64, boxWidthPt, boxHeightPt, glyphWidthPt, glyphHeightPt, pixelRatio}
  → React mask-image + currentColor，保持控件原有aria-label
```

缓存键包含符号名、配置、像素比；若直接烘焙颜色，还必须包含颜色与appearance。单色mask只取alpha，能由CSS设置Mac当前文字色/选中黄色，但它不会自动得到NSButton的失活/按压/可访问性效果。需要完整系统状态时，用原生NSButton/NSToolbarItem并让template image参与系统渲染。`NSButton.h`说明contentTintColor仅适用于borderless按钮，不能假定所有按钮设置此属性都有效。

离屏探针核心为：

```swift
let image = NSImage(systemSymbolName: "checklist", accessibilityDescription: "核对清单")!
    .withSymbolConfiguration(.init(pointSize: 17, weight: .regular, scale: .medium))!
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 64, pixelsHigh: 64,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: 32, height: 32) // 图形上下文逻辑尺寸，实际像素是2×
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
image.draw(in: NSRect(x: (32-image.size.width)/2, y: (32-image.size.height)/2,
    width: image.size.width, height: image.size.height))
NSGraphicsContext.restoreGraphicsState()
let png = rep.representation(using: .png, properties: [:])!
```

生产代码还应清空透明背景、处理nil与错误，在AppKit主线程运行并正确管理Rust/ObjC对象生命周期。多色/分层符号不能只用单色alpha近似。

## 原生工具栏和材质

Apple公开SDK提供：

- `NSWindow.toolbar`、`toolbarStyle`、`titleVisibility`、`titlebarAppearsTransparent`、`contentLayoutRect/contentLayoutGuide`。采用full-size内容时必须考虑不被工具栏遮挡的区域，不能继续硬编码一份CSS顶部高度并重复留白。
- `NSToolbar`、`NSToolbarItem`、`NSToolbarItemGroup`、`NSSearchToolbarItem`可承载实际系统按钮、分组和搜索；`NSToolbarItem.navigational`可标记返回动作。macOS26还提供item的plain/prominent style，NSButton提供borderShape。
- `NSGlassEffectView`（26+）提供contentView、cornerRadius、tintColor、regular/clear style；`NSGlassEffectContainerView`提供contentView与spacing以组合临近玻璃。公开头文件只定义regular和clear，不能把其他整数材质当公开API。
- `NSVisualEffectView`提供sidebar/menu/popover等语义材质、withinWindow/behindWindow混合和followsWindowActiveState。可用于对应语义背景或较旧系统，但不是26玻璃控件的替代证明。

关键层级约束：Apple头文件只保证 `NSGlassEffectView.contentView` 被正确置于玻璃内，随意addSubview的相对z-order没有同样保证。应将完整native控件内容设为contentView。材质是动态窗口内容，离屏生成一张静态PNG不能保留其背景采样、光照和状态响应。

原版三栏标题/分隔对齐仍需单独处理：HTML分栏不是NSSplitView，native工具栏不会自动知道CSS的228/280pt分隔。可让前端把布局宽度提交给Mac桥接层并更新约束，或再评估原生split布局。无论何种方案，resize与拖拽后均须同一状态驱动，不能让native strip和DOM各自保存独立宽度。

## 当前Rust/Tauri接入点

本次Cargo.lock已锁定 `objc2 0.6.5`、`objc2-app-kit 0.3.2`、`objc2-foundation 0.3.2`、`wry 0.57.1`、`window-vibrancy 0.8.1`。它们目前主要为Tauri的传递依赖，应用若直接使用应增加macOS条件直接依赖及最小features，不能依赖传递依赖恰好可见。当前Cargo.toml仅为tauri开启protocol-asset，没有自行声明AppKit依赖。

Tauri2.12.5源码的 `Webview::with_webview` 在主线程执行闭包，macOS `PlatformWebview.inner()` 返回WKWebView指针，`ns_window()`返回NSWindow指针；同一文档有objc2转换示例。`Window::run_on_main_thread`也可调度。不要把这些原生借用指针跨线程保存；生命周期由窗口所有者控制，应用负责保留delegate/action target和销毁清理。

推荐结构：

```text
macOS: NSWindow
  ├── 原生工具栏 / 小范围NSGlassEffectView+原生控件
  │      └── action → 同一命令/前端事件 → 编辑器命令
  └── WKWebView（文件夹/列表/富文本，初期保持现有实现）

Android: 现有移动壳和自绘图标/面板（不调用Mac桥接）
```

每个native action应走现有编辑/保存入口，不能另建一套文档状态。对格式按钮须保存/恢复编辑器选区，再执行Tiptap命令；验证中文composition、撤销历史和锁定态启用/禁用。主窗与独立窗都需安装/卸载桥接，不只初始化main窗。

`window-vibrancy 0.8.1`本机源码已有apply_liquid_glass与LiquidGlassOptions，可作为实现参考；其作用范围默认是整个传入view的bounds，不自动对应几个CSS胶囊。该crate枚举还包含明确标注private的其他style，建议只使用公开regular/clear。对于contentView保证与具体层级仍须检查实现，不能仅调用便宣称官方控件等价。

透明WebView是额外边界。Wry0.57.1源码在透明/设置背景时使用`drawsBackground` KVC；源码明确标为私有键。公开WKWebView的underPageBackgroundColor存在，但不能据此假定能完全穿透所有网页背景。若需在WKWebView后面放原生材质，应先做独立透明性原型，公开记录实际调用；优先用原生顶栏/分离区域减少整个网页透明的依赖。当前应用没有启用透明窗口，该研究没有修改此配置。

## 验证门槛与未决项

- 当前仅实证候选符号存在、可配置且可离屏栅格化，以及本机native类存在。没有创建工具栏或玻璃窗口，不包含实际材质截图。
- 先按原版尺寸采图标候选矩阵（字号/字重/scale），对齐同一个物理像素边界比较alpha与边缘；16pt/17pt/18pt等候选必须实测，不能以名称相同推定相同字形。
- native顶栏原型应覆盖同尺寸、同桌面背景、激活/失活、明/暗、hover/按压/disabled、菜单展开、窗口resize与多窗口。输出overlay/diff与动态区域说明。
- SDK是26.5而运行系统是26.4，类存在不代表所有较新selector可用。当前最低系统配置12.0，所有26+调用必须运行时检查并明确较旧系统的表现；不把旧系统回退称作26版像素一致。
- 不能从原版截图确定具体symbol名称/字号/字重，也不能确定Notes的所有材质均使用公开regular。仍需通过原版对应截图逐项验证。静态API与探针不是原版内部实现证据。

## 可追溯资料

本机主来源根目录：`/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk/System/Library/Frameworks/AppKit.framework/Headers/`。已读取：NSImage.h、NSButton.h、NSWindow.h、NSToolbar.h、NSToolbarItem.h、NSToolbarItemGroup.h、NSVisualEffectView.h、NSGlassEffectView.h；WebKit.framework/Headers/WKWebView.h。

依赖源码根目录：`/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/`。已读取tauri-2.12.5/src/webview/mod.rs和window/mod.rs、objc2-app-kit-0.3.2生成NSImage/NSGlassEffectView绑定与Cargo.toml、wry-0.57.1/src/wkwebview/mod.rs、window-vibrancy-0.8.1/src/macos/。

本轮尝试了Apple开发文档的网络搜索与页面读取，但可见返回为空，未获得可引用正文；因此没有把在线页面或视频当作已验证来源。具体技术结论以上述实际读取的本机公开头文件和源码为主。
