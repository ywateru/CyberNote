# ACCOUNT109 debug readiness and idle observation

2026-11-13。最新 fresh GUI cancel-local-live01 在 documentProbe 超时；其后 driver 的有限 Eval 诊断被 native 的 READY_ACCEPTED 门槛拒绝，只记录 DIAGNOSTIC_UNAVAILABLE。源码还确认 debug.waitForIdle 的采样循环仅等待 rAF，未交付帧时既不能继续检查真实 busy/save/error，也不能兑现自身 timeout。两者是调试观测缺陷，不证明当前产品启动超时的根因。

## 本轮授权范围

- 只完善显式 debug/sync-e2e 构建中的观测与有界等待，不改变原生账户、Store/Session、同步、权限或生产导航边界。保留 ready、命令、任意 Eval 和 Shutdown 的原门槛，不为诊断在 ready 前允许任意脚本或产品命令。
- native 增加一个固定、只读、有限的启动诊断动作；只访问已有可信 main WebView。允许在 READY_ACCEPTED=false 时运行该固定脚本，拒绝额外参数/任意 expression。仅收集 document/startup/root 状态、rAF/timer 次数与有限 App busy/save/error 布尔值/计数，不含正文、账户、URL、callback、原始异常或保存错误文本。所有任务和回调必须有界、取消/退出可清理，不能因诊断改变 ready 接受状态。
- driver 在原 ready 超时后只调用上述固定动作；原始失败与 diagnostic 不可用分别保留，不能将诊断成功当启动通过。现有旧候选不支持新动作时仍失败并保留有限不可用结果，不回退任意 Eval 或重试启动。
- debug.waitForIdle 每轮采用有界的“rAF 或 timer 到达”采样机会；timer 只恢复循环，必须重新读取实际 active/busy/save.pending/save.saving/save.failed/error。只有原有连续三次真实空闲样本可返回 idle；错误、销毁、忙碌或 timeout 不能形成 PASS。实际 timeout 不再依赖帧交付。不声称 timer 证明 paint、像素、物理输入或浏览器授权成功。
- 不改 App 中 quiet cover 的 rAF/flushSync 隐私顺序，不以强制 ready、默认开启账户同步、清除 pending/save/error 或隐藏窗口故障来解决。

## 交付与验证

作者和独立审阅分离。优先复用既有代码文件，控制新文件和回执数量。用受控时钟覆盖无 rAF 但 timer 可运行、正常 rAF、竞争只完成一次、关闭/取消/迟到回调、busy/save/error 中途变化、实际 timeout，以及 ready 前只有固定诊断允许、Eval/Execute 仍拒绝与诊断不会设置 READY_ACCEPTED。先提交源码与必要 fixture，经独审后才构建精确新 GUI 并安排一次新的实际检查；旧失败原样保留。无凭据、原库、手机、外部角色/网络设置或 live 认证操作。共享 native target 仅由父级协调，未获分配不编译；不用 HOME/CODEX_HOME 覆盖。
