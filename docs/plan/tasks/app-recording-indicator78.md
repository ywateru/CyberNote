---
id: app-recording-indicator78
scope: mac-active-recording-owner-badge-live-card-and-finish-button
status: done
depends-on: [app-mac-feedback77]
---

# objective

处理用户最新Mac录音反馈：所属笔记列表项添加闪烁录音角标；实时录音卡加入清晰录音动效；定位并修复录音中✓不能保存、×可以保存的差异。保持唯一非模态右栏、原A归属和暂停/关闭自动保存。

# context

- docs/INDEX.md、docs/ui/recording-desktop.md最新78、references/desktop/recording-feedback78/
- docs/debugging.md、docs/testing.md、src/{DesktopRecordingPanel,RecordingView,App}.tsx、recording-live-card.ts及RecordingPanel.css
- 既有录音64–69/71、Mac77及手机73/75契约，真实Rust设施74可按必要范围复用；不把JS模拟ACK当真实Rust/原生硬件验收

# path

最小必要src/App.tsx、RecordingView.tsx、recording-live-card.ts、RecordingPanel.css/style.css及必要展示辅助；scripts/debug录音真实DOM回归；docs/verification/recording-indicator78/、必要debugging.md。不改Rust、依赖、schema、保存/授权门槛、手机产品逻辑。根保留任务/索引/录音规格所有权。

# contract

严格遵循recording-desktop.md 78；不要将角标/动效写入保存文档。原owner身份和过期state回调校验、phase变化时有效投影，最终/取消清理、错误/暂停静态状态、reduced-motion；列表220/长标题/搜索/画廊不重叠。多个已存卡只有实时卡活动。动画语义是录音状态，不是造假的音量图。

疑似根因：DesktopRecordingPanel.state.canFinish包含recording，但RecordingView局部canFinish只允许paused/retry，真实DOM✓因此disabled；×直接调用close保存。先真实DOM复现/截图再修，用真实点击而非仅semantic finish验证，手机现有录音中完成策略不变。修复失败不删文件、不放宽save/owner检查，不写B。保存错误和重复动作需要真实handler重试。

# verification

开发commit冻结、不同agent独审、根主线完整整合。新增命令组/场景：真正开始采集后有且仅有原A角标和实时卡动画；切B编辑/搜索/过滤再返回A；暂停保存停止动画、继续恢复；直接点击✓于recording成功且×同等链；迟延checkpoint/存储或正文故障、重试、重复点击，无重复卡/错误owner；错误/取消/新会话无旧角标；reduced-motion静态可读且无运动；220px/长标题/画廊HTML/rect/PNG。验证标识不改documentJSON/Undo历史，保留77搜索/右键。

最低完整回归：pnpm build、production排除、桌面当前148+新增检查、手机notes9/recording43/attachments43。合成媒体可Mock，录制/累计编码/保存正文ACK走真实产品。记录源码输入指纹、自然exit、完整wall、pageErrors与失败证据。无需真实麦克风，不读取用户录音/笔记，不启动/停止/安装或改原Android约13秒未保存录音现场，不做原版删除测试。不再询问运行许可。

完成后根生成Mac23本地包并独立核对实际内嵌资源和严格签名，真实原生和完整像素仍按各自证据，不外推。Android原生76继续保留后续。

# delivery

2026-11-06限定完成。产品206557bb、runner8fc060dd，独审f54f9f95 PASS（48项+桌面/手机静态整图与几何严格相同），主合入e4276d8b。修改前已真实DOM复现controller canFinish=true而✓disabled；修正桌面能力投影、列表角标/当前实时卡动效、phase/owner去重与迟到回调校验。手机完成策略保持。

主线六项全部自然exit0：build/production、桌面197、手机notes9/recording43/attachments43；90输入前后指纹09fb9ee8b4702499400963dbf4f16693cd5c8646565f06823aa9daeb39f4b9ce，各pageErrors为空。见[主线整合](../../verification/recording-indicator78/integration/README.md)。

Mac23以52056b4a构建，279构建输入不变，35.423秒；原始包严格签名失败保留，派生副本adhoc严格验证通过。独立从原/派生exe解码JS/CSS逐字等本次dist，HTML完整token等价；ZIP全部内容/权限/CRC核同，SHA256 9c28504a718e7924834a98ff941e718c385de9cfe42b8586b67b98e94d57a6ec。见[构建](../../verification/recording-indicator78/native-build/README.md)和[独立核包](../../verification/recording-indicator78/native-independent/README.md)。

既有正文保存双次故障的全局旧错误提示仍按“全局重试→侧栏✓”恢复，已明确记录，不无条件清除其他错误。原Android未保存录音现场不动，Android原生76保持后续；不授予真实原生硬件、Rust本轮持久化或原版整窗像素通过。
