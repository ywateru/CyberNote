# Mac媒体首显恢复67：Mac20准确输入准备与冻结

2026-11-05。root完成67产品、作者与独审合入，并确认根typecheck/build通过，指定准确根源码 **`b455c14093b7a717a0a6e810b30d19301296e448`**。本计划与freeze完成后，root直接核准并给出准确START；唯一attempt01已完成准确构建与collection。GUI、设备及实际音频操作仍未执行。

产品 **361** 项，聚合 `c12780c3f0049592fa035e6c64f39a3d9df40b054249ee7194abc49a205f4c3d`；完整输入 **382** 项，聚合 `7ba3010f9b9fdc0f2f72aebc391d0a4bcdbf9f45575b6396e70a04cfe63ddf00`。准确 [mac-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/mac-authorization.json) 为39568字节，SHA256 `2d5f283789f9975230e34d54538ae17b5218e3ab31c523c41718b002ad77bd6c`。授权schema保持原九字段，没有在授权内增加迁移或审计字段。

以Mac19准确7c1a3e42的完整358/379底表作union，全数保留原产品和输入；新增3个已提交检查脚本：check-recording-media67.mjs、check-mac-recording-media67-independent.mjs、check-mac-recording-media67-final-independent.mjs。唯一修改的既有产品输入是src/use-attachment-media.ts。21个历史input-only输入逐项大小/SHA未变：2个store-probe清单、5个patched ProseMirror依赖、14个Android生成输入。77个插件文件及既有产品fixture例外继续纳入。

[完整输入计划](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/input-plan.json)包含每个旧/新输入行、378 unchanged/3 added/1 modified完整迁移、精确大小/SHA与两聚合。相对Mac19没有新删除；Mac18→19已经删除的macos-recording-access.json及recording-window.json仍不存在，历史tombstone保留在计划中，未恢复或加入授权。

[全capability/handler审计](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-media67-preparation/command-capability-audit.json)逐字核准Mac19与新源：3份capability集合、两组完整application handler、原生local guard实现及插件命令/权限资源均未变化。没有新增或移除grant；macos-notes-ui.json继续在macOS的main/note-*范围明确授予notes-ui:allow-recording-access。67仅在媒体hook对typed MetadataStale有界发起最多三次新的readAttachment；bridge、metadata/access验收、附件写入、录音revision/ACK与退出实现未变。此处记录准确源码映射，不取代独审或真实运行验收。

[input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/input-freeze.json) 为 **350994字节**，SHA256 **`051ad9000605d9883596090dec6618d1121d99f24379b138c145771e3df97da2`**。原工具摘要为 [freeze-summary.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/freeze-summary.json)，执行者 [freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/freeze-review.json)对授权、计划、freeze和当前行逐项核对全部通过。仅运行现有freeze工具的版本、环境及补充输入身份检查，未修改工具或输入。

下一阶段须root直接核准精确freeze SHA并另给START，再使用既有run-build→collector流程。历史Mac19第一次尝试已证明本机访问限制会阻止监控工具启动前的/bin/ps只读检查；下次准确START后应使用所需执行权限运行相同工具，避免重造未执行尝试，不删除检查、不改工具/签名/cache策略。run目标为 `/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20`；artifact目标为 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-media-build20`，执行阶段已在mac-attempt01下创建完整原包与独立派生包。

本轮不追认Mac19已包含67。旧Mac19 C首次MetadataStale及手动重试、E/F和重开观察保留各自历史身份。root最新告知：无活动录音的Mac19已正常CmdQ退出，并只读确认18/19/20均无相关进程；旧Mac18停止时点/原因未知，不能声称其未保存音频仍被保全，不重开旧18。root称已保存C/D/E/F仍在应用数据，未导出音频；本执行者没有访问实际音频、操作GUI/Android、读取或改动旧包。Android仍完全不操作。

准备索引只纳本README、准确授权、完整计划与全权限/handler审计，排除自身。平台freeze/执行及产物另有索引。本轮只证明输入身份，不包含DeveloperID、公证、TCC、真实麦克风/首显恢复/保存/像素验收。

执行更新：root精确START后唯一attempt01以相同既有工具/策略成功正常构建，elapsed 45.388秒、exit0，collector ready=true，完整原包与一份独立派生签名包均已保全。完整运行门槛与包身份见 [Mac20构建记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-media-build20/README.md)。input-plan保留冻结时状态文字；原授权、计划、审计和freeze字节未变。新包尚未由本执行者运行，不追认旧Mac19或实际首显恢复。
