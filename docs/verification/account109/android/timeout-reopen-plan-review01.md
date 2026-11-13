# 授权等待后error态正常重开：独立步骤审阅

2026-11-13。**APPROVE，限定为任务与既有API的静态步骤审阅，无blocking finding。** 审阅精确main `7c396b1b3a2c2582e506bead2717774aa8a44845` 的 `docs/plan/tasks/app-account109-android-timeout-reopen.md` 及下述已有helpers。父级可用现有exports直接完成单独用例，无需新增脚本、改产品或重建。此结论不表示恢复已执行/通过，不改变旧smoke FAIL。

## 可直接执行的既有API顺序

1. `loadInputs()`（current-login-smoke helper）只加载固定SHA的升级receipt/0600私有快照与固定历史fixture；不要调用该模块的`run`/`exerciseCurrent`。本审阅未读取这些私有文件。`PIN.apkSha256`须仍对应88b2dabe已独核APK。连接用`connectAndroid({launch:false})`，持其exclusive lease；`assertInteractive()`确认解锁和测试包foreground，`ownPid() === peer.owned.pid`，`peer.artifactIdentity()`核固定package/APK。这里的oldPid取**本次peer.owned.pid**，不能用`PIN.oldPid`（那是升级前旧包进程）。
2. 读取native status，严格要求`state=error`、`error.code=account_authentication`、`enabled=false`、无profile、`authorizationSurface===undefined`、`pendingCount===0`且`devices`为空数组。用`capture(peer, history)`（preserving-upgrade helper）及`sameSnapshot(expected, captured)`逐字段比对当前完整数据；再读同一error状态并重新核PID/foreground。capture先核固定历史前缀、附件节点/引用/授权，再读取固定附件原字节并核长度/SHA；返回完整notes、descriptor与附件byte evidence，同私有快照比较。不是仅比旧历史文档hash，不读取grant。`pendingCount`是同步计数，不能单独用它证明无授权pending。
3. 在旧peer lease仍持有时，再次核`ownPid()===oldPid`与`assertInteractive()`，调用`backgroundAndroid()`；立即要求返回`pid===oldPid`。随后再次核`ownPid()===oldPid`，调用`reclaimBackgroundAndroid()`；它在`am kill`前再次读取owned PID并拒绝测试包仍foreground，有限等待进程消失。要求返回`oldPid===所持oldPid`。任何PID/foreground/状态/数据门槛失败立即停止，不能仅在全部动作后才统一核对返回PID。
4. `await oldPeer.close()`使用默认keepForward=false，随后以`ownedForwardPresent(oldPeer.owned)===false`及既有固定lease目录不存在检查确认释放，才进入下一连接。close不要求旧PID继续存活，故可在am kill后清理；只移除该serial/local/remote精确mapping，不能用remove-all或删除他人/stale lease。
5. `connectAndroid({launch:true})`重新取exclusive lease后内部调用`launchAndroid()`默认restart=false，实际是正常`am start -W`，不是force-stop。要求新`owned.pid!==oldPid`、同package及同APK hash，`assertInteractive()`通过。先`cleanSignedOut(await peer.accountStatus())`并完整capture/compare；若不是healthy signedOut即停止，不用账户命令把状态改成预期值。
6. 使用现有`stableLocal(after, expected, {capture: p => capture(p, history)})`进行至少3秒、至少3次的真实重复完整数据/healthy signedOut观察；每次capture边界补`assertInteractive()`与当前owned PID核对，最终再核APK/PID/foreground。**必须传完整capture覆盖参数**：stableLocal默认snapshot使用旧KNOWN_BODIES，不能替代本次私有完整快照。在每次状态样本另严格要求`pendingCount===0`及空devices数组，不能仅依赖cleanSignedOut允许无connected device的较宽条件。保留其真实durationMs/samples；不足样本或超时/错误不得计PASS，不补恢复动作。

## 禁用入口与失败清理

- error态不能调用`peer.reclaimSignedOut()`：它正确要求clean signedOut，不能为本次改宽。preserving-upgrade的`initialAccount()`要求旧coordinator网络错误，也不适用于本次error/account_authentication。
- 不调用smoke `run`、`exercise`、SignIn/cancel/signOut/setEnabled/syncNow；不用`launchAndroid({restart:true})`、force-stop、clear、grant/logout或原库/快照改写。正常启动自身的既有恢复逻辑不等于测试器执行账户命令。
- 任一失败只在finally关闭本次取得的peer；connect失败内部close已有资源。close是idempotent，释放ws/pending CDP与精确owned forward，lease仅在owner token匹配时删除。将forward/lease清理失败单列，整体不能PASS；不重复重开、杀其他进程、清旧错误或执行新授权。
- 新用例用独立输出，报告只保留有限状态、逐项比较布尔/摘要、PID与动作记录及3秒样本结果；不复制私有正文、原字节、grant或原始XML。旧FAIL、私有升级快照和历史baseline保持原样，不追认附件来源或历史baseline已接受。

## 源码依据与范围

精确7c396b1b：`account109-android.mjs`的assertInteractive/ownPid、backgroundAndroid/reclaimBackgroundAndroid（87–145）、connect/close（224–260）、reclaimSignedOut与artifactIdentity（367–379）、authorized readAttachment（429–438）；`sync108-android-lifecycle.mjs`的exclusive lease/owner close；`account109-android-preserving-upgrade.mjs`的capture/sameSnapshot（67–80）；`account109-android-current-login-smoke.mjs`的pinnedPrivate/loadInputs（30–46）；`account109-android-login-surfaces.mjs`的cleanSignedOut与stableLocal（24–25、46–47）。上述imports均无顶层设备动作。

14:14:15仅能确认当时error/account_authentication；原有限状态没有可确认timeout的stage/reason，等待约10分钟不能独立证明自然超时。本审阅不作该根因归类。当前pipe/PTY差异与14:14 guard拒绝已按原档阅读。此恢复流程不需要调用仍待修正的nativeLoginPresentation，也不触发Back；PTY/helper修正及其Cicero独审仍是下一轮新取消smoke的独立门槛。这里只读源码与已归档有限结果；没有ADB/App/网络、私有快照读取、测试运行、构建或产品/helper修改。

复核差异：31fce1dc→7c396b1b的account109-android、lifecycle、preserving-upgrade、current-login-smoke、login-surfaces五个helper文件无任何diff。既有background→reclaim→close→connectAndroid({launch:true})的顺序和owner/cleanup结论不变；更新仅收窄原因归类及明确执行门槛。本次仍未执行任何设备或测试动作。此提交替代未合入的6065c831审阅文本，不要求先合旧版。
