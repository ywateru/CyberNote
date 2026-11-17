# MCP 测试器 117：两个 P2 修复窄复审

2026-11-17。结论：**pass（仅本次修复范围）**。审阅候选 `00d0ae359a0592f701d3034b05baaf3f06128926` 相对 `01d3b4f0` 的差分，关闭原报告 R1、R2，未发现这两个修复及对应测试引入的新阻塞问题。

原 [blocked 报告](app-mcp-tester117.md) 原样保留；已用 Git 核对其内容仍与 `01d3b4f0` 一致。本次不重复历史全审、不扩大原有宿主验收结论，也不修改产品代码。

## R1：共享停止所有者与单次关闭——关闭

核查位置：`src/AgentMcpTester.tsx:22`、`:38–64`、`:81–101`。

- `disconnect()` 在首次调用时同步建立 `stopping.current`，重复进入返回同一个 Promise，包括 active 已为空的情况；真正 stop 延至 microtask，保证同步重入也能观察相同所有者。
- stop 捕获原 connection/client；错误与 busy/working 收尾检查所属 epoch，不再修改后续代次。Connect/execute 同时检查 stopping/closing，停止尚未完成时不能重连或发起新调用。
- `close()` 共享 `closing.current`，等待同一个停止 Promise 后才调用 onClose；重入 Close、Stop 后 Close 都只完成一次关闭。卸载清理也复用 disconnect。

`scripts/mcp-tester117/callback-checks.mjs:14` 从 AST 提取实际生产回调，用 refs 和 deferred client 执行，没有挂载 React 或操作 DOM。已核对并实际通过的针对性断言包括：重复 Stop 的 Promise 身份相同、只发送一次 stop、等待期间不能 Connect；旧停止成功/失败不能清除新代次 busy/working/error；重复 Close 和 Stop→重复 Close 只触发一次 onClose；初始化期间 Close 等待原 UUID 的停止，迟到握手不发布。

原报告的重入停止提前结束、旧停止收尾覆盖新调用状态这两部分均有对应修复和可执行回归，R1 关闭。

## R2：恢复元数据与原写入依据保留——关闭

核查位置：`src/agent-mcp-tester-runner.ts:19–70`、`:78–113`，`src/AgentMcpTester.tsx:23–36`、`:120–133`、`:154–162`。

- 错误仅保留允许的 code、经类型/长度/控制字符检查的 operationId、布尔 committed 及白名单 warnings；未知 warning 转成固定 OTHER_WARNING。回执也重建为指定字段，不复制任意响应对象。原始 message、任意 extra 字段及原始异常不进入恢复记录。
- 每次批量 mutation 在 `options.call` **之前**同步报告 pending intent，深复制本轮原工具参数，保留 run/workspace/grant 身份和原幂等键。取消或完全丢失响应后，已登记的原写入依据仍在。
- 有 operationId 的失败只追加 `notes_get_operation` 查询；pending/not_found/denied/查询失败都保留原提交证据，不被误改成“未提交”。取得有效提交回执时更新恢复状态，但仍停止后续批量写入，不重放原写入。
- 对话框以独立 recoveryLog 保存这些记录，Stop/重连清空普通 rows 时不会清掉恢复信息；可复制完整信息，重连后查询仍只调用 operation 工具，并检查当前 workspace/grant。100 项容量在新写入发送前限制；界面提示关闭前复制，未声称恢复信息跨对话框持久化。

`scripts/check-mcp-tester117.mjs:105` 起的针对性用例覆盖 create/append/update、committed 真/假/缺省，以及 pending/not_found/denied/丢失查询响应的组合；另测完全丢失 mutation 响应、发送前已记录原参数/键、恢复成功、未知 warning 和非法元数据净化。callback 回归还验证取消后迟到回执不覆盖原 intent、重连仍保留原依据，以及实际 recover 回调仅查询 `notes_get_operation`。这些检查本轮均实际执行通过，R2 关闭。

## 本轮实际执行

| 命令/检查 | 结果 |
| --- | --- |
| `node scripts/check-mcp-tester117.mjs` | exit 0；输出 69 项 DTO / batch / cleanup / handler checks passed；包含实际回调及 runner 的上述回归。69 是脚本分组检查计数，不等于 69 个原生测试 |
| `pnpm typecheck`（`tsc --noEmit`） | exit 0 |
| 下列小 Rust harness 命令 | exit 0；8 passed、0 failed；测试运行 4.71 秒；doc-tests 0 项 |
| 原报告内容及工作区核对 | 原报告未变；写本报告前 worktree clean |

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 \
MCP_TEST_ADAPTER=/Users/water/work/2026/Apple-Notes-Clone/artifacts/releases/20261117-project-evolution/mcp/cybernote-mcp \
cargo test --manifest-path scripts/mcp-tester117/Cargo.toml --locked --offline
```

使用已有主 target，输出 `Finished test profile ... in 0.07s`，没有新建 target，没有完整 native 构建、依赖安装或 UI 操作。

Rust 总数仍为 8 个测试函数；本次新增的取消验证位于 `scripts/mcp-tester117/tests.rs:323` 的 **8 个在途场景**，不是另外 8 个测试函数。场景为 stop、撤权、incarnation 变化、目录范围变化、access epoch 变化、窗口关闭、close_all、host disabled。每个场景使用真实子进程门闩，先使一个调用进入 child、确定另一个已排队，再验证容量拒绝；取消后两个调用均报错，队列请求没有送达 child，直接子进程已回收、后代不再运行，恢复替身授权后新 UUID 能重新初始化和调用。已阅读这些断言及 gate fixture，而非根据测试名认定清理成功。

边界保持明确：Registry/Process 是生产实现，Desktop/授权来源仍为替身；指定真实 adapter 的测试仍连接私有 IPC fixture。本轮不授予 tester→真实 Session/SQLite 或 Tauri UI 验收，也不重新审查历史范围。

**最终状态：pass，原 R1/R2 均关闭，本次窄复审无开放 blocking finding。**
