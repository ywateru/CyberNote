# Task50 最终独立工程复核：SOURCE-READY

2026-11-05，准确产品源 12e5cd2bfcb9dca75983a3c54f67d6f4a94c6cf0。隔离工作树 /private/tmp/apple-notes-recording-window50-independent-03，HEAD b698c83 为同一单行提交的 cherry-pick；20 个允许的产品/检查输入逐字节与12e一致。未操作GUI、TCC、真实麦克风、原版用户数据或手机设备。SOURCE-READY仅表示本轮工程独审通过，实际双原生窗/有声/设备/像素验收由root继续。

## 结论与修复链

首源9141的relay首次失败无法重送、child Destroyed后真实原A ACK无法释放guard两项，已在8e独验关闭；首证据7e0d4fe6f2fb0aa54afee07ea6f21b4e771b4820、第二证据541fd72bafbe8d0a975ce150fb7d751a2446c6d6均保留。本轮原App保存边界33项再次覆盖lateACK；RecordingWindow/Panel/coordinator等与8e完全相同，沿用第二批实际组件12/child relay6的串行浏览器证据，不重复无变化矩阵。

第三项Quit成功ACK后仍可接受未确认编辑，在1b47独验关闭。第一await前quitState、实际SearchEditorGate.suspend/park与app inert封住正文输入；原生、格式、新建、附件、独立窗口入口及等待后continuation均检查。成功ACK后保持冻结，晚onReady、gate.activate/restore不能解除。取消须匹配本轮id，恢复当前合法、同实例、活动Editor，parked/只读/撤权/同步/删除/替换实例不重开。活动或尚未完成的组字立即拒绝本次Quit，不强行结束输入或改正文；不是普通后台录音/hide的限制。

独审还发现1b47重复Quit阻塞：main录音saved→childDestroyed→main正文ACK后，另一正文参与者未ACK；第二次ExitRequested因entries空直接放行。原public-function probe native-repeat-quit-first保存repeatPrevented=false及断言101。12e仅修正这一早退条件。相同脚本和断言在native-repeat-quit-final通过，firstPrevented=true/repeatPrevented=true/otherAckSent=false/exitCalls0。本次不新增产品源修改。

## 独立执行结果

- 原样第三项脚本首先运行，新增App宿主依赖缺失 ReferenceError quitPending 的原始stdout/stderr保留，不计产品失败；只补新state/ref/真实SearchEditorGate与Editor.setEditable宿主后，全部原始断言不变，33 PASS，editableAfterAck=false/pendingDocs0。脚本与适配说明另存，不覆盖原样。
- 固定实际新版App闭包+SaveQueue+SearchEditorGate检查38 PASS，typecheck PASS（执行于1b47；相应所有TS输入与最终12e相同）。
- 独立额外恢复8 PASS：suspended/operation/deleted/missing-note/replaced-instance/prior-readonly；真实PM草稿待存时composing拒绝Quit、正文和pending引用/可编辑状态保持；旧代取消后晚完成不能发旧success ACK或解冻新Quit。此处composing平台状态受控，不冒称真实输入法设备验证。
- 实际Rust public函数独立参与者3 PASS：ACK前加入正文窗口、全部正文ACK后但childDestroyed前加入窗口、已ACK正文窗Destroyed；均发送带原id取消、拒绝旧ACK、exitCalls0。调用生产函数体不变，仅Tauri window/state/event/exit边界受控。
- 最终12e pnpm build PASS（现有chunk大小提示），locked/offline独立target Rust4 PASS。没有下载或新增依赖，没有扩大历史全矩阵。

所有probe保留命令、固定模块原始hash、仅移除command属性/内doc注释变普通注释的说明及兼容已有rlib选择过程。native首次库特征不匹配编译尝试原样保留，最终执行失败/通过均有execution.json；忽略.bin而不提交可执行产物。

## 边界

受控编辑器命令宿主、后台invoke、窗口/事件与媒体不能替代真实桌面双窗、音频编码/有声、后台采集、手机安装/权限或原版像素一致。1b/12e没有变化的UI/媒体组件沿用8e独验，不新宣称浏览器或像素PASS。既有防御性反序nativeACK限制仍按实际App终态→close→flush→QuitACK协议判为不可达，不计本轮阻塞。当前无剩余本轮工程阻塞。
