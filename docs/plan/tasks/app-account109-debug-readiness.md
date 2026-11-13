# ACCOUNT109 debug readiness and idle observation

2026-11-13。最新 fresh GUI cancel-local-live01 在 documentProbe 超时；其后 driver 的有限 Eval 诊断被 native 的 READY_ACCEPTED 门槛拒绝，只记录 DIAGNOSTIC_UNAVAILABLE。源码还确认 debug.waitForIdle 的采样循环仅等待 rAF，未交付帧时既不能继续检查真实 busy/save/error，也不能兑现自身 timeout。两者是调试观测缺陷，不证明当前产品启动超时的根因。

## 本轮授权范围

- 只完善显式 debug/sync-e2e 构建中的观测与有界等待，不改变原生账户、Store/Session、同步、权限或生产导航边界。保留 ready、命令、任意 Eval 和 Shutdown 的原门槛，不为诊断在 ready 前允许任意脚本或产品命令。
- native 增加一个固定、只读、有限的启动诊断动作；只访问已有可信 main WebView。允许在 READY_ACCEPTED=false 时运行该固定脚本，拒绝额外参数/任意 expression。仅收集 document/startup/root 状态、rAF/timer 次数与有限 App busy/save/error 布尔值/计数，不含正文、账户、URL、callback、原始异常或保存错误文本。所有任务和回调必须有界、取消/退出可清理，不能因诊断改变 ready 接受状态。
- driver 在原 ready 超时后只调用上述固定动作；原始失败与 diagnostic 不可用分别保留，不能将诊断成功当启动通过。现有旧候选不支持新动作时仍失败并保留有限不可用结果，不回退任意 Eval 或重试启动。
- debug.waitForIdle 每轮采用有界的“rAF 或 timer 到达”采样机会；timer 只恢复循环，必须重新读取实际 active/busy/save.pending/save.saving/save.failed/error。只有原有连续三次真实空闲样本可返回 idle；错误、销毁、忙碌或 timeout 不能形成 PASS。实际 timeout 不再依赖帧交付。不声称 timer 证明 paint、像素、物理输入或浏览器授权成功。
- 不改 App 中 quiet cover 的 rAF/flushSync 隐私顺序，不以强制 ready、默认开启账户同步、清除 pending/save/error 或隐藏窗口故障来解决。
- 既有 `NOTES_SYNC_E2E_SLOT=left|right` 是显式测试窗口布局：show/unminimize 后可对该 owned main window 请求一次正常 `set_focus`，使 CLI 启动的实际 GUI 获得正常前台呈现机会。仅该已存在的显式布局分支生效，不设系统偏好/权限，不操作其他 App，不模拟点击，不跳过真实 DOM/idle/帧/关闭检查，失败则保留错误。这是执行前提的显式窗口激活，不证明 live01 根因；普通构建与未设 slot 的启动不增加焦点行为。

## 交付与验证

作者和独立审阅分离。优先复用既有代码文件，控制新文件和回执数量。用受控时钟覆盖无 rAF 但 timer 可运行、正常 rAF、竞争只完成一次、关闭/取消/迟到回调、busy/save/error 中途变化、实际 timeout，以及 ready 前只有固定诊断允许、Eval/Execute 仍拒绝与诊断不会设置 READY_ACCEPTED。先提交源码与必要 fixture，经独审后才构建精确新 GUI 并安排一次新的实际检查；旧失败原样保留。无凭据、原库、手机、外部角色/网络设置或 live 认证操作。共享 native target 仅由父级协调，未获分配不编译；不用 HOME/CODEX_HOME 覆盖。

## 作者交付回执（device-free）

独立树 `codex/account109-debug-readiness` 基于 `c090d7b4`；接口按 `816041b3` analysis 尾节、owned slot 激活按 `156d6a58` task 追加授权实现。仅修改 native debug driver、stdio Node driver、debug runtime 与必要 fixture；不改 App/startup/quiet-cover 或生产权限。固定无参数动作 `startupDiagnostic` 只投影 `__CYBERNOTE_STARTUP_DIAGNOSTIC__` 的 schema=1、九 gates、六 phase，非法/缺失快照为 null；DOM/render 及 native visible/minimized/focused 只输出有限值。无 app.state/execute/Eval 诊断。350ms 观测清理 rAF/timer/pagehide 回调，driver 原 Ready 失败仍抛出且记录 `readinessError`，不支持动作的旧候选单列不可用，协议错误仍 fatal。

idle 每轮最多等待 min(50ms, remaining) 或 rAF，胜者清理另一通道，随后重新取实际状态；连续三次真实 idle 才通过。dispose 取消各调用的回调；execute 双 rAF 屏障未改，active execute 停帧时 idle 必须 TIMEOUT。既有 validated left/right slot 分支内，show→unminimize→一次 set_focus 均绑定同一 owned main，任一步失败保留错误并停止后续操作；未设 slot 的分支不新增 focus。

作者验证：device-free readiness fixture + Node driver + relogin + helper **84/84**；TypeScript、Node 语法、diff check 通过。fixture 直接 bundle 生产 debug runtime 并执行 Rust 常量中的精确固定 JS，不启动浏览器或产品 App；stdio 子进程只是 Node fixture。覆盖无帧、正常帧、竞争/迟到 callback、dispose、busy/pending/saving、失败/错误变化、deadline、active execute、快照未知/注入、旧动作不支持与原错误保留。Rust 两项单测已写入但**未编译/执行**：`fixed_startup_diagnostic_is_parameterless_and_preserves_ready_gate`、`owned_slot_focus_follows_presentation_once_and_never_hides_failure`；待父级协调共享 target 后定向 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib sync_e2e::tests::`。没有使用任何 Cargo target、新建大 target、HOME override、App/UI、网络、凭据、原库或实际认证；不证明 live01 原因或 WebKit/焦点/paint 效果。源码先提交，manifest 若涉及既有 inventory 条目再从精确 source SHA 单独刷新；不扩展 inventory。独审范围为上述三个源码文件、两测试文件及本回执；App handoff 最终接线由父级整合后核验。
