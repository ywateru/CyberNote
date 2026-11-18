# CyberBus main 组合 CLI 验证

2026-11-18，独立 platform verify。验证提交：`c693a748788fe648f7959a6a72a17aa83362c6e3`，主 workspace `/Users/water/work/2026/Apple-Notes-Clone`。Node `v22.16.0`，pnpm `10.15.0`。

结论：**本次 frontend typecheck、34 项 platform Node CLI、合并 TS 双方契约复核均 pass，未发现本范围新增 blocking finding。完整前端 build 待 Tesla hook 单独提供结果，不在本报告记为通过。** 本次未运行 UI、Android AAR/Gradle/D8、Cargo 构建或真机/网络测试；未更改产品代码、刷新 manifest、执行生产 source export 或提交文件。

## 执行结果

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| `pnpm typecheck` | **pass / exit 0** | 实际执行 `tsc --noEmit`，覆盖 `src` |
| `node --test plugins/tauri-plugin-notes-auth/*.test.mjs scripts/publish/*.test.mjs` | **34/34 pass，0 fail，0 skip / exit 0** | 平台 DTO/IPC 静态契约、host vault、父目录 fsync retry、发布清单/ownership/license/helper 拒绝策略及隔离 packaging fixture；不是生产 export 或最终产物验收 |
| `node --test docs/plan/reviews/cyberbus123-platform-01/dto.test.mjs` | **2/2 pass / exit 0** | 实际合并 TS 经内存 Vite `write:false` 编译，验证 CyberBus transport freshness/generation/额外字段及有限授权错误恢复 |
| 独立 inline Node DTO probe（下述方法） | **pass / exit 0** | 新顶层错误 28 个合法输入、11 个非法组合、4 个平台恢复断言；没有启动 Cargo 或写 dist |
| `git diff 0f3cd922 c693a748 -- src/account-client.ts` 与 `git diff fc711b6b c693a748 -- src/account-client.ts` | **pass（人工逐项审阅）** | 账户新增分支完整保留，同时包含平台原有扩展，见下表 |
| `git diff --exit-code c693a748 -- src/account-client.ts plugins/tauri-plugin-notes-auth scripts/publish` | **pass / exit 0** | 被验 TS/平台脚本字节与指定提交一致；执行结束 HEAD 仍为 c693a748 |
| 完整 `pnpm build` | **本 agent 未执行 / 待 Tesla hook 结果** | 用户指定 Tesla 并行执行 Tauri mac debug build；`src-tauri/tauri.conf.json:9` 的 `beforeBuildCommand` 为 `pnpm build`，保持该 hook 为唯一 dist writer |

34 项 suite 内部仍包含 host JVM 编译和合成 key 测试，输出 `SecureVault: 21 contract cases passed`，以及 fsync retry 的持续故障/遗留空目录/重启检查；这是 Node suite 的既有组成，不是重复 Android AAR 构建。原 host harness 的 `successful child-directory fsync count=5` 实际计全部事件；含父目录 1 次，不能误写为 5 次子目录 fsync。

## 合并 TS 契约复核

代码位置均为 `src/account-client.ts`，基于 c693a748。

| 契约 | 代码位置 | 独立结果 |
| --- | --- | --- |
| 账户三个顶层错误及可选数值字段 | `:28`、`:29` | `account_sdk_failed`、`account_unknown_outcome`、`account_deadline_exceeded` 与 `cyberbusCode?: number` 均保留 |
| 字段白名单与严格分支 | `:138`–`:150`、`:179` | SDK failure 必须带整数 1–26，且仅 code/message/cyberbusCode；其他错误禁止 cyberbusCode；unknown outcome/deadline 仅 code/message；返回值保留数值字段 |
| 固定文案及安全详情 | `:229`–`:231`、`:282` | 三种错误使用固定文案，详情保留 cyberbusCode，不把 IPC message 作为用户文案 |
| 平台 providerReason 扩展 | `:13`、`:157`、`:261`–`:264` | 新 reasons、authorizationProvider/code 分支约束与固定文案均保留；旧 reason 兼容未被账户改动覆盖 |
| 平台恢复动作 | `:67`–`:74`、`:102` | unavailable 保留网络分类；unauthenticated/reauthRequired/sessionRevoked 保留重新登录分类；新增三个顶层错误在 ready-profile/enabled 的 error fixture 上均仅返回 status，不自动 signIn/syncNow |
| 平台 transport | `:30`、`:41` | cyberbus kind、在线才显示的固定 CyberBus label 均保留；unknown/unavailable 不推断直连/中继，freshness/generation 校验通过 |

因此冲突解决没有只保留类型声明而遗漏验证/文案/详情，也没有覆盖平台的 providerReason/recovery/transport。这个结论覆盖实际合并 TS，**不替代 Rust 运行链或真实 UI 行为验收**。

## 独立 inline DTO probe 方法与结果

从主 workspace 以 `node --input-type=module` 执行，先对比工作树 `src/account-client.ts` 与 `git show c693a748:src/account-client.ts` 字节相同。通过 `vite.build`、`configFile:false`、`build.write:false`、`minify:false`、library ES entry 为该 TS，注入 `import.meta.env={VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}`，再从内存 data URL import 导出函数。该 library bundle 只用于 CLI 函数检查，没有启动浏览器或写入 dist，不等价于完整 `pnpm build`。

- 对每个 cyberbusCode=1..26 的 `account_sdk_failed`、另两个顶层错误，各构造合成 error status：`enabled:true`，存在合成 profile，空 devices、pendingCount/conflictCount=0。实际 `validateAccountStatus` 保留原结构，`accountIPCError` 保留 code/数值；`accountErrorMessage` 替换测试 message sentinel；`accountErrorDetails` 保留 SDK 数值；`accountConnectionRetry` 全部为 status。共 **28** 个合法输入。
- **11** 个非法组合全部由 validator 抛错且 IPC 返回 undefined：SDK 数值缺省/0/27/1.5/字符串/null；SDK failure 附带 identityRefresh stage；account_network 附带数值；unknown outcome 附带数值；deadline 附带 stage；SDK failure 附带 token 字段。全部仅用合成数据。
- providerReason 为 unauthenticated/reauthRequired/sessionRevoked 的三种输入返回 signIn；unavailable 返回 syncNow（有 profile 且 enabled 的显式重试）；共 **4** 个平台动作断言。

实际摘要输出：

```json
{"pass":true,"scope":"merged TS only; in-memory Vite write:false; synthetic DTO; no Cargo/UI/dist","acceptedNewTopLevelErrors":28,"rejectedInvalidCombinations":11,"platformRecoveryChecks":4}
```

未运行 `scripts/verification/cyberbus121-account-dto.mjs`，因其先启动完整 Cargo test；本轮范围按用户要求收敛在 typecheck/Node，与 Tesla 并行 native build 分工。已有账户独审的 Rust→TS fixture 证据仍归账户报告，本次不冒充独立重跑。

## 并发与剩余门槛

完整前端 build 由用户指定的 Tesla hook 独占；本 agent 没有调用 `pnpm build`、Tauri 或任何 dist 写入。未从 Tesla 取得 build 成功结果，最终集成者应另行关联其日志、准确提交与退出状态，不将本报告的内存 library 编译误记为生产 build。

主 workspace 开始及结束均有其他 agent 的文档修改；本次只新增此文件，不覆盖 README、MANUAL-UI-TESTS、plan/task 或其他文档，不自动 git add/commit。无 UI、Keystore 真机、Logto、多端同步/账户隔离、最终包和完整 source export 通过声明；这些门槛继续由各自验证报告承担。
