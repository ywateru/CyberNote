---
id: app-mac-recording-media67
scope: validated-media-read-stale-recovery
status: in-progress
---

# objective

关闭统一录音侧栏后，持久录音卡首次显示无需手动重试即可加载；只对可明确识别的MetadataStale重新发起有界、完整校验的读取。保留所有access、metadata、owner、journal与保存语义。

# context

- `docs/verification/mac-recording-sidebar66-runtime/README.md`：准确Mac19真实首次加载失败、一次重试恢复1:31。
- `docs/ui/recording-desktop.md`、`docs/architecture.md`
- `src/use-attachment-media.ts`、`src/bridge.ts`、`src/metadata-client.ts`、`src/Editor.tsx`、`src/recording-live-card.ts`

# contract

1. 持久附件读取若且仅若typed MetadataStale，在同id/kind/effect生命期内丢弃该次结果并有界地发起新readAttachment；最多三次总尝试，达到上限仍保留明确错误与手动重试。每次都重新捕获access stamp，经现有access与metadata验收；不能重用旧bytes/URL或降低sequence。
2. AccessChanged、锁定、撤权、真正不可读和其它错误不能按MetadataStale自动恢复；身份变化、unmount、手动新version令旧尝试失效，不发布旧URL、不继续旧重试。临时URL按既有约束回收。
3. 不改附件写入、录音保存、正文ACK、query committed、退出守卫或实时节点唯一性；不重存/重插入/生成新录音版本来修复读取。不改变呈现与手机录音流程；共享加载器修改须受控覆盖手机附件基本回归，原设备仍不可操作。
4. 已确认写入后的overlay撤除，持久卡须通过完整加载链自动恢复可播放；不能仅延迟隐藏失败或把所有异常吃掉。无无界循环和固定长sleep。

# verification

- 从准确已提交源构造可控read_attachment返回顺序：先持有旧read，推进真实metadata gate/正文保存，再放旧回包，确认旧结果拒绝、下一次新stamp/read成功、首次持久播放器无需按钮。使用实际bridge、hook/MediaView、实际录音/编辑链适当覆盖，记录trace区分事实与推断。
- 同附件连续stale达界、其它错误不重试、撤权/锁定/换id或kind/unmount及迟到响应不发布、URL清理、手动重试新版本的边界。
- typecheck/build，受控共享媒体回归；独立review后根整合、准确新Mac包和Computer Use再次验暂停/累计/×后首显、活动×、main close/重开与退出可隔离范围。
- 不操作旧Mac18 PID8002/3秒现场、Android13秒现场；不导出实际音频、不原版删除、不扩权限、不改变签名策略。Mac19已有C/D与1:31录音保留，不清理历史失败证据。

# progress

- 2026-11-05：66源码独审/准确Mac19核包通过，实际首显MediaView MetadataStale阻断；有界安全新读合同先落文档，待作者实施与不同作者独审。

- 2026-11-05：作者新隔离树`/private/tmp/apple-notes-mac-recording-media67-01`由root43e16f97建立，正在实施真实读取竞态runner及窄修。Mac19额外E活动×保存0:21首显正常；F活动主窗close后新进程重开0:10/C1:31/D文字保持。旧18准确PID随后已不在，内存现场无法继续保证保留，原因/时点未确定，已向用户披露；不重启旧18、不声称恢复。手机仍完全未操作。

- 2026-11-05：产品7243→root496707b7、作者7309→393975a4、独审f873→608d13ab已合入；独立候选30组、旧hook预期缺陷1组及typecheck/build通过。根typecheck/build通过，产品目录逐字同，见[根整合](../../verification/mac-recording-media67-root-integration/README.md)。源码接收，新Mac20冻结/核包/实际首次加载恢复待验，任务仍in-progress。

- 2026-11-05：准确Mac20构建及独立核包84a46a74通过；真实录音/两次暂停累计、×首显播放、主窗close重开有限成功，但CmdQ切B后重开K无卡，进入68。首次进程授权code7、重开后采集成功均保留，见[20实际记录](../../verification/mac-recording-media67-runtime/README.md)。不标完整runtime或像素通过，Android不操作。
