---
id: app-media-platform99b
scope: media-platform-integration
status: done
depends-on: [app-media-core99a, app-build-delivery97]
---

## objective

将独审后的 MEDIA99A 真实接入应用：唯一媒体服务、真实窗口/Session 授权的 acquire/release IPC、撤权与窗口生命周期、最小双端本地网络配置，以及 bridge 两道 gate 接收租约的接口。暂不迁移 App/Editor UI，生产入口必须可测试，不能用模拟 server 默认成功。

## context

docs/architecture/attachment-media.md；docs/architecture.md；MEDIA99A 模块 README/独审；docs/architecture/build-delivery.md；原 bridge 的私有 attachmentOwners、AccessGate、MetadataGate 与 tagged response。

## path

src-tauri/src/lib.rs 与新 attachment_media 接线模块；必要的 access/metadata 发出入口和 SyncWindows emitter adapter（不改授权业务）；tauri.conf CSP、Info.plist 最小本地网络例外、Android network-security XML/manifest/Gradle（不得改 MainActivity 的会话键盘）；src/bridge.ts 新 typed 接口及 src/attachment-media.ts 可选租约源类型，不改变旧 API 行为。未明确的路径先报告，禁止改 App.tsx/Editor/Preferences/共享CSS，避免与 SESSION96/MODULES98 并行冲突。

## verification

- 应用真实管理唯一 server/core/authorizer；IPC 从 Tauri 注入窗口取得 registry identity，禁客户端自报label/incarnation，授权 Token 沿原协议验收；acquire response 含原 access/metadata stamps，bridge 双 gate 拒绝迟到租约并释放。
- release 必须关联签发窗口，猜测其他窗口 lease ID 也不能越权释放；destroy/close lifecycle 与 access prepare/commit、同步替换/删除撤销全部受影响媒体。普通元数据更新不无谓撤销其他笔记媒体。
- HEAD/Range/no-Range 继续真实受管路径；默认无可用 server 时明确 typed error，不回退完整Base64。
- 网络配置只允许必需 loopback，不全局HTTP，不开放附件asset scope；两端生产编译配置路径可静态/单项编译检查，最终同源 native build仍在FINAL101统一做。
- 缓存统计与清理需明确接入数据管理；若与并行任务冲突保留精确后续接线点，不冒称媒体性能整体完成。预览/导出语义不得因为新增资源类型而改变。
- 针对性真实Rust生命周期/bridge gate测试、pnpm build与相关旧媒体回归，独立审查后整合。实际平台播放与测量仍由MEDIA99/FINAL101验收。

## delivery

开发0e08200a（基线d00781d4），独立复审317d7846接受。已回填主目录；7项真实生产runtime、独立双笔记/双窗口探针、production bridge双gate与精确配置均由独审复验。主目录组合build/bridge/runtime整合检查继续记录在恢复入口。实际媒体UI、Mac ATS与Android release解码/seek、原生性能仍待99/101，不以本阶段通过替代。
