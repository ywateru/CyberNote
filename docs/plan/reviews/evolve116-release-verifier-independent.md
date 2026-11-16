# evolve116 release verifier 独立审查

2026-11-17。结论：**pass**。未发现本次修改引入或遗留的 P1/P2 blocking finding。

## 范围与代码核对

- 工作树：`/Users/water/work/2026/Apple-Notes-Clone-evolve116-release-verifier`。
- 分支：`codex/evolve-116-release-verifier`。
- 被审提交：`f9f1188bc4961c330ea039b474ec226e98a97d2b`；测试开始及结束时 HEAD 一致，工作树 clean。报告在全部身份敏感测试完成后才创建。
- 已读任务 `docs/plan/tasks/evolve-116-release-verifier.md`、作者记录 `docs/verification/evolve116-release-verifier.md`、`docs/architecture/build-delivery.md`、完整提交 diff 和相关生产脚本/回归。

生产差异仅 `scripts/release.mjs:31`：把 metadata 原始的 `sourceDirty`、`inputCount` 传入现有 `validateStamp`。未加默认值、类型转换或按当前源码覆盖声明值。`scripts/build-info.mjs:87` 的严格比较未修改；schema/production/UTC 时间（`release.mjs:29`）、外部 stamp 与批次匹配（`:32`）、JS identity witness（`:37`）和包内双 witness（`:43`）仍在原路径执行。包入口选择与 publish 未变。

## Findings

无 P1/P2/P3 finding；无 blocking 项。此前“合法 frontend 总被拒绝”的阻断在被审提交中已消除，没有以放宽严格校验换取通过。

契约依据：`docs/architecture/build-delivery.md` 的“构建与发布”“命令与包内证明”，以及任务 verification 对合法 fixture、错误字段、runtime 与真实包边界的要求。

## 实测命令与结果

环境：Node `v22.16.0`。以下命令均在被审工作树运行，日志不写产品输入。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `node scripts/check-release-frontend.mjs` | 54 checks PASS，exit 0 | `/tmp/evolve116-release-verifier-independent-author54.log` |
| `node --test scripts/publish/build-info.test.mjs` | 3 PASS / 0 FAIL / 0 skipped，exit 0 | `/tmp/evolve116-release-verifier-independent-buildinfo.log` |
| `node scripts/check-release-entry.mjs` | 18 checks PASS，exit 0 | `/tmp/evolve116-release-verifier-independent-entry18.log` |
| `node /tmp/evolve116-release-verifier-independent.mjs` | 独立 22 次 CLI 调用均符合预期，exit 0 | `/tmp/evolve116-release-verifier-independent.log`、`/tmp/evolve116-release-verifier-independent-results.json` |
| `node --check scripts/release.mjs` | PASS，exit 0 | 本轮命令输出 |
| `node --check scripts/check-release-frontend.mjs` | PASS，exit 0 | 本轮命令输出 |
| `git diff --check` | PASS，exit 0 | 本轮命令输出 |

作者回归本轮生成的 fixture/receipt：`/var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/cybernote-release116-TRKXvL/`。已核读其覆盖：干净与 dirty 临时 Git fixture、带/不带外部 stamp、字段缺失/类型/值错误、产品字节漂移、各 runtime 身份字段缺失；未把作者“54”解释为 54 次真实 CLI 调用，其中也包含直接调用生产导出函数的检查。

## 独立验证方法与新增证据

独立脚本只保存在 `/tmp`，不复用作者测试 helper，也不复制或替换 verifier。每次通过 Node 子进程调用被审工作树实际 `scripts/release.mjs`，断言退出码和相应拒绝原因，逐次保留 stdout/stderr。原始证据目录：`/tmp/evolve116-release-verifier-independent-8qXmC7/`，内含 `result.json`、本轮 stamp、frontend、合成包与逐次输出。

1. 使用实际 CLI `prepare` 取得当前干净源码 stamp，再独立手工构造 frontend JSON/JS；带/不带外部 stamp 均通过，CLI 返回 metadata 与输入逐字段一致。
2. 缺失、数值、相反布尔值、字符串 dirty，以及缺失、分数、字符串 count 均拒绝。每次 JS 同步包含篡改后的 metadata，错误准确落在 `Release stamp is stale or invalid`，排除了因 JS 不匹配导致的伪阳性。
3. stale revision/fingerprint、错误外部 stamp count 仍拒绝；自身合法但 preparedAt 不同的 stamp，以及未声明对应 releasePreparedAt 的 frontend，均以批次不匹配拒绝。
4. production 模式与规范 UTC 时间继续受检查；合法 metadata/stamp 配无关 JS，准确在 runtime witness 检查拒绝。
5. 新增完整 `verify-package --platform macos` CLI 路径的合成验证：生成 plist、不可执行的合成主文件和 Brotli metadata/runtime assets。完整双 witness 通过并生成 manifest，其中 dirty/count、packageEntry 和两份 witness 正确；分别移除二进制中的 metadata 或 runtime 编码字节均拒绝；字节相同但不对应 CFBundleExecutable 的 decoy 也拒绝。

独立脚本共 22 次 CLI 调用（含 prepare、正例和预期拒绝例），没有把内部断言另算成测试数量。该补充证明修复后调用链会继续核包和嵌入字节检查；合成主文件不是 Mach-O、没有执行，生成的 `synthetic-mac.json` 明确标记 synthetic，不可用于发布。

测试时源码身份：1728 inputs，`sourceDirty:false`，fingerprint `89ca4ced0b6ac0ff6e4c9c29024bf692758f5c993801b4c8feaef99a57b92e39`。独立脚本开始/结束对下列文件逐字节 SHA-256 核对一致：

| 文件 | SHA-256 |
| --- | --- |
| `scripts/release.mjs` | `f0a463da938696c69a95cf605507200d167c46b0dab0fd68355ac583281a9e87` |
| `scripts/build-info.mjs` | `30f986b0128714efad89b25db1e257667d94ec5db422b9975c94574e497b78b2` |
| `scripts/check-release-frontend.mjs` | `0938f19d3d9e86fc04b1ae6ca345b648e752a3afdfa15ae1d72ef6726bf9e4e7` |

## 结论与交付边界

**pass：仅针对 release verifier 一行修复及其定向回归。** 可交主线程合入后做小范围主树复验。报告提交会改变 revision；本轮临时 source stamp 不作为合入后/最终构建的 stamp。

本轮仅写本报告并提交；未改产品源码、作者脚本/证据、任务状态、README。既有入口脚本生成的是 ignored fixture receipt。未运行 publish、前端构建、native/Cargo/大组测试、App、设备或用户资料库，未使用共享 target。未验证真实 Mac/Android 包、签名、安装、实际生产 JS 执行或 MCP 第三产物；116 的这些实际交付检查仍需按最终合入源码另行完成。
