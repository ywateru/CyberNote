# MEDIA99B 生产接线独立审查

2026-11-09。审查人 `/root/media99a_verify`，非开发作者。范围 `d00781d409d446310095d6844d46c8659ad1b7af..0e08200af2323e3b78172913fbc0cd14d72ec8be`，工作树 `/private/tmp/cybernote-media-core`。

## 结论

**pass；在本任务限定的生产接线、Rust/bridge 与静态平台配置范围内未发现 blocking。** 本次仅新增独立测试、报告和结果，不改产品源码。不将此结论扩展为前端媒体迁移完成、原生平台播放或整体性能验收通过。

## 源码审查

- `lib.rs` 在同一个真实 Session 建立后创建并管理唯一 `MediaRuntime`，失败直接终止初始化；后续 SyncWindows 与普通 mutation/session_command 的文档事件均经过 `emit_document_event`。该入口在 Session mutex 释放后执行媒体撤销，随后仍发送文档事件；缓存 IO 失败不会吞掉 renderer 事件/ACK。
- acquire/release IPC 从 Tauri 注入的 `WebviewWindow` 取得 label，再查 host registry；renderer 参数没有窗口/incarnation。setup/page-load 是登记入口，Destroyed 清 incarnation 并 revoke 窗口租约，Exit stop server。acquire 在 await 前捕获 identity，worker 完成后重新核对租约、真实授权/附件登记，并调用相同 Session 的 tagged。core release 核对签发 identity，不能释放其他窗口的租约。
- access/sync prepare 按 operation ID 叠加 deny note range，先阻止签发、取消存量流，再从真实 Store 捕获目标附件 ID 清理派生缓存。quiet sync 不依赖 `Session.pending`，不会在 ACK 窗口重新取得 lease。terminal 只移除对应 operation，旧/无关 ID 无法恢复其他操作。同步 emitter adapter 同样走该路径；commit/metadata 后 reconcile 保留合法未变 identity，仅清理失效源。
- 缓存删除按 Store note 所有权枚举，不依赖 active leases，覆盖已释放缩略图的软删与同步 tombstone。cache-only clear 提升派生 epoch，拒绝迟到派生生成/租约，撤销 thumbnail 而保留 original；缓存 API 以原全局 data-management Token 验证，统计与 Store totals 分开，clear 不触及附件目录。
- bridge 在 invoke 前捕获原 owner/AccessGate stamp，验证回执用途、owner、URL 路径/端口及有界维度，再通过现有 AccessGate 与 MetadataGate；异常/迟到结果不发布，并尝试从实际签发窗口 release。release IPC 失败不改变拒绝结论；native revoke/expiry 保留兜底。
- CSP 仅在 img/media/connect 加入 `http://127.0.0.1:*`，未加入任意 HTTP、通配域或扩大附件 asset scope。Android main XML 默认禁止 cleartext，仅精确 127.0.0.1 例外；main manifest 引用 XML；debug overlay 允许既有开发网络，未进入 main/release 配置。Mac ATS 未凭静态配置推断可播放。

## 独立执行证据

1. `cargo test --locked --test platform -- --test-threads=2`：**7 passed / 0 failed**。使用真实 production runtime、Store/Session/TCP；涵盖 tagged/window/release、24MiB 停滞 no-Range 的 prepare/quiet-sync/close 取消、普通 metadata 保留与实际源替换、cache stats/clear 原件保留及旧 Token 拒绝、stop/start typed error、零租约软删和真实第二 Store 同步 purge、重叠 operation 精确恢复。
2. 新增独立 `harness/review99b.rs`，thin integration 入口 `harness/tests/review99b.rs`，`--test review99b`：**1 passed / 0 failed**。真实两个 note/两个附件、两个 host window：生成两个缓存并释放全部 thumbnail leases；prepare A 后只剩 B 缓存且 B 原件 HTTP body 不变；prepare B 后清空；terminal A 只恢复 A；无关 terminal 不恢复 B；terminal B 后 B 恢复；关闭 main 使其租约 404，同时 second 的 body 保持；reopen 后旧 main incarnation 仍拒绝签发。没有 mock 授权或布尔替代 Session。
3. 独立运行 `node scripts/check-attachment-media-bridge.mjs`：**pass**。载入 production bridge/AccessGate/MetadataGate，仅控制 IPC transport；实际断言 access prepare 迟到、metadata sequence 迟到、owner 改变与畸形回执释放、清理失败仍拒绝、用途/尺寸输入限制、可选缓存统计兼容、精确 CSP/main Android XML 和两套 IPC 注册。
4. 日志 `artifacts/media99b-independent/{platform.log,review99b.log,bridge.log}`；结构化结果及日志 SHA-256 见相邻 `app-media-platform99b-result.json`。共享根 target，jobs=2，仅 native-free harness；未重复 core 全集、前端 build 或 native cargo check 的作者证据。`git diff --check` 通过。

命令使用 `CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2`，manifest 为 `src-tauri/src/attachment_media/harness/Cargo.toml`。本次未修改 lib.rs/runtime/bridge 等产品逻辑，未 native build/安装/ADB，也未操作用户库。

## 后续范围

本次 runtime harness 不能证明真实 Tauri 窗口回调、WebView 解码、iOS/macOS ATS、Android release 网络策略合并的运行表现。当前 UI 仍未消费新媒体源和展示 cache stats/clear；这些精确接口已具备但功能接入由 MEDIA99 后续完成。真实 Mac/Android release 首帧/长音频与视频尾段 seek/读中撤权，以及大量附件冷/热启动、RSS/滚动测量保留 MEDIA99/FINAL101 门槛；不能以这次 source/harness 通过替代。
