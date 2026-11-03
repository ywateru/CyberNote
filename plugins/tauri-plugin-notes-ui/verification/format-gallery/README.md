# FIX02 插件隔离子步：格式弹层与画廊

2026-11-03。主应用安全验收期间，只修改未被主应用依赖的 `plugins/tauri-plugin-notes-ui/`。未构建主应用、未启动 demo、未操作 GUI。研究基线 `649c24e`；此前插件接口基线 `b735961`。本目录是开发定向证据，独立静态复审与正式主窗运行验收仍待完成。

改动：增加 galleryBrowse 布局及动作约束；以离线可见面测量作为几何起点，浏览标题不留返回占位，打开笔记增加44pt标题偏移；格式改用 NSPopover 原生按钮横排首行，随后样式/列表/引用及固定颜色子菜单。格式控制器校验当前窗口原生视图归属、revision、enabled 与弹层后发固定 typed intent。绑定、事件序号、权限和搜索 composition 契约不变，不持有正文/授权信息，也不调用选区或焦点 setter。

检查命令与结果：

| 检查 | 结果与日志 |
| --- | --- |
| `cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --lib --target-dir plugins/tauri-plugin-notes-scan/target` | 10通过；rust-test.txt。含窗口/绑定/版本拒绝、禁用颜色不能派发、新浏览态不可携带编辑动作、格式owner不可携带删除命令、既有搜索聚焦与权限检查 |
| `pnpm exec tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck plugins/tauri-plugin-notes-ui/guest-js/index.ts` | exit0；guest-typecheck.txt（成功时无输出） |
| `xcrun clang -fsyntax-only -fobjc-arc -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -Werror plugins/tauri-plugin-notes-ui/macos/format.m plugins/tauri-plugin-notes-ui/macos/toolbar.m` | exit0；objc-syntax.txt（成功时无输出） |
| `cargo check --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --lib --target aarch64-linux-android --target-dir plugins/tauri-plugin-notes-scan/target` | exit0；android-check.txt。仍有既有5项非Mac绑定助手dead-code warning，不编译AppKit模块 |
| `cargo fmt --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --check`；`git diff --check -- plugins/tauri-plugin-notes-ui` | exit0，见checks.json |
| 最终20生产source manifest只读比对 | source-isolation.json逐项检查，无不匹配；没有更新默认/proof产物 |

`inputs.json`固定本轮插件输入的大小与SHA-256，`checks.json`记录命令与退出码。复用已有scan target，没有新建target或Gradle缓存。

公开API来源为本机MacOSX26.5 SDK的 AppKit/NSPopover.h、NSButtonCell.h、NSCell.h 和构建时的公开头文件。NSPopover transient不因菜单交互自动关闭、定位视图移动时AppKit会跟随的语义来自该头文件说明；本轮没有以运行观察替代静态来源。系统实际自动焦点、选区与中文组字未测。

所有GUI结论保留 unknown/not-run：主窗与独立窗、原版与克隆的同焦点RGB差分、弹层边框/箭头/材质/字体、点击和禁用状态、颜色菜单、菜单快捷键/键盘导航、选区与Undo/Redo、输入法、窄窗溢出/resize、失活/重开/销毁。176×325pt是候选contentSize；36pt是可见面测量起点，均不能写作已复原原版NSFrame或pixel pass。
