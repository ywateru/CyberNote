# 开启同步失败：大资料库准备超时修正

2026-11-14。用户在 `6dadbb8a` Mac 中确认开启同步后收到 `account_sync_adoption_blocked`。旧错误没有保留细分阶段，无法唯一还原截图那一次拒绝；本轮确认并修复了可导致此类失败的大资料库超时缺陷，不能将源码修正直接等同于原库真实启用已通过。

## 原因与证据

只读原库检查：inbox 为 0、并发 head 组为 0、head/projection 不一致为 0；本地非 dirty 笔记、文件夹与附件元数据未发现差异。135 项 dirty 表示尚未固化的本地变化，本身不构成数据损坏或冲突证据。

在隔离私有副本上运行真实 Store：preflight 45 ms 通过，全量媒体准备 25.766 秒通过，adoption 事务 8.671 秒通过；业务行和 189 个附件原字节保全，原库 DB/WAL 及附件摘要未变化。[完整诊断](native/adoption-store-diagnosis01.md)保留未复制旧 `.sync` 缓存等局限。这些耗时不是现场准确计时。

旧代码会先为通用 apply 准备媒体，再推进 adoption 窗口屏障；全部 prepare ACK 后的全量媒体准备也占用仅 5 秒的期限。正常的大资料库处理可使屏障过期，随后又被通用错误文案描述为旧冲突或未应用内容。

## 修正与验证

- adoption 跳过通用 apply 的媒体准备，全部窗口保存确认后，单次进入 60 秒媒体提交前阶段；窗口确认仍各限 5 秒。保留最终权限、参与窗口、intent、目标集合、Store/media generation、账户 gate 和事务检查。
- 媒体事件不重复续期，旧计时器不能取消后续操作；取消或超时后的迟到结果不得提交。事务结果及窗口释放仍由真实 terminal receipt 决定。
- 明确超时携带有限的 `adoptionStage` 和 `adoptionReason`，界面显示窗口响应、保存确认或附件准备超时，不再用旧冲突解释已识别的超时。旧错误和其他原因保持兼容。

[原生／前端整合独审](native/adoption-large-library-review01.md)批准：原生 adoption 23/23、account types 7/7、前端 60/60 通过，零失败、忽略或跳过；作者另执行 Session synchronization 18/18，与上述原生范围有重叠。[前端独审](adoption-large-ui-review01.md)包含 ACK 竞态、重复事件及计时器所有权反例。相关契约见[准备期限](../../plan/tasks/app-account109-adoption-large-library.md)。

## 当前候选与手动复验

精确构建源码 `5590e25e6607e439cc13a0b852cdc1d16b932ddf`。应用：`artifacts/account109/mac-5590e25e-debug-01/CyberNote-Account109-5590e25e.app`。[构建、身份及签名回执](native/5590e25e-mac-build01.md)通过。

旧包正常退出后，已用新包打开原默认资料库，实际 PID 2147。原生窗口版本信息为 `5590e25e6607`；进入账户页，现有账户恢复，开关关闭、同步暂停、待处理 0 项、尚无成功同步记录。未点击开启、未重新登录、未退出账户、未编辑笔记。新包留在账户页供用户确认“开启并合并”；首次准备可能需要几十秒。若仍失败，展开错误详情记录安全 code 及可选 adoptionStage/adoptionReason。完整原库启用及多端收发尚待手动验收，Android 包未在本轮更新。

复用既有 Cargo target。一次性私有复现数据已清理 358 个文件、约 584.0 MiB 逻辑大小，保留结果与执行回执；原始资料库、旧基线和旧候选均保留。
