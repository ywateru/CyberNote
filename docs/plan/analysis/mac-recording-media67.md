# 持久录音卡首次读取竞态67

Mac19实际×收起后出现MetadataStale，一次重试恢复卡及播放。保存成功/卡引用可用与首显读取通过必须分别接受。当前证据不表明音频丢失。

useAttachmentMedia只随id/kind/version运行；MediaView的stale failure不会随后续metadata同步消失。recording-live-card的persisted隐藏不卸载NodeView，所以该失败可能在实时卡背后发生，再在dispose后显露。精确事件序列须定向trace验证。

修复放在读取协调层，typed MetadataStale按最多三次总尝试捕获新授权发起新read，保留现有gate拒绝旧response。它不扩大读取权限、不接受旧结果，也不修改任何保存/录音状态。其它错误和生命期失效仍立即停止。所有重试均需可证有界，耗尽后保留用户重试入口。详细契约以[任务67](../tasks/app-mac-recording-media67.md)为准。
