# APP-001 开发者自测记录

日期：2026-11-03（Asia/Shanghai）。源码：`0870d044c6347cbcf1e5aa48250c00e2bbf40db3`。这是开发者证据，独立 QA 与像素验收尚未完成。

## 构建与环境

- macOS 26.4 / arm64，原版 Notes 4.13 (3146.101.28)，克隆 bundle `com.local.notesclone`。
- Rust 1.97.1，Node 22.16.0，pnpm 10.15.0，Tauri CLI 2.12.4、Rust 2.12.5，Tiptap 3.32.2。
- Android 模拟器 `emulator-5580`，Android 11 / API 30 / arm64，系统 WebView Chrome 91.0.4472.114。截图 1080×2280px，CSS 宽 393px（DPR 约 2.75）。语言中文、亮色、系统字体；源 iPhone 录屏为 224×480px，不能据此宣布高清字形一致。
- `pnpm typecheck`、`pnpm build` 通过；Mac `pnpm mac:build`、Android `pnpm android:build --debug` 通过。Vite 有单 JS chunk 超过 500 kB 的优化提示，不是编译失败。
- 本机 Android SDK、NDK 27.2.12479018、JDK 17；生成 Android 工程 compileSdk/targetSdk 36，minSdk 26，当前只构建 arm64 debug APK。

| 产物 | 位置 | SHA-256 |
|---|---|---|
| Mac 应用 | `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/release/bundle/macos/备忘录.app` | 见下一行可执行文件 hash（bundle 含多个文件） |
| Mac 主可执行文件 | `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/release/bundle/macos/备忘录.app/Contents/MacOS/notes-clone` | `30c007a2d08ac5e27bd63fd34e696036603c898afa7216ace788f8f943a9a54c` |
| Android 最终 APK | `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` | `cba3dce05e24891bc2fa045c5d200eb2db3eb8ac05c03d1defb48ed2353beb3e` |

APK 296,201,674 bytes，含调试符号，未作为正式签名/瘦身发行包。最终 APK 在核心自测后仅同步了生成的备忘录启动图标并重打包；核心自测所用包 SHA 为 `c13bcc64a59703cbbff32bbabf4a25d67bb828df8db95d7006621749f015c9e8`，应用行为源码相同。最终包已安装，交由独立 QA 再测。

构建日志保存在 `artifacts/logs/mac-build.log`、`android-build.log`。这些产物、日志和截图按 .gitignore 留在本机。

## 实际通过的开发用例

| 用例 | 实际证据 | 结果 |
|---|---|---|
| Rust 临时 SQLite 持久化 | `store::tests::persistence_conflicts_delete_restore`：创建、保存、revision 冲突拒绝、删除/恢复、关闭重开、默认文件夹幂等 | pass |
| Rust 本地加密 | `encrypted_data_and_unlock`：明文文档清除、DB/WAL 不含正文样本、错误密码拒绝、正确密码恢复 | pass |
| Rust 附件/归档/文件夹约束 | `archive_attachments_and_cycle_guards`：附件字节、备份恢复、路径穿越拒绝、文件夹循环拒绝、删除/恢复 | pass |
| 安装启动与非白屏 | 真实安装/启动，`artifacts/android/folders-v3.png` | pass |
| 系统栏避让 | v2 截图覆盖状态栏/导航栏；v3 原生 Insets 修复后按钮在系统栏以内 | pass（当前模拟器） |
| 真实中文编辑→SQLite→强杀→冷启动 | `scripts/android-smoke.mjs` 在已安装 app 点击新建、通过 Input.insertText 输入中文、用按钮插入清单/表格、勾选、读 Rust 数据、force-stop、cold-start，比对全 Note 结构 | pass |
| 冷启动重新进入编辑器 | 通过文件夹/列表打开笔记，比对 Tiptap JSON 与 Rust 文档 | pass |
| Android 系统 Back | 发送 Android keyevent 4，编辑器回到列表而非退出 | pass |
| WebView 运行异常 | 回归监听 Runtime.exceptionThrown，编辑和重开均为零异常 | pass |
| 浏览器存储隔离 | `__TAURI_INTERNALS__` 存在，`notes-browser-preview` 为 null；断言读取正式 invoke 返回的 SQLite 数据 | pass |

最后一次脚本测试笔记 `安卓重启验证 2026-11-03T03:45:46.398Z`，id `0ab60faa-364c-4dcb-adaa-c703e032966f`，revision `7`；冷启动时间见 `artifacts/android/smoke/result.json`。完整前后文档 `before.json` / `after.json` 完全一致；截图 `before.png` / `after.png`。人工步骤证据另存 `artifacts/android/persistence-before.json`、`persistence-after.json`、`persistence-after.png` 与 `back-button.json`。

## 已定位并修复的阻塞

1. Chrome 91 不认识 `100dvh`，根节点原先没有有效高度，导致安装后白屏。现先声明 `100vh`，再用支持时的 `100dvh` 覆盖；Vite 输出目标 chrome90。
2. Tiptap 在事务分发使用 `Array.findLast`，Chrome 91 缺失该方法。之前 DOM 出现编辑结果但 onUpdate 未执行、Rust revision 保持 0，强杀丢失编辑。Runtime 异常证据定位到此方法，现入口先引入 core-js 补全；修复后 revision 递增、完整重启用例通过。
3. `enableEdgeToEdge` 下旧 WebView 未提供 CSS safe-area，状态栏和三键导航遮挡按钮。MainActivity 使用 systemBars Insets 避让，实际截图已确认。
4. Android 系统返回原本直接退出 webview，现绑定 Tauri onBackButtonPress，走与屏幕返回按钮相同的页面状态。

REA 的 Android 安装/启动/截图工具曾成功取证；该旧 WebView 的 forwarded CDP 被 `list_browser_targets` / `inspect_web_page` / scenario 返回 invalid_endpoint_response。故回归采用本仓库开发测试脚本直接连接同一调试口，测试目标仍为已安装 Tauri app，未使用浏览器预览替代。

## 尚未通过或未实现

- Mac 由主代理实际启动并采集 `references/desktop/clone-list-editor-first.png`；这不是本代理独立验收。旧 release 进程仍可能运行，独立 QA 必须退出后用完整路径重开当前产物。
- 像素验收 fail/未完成：Mac SF Symbols、原生工具栏材质、标题/正文样式、纯文本粘贴处理、侧栏间距、列表/画廊几何与动画；移动端格式面板替换键盘、纸张选项七项布局、字形/图标/菜单/交互细节均有差异。没有输出误导性的“像素一致”通过分数。
- 原版画廊双击应在主窗口隐藏列表、保留侧栏并显示返回按钮；当前实现仍需修正。
- F17 标签/智能文件夹、F18 数学/笔记链接、F19 PDF/Markdown 等格式导入导出未实现；`.notesbackup` 只解决本应用本地归档。
- 扫描自动裁边、OCR、录音转写未实现。相机/录音/媒体附件、绘画编辑、独立窗口、备份对话框、锁定的完整 UI 路径已编写但尚未逐一完成平台独立验证，不能标 pass。
- 真机、多尺寸、中文 IME composition、新版 Android/键盘/系统分享面板尚未覆盖；iOS 未建立可运行产物。
- 归档导入附件写入和数据库更新尚非单一原子事务；跨窗口同步目前以 revision 冲突保护，缺少原版实时同步体验。后续由独立 QA 归类风险与修复门槛。

任务 APP-001 保持 in-progress，源码基准交付给 QA-001；本报告不代替原需求完整交付。
