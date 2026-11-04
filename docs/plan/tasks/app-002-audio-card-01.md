---
id: app-002-audio-card-01
scope: saved-recording-timestamp-and-mobile-compact-card
status: source-ready
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
3. 同一次受权read返回日期，MediaView/AudioPlayer不保留其他ID/晚响应的旧值。无日期不渲染伪日期。手机紧凑卡左三行/右播放白胶囊与真实标题、日期、独立总时长文案接通；长标题和窄屏真实可达。未测量的几何数值标候选。元数据可在Mac保存/读取，但此次显示校准仅作用于手机分支；Mac既有紧凑显示没有对应原版证据，先保留并在独审中核对未被共享样式意外影响。
4. 新程序支持归档1/2；有日期导出2，无日期可导出1；v1非空日期拒绝，v2非法日期拒绝且旧数据保全。重复导入两次正确映射ID并保留日期/字节。不要顺带升级智能文件夹、数学或笔记链接格式。
5. 不改展开/收起/播放/拖动/±15/错误重试语义，不从原片缺帧推断应删除能力，不全局改进度时间函数。不为此重复旧Android媒体验收或建立新的媒体引擎。

## verification

开发者必须覆盖真实Panel/Session→App→submission→真实Rust临时Store的开始时间固定和失败重试边界；受控硬件采集不代表原生音轨通过。至少包括打开/权限等待后再开始、暂停继续不变、跨日与长暂停、首store响应丢失、正文ACK失败、refresh失败及旧目标晚响应。每种恢复核对同operation/attachment/日期，错误日期重复请求拒绝，旧正文/字节不变。

真实Store与归档检查覆盖旧None行/旧日记/旧v1、外部File.lastModified不自动赋值、合法v2往返两次及ID重映射、日期类型/范围/kind非法时原子拒绝；加载或读取非法已持久值明确报错且旧行/字节不改。核对已有完整Eq未放宽，不复制设备数据库或用户音频作为夹具。

UI仅对新紧凑卡作真实组件检查：三行、未知日期两行、独立短总时长及既有进度表达不变、读失败/换ID/卸载/权限变化不串旧值、长标题/窄屏。执行typecheck、相关生产边界回归与必要Rust定向检查，不为可逆样式变化写镜像测试。共享Rust target需root明确分配；每输出阶段≥2GiB，无下载/升级/平台构建、target复制或泛清缓存。

开发完成精确冻结SHA和证据，交不同作者独审后才能SOURCE-READY；root再按受影响平台构建安装，实际新录音保存/正常退出或force-stop冷启、日期/文件/正文复核并据原片作有边界对照。源码/有限功能通过不等于全卡交互或像素通过。原录屏低分辨率、未知长时长/深色/展开和原版取时规则均继续记录。

## execution 2026-11-04

从96b2263隔离于`task/app-002-audio-card-01`开发，源码候选已接通第一次成功start后的固定UTC毫秒→RecordingResult→原票据/operation→preparing及公开元数据→同权限read→手机日期行；旧未知无回填，外部mtime不取值。归档1/2与严格非法持久值拒绝同步实现，完整Attachment Eq、目标身份、正文ACK、补偿及播放器不放宽。

开发检查使用准确本树offline/locked Rust Session/Store、新命名CLI和纯合成字节；真实Panel/Session→实际App闭包→production Submission/bridge/SaveQueue→真实Rust临时DB覆盖权限等待、跨日长暂停、响应丢失、正文ACK失败、refresh失败和旧目标晚响应。另有实际Editor NodeView卡片320/390与桌面检查、原有录音及附件回归。精确命令、失败首轮、最终源码哈希和边界在`docs/verification/app-002-audio-card-01/README.md`。

上述为开发候选阶段记录，后续独审与主整合见下文。Mac/Android新包、真实有效音轨、设备冷启与原版像素对照仍由root后续完成。原片取时规则、长时长格式、深色、展开及所有像素一致性继续unknown。未运行平台构建、GUI/ADB、下载、依赖升级或设备数据复制。

## independent review and main integration 2026-11-04

精确源码9303b484经不同作者独审b477f79通过，P1/P2/P3产品findings均无，仅授予列明源码和受控实际链SOURCE-READY。独审包括准确编译Store/Session47项、额外5项持久坏值/归档重映射/完整Eq测试、Panel到Rust5场景、NodeView8、实际Session权限8及相关回归；见`docs/plan/reviews/app-002-audio-card-static-01.md`与独立证据目录。

主线4dbdbd25238c430f7800cb286b642577a09ccf50整合后，238产品输入与11改动检查脚本逐字等于冻结候选，前后未变。pnpm build、schema96/access16/toolbar13/OCR37、Panel→实际App闭包→production Submission/bridge/SaveQueue→准确Rust Session/Store5、实际NodeView8通过；当前挂载App/Editor的标签browser27、保存11/53条及组合12/170条真实tag-only Store action通过。两类CLI身份及不同transport边界明确区分，无重新Rust编译、平台构建或native claim。主整合证据在`docs/verification/app-002-audio-card-main-integration-01/README.md`。新设备包、真实音轨/冷启及原版取时/像素验收仍待后续。
