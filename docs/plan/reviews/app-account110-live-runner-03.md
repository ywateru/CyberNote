# Account110 CLI 异常映射与生命周期增量独审 03

- 结论：**APPROVE `bbd2b8973da04c1189e10a4a88727d041a2db895`；本增量未发现阻塞项。**
- Git author/committer：`osd-pub <osd@osd.pub>`；提交只改 `account110-device-actions.mjs` 和对应 `.test.mjs`。
- 作者树 `/private/tmp/cybernote-account109-login-surfaces` 审阅前后 clean。检查时 HEAD 为 `7abc5bc43d20292c5762720005f83343091e8805`，比目标多一笔首失败归档；已用 Git 确认 runner、fixture、复用 driver 与目标提交字节无差异。
- 本轮限定复审有限错误码和原生进程生命周期，不重复审批 native 栈溢出修复，也不把 fixture 通过当双端实测成功。

## 复核结论

1. **异常只按有限 code 映射。** `safeFailure` 为既有 driver/bridge 增加固定枚举；未知 code、带后缀 code、仅 message 中出现已知标签均回到 `CHECK_FAILED`。不提取/透传 message、stack、callback、URL 或其他原始字段。`APP_EXITED`、`EXIT_BEFORE_RESPONSE`、`STDIN_ERROR` 等真实固定失败可保留，不再全部折叠为通用失败。
2. **退出事件、pipe close 和自然退出分别记录。** `safeLifecycle` 输出有限 device label、exitObserved/closeObserved/closeConfirmed、有限 signal、有效 exit code、TERM/KILL 记录及安全错误码。未知 signal 仅写 `unknown`；没有退出观测时不会把 null code/signal 当成功。自然退出还要求 driver 明确 naturalExit、已确认 close、观察到 exit0/null signal、没有强制信号/driver failure/cleanup error。
3. **close 异常之后仍等实际 child close。** `closeNativeClients` 为每个已持有的 NativeApp 调用其既有有界 `close()`，无论返回或抛错，随后用既有 `bounded` 再等待 `app.closed`，默认最多 3000ms，并要求 driver 的 close 事件记录存在。shutdown ACK/exit 事件本身不够；缺少 lifecycle、close 超时、close 抛出 null/未知错误均保持失败。新增代码不杀其他 PID、不按名称/端口回收；沿用 driver 精确 child 的退出策略。
4. **失败客户端不跳过健康 sibling。** 每个回收任务内部捕获 close/wait 错误，所有 child 的回收并行执行；失败端的有限 driver、exit signal 与 cleanup code 可以同时保留，健康端仍等其 close。主流程原 `report.failure` 不被 cleanup 覆盖；另记 `cleanupFailure`、逐进程生命周期与 `nativeCleanup.allClosed`。全部自然退出/确认成功后才可能保存最终 pass。
5. **迟到证据不改写已保存失败。** close 未确认时捕获的 lifecycle 仍是 false/timeout；随后 Promise resolve 不会修改已构造的安全回执。实际仍未回收的分支只能报告未确认/FAIL，不能声称所有进程已消失。

## 独立检查

运行范围仅 Node 设备外 fixture 和静态源码，无 App/native binary、Cargo、ADB、网络、真实资料库、grant 或凭据访问。

```text
node --test scripts/verification/account110-device-actions.test.mjs
24/24 PASS；0 failed/cancelled/skipped

node --check scripts/verification/account110-device-actions.mjs
node --check scripts/verification/account110-device-actions.test.mjs
均通过
```

新增 fixture 覆盖有限码/未知原文拒绝、signal exit/无观测区分、exit 或 ACK 后继续等 pipe close、崩溃端与健康 sibling、close timeout/缺失 lifecycle/null rejection，以及 `main` 持久化时同时保留首失败和清理证据且不落原始错误。

另独立执行纯内存反例检查：强制 TERM/KILL 即使 driver naturalExit 标志为 true 也不能 pass；未确认 close 不自然退出；未知 cleanup error 只留下 `CHECK_FAILED`，健康 sibling 仍完成回收；带原文后缀的已知 code 被拒绝。均通过，没有启动真实进程。

| 检查模块 | SHA256 |
| --- | --- |
| `scripts/verification/account110-device-actions.mjs` | `283f59afe9ee0fc6cc7e60b60048803342cf7007d7aee2c6d1cfddba86373ac9` |
| `scripts/verification/account110-device-actions.test.mjs` | `c1679135373ef6167a47d1a881d0f0a3b829be0d436cc6d9059b73a0a13e56f7` |
| 复用且未改的 `scripts/verification/sync108-native-driver.mjs` | `d521530738daf0586846445de14e6ecf57799c2c441e78cb0d25312b640a2c23` |

本审阅不修改/重写 live01 首失败证据，不据此补造其当时缺失的生命周期字段，也不宣称测得真实 PID 回收。native 修复独审、合入后最终 manifest/source/package 身份及后续真实验收由各自门槛负责。本提交仅新增本审阅文档，未改作者实现或 manifest。
