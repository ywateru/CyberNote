# Original-store GUI relogin01 — failed run archive

**FAILED，未完成真实重新登录验收。** 实际运行时间 2026-11-13 **05:40:04.134–05:40:12.077 UTC**。这是对既有私有结果的只读脱敏归档，没有重跑、修复或继续该场景。

原始私有记录：`/private/tmp/account109-desktop-relogin01/result.json`；SHA-256 `74c8e43288182e26b08ad7a91ab2a27acd4ae7145d818f21c7e57a608728fab7`。原始记录未复制到 repo、未修改；只将白名单字段投影为本目录 `result.json`。私有 `steps.jsonl` 同样未修改，白名单步骤投影为 `steps.safe.jsonl`。前后 SHA 记录在 `preservation.json`。

## 实际完成与失败位置

| 阶段 | 证据 |
| --- | --- |
| Baseline | **PASS**；两库重叠 note/attachment agreement 在启动前完成。原始文件 unchanged 记录仅描述 baseline snapshot 阶段。归档不含 note ID、完整 body、附件 payload 或 DB。 |
| 两 GUI | **均 ready**：A/B `interactive=true`、`startupDetached=true`。 |
| A 初始状态 | signedOut，enabled false，无 profile。 |
| B restore | 原生 status 已返回 **error / account_authentication / identityRefresh**，enabled false，hasProfile true。 |
| 最终失败 | phase **startup**、code **CHECK_FAILED**；最后完成操作为 B `account.status`，sequence 4。 |
| 重新登录和修改 | **尚无 SignIn、任何创建/编辑、enable/pause setting 或 merge confirmation。** login、pausedEdits、catchup、bidirectional、restart、endState、auth06 均 not-run。请求 end-state 为 enabled，未达成。 |
| 清理 | A PID **91658**、B PID **91681** 均记录 **naturalExit=true，exit/close code 0，signal null，forcedSignals=[]**。 |

固定 runner 的 `status()` 顺序是：取得原生 account status → 记录安全状态 → 若有 profile 则执行预期 username 断言 → 返回给健康检查。B 的错误状态已经记录，但其 profile 对应的 username 断言随后触发，因而错误被通用 `CHECK_FAILED` 遮蔽，尚未由 `requireHealthy` 分类为 account health 失败。此解释依据精确 runner 源码、B 状态和最后操作边界；**不复制或复述运行时 username、subject、profile 或用户身份值**。

现有记录只确定 B restore 已报告 authentication/identityRefresh 阶段；**auth 与 transport 的底层根因仍未确定**。不能将本次失败当作 WebView readiness 故障、已尝试 SignIn、实际 enable 或编辑失败，也不将粗粒度 authentication 标签当作凭证失效/网络原因的最终证明。本次没有读取更多 auth/grant/profile 数据来推断根因。

## 精确工具字节

`tools/` 中的工具全部直接取自固定提交 **`195cd3354ca22979030586f574568a131ae736da`**，未导入执行或改写。原始报告所列的 5 个工具逐一核对 SHA 完全一致：

- `account109-desktop-relogin.mjs`
- `sync108-native-driver.mjs`
- `account109-desktop-helpers.mjs`
- `account109-desktop-recovery.mjs`
- `account109-headless-recovery.mjs`

另保留同一提交的传递依赖 `account109-headless-driver.mjs`，其 hash 单独记录；原始 runner 未单独记录该依赖 hash，因此不声称与原始运行 hash 交叉验证。工具的源码固有 synthetic fixture 常量按精确字节保留；未向工具或归档附加任何运行时身份、token、grant、callback、profile subject 或私有 payload。

二进制 SHA-256 `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2`，source `39c1420d23daaa9397036d24826219e1bd2b89ff`；原始报告明确 `currentMainBuild=false`。此处仅保留 identity，不复制二进制或启动它。

## 归档范围

本次只读取指定私有 result/steps 和 Git committed 工具 bytes，只写此目录。没有打开、复制 DB/WAL/SHM、grant、私有 baseline/full-body 文件；没有 App、ADB、进程探查或网络操作。原始 run 本身的 baseline 私有副本保持原样，本归档不带入 repo。该 run 的 recorded natural exits 与当前系统进程状态没有混同；本次不执行额外 PID 检查。

本归档包含脱敏失败回执、安全步骤、原始记录前后 hash、精确工具字节和 SHA256SUMS。无代码修复、重试、提交或 main 变更。等待后续 auth refresh 修复的独立 review 范围。
