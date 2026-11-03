# FIX-01 Android IME 遮挡补修：开发者回归

日期：2026-11-03。来源：独立 P1 `docs/verification/qa-fix-01/run-08f2776/finding-android-ime.md`。本记录为修复候选的开发者自测，**待独立复验，不关闭原 finding，也不宣称像素验收通过**。原 FIX-01 与 QA 取证保持原样。

## 改动与产物范围

唯一生产改动为 `src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt` 的根容器 inset listener：原生容器底部 padding 取 systemBars 与 Type.ime() bottom 的较大值，顶部/左右仍取 systemBars；已处理的 inset 扣除后传给 WebView。这样 WebView 的真实布局高度随 IME 改变。未加前端 keyboard offset 或第二套 visualViewport 定位，未修改共享 App / CSS / Rust / Mac 配置。

只执行 `pnpm android:build --debug` 并更新安装 Android APK，未重新构建 Mac。最终 Mac 可执行文件仍精确匹配原 FIX-01 SHA-256；共享前端、Rust 和 macOS 构建输入也与原 FIX-01 相同。新源码清单与差异核对见 `build-manifest.json`。

- 新 APK SHA-256：`5b08ee22fa8d1e7422062bec81b87097232db2b1f485e15fc280cf0fe5c6b48e`
- 设备实际安装 base.apk 的 sha256sum 与新 APK 相同，见 `checks/installed-apk.txt`。
- 未改 Mac 可执行文件 SHA-256：`fc9f522fa6f0eedfc77854280b3bee34d26c784cd8b839dd535881eed57a8eae`
- 新生产源聚合 SHA-256：`93902520e5f032e1b31c274bc2b06c63e17522f505540601734c6eaffc62dba2`

## 真实输入与结果

设备仍为 emulator-5580，Android 11 / API30、1080×2280、devicePixelRatio=2.75、Chrome91、Google LatinIME。脚本 `scripts/android-ime-regression.mjs` 通过 adb 原生触摸、原生文本输入、实际系统键盘 Enter 坐标和系统 Back 完成全部 UI 变化；CDP 仅观察 DOM/编辑器并调用只读 Rust load_workspace，不调用 click、focus、selection setter 或编辑器命令。

1. 冷启动克隆应用，原生触摸新建，输入独立合成标题 FIX01IME-1793688849354；触摸截图所示系统键盘 Enter，原生输入 Alpha Beta Gamma，实际形成 h1 + paragraph。
2. `android/keyboard-before-native.png/json`：IME 显示时 WebView 从 `[393,751,2.75]` 缩为 `[393,502,2.75]`。截图显示整条编辑工具栏位于键盘上方；格式按钮物理 Y1352–1456，可见应用下边界 Y1464，与 IME 顶部衔接。原 P1 的布局高751、工具栏落入 IME 现象在本次候选中不再出现。
3. 根据正文 Beta 的只读文本 bounds，使用 adb 原生长按选中 Beta；`selection-native` 记录真实 DOM selection 与编辑器 anchor/head。
4. **在 IME 仍显示时**，按格式按钮实际屏幕中心坐标触摸，`format-native` 面板成功出现，IME 隐藏，Editor 失焦，原选区保留。不是收键盘绕行，也不是 DOM 点击。
5. 原生触摸粗体：`bold-native` 中只有 Beta 获得 bold，选区保留、Editor 仍失焦、IME 仍隐藏。
6. 原生触摸 X：`x-native` 中同一选区恢复、IME 显示，WebView 再次为502高，格式工具栏仍可达。
7. 从该键盘状态再次原生触摸格式并按系统 Back：`panel-back-native` 中面板关闭、IME 隐藏、仍在 page-editor，布局高恢复751。
8. 原生触摸正文恢复键盘，再按系统 Back：`keyboard-resumed-native` 与 `ime-back-native` 显示键盘隐藏且笔记仍打开，布局高恢复751。
9. `saved-note.json` 为 Rust 实际保存的这份合成笔记，含正确 Beta bold；WebView 异常为空。

最终脚本一次完整运行通过，见 `android/result.json`、`android/native-actions.jsonl` 和 `checks/regression.log`。物理 WebView top=83px 与 IME Enter 坐标是此设备截图夹具，脚本不冒充跨设备通用输入驱动。

## 验证边界

- Android 构建通过，包含 TypeScript/Vite 与 Android Kotlin 编译；已知 Vite 块体积提示保留。测试脚本 Prettier 检查通过。
- 没有改 Rust、共享前端或文档 schema，因此本次未扩大重跑全部存储/schema/纸张矩阵。
- 只证明当前 Android11/Chrome91 实机模拟环境的该原生触达闭环；未据此推断真机、新版 Android、其他 IME、组合输入或动画像素一致。
- 旧 `scripts/android-fix01.mjs` 中的 DOM click 已被独立发现不能证明 hit-test。此新脚本和证据补上真实触达性；原证据的通过表述由本 finding / 补修范围限定，未改写历史记录。
- 原始构建日志末尾空行按原样保留；源码与说明文档的差异空白检查单独执行。

Android GUI 已释放，可由独立 verify 对新 APK 复验。Mac GUI 一直由 verify 持有，本补修没有触碰。
