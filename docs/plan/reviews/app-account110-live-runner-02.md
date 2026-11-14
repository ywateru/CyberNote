# Account110 双客户端 CLI runner 复审 02

- 结论：**APPROVE 本次 runner 修正；review01 的三个 P2 均关闭，未发现本次范围内剩余阻塞项。**
- 精确对象：`0e0c5193fad0de7d3ae1011efc0ab86d9bdc1fcf`，前驱 `9f39d41ab72364feb45326f174e96bdad949843a`。
- 对照审阅：`08b6f6e94cbdbe8767898377709d58f0e33d55ba` 中的 `app-account110-live-runner-01.md`。
- 作者树 `/private/tmp/cybernote-account109-login-surfaces` 审阅前后 clean。此次 diff 仅 runner/fixture 两文件；未修改作者实现。
- 已读取作者有限回执 `/private/tmp/account110-device-actions-reviewfix-author-receipt02.json`，并独立核对模块 hash、运行 Node 检查。该回执不是独立验证的替代。

## 三项复核

### 1. 部署证据门槛：关闭

`account110-device-actions.mjs:136` 的 `validateDeployment` 现在解析 JSON、限制顶层字段、要求 schemaVersion=1、精确成功 status/READY、sourceRevision 与 productionDeploymentId 匹配显式预期，并核对 SHA256。还要求 source 闭包与生产 assignment/public smoke 的肯定标志、项目/域名及有限来源 digest。`:249` 在输出根创建和 App 构造之前调用验证。

fixture 覆盖普通文本、错误 JSON 形状、失败/未就绪状态、source/ID/hash 不符及否定标志。构造 App 前拒绝的集成 fixture 通过。

另直接以 Git 已提交的 `43e3bf712e36e7bbcf63cfca9ed71ede7a02d49c:docs/verification/account110/server/registry-deployment01/result.json` 字节调用新 validator，通过，并独立匹配：

- source：`e220111362084d4c72b6d6fe2dada505b97a6df3`。
- deployment：`dpl_8Fewyd8o8HHUouDYJDULDd6XSweY`。
- receipt SHA256：`6eb360ff873b159683e9ae8ee2419ad4b2bd32b78be2c3b6b34da6e6b46414db`。

信任边界明确：输入仍须是父级选择的已独核精确回执；本地 validator 不提供密码学签署或重新查询线上当前 assignment，也不把匿名 smoke 解释为真实账户注册通过。本次没有新网络请求。

### 2. 慢采样及绝对期限：关闭

`:71` 默认仍为最小 5000ms 观察窗口，新增固定默认 30000ms 总预算。有效 read/check 都成功且未被 abort 后才计样本；必须同时至少两样本、经过最小窗口且未超总预算才能返回。慢首轮跨过窗口时立即继续第二轮，wait 经非负钳制；不会再以单样本提前断言失败。

每轮 timer 使用同一起点剩余预算，非逐轮重置；`Promise.race` 限制挂起 read/check，finally 清 timer 并 abort。实际 idle 回调在异步阶段间检查 signal，protocol probe 接受同一 signal，迟到结果不会使该窗口 pass 或在取消后继续启动后续 probe。已派发的 NativeApp 只读请求仍由既有 driver 自身有界收尾；30 秒是观察判定预算，不是宣称所有操作系统清理都在该时刻完成。

设备外 fixture 覆盖慢首轮、慢后轮、两轮均慢、总预算耗尽、检查错误原样失败及挂起 read；均通过。没有增加授权/连接预算或重试产品动作。

### 3. probe 生命周期及竞争：关闭

`:172` 的 `ProtocolProbes` 只持有固定 Python 只读命令的精确 ChildProcess。stdout/exit 不等同 close；成功也等 close 后才完成。stdin/error、超时、输出超限和 abort 均走统一失败回收路径：先保留首个有限 primary error，TERM 后等 3 秒，未 close 才 KILL，再等 3 秒确认；close 清 timer/abort listener 并移除 active ownership。

最终仍未 close 时，不把记录从 active 删除。result 保留原错误与独立 `PROBE_CLEANUP_FAILED`；最终 `closeAll` 再给同一个 child 有界 close 确认机会。仍未确认则 allClosed=false，主结果明确 FAIL 并保留 cleanup failure；即使随后收到 close，也不抹掉已发生的清理失败。没有按名称、端口或另一个 PID 清理。

独立补充了 **7 个纯内存 child-event/fake-timer 场景**，未写入作者测试源码、未启动真实 helper：正常 close、stdin 错误后 TERM close、超时后 TERM close、TERM 升级 KILL 后 close、kill 调用内同步 TERM close、kill 调用内同步 KILL close、预算耗尽仍无 close。每项均检查 timer 集合为空，并在 close 后推进时钟确认无迟到 kill。已 close 分支 active=0；无 close 分支 active=1、原 `PROBE_TIMEOUT` 与 cleanup failure 同时存在，晚到 close 才释放 ownership。作者 fixture 同时覆盖输出超限、取消和最终确认。

因此通过的是受控事件下的 timer/ownership/错误保留语义；本次没有真实进程，不能据此声称已测得某个实际 Python PID 消失。运行时若未确认回收，代码按合同保留 FAIL，而不是声称无残留。

## 检查及交付边界

独立执行：

```text
node --test scripts/verification/account110-device-actions.test.mjs
19/19 PASS，0 failed/cancelled/skipped

node --check scripts/verification/account110-device-actions.mjs
node --check scripts/verification/account110-device-actions.test.mjs
均通过
```

另完成上述已提交真实部署回执的本地验证及 7 项纯内存生命周期补充检查，均通过。

| 文件 | 独立核对 SHA256 |
| --- | --- |
| `scripts/verification/account110-device-actions.mjs` | `599aa1de2f4d82c165fbf3b63e468c63fab1cf9bdd493f8c57c236079043619f` |
| `scripts/verification/account110-device-actions.test.mjs` | `8cb63b00b82bea5e2f3325a8acda374cb3d650510158bba54b664dc1db714509` |

本次仅审批 runner 修正，不代替尚待完成的 native gate、最终 source/package pin 或双客户端真实执行。review01 所列两客户端/功能 IPC/有限观察等覆盖边界继续有效。未运行 Cargo、App、ADB、登录、外网或私有资料库；未修改 source pins/manifest。本提交仅新增本复审文档。
