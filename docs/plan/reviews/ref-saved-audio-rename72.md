# 研究72独立核对：报告准确，原版目标未完成

2026-11-06。受审提交`1c30294e08e4419abf3454045553c1f536742feb`，分支证据基线`0f43a9c6185a193c6a6408c732aa1ae50871490d`。仅阅读已保存证据、报告和克隆源码；没有重试原版UI、请求权限、操作设备/麦克风、读取用户音频或修改产品代码。未运行构建或假造行为测试。

## Findings

- **P3 / non-blocking，已在本次文档修正：源码引用精度。** README标题regex实际位于`src/Editor.tsx:158`；文档validator完整路径为`src-tauri/src/store/archive/document.rs`，并非`src-tauri/src/archive/document.rs`。同时明确未登记attrs直接拒绝，只有manifest已登记但没有专门策略的字段才落到`value == default`。不能读成任意新attrs值等于默认就能绕过schema。
- **P3 / non-blocking，已澄清证据强度：observe响应不回显请求参数。** `02-original-observe-denied.json`保留完整错误，但没有pid/window_id。报告中具体输入来自调查者调用记录；仅靠此响应不能独立还原该输入。二进制SHA可由local-identity与REA open相互核对；pid/window由local-identity证明；目标合成笔记/卡片未被本轮确认。这一限制不改变拒绝本身真实、原版行为尚未取得的结论。
- **原版重新命名交互仍开放，不能将研究任务标done。** `ORIGINAL-OPEN`是任务目标未完成，不是新发现的产品修复或报告失真；此轮没有对话框、字段初值/选区、Return/Escape、取消、实际暂改、恢复、Undo、重开或像素证据。报告已经明确不把工程候选当原版语义。

## 原始证据核对

| 项目 | 核对结果 |
| --- | --- |
| 时间/源身份 | local-identity的UTC `2026-11-05T16:38:41.505424+00:00`对应Asia/Shanghai 2026-11-06；记录sourceHead0f43a9c6。 |
| 原版二进制 | local-identity与REA open均为`/System/Applications/Notes.app/Contents/MacOS/Notes`、SHA`9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02`；open标注mach-o-universal/arm64。仅核保存响应，没有重新操作原版。 |
| 进程/窗口 | 保存的pgrep/ps为40579；CGWindow中83173为onscreen、标题“Notes Clone UI 对照”、bounds53/29/1387/903。不能据此推断合成笔记选中。 |
| REA拒绝 | capability_unavailable / unsupported_provider，provider native-macos，operation observe_native_ui，reason accessibility-denied。不能改称锁屏、无窗口或截图失败。 |
| AX拒绝 | System Events脚本exit1、osascript不允许辅助访问、-1728。未保存可读AX树。 |
| 会话/导出 | 起始open=false、cleanup_pending=false；本轮正常open；export bytes105/records0/unknowns0，与空bundle一致；close result null。没有观察证据记录，拒绝响应单独保留。 |
| 改名/恢复/像素 | 均无证据，报告未虚报执行或恢复；没有本轮截图。 |

## 克隆静态事实核对

1. `MediaView`从node取得id/name/kind，音频props采用`media?.name ?? name`。`useAttachmentMedia`依赖id/kind/version并缓存后端name/source；仅改node.attrs.name不能稳定改变已加载名称。`AudioPlayer`对最后点后缀的regex会把“会议.纪要”显示成“会议”。
2. bridge通过attachmentOwners确定note、AccessGate stamp/expected及accept校验；Rust read_attachment从真实attachment_note确定归属，Session.sensitive检查token/屏障/授权，再读Store数据并tagged。报告没有建议绕过访问门。
3. Attachment派生完整PartialEq/Eq，display_name确在比较字段中。operation_reference对live记录与journal Attachment不一致返回managed_identity_changed；query把Uncertain映射为deferred。store重放还检查display_name/mime/size/recorded_at及原字节。直接改live display_name会破坏此身份契约；journal的可变操作state与不可变输入身份须区分。
4. recording-replacement的合法revision替换先spread旧node.attrs，再覆id/name/kind；因此未来显式标题字段存在时有保留路径，但当前尚无audioTitle字段或已保存录音rename命令，不能宣称功能已完成。
5. TipTap attachment schema目前仅id/name/kind。Rust document validator先检查attrs已登记，再执行显式字段策略/default比较。候选B必须同步TS/Rust/manifest/corpus；正文SaveQueue/revision/ACK、PM Undo、归档和授权路径真实存在，但没有本轮运行验证新增字段或重命名。
6. 候选B仅为可能的逐引用正文标题模型；原版是否全局名称、是否随Undo、是否影响导出/扩展名/重复引用仍未知。报告准确区分工程性质与原版观察，没有把保存链存在等同于新行为已验。

结论：**报告准确性核对pass；SOURCE-READY仅指源码准备与不变量已梳理，ORIGINAL-OPEN继续成立。** 本任务原版行为目标没有完成，任务状态应继续in-progress，不能根据该pass标done。后续只有实际原版证据支持的交互才能进入开发合同；当前可继续其他已有充分参考证据的工作。
