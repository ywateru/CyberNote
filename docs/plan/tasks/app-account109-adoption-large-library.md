# 大资料库开启账户同步的准备期限

2026-11-14。用户在 `6dadbb8a` Mac 原库开启同步时收到 `account_sync_adoption_blocked`。只读检查没有发现 inbox、并发 head、失配 projection 或非 dirty 本地内容差异；私有副本上的实际 Store preflight 和 adoption 均成功。该副本 bootstrap 媒体准备耗时 25.766 秒、事务耗时 8.671 秒，业务行与 189 个附件保全。副本未复制原同步 blob 缓存，因此这些耗时不是现场准确计时，也不能据此断言现场唯一拒绝分支。

已确认的设计缺陷是：通用 coordinator 会先准备旧 apply 的媒体再推进 adoption；全部窗口 prepare ACK 之后，全量附件准备仍占用 5 秒窗口确认期限。大资料库的正常媒体工作会使屏障过期。不得通过清空同步记录或绕过保全检查解决。

## 修正规则

1. 仅 workspace adoption 跳过 coordinator 的普通 apply 媒体准备；其最终事务必须使用自身完整验证过的媒体。普通 apply、手工恢复的媒体和期限规则不变。
2. probe 与 prepare 各保留 5 秒期限。取得全部 prepare ACK 后，原生在同一 Session 锁内复核操作、参与窗口、Session epoch、Store instance、无 pending/intent/protected、目标集合及 Store preflight，单次进入媒体阶段。重复调用不能续期。
3. 媒体阶段的提交前期限固定为 60 秒，以单调时钟计算。原生广播严格事件 `{phase:"adoptionMedia", operationId, sessionId}`；只有匹配当前操作且已完成 prepare 的窗口可接受。窗口继续持有原冻结租约，首次事件将取消计时器改为 60.5 秒，重复事件不续期；未知、错配或错误顺序不得延长租约。兼顾 prepare ACK 的 IPC 返回与阶段事件竞态。事件发送失败中止，事件丢失仍由原计时器安全取消。计时器只能请求取消，不能自行解冻或宣布成功。
4. 媒体完成后，在最终同锁提交前重新检查以上全部条件、媒体期限、账户 gate/generation 及 media generation。超时或取消后迟到的 verifier 结果不得提交。60 秒是进入事务前的期限；进入原子事务后的结果由真实 commit/abort 与 terminal receipt 决定，不能用计时器伪造终态。保留本地编辑权限、Store instance 旋转、旧 backend fence、release 重放及终态恢复。
5. 保持原有错误码；为实际超时增加成对、有限的可选诊断字段：`adoptionStage: "probe" | "prepare" | "media"` 与 `adoptionReason: "timeout"`。只允许该错误码携带这对字段；不能展示内部原始错误、路径、标识或用户内容。原生保留超时阶段，避免 coordinator 先释放后被后续 cleanup 覆盖。旧版或其他阻断原因没有这对字段时保持兼容，不猜测根因。界面遇到明确超时显示对应准备阶段及可重试说明，避免称其为旧冲突。

## 验证与边界

用可控时间和 verifier 验证：全部 ACK 后 25.766 秒媒体工作可通过；超过 60 秒会释放并拒绝迁移；迟到结果、参与窗口／权限／intent 变化仍拒绝；重复阶段事件不续期、丢失安全取消；普通 apply 不延长。补充真实 React／renderer 协议与 DTO 检查，保留现有事务和 release 回归。不得在测试中等待真实 60 秒或用大型合成媒体制造同构耗时。

原库保持不动，不清除旧协议状态或登录授权，不自动发起与其他设备的合并。验证后按精确 clean 源码刷新 pin、复用既有共享 target 生成 Mac 候选，由用户继续手动开启及多端验收。本轮实际观察与未证实部分应分别记录。
