# Android 窗口 API 条件编译窄修

固定产品源：`106204bd5e7b1d986d8c3c658e18282aa23ed701`，仅在原 50 最终产品 `12e5cd2` 的 `recording_window.rs` 中，为 `reveal_owner` 的 `unminimize()` 增加一行 `#[cfg(desktop)]`。没有 UI、采集、消息、保存或退出语义变更；没有 Session52 或新任务55功能变更。最终20文件新清单见 `android-cfg-source-manifest.json`，旧清单保留。

根整合源5a147d2的真实 Android 构建发现 E0599：Android 的 WebviewWindow 没有 unminimize。原日志复制为 `android-cfg-original-build-failure.txt`，根原件位置不变。此次构建失败真实保留，不计为通过。

核对 Cargo.lock 准确 Tauri 2.12.5 的本地官方 crate 源，unminimize 位于 cfg(desktop) 限定的 Desktop setters impl；同函数的 show/set_focus 位于未加该限定的通用 impl。lib.rs 唯一另一处 unminimize 已在 cfg(target_os = macos) 的 Reopen 分支中。审计摘录与文件哈希见 `android-cfg-api-audit.json`。

本树只运行离线 cargo check，显式使用本树 `src-tauri/target`，未触及根构建目录、未下载或安装，也未跑历史测试矩阵。检查 exit=0 通过，结果记录在 `android-cfg-check01`。真实 Android 构建复验由根在当前整合主线执行，本条窄修和桌面检查不能代替该实际重建。
