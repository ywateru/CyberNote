---
id: app-002-audio-card-01
scope: saved-recording-timestamp-and-mobile-compact-card
status: pending
depends-on: [app-003-tags-01]
---

## objective

完成手机已保存录音紧凑卡的真实日期接入及已见三行层级/文案校准，不改变已有播放controller和未经原版取证的展开交互。原版明确有日期，当前数据无来源；日期与显示是一个交付，不能先给旧卡填假日期。本任务须待标签最终源码独审并合入后从新主线建立隔离分支，避免App/Editor/Store共享路径并行修改；这里depends-on指标签源码整合门槛，不要求为此停止等待中的平台原生IME补验。

## context

- docs/INDEX.md、docs/architecture.md“保存后录音日期与紧凑卡片”
- docs/ui/audio-card-mobile.md、docs/ui/recording-mobile.md
- docs/research/mobile-saved-audio-card-20261104-01/README.md
- docs/research/saved-audio-timestamp-readiness-20261104-01.md（建议的取时方案已由架构选择为客户端实际开始观察，不做Rust印记）
- docs/verification/README.md、原录音会话/附件operation/归档FIX-00边界

## path

RecordingSession/Panel完成结果、App录音票据和提交batch、AttachmentSubmission的固定元数据、bridge、TS/Rust Attachment、lib/Session受权传递、Store持久operation与旧store、read_attachment、归档版本/验证/重映射、Editor MediaView/AudioPlayer及手机紧凑样式。必要的局部显示helper和有意义的集成检查脚本。文档与执行证据。保持所有锁文件/依赖字节不变，不新增正文schema字段或改通用保存/搜索/访问协议。

## implementation

1. 精确贯彻架构的recordedAt含义、整数/null/未知边界与仅真实本次录音来源。onRecording第一次成功开始固定一次，同File/票据/operation跨暂停、继续、完成和失败重试；外部audio File即便带mtime也不提升为录制日期。
2. 元数据进入preparing日记和公开Attachment同一快照；重复store完整比较日期，query/正文ACK失败恢复不得换值。旧JSON加载None，不回写旧行；保持媒体字节、既有原目标/文件/ACK身份和安全补偿边界。
3. 同一次受权read返回日期，MediaView/AudioPlayer不保留其他ID/晚响应的旧值。无日期不渲染伪日期。手机紧凑卡左三行/右播放白胶囊与真实标题、日期、独立总时长文案接通；长标题和窄屏真实可达。未测量的几何数值标候选，桌面影响单独说明。
4. 新程序支持归档1/2；有日期导出2，无日期可导出1；v1非空日期拒绝，v2非法日期拒绝且旧数据保全。重复导入两次正确映射ID并保留日期/字节。不要顺带升级智能文件夹、数学或笔记链接格式。
5. 不改展开/收起/播放/拖动/±15/错误重试语义，不从原片缺帧推断应删除能力，不全局改进度时间函数。不为此重复旧Android媒体验收或建立新的媒体引擎。

## verification

开发者必须覆盖真实Panel/Session→App→submission→真实Rust临时Store的开始时间固定和失败重试边界；受控硬件采集不代表原生音轨通过。至少包括打开/权限等待后再开始、暂停继续不变、跨日与长暂停、首store响应丢失、正文ACK失败、refresh失败及旧目标晚响应。每种恢复核对同operation/attachment/日期，错误日期重复请求拒绝，旧正文/字节不变。

真实Store与归档检查覆盖旧None行/旧日记/旧v1、外部File.lastModified不自动赋值、合法v2往返两次及ID重映射、日期类型/范围/kind非法时原子拒绝；加载或读取非法已持久值明确报错且旧行/字节不改。核对已有完整Eq未放宽，不复制设备数据库或用户音频作为夹具。

UI仅对新紧凑卡作真实组件检查：三行、未知日期两行、独立短总时长及既有进度表达不变、读失败/换ID/卸载/权限变化不串旧值、长标题/窄屏。执行typecheck、相关生产边界回归与必要Rust定向检查，不为可逆样式变化写镜像测试。共享Rust target需root明确分配；每输出阶段≥2GiB，无下载/升级/平台构建、target复制或泛清缓存。

开发完成精确冻结SHA和证据，交不同作者独审后才能SOURCE-READY；root再按受影响平台构建安装，实际新录音保存/正常退出或force-stop冷启、日期/文件/正文复核并据原片作有边界对照。源码/有限功能通过不等于全卡交互或像素通过。原录屏低分辨率、未知长时长/深色/展开和原版取时规则均继续记录。
