---
id: app-recording-interactions50
scope: desktop recording sidebar, live card and shared transport
status: ready
depends-on: [app-002-recording-preview-01, app-002-recording-submit-01]
---

## 用户目标与合同

用户2026-11-05明确要求完善基本录音交互，不做听写。遵循 `docs/ui/recording-desktop.md`、`docs/ui/recording-mobile.md` 与准备49；现有已授权保存边界继续保持。优先交付可运行行为，不扩大到录音文本、云同步、原版删除实验或新录屏工具权限。

## 实现

从当前d9ce9c4产品基线隔离worktree实施。开发者只改必要RecordingPanel、其CSS、recording-playback及新增局部waveform/临时卡模块；App仅允许显式平台/原编辑器目标、挂载布局和会话卡接线，必要Editor显示接缝可以加入。新临时卡不得成为schema持久节点或JSON mutation；无新数据库协议、依赖、锁文件、原生权限改动。不得改智能文件夹、键盘、侧栏或共享保存控制器。若确需扩张先报具体原因。

必须实现右侧非遮暗栏、桌面正文进行中卡、真实总时间/位置分离、pause后试听位置保持、真实绝对seek与拖动/键盘、±15、试听时禁继续、完成/安全关闭同一File/ACK与失败保留。手机保留三态布局并获相同transport修复。错误/忙碌不画正常假态；真实波形按活动时间保存并有界聚合，禁止随机音轨。可按既有生产Session/播放器接缝完成，不为视觉任务重写媒体采集。

## 验证与交付

开发与独立审查分人进行。作者typecheck/build与有意义组件集成检查：实际Panel+Session+播放controller，平台事件受控需说明。覆盖desktop/mobile布局、开始/暂停/试听暂停后位置、绝对seek/±15边界、试听禁继续、结束重播、继续累积、完成只一次、未录关闭/录制与暂停关闭保存、保存失败重试同File、迟到事件/卸载清理、原编辑器装饰不变JSON/history与错笔记不显示。复用既有媒体与父提交回归，禁止只核常量或mock组件。

独审通过后root整合并构建真实两端包；CUA核桌面、ADB保数据核手机，不读用户数据库、不导出本轮麦克风文件。实际编码/设备有声与工程受控分开记账；原版逐像素目标不得由headless截图宣布完成。

证据仅各自 `docs/verification/recording-interactions50/` 与 `docs/verification/recording-interactions50-independent/`，记录必要命令、结果及失败即可，不为本轮复制整套历史矩阵。不得清理旧输出或工作树。
