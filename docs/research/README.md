# 调研记录

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
