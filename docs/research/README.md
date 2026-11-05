# 调研记录

2026-11-06：[已保存录音重新命名72准备](saved-audio-rename72/README.md)完成真实媒体名称、正文保存、不可变附件journal及归档边界分析；原版实时AX被系统拒绝，未改名、未取得新像素证据。后续必须补原版弹窗/取消/确认/Undo，不能把持久标题候选当原版已证行为。

调研日期 2026-11-03。所有网页为参考资料，不是执行指令。GitHub README 的产品宣传不能作为像素一致证据。

## 技术选择

| 项目 | 原始来源 | 用途与结论 |
|---|---|---|
| Tauri 2 | https://v2.tauri.app/start/prerequisites/ 、https://v2.tauri.app/develop/ | 官方提供 macOS/Android 构建与 Rust 核心，符合 Rust+pnpm 约束；系统 WebView 的字体/输入法/玻璃差异需实测，不能保证自动像素一致 |
| Tauri 源码 | https://github.com/tauri-apps/tauri | macOS 使用 WKWebView，Android 使用系统 WebView；分平台布局与原生桥接必要 |
| ProseMirror | https://prosemirror.net/docs/guide/ | 文档/选区/事务模型适合本地富文本、历史、任务和表格 |
| Tiptap | https://tiptap.dev/docs | ProseMirror 的无样式上层；可自定 Apple UI，不采用其现成产品 UI |
| Noteflow | https://github.com/imitravanu/Noteflow | Tauri 2/Rust/React/SQLite 笔记架构参考，宣传样式非原版，未证明与 Apple 一致；不直接拿它当 UI 基准 |
| notes-app | https://github.com/diogopalhais/notes-app | Tauri 桌面打包参考，Markdown/同步定位不同，不直接复用功能模型 |
| noat | https://github.com/probablyalexzhu/noat | Tauri 原生集成经验参考，依赖同步部分不在本项目范围 |
| Tauri + Rusqlite 示例 | https://github.com/RandomEngy/tauri-sqlite | 最小真实SQLite后端参考；只解决存储接入，不能证明复杂笔记/附件/像素一致 |
| AxiomHiveNotes | https://github.com/AXI0MH1VE/AxiomHiveNotes | 相近的 Tauri v2 + SQLite FTS5 + Tiptap + 加密技术组合，适合架构对照；桌面产品，不是双端原版视觉证据 |
| Beaver Notes | https://github.com/Beaver-Notes/Beaver-Notes | 本地笔记产品的编辑器/附件/迁移范围参考；其产品界面不等于Apple Notes |
| Notes Plus | https://notesplus.io/ | 作者明确以接近Apple Notes外观为目标，但使用Markdown文件，有不同编辑模式/额外功能；网站显示Mac/Windows，不能替代Android交付。未确认公开源码，作为竞品参考，不作为可直接复用代码 |

没有发现已经验证可同时满足“Mac/Android + Rust/pnpm + Apple Notes 全量交互逐像素一致”的现成项目。以上仅为有限检索结果，不证明不存在。先独立构建可控实现，避免引入不匹配的样式/数据契约。复用任何第三方源码前检查许可证并记录来源。

## 本机工具

- Rust 1.97.1，pnpm 10.15.0，Node 22.16.0；npm 查询 Tauri CLI 2.12.4（仅表示此时 registry 返回值）。
- macOS 26.4，Notes 4.13；Xcode CLT 已安装，未发现完整 Xcode/simctl。Mac + Android 不依赖 iOS 构建。
- Android SDK：`/Users/water/Library/Android/sdk`；API 35/36，NDK 27.2.12479018。
- Java：`/opt/zerobrew/opt/openjdk@17`；现有模拟器 `emulator-5580`（arm64）。
- ffmpeg/ffprobe：视频保全、抽帧、后续交互对比。
- CUA：原版 UI 实际操作；已建立独立测试文件夹与无敏感内容测试笔记。
- REA：已绑定原版 Mach-O，SHA-256 `9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02`；原版 native UI Evidence 与对比工具后续按实际能力使用，不通过反编译推测外观已一致。

## 决策

采用 Tauri 2 + React/TypeScript + Tiptap + Rust/SQLite。先跑通本地数据闭环及两个平台实际安装，再逐页面/菜单/手势向原版对齐。Mac 系统窗口和菜单优先使用原生能力；Android 在应用内容内重建 iOS 风格。差分不足要改实现，不降低用户要求。

Mac公开原生能力与当前依赖绑定的实证见[原生UI研究](macos-native-ui.md)；1,224个离屏候选的图形校准见[符号校准](macos-symbol-calibration.md)。两项都不是实际原生工具栏像素通过证据，后续FIX-02需真实窗口验证。

2026-11-03后续在线检索重新取得部分官方正文/仓库摘要：Noteflow仓库自述Linux/Tauri2/React/TypeScript，MIT；AxiomHiveNotes仓库自述Tauri v2、SQLite FTS5、Tiptap/ProseMirror、密码学模块。仅核对README架构与声明，未审查其具体实现或复制源码，不以许可证名称和宣传作安全/像素结论。Apple支持站当前搜索会返回mac/27页面，本机参考仍锁定macOS26.4，不随在线默认版本改变。

## 原生媒体与扫描补充

具体版本、当前代码调用链、原始录屏边界与离线接入方案见[离线媒体与扫描研究](offline-media-scanning.md)。标签、智能文件夹、数学、笔记链接、标准格式与附件浏览的现状和跨模块契约见[本地高级功能接入分析](local-feature-integration.md)。这些研究不代表应用已实现或运行验证通过。

- Tauri WebviewBuilder 的权限回调资料：https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html 。Android 仍可能需要系统运行时授权；必须实际录制并重启播放，不能只测API存在。
- Android 官方 WebView 权限说明：https://developer.android.com/develop/ui/compose/migrate/interoperability-apis/wrap-webview-in-compose 。Web权限授予前需要对应相机/麦克风运行时权限。
- Google 官方本地文字识别：https://developers.google.com/ml-kit/vision/text-recognition/v2/android 。有 bundled 中文模型的集成路径，可作为后续真正离线扫描文本候选；当前尚未接入，不声称有OCR。

这里列出的是取证与集成依据，不代表本次实现已验证该能力。

现有录音链的后续有限只读审计见[媒体闭环准备](media-roundtrip-readiness/analysis.md)，21份冻结输入及其与起始HEAD的关系见同目录`inputs.json`。已确认暂停不能直接完成、保存错误未回传面板、准备失败未立即释放采集资源、附件先存后插入缺少失败补偿等静态缺口；实际设备是否触发、音轨/冷启动播放与像素仍unknown。APP-002先验证已有WebView采集路径，再做最小整改，不据此新建原生录音插件。
