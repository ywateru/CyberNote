# 附件操作与呈现

App 创建一次 AttachmentOperations 和 AttachmentPresentation。前者拥有 picker input→batch、batch 集合、operationId→既有 AttachmentSubmission 的唯一映射及当前 picker runtime；根通过同一 refs 与原录音/OCR/ACK/访问撤销流程协作，没有复制一套 operation 或业务 owner。后者拥有画廊引用投影、预览目标与保留源、附件跳转目标及 DOM 跟随资源。

输入分成明确 contracts：业务准入/文档 ACK/录音完成与取消的 ports，画廊/预览的实时授权与受限导航 ports，以及原 PickerTarget/RecordingTicket。根仍持有可信 Workspace、Editor registry、SaveRevisions、访问门禁及原 validatePickerTarget/validateRecordingTarget/awaitAttachmentDocumentAck；模块不重写这些跨领域控制器。

调用链：picker 或剪贴板捕获精确 noteId/Editor/版本/书签 → 原 AttachmentSubmission 存储 → 原准入校验 → 原文档插入与 ACK → 根 metadata refresh。取消、失败重试、安全补偿沿用原实现和 operationId。画廊按实际正文引用与 owner 生成条目，再核验授权代次、当前引用和可用性；“在备忘录中显示”把已核验 owner 交给 Navigation。预览与主界面选择独立，另行 acquire original（不能 retain thumbnail 冒充原图），await 后重新核验原 owner/授权/正文引用/trigger，随后独立 retain；附件菜单权限核定归呈现层，录音占用仍从原 ticket 实时读取。

生命周期：picker 监听卸载移除 input cancel/transfer-error listeners，失效捕获目标与既有 submissions；不抢占原录音取消控制器。预览 hook 卸载释放保留源、废弃晚结果；跳转清理 RAF、ResizeObserver、scroll/resize listener 和高亮 timer。撤权路径仍可同步读取相同预览引用并移除敏感 DOM。

MODULES98 开发验证：attachment-gallery33、attachment-files14、recording-refresh8 通过；平台阶段再跑文件14。文件测试补了有界 IPC receipt 等待：原断言在 renderer click 后立即检查异步 fixture actions，诊断实际 open 请求稍后到达；产品权限与预览逻辑未放宽。证据 `artifacts/modules98-attachment-*`、`artifacts/modules98-platform-files.log`。临时诊断脚本已移除，日志保留。实体文件系统/播放器仍需最终原生验证。


MEDIA99UI 接线：`useAttachmentMedia` 从根 AttachmentMetadataContext 读取登记元数据（含 recordedAt），只经既有 acquire/release 接口申请 URL；旧 readAttachment 不再用于显示媒体。`attachment-source-pool` 拥有 thumbnail 队列/共享 source，最多2个签发、离屏等待项立即撤出；original 独立激活。每个 source handle 的 dispose 幂等，最后引用停止 controller 后再 release；prepare 同步强制 revoke 所有受影响 owner，不能等 React 清理。pool 通过实际 attachment metadata changes ID 失效同字段替换，正文保存不改变其共享键。数据管理缓存清理只刷新缩略图，原件播放不动。

列表160/画廊480/正文1024使用 PNG 缩略图。普通文件不 acquire；音视频激活前只呈现元数据/中性轨道/视频 poster 占位，普通离屏暂停并释放。AudioWaveform 在 fetch 前同时要求已知登记大小≤8MiB、已知时长≤300s；大/长/未知保持中性可 seek 轨道。视频 poster 真实格式支持仍等待99C，本轮不宣称原生provider完成；真实Rust大媒体postmeasure归99M，双端设备归FINAL101。

Source pool 对仍存活申请的 response gate 过期（`access_changed`/`metadata_stale`）最多重走 acquire 三次，每次均过原授权/metadata 两道门；不重试显式授权拒绝或已取消目标。这处理连续附件插入触发 quiet sync 后的迟到 thumbnail，不以全局 metadata sequence 重建媒体 key。
