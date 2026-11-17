# MCP 测试器独立审查 117

2026-11-17。结论：**blocked**。候选 `0a05b01244a057b14d834925d8fb67ebe4a9dd6b`，基线 `bfd93158654c18aec03010905ea554d506b76d95`，worktree `/private/tmp/cybernote-mcp-tester117`。发现两个需要修复的 P2 问题；没有修改产品实现。本报告不授予真实宿主端到端验收。

## 阻塞发现

### R1 · P2 · 重入停止不等待收尾，旧 Stop 可以释放新调用的互斥

位置：`src/AgentMcpTester.tsx:24–31`，并影响 `:57–67`、`:69–87`。

`disconnect()` 每次进入都先清空 `active.current`，但没有复用已有停止 Promise，也没有在 `catch/finally` 验证自己所属的 connection/epoch。第一次停止 A 尚未返回时，第二次停止看到 active=null，不等待第一次停止，立即把 `working=false`、busy 清空。随后 A 的迟到 `finally` 还能修改 B 的状态。

直接可重入的入口是始终启用的 Close 按钮及 Escape（`:33`、`:39`、`:92`）。独立执行两次实际 close 回调，第二次在 stop(A) Promise 尚未完成时已调用 onClose。即第二次 Close 绕过了第一次 Close 原本执行的回收等待。此反例不依赖 Stop 按钮能否赶在 React 禁用渲染前再次收到物理点击。

独立 Node 验证从 TypeScript AST 提取**实际生产** `append/disconnect/connect/execute` 的声明执行，没有重写被测回调，没有 React、DOM、浏览器、App 或子进程。受控 Promise 复现顺序如下：

1. A 处于已连接状态，调用 Stop(A)，暂缓其返回。
2. 在按钮禁用状态完成渲染前，再调用一次 Stop。第二次调用立即结束，working 已被提前释放。
3. A 在 native 侧已经释放 slot，但其停止响应尚未交给 renderer；因此 B 此时可以连接。验证将 B 握手完成，再开始 B 的一次调用并暂缓返回。
4. 交付 A 的停止响应。A 的 `finally` 把 B 调用期间的 working 和 busy 清空。
5. 再调用 execute，实际第二次 `client.call` 进入；第一调用仍未完成。

验证结果：**回调交错复现成功，calls 从 1 变成 2**。普通单次 Stop 的 epoch 保护不能阻止这一情况，因为 `disconnect.finally` 本身不检查 epoch。fieldset 随 busy 被清空而恢复，用户也能重新选择工具或启动第二轮批量；第二轮批量会生成新的 UUID。未使用 UI，故没有验证物理双击 Stop 是否能早于 React 的禁用渲染；新调用互斥失效是受控回调交错的结论，重复 Close 提前完成则有不依赖该时序窗口的可重入入口。这不证明正常 Close 后必然遗留进程，也不证明宿主的写串行/CAS 或幂等被绕过。

修复要求：停止操作应在完成前保持同一个在途所有者，重复 Stop/Close 等待同一收尾；旧操作的错误、working 和 busy 更新须绑定其所属代次，不能修改新连接或新调用。不要仅靠 React disabled 状态防重入。

必补回归：Stop 双击 → A 已清理但停止响应迟到 → B 连接 → B 调用在途 → A 返回；断言仍然 busy、working 为真且第二次 execute 不发出调用。另测 Stop/Close 同时进入、旧停止失败晚于 B 成功，以及 Close 在初始化期间等待停止。

### R2 · P2 · 批量吞掉已提交错误中的恢复元数据

位置：`src/agent-mcp-tester-runner.ts:10`、`:28–36`、`:59–60`、`:82–85`。

`step()` 将整个 ToolError 转成只带 code 的 `ToolFailure`。错误返回中的 `operationId`、`committed` 随即丢失；只有成功响应才进入 receipt。新建错误又导致 `notes_get_operation` 被直接跳过。追加/替换错误时，之前显示的回执也只能说明前一次提交，无法恢复本次错误对应的操作。

这不是假设中的非法响应：`crates/notes-mcp/src/schema.rs:111` 的错误 schema 明确允许 `operationId` 和 `committed`；`src-tauri/src/agent_host/service.rs:376–385` 等路径会在已提交、后续交付失败时返回这些字段。宿主协议也要求取得 operationId 后先查询，不能把交付失败等同于未提交。

独立验证执行实际 `runMcpBatch`，让 `notes_create` 返回 schema 合法的 `STORAGE_ERROR`、`committed:true`、有效 UUID operationId 和私有 message。结果：创建调用一次、后续没有写入或操作查询；结果行标 fail，但序列化全部结果行后既没有该 operationId，也没有 committed 状态。私有 message 没有出现在结果中，这个净化行为应保留。**恢复元数据丢失复现成功**。

修复要求：保留并展示经过校验、白名单化的恢复元数据，区分已提交/明确未提交/未知。取得 operationId 时允许或尝试只读查询该操作，失败时仍给用户保留恢复依据；没有 operationId 的传输中断须明确结果未知，并保留本轮测试标识等安全依据。不得自动重试写入，也不应为修复此问题直接展示原始 message、正文或任意错误字段。

必补回归：create/append/update 各自返回 `committed:true + operationId`；返回 `committed:false + operationId`；只有 operationId；完全丢失响应；操作查询 pending/not_found/权限拒绝。断言后续写停止、无写重试、恢复身份不丢失、私有 message/正文不显示。

## 已执行的验证及边界

| 验证 | 本轮结果 | 能证明的范围 |
| --- | --- | --- |
| `node scripts/check-mcp-tester117.mjs` | exit 0；17 项通过 | 作者提供的 DTO、batch、transport seam 及 handler 检查；其中 handler 字符串检查不是原生执行证据 |
| `pnpm typecheck` | exit 0 | 当前 worktree 的 TypeScript 检查 |
| R1 独立原始回调探针 | 复现竞态 | 实际 callback 的状态/Promise 交错，client 为受控替身 |
| R2 独立 runner 探针 | 复现元数据丢失 | 实际 runner 对合法 ToolError 的处理，响应为合成数据 |
| 额外原始回调探针 | 通过 | 同时 Connect 只启动一次；Close 在 Connect 期间捕获原 UUID、等待 stop；迟到握手不发布；Stop 后迟到 call 不追加结果 |
| 实际 client + 实际 AccessGate，替身 invoke | 通过 | 在途调用期间 epoch 改变会拒绝结果；停止仍携带捕获的原 epoch；未打印正文 |
| 产品只读核对 | 通过 | 写报告前 `git diff --exit-code 0a05b012 -- src src-tauri scripts` 为 0；原工作区 clean |

未调用 cargo、rustc、构建或新建 target；Rust slot 未占用。未运行 UI 自动化、原生 App、模拟器、用户资料库；未创建子代理或管理 worktree。探针在单个 Node 进程中执行，不启动适配器或其他子进程，只输出通过/复现结论。

作者已有 `cargo check --lib` 及 `scripts/mcp-tester117` 8 tests 通过是用户提供的既有证据，本轮**未复跑**。已阅读测试实现：8 项实际为 **3 项 Registry 测试 + 4 项 fixture Process 测试 + 1 项真实 adapter→fixture Process 测试**，不是 8 项 Registry 测试。

真实适配器既有路径为 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/releases/20261117-project-evolution/mcp/cybernote-mcp`。`actual_adapter_stdio_to_isolated_private_ipc` 直接调用 `Process::spawn`，接私有 Unix socket fixture；没有经过 Registry、Desktop、真实 Session 或 SQLite。原宿主/窗口链此前已有测试，不能转称本轮新增 tester 已完成真实宿主验收。

## 启动、权限、工具和写隔离的代码核查

已读 `docs/plan/appearance-mcp-tester-20261117.md`、`docs/architecture/agent-mcp.md`、`docs/architecture/agent-ipc.md`，并追到以下生产路径：

`AgentSettings` 的现有有效授权及绝对 binary → `AgentMcpTester` → 独立 typed tester client → `agent_tester_start/call/stop` → `Registry` → `Process` → 真实 stdio adapter → 私有 IPC → 既有 `AgentHost/Service`。

- `AgentSettings.tsx:186–244` 从现有 configGrant 和实际 HostSettings 开启测试器；入口要求 enabled 和合法绝对路径，移动端明确显示桌面限制。页面卸载会卸载 tester，cleanup 捕获连接 UUID 发送停止。
- `agent-mcp-tester-client.ts:43–75` 捕获 access token，响应后检查 gate generation/session/epoch；停止使用原 token，允许 access 已推进后的清理。输入/错误消息有界、净化；原始 invoke 错误不直接输出。
- `src-tauri/src/lib.rs:175–249` 以真实 WebviewWindow.label 传递所有权，两个 handler 数组均登记三命令；非 macOS 返回不可用。这里只做代码核查，未把登记字符串视为 native 调用通过。
- `agent_tester/mod.rs:193–217` 先从 `Desktop.settings(expected,label)` 校验当前活窗口/Session，再核对 enabled、workspace、incarnation、grant 撤销及过期。命令只收 binary/grantId/workspaceId/connectionId，不收凭据或任意 args。
- 子进程实际 argv 固定为 `--workspace-id <当前宿主workspace> --credential-ref <选中grant引用> --runtime-dir <当前宿主实际runtime>`，不用 shell，不传原始 credential。`Process::spawn` 清环境、固定 cwd=/、管控 stdin/stdout、丢弃 stderr、建立进程组；实际 credential 仍由 adapter 的安全文件加载/私有 IPC 交给原宿主校验。
- `Process::initialize` 执行 initialize → initialized → tools/list，核对协议版本和唯一九工具目录，拒绝分页目录；UI 提供所有发现工具和真实 input/output schema 的查看及 JSON 手动调用。没有 Store/application-service 替代路径。
- 批量 write 初始 false；只读时不发 create/append/update，列表与目录每页 limit=1；读取已有笔记时只报告版本/分页状态，不记录正文/标题。权限不足标 skip，非权限业务错误标 fail。
- 写批量创建内容带本轮 UUID 标识；mutation 目标仅来自该次 create 回执，读取版本后传 expectedVersion；逐次 UUID 幂等键、查询回执并比较 operation/note/version/revision、精确 readback 后才继续。没有自动写重试或删除操作；UI 明示测试笔记会留存。此正向机制不能弥补 R2 的失败恢复缺口。

## 停止、授权变化及 Registry 测试缺口

代码中 Registry 使用 Mutex 原子预留，全局最多 2 个 live slot、每 label 最多 1 个，队列容量 1（工作中请求之外可排一个）；所有权比较 label 和完整捕获 token。先 Stop 后 Start 的 UUID 使用最多 64 条 tombstone。停止信号优先于工作，工作完成后 kill 进程组、wait 子进程、删 slot、发 done；停止调用等待 done。

初始化上限 12 秒，单个 stdio request 含写入管道和读取在超时范围内；手动/批量 call 的 native 期限为查询 7 秒、写入 22 秒。frame、通知数量、参数、结果和显示历史有界。代码路径没有写重试。

活连接以 250ms 周期复查宿主设置，握手/每次调用前后也复查。撤权、hostSession/incarnation/workspace、授权范围/引用/代次变化会结束 worker；窗口 Destroyed 发 close_window；宿主显式关闭、撤销、维护和退出接 close_all。Desktop 没有在等待 tester 收尾时持有 host Mutex；revoke 在 close_all 前明确 drop slot。这是静态结论，未经本轮真实宿主生命周期执行。

现有 Registry 测试的具体范围及欠缺：

| 测试位置 | 实际已覆盖 | 关键未覆盖/作者应补 |
| --- | --- | --- |
| `scripts/mcp-tester117/tests.rs:178` | 替身 Desktop 拒绝错误 workspace/label/epoch；revoked/expired grant 禁止启动 | 在途响应期间的 token/incarnation/范围变化，旧响应不得交付，清理后 slot 可复用 |
| `:212` | 同 label 第二个连接被拒；不同 label 的 call/stop 被拒；正常 stop 后 call 拒；stop-before-start tombstone；初始化期间直接 Registry.stop | 没有前端 Close 流程；没有双 Stop/重连交错；没有全局两个 slot 的容量验证（替身仅认可 main） |
| `:255` | 已连接后修改 revoked/host/workspace/expiry/active 或 close_window，330ms 后 call 拒绝 | 所有变化都发生在 idle；缺在途 call + 已排队 call 的取消、响应丢弃、done/slot 回收与重连断言 |
| `:278` | 真实 adapter 的握手及一次 folder tool，私有 IPC fixture | 直接 Process，不含 Registry 或真实 Session/SQLite；不可用来补上述缺口 |

另外 `tests.rs:79` 的 Process 超时/取消测试虽命名 `destroy_group`，实际只检查超时/取消并调用 close，没有子进程/后代 PID 已消失的独立断言。Registry 测试主要观察调用被拒绝，也未独立观察进程组退出。建议使用受控 fixture 的 PID/事件门闩验证清理，避免仅靠固定 sleep 或拒绝响应证明“已回收”。不需要 Tauri UI 或用户库即可补这些边界。

最少合入前回归门槛为修复 R1/R2 并加入对应可执行回归，以及补一组生产 Registry+Process 的在途调用停止/撤权、排队请求终止、清理后新 UUID 连接成功的边界测试。此次 Rust slot 受限不构成新产品 bug，也不请求占用 slot：现有两个独立复现已足以阻塞候选，后续由主代理协调作者测试。

## 最小复现方法

所有独立探针均在候选根目录以 `node --input-type=module` 执行，使用项目已有 TypeScript，不写产品文件。R1 的关键加载方法如下；调用顺序见 R1 的五步，替身 client 的 stop(A)、connect(B)、call(B) 分别用 deferred Promise 控制交付。

```js
const ast = ts.createSourceFile('tester.tsx', source,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['append', 'disconnect', 'connect', 'execute']);
const declarations = [];
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && names.has(node.name.text))
    declarations.push(`const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
})(ast);
const code = ts.transpileModule(declarations.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None }
}).outputText;
const callbacks = vm.runInNewContext(
  code + '\n({disconnect,connect,execute})', syntheticEnvironment);
```

`syntheticEnvironment` 使用普通 `{current:...}` refs、内存 setter 和受控 client；在各异步步骤之间更新 connected/selected，使调用对应最新一次渲染所持有的状态。没有挂载组件或操作事件/DOM。R2 用同样的 transpileModule + vm 执行完整 runner，只替换导入的错误类型/helper，响应包含有效 operationId 和 committed:true；对结果 rows 及实际 calls 作断言。报告未保存或输出笔记正文、凭据或原始响应。

**最终状态：blocked，R1、R2 未修复。**
