---
id: app-mac-recording-sidebar66
scope: desktop-recording-sidebar-owner-and-lifecycle
status: in-progress
depends-on: []
---

# objective

按用户2026-11-05最新明确要求彻底重构桌面录音，统一主窗口右侧非模态栏，移除浮窗及切换；同时保留录音时操作Notes、原A归属、暂停自动保存、关闭自动保存和失败重试。准确65修复作为基线保留。本任务包含实现/独审/根整合/准确包/有限实际运行，未实际验收不标全部完成。

# context

- `docs/INDEX.md`
- `docs/ui/recording-desktop.md`（66优先，旧50/55仅历史）
- `docs/architecture.md`、`docs/requirements.md`
- `docs/plan/analysis/mac-recording-sidebar66.md`
- `docs/plan/tasks/app-mac-recording-autosave64.md`
- `docs/verification/mac-recording-commit-gate65/author/README.md`
- `docs/verification/mac-recording-autosave64-runtime/README.md`

# path

- `src/App.tsx`、`src/main.tsx`、`src/DesktopRecordingPanel.tsx`、`src/RecordingView.tsx`、`src/RecordingPanel.css`
- 桌面会话、侧栏owner/lifecycle、原远程窗口/relay/coordinator相关模块（可删除无活动依赖代码，不更改手机语义）
- `src-tauri/src/recording_window.rs`、`src-tauri/src/lib.rs`及必要capability/command权限文件
- `scripts/`有意义集成验证、`docs/verification/mac-recording-sidebar66/`、独审报告与源码清单
- 文档只更新本次真实结论；禁止改写历史证据或无关功能

# contract

1. 每个实际文档owner窗口至多一个活动会话，不增加全进程录音锁。主App稳定布局持有唯一桌面controller/Session/累计PCM/待存File。当前note、search、folder、Host停车不卸载；blur/minimize继续。无录音child WebView、浮窗模式、切换菜单或hidden child采集。重复入口恢复当前栏，不重复采集。
2. 同renderer File直接调用真实submitRecordingRevision。明确desktop-local owner身份；不可伪造remote绕过原安全条件。原A/Editor/bookmark/access epoch/window incarnation和真实最新正文、版本校验保持；65真实Host commit等待后重新核对。
3. 暂停自动保存合法完整累计WAV，recordedAt固定，后续版本替换唯一确认节点；checkpoint保留会话。删除/Undo移走/重复节点、外部更改/真正撤权拒绝且保留音频，不能向B存或插第二张卡。store、saveDoc ACK、query committed均保留。
4. ×/Done有音频时final并等持久确认后收起；未开始可安全取消。busy时记录关闭意图；多个close共享等待结果。失败保留右栏及同File/operation供重试。final正文已存而native注销/清理失败时仅重试清理，不能重跑已确认revision或重插附件。
5. Desktop handle close必须可等待真实final+cleanup，不是void/乐观成功。Escape仅右栏自己的上下文处理，不拦正文、搜索、菜单取消。保持A/B选区与焦点、一个可见实时卡，不以inert锁整个主窗保护普通录音。
6. main红关闭/CmdW等final和真实flush后销毁；失败取消。移除ensureFloating→hide。明确退出应用先native本地会话登记守卫→所有正文参与者seal→final+flush→准确quit ACK，不能因旧child registry为空放行；busy、清理失败、超时、真实撤权都不得丢音频或假ACK。取消退出恢复合法编辑而不绕过撤权；迟到成功不能重放过期quit ID或自动再次退出。
7. native登记在采集前，精确owner/window incarnation/session/operation，防跨窗冒认/重放/陈旧注销，正常final或明确无音频安全终态后清除；保留document参与者约束/既有权限。不放宽TCC、capability、签名、存储授权或更改应用标识。
8. 手机源码行为与设备现场不变；不得操作原模拟器或复制13秒音频。当前Mac18未存3秒现场同样不能退出/重载/复制。所有真实GUI只Computer Use，不做原版删除实验，不导出/转写真实音频。

# verification

- 准确committed源码绑定及typecheck/build。
- 实际App/Host/Editor/Gate/SaveQueue+direct Panel/Session链：首次暂停、两次累计、A/B编辑/搜索/停车不remount、焦点保持；不能只验证假的闭包或Fake Editor。
- 故障：Host提交等待期间授权/正文/owner变化、stop/解码/store/save ACK/query失败、重试同File/operation、busy close/reentrant close、final已存cleanup失败只重试cleanup。
- sidebar ×/Done/scoped Escape；主窗红close/CmdW等待且失败保留；native local registry/quit防跨窗和陈旧身份、全参与者seal/ACK/timeout/cancel。通过受控媒体和native生产核心测试验证，不采真实新音频。
- 生产入口无浮窗/child/relay活动路径；手机回归检查准确未变。
- 独立review后才合入；准确新Mac包freeze→根核对→串行构建/collect→独立身份核对。Computer Use实际验证另记；现有Mac18现场不能为验证新包而退出。整体像素不由受控验证推认。

# progress

- 2026-11-05：用户明确改变呈现，取消65-only Mac19方向。66合同和调用链先落文档，准确65独审收尾后作为实现基线。尚未66源码/新包/实际验收。

- 2026-11-05：准确65产品/作者/独审映射b42d51f5/ec3886c3/989f23e5合入；root typecheck/build通过。66隔离树 `/private/tmp/apple-notes-mac-recording-sidebar66-01` 由989f23e5建立并开始实现，源码未交审。

- 2026-11-05：首版产品11c73a91、作者证据182617db冻结，42项作者整App检查通过。独审bd6172eb（root95fb92e8）实际挂载7组PASS、2项P1阻断：登记回复丢失丢票据导致orphan守卫；requesting关闭后迟到授权反而开始采集。首版未合入产品、未出包，原树正在修复，两项须准确新提交复验。
