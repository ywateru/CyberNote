# Android附件与显示缺陷处理

2026-11-06。用户新报告安卓版仍有多处显示问题、添加附件无法保存。父需求F08/F14/F15/F19和原版像素目标继续有效，未因此前录音控件或浏览器测试完成而关闭。

当前第一交付为[附件75](../tasks/app-android-attachments75.md)，开发和独立复核分别执行。原Android约13秒未保存录音按用户此前决定保留，不在该环境安装、停止、重启、备份或导出。命令验收只用新建隔离数据与合成附件。

## 调用链与验收责任

```text
手机附件菜单 → 原input.click/原batch
                     ↓ 系统chooser边界（本轮模拟）
实际FileList change → fileSelected → AttachmentSubmission
   → 原target校验/可信同步/Host commit
   → FileReader → bridge → Session → Store/journal/受管字节
   → Editor插入 → SaveIntent/SaveQueue → Rust正文ACK
   → readAttachment → 图片/媒体/文件卡
   → 退出owned进程 → 同目录新Session恢复正文和字节
```

| 分界 | 任务75要求 | 仍不能据此声称 |
| --- | --- | --- |
| 选择返回 | 使用原hidden input和原batch，加入往返事件/延迟及取消 | Android WebView原生URI及真实事件顺序已通过 |
| 保存 | 当前真实Session/Store、真实字节、正文ACK、重试去重、新进程恢复 | 安装中的旧APK自动具备当前源码 |
| 显示 | 实际媒体加载/错误、HTML/几何、手机窄屏和截图 | PDF预览已实现或整页原版像素相同 |
| 复核 | 不同作者按冻结源独立复跑 | 所有手机功能已验收 |

## 研究发现与归因限制

只读研究基线516e6196，任务启动基线002273d8仅增加文档，产品相同。以下均不能未经复现写成用户本次故障根因。

- 既有桌面attachments-ocr已有TXT chooser→FileList→onChange正例，但mobile CLI原先只允许notes/recording。`attachment.submit`重建target并直接提供File，不能证明此前选择器保留的原batch。
- 多文件逐份校验会显式同步并增加renderer generation，上一卡片异步read可能收到AccessChanged；当前useAttachmentMedia仅对MetadataStale自动重读，非音频错误无重试入口。这是待命令复现的显示竞态候选，不能先称字节丢失。
- App允许已授权locked note打开附件入口，Store对所有locked note拒绝附件。它是静态可证的前后端不一致；修复不能更改加密策略或放宽Rust授权。
- 空File.type按application/octet-stream保存，外部图片可能因此成为文件卡；PDF当前是普通文件链接。类型降级、缺少预览和写入失败必须分别报告。
- FileReader仅onload/onerror，未处理abort。可注入读取边界验证是否导致pending永不结算，但Android pause导致abort尚未实证。

## 后续显示与功能队列

可靠性先解决附件与正文保存、重试及重新打开；随后按原视频已有状态逐页复核文件夹、列表/画廊、编辑器、附件菜单/卡片、格式/纸张和录音。每页须有准确源码、同主题/宽度/状态的HTML/rect/截图及残差，不重新将已经完成的局部修复称作整页完成。

已有纸张/文件夹/新建锚点及录音控件的研究与修复记录继续作为基线；旧research建议可能已接入，不按旧待办盲目重做。附件75冻结后根据实际失败与当前原帧差异拆下一项，原生chooser、IME、系统Back和真实硬件在独立安全环境可用时验收。未开始/未验证项目保持开放，不能用更多Mock断言代替。
