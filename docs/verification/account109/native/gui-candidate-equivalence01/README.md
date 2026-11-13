# GUI 候选输入等价核对 — 2026-11-13

**结论：可复用 full-native02 的既有 `39c1420d` GUI 候选，执行缺失 AUTH-07／AUTH-06 的有界续验，无需为这两项先重新构建。** 续验须记录候选真实 source revision 与二进制哈希；本核对不把旧候选标成 main 新构建，也不判定用例已通过。

| 核对对象 | 精确身份 |
| --- | --- |
| 旧候选 source | `39c1420d23daaa9397036d24826219e1bd2b89ff` |
| 比较 main | `86cf971f925e375b63caa6771abe211f470dee43` |
| 已存在二进制 | `artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone` |
| 本次重新计算的二进制 SHA-256 | `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2` |
| 归档构建 features | `sync-e2e`, `tauri/custom-protocol` |

二进制哈希与[既有构建记录](../../macos/39c1420d-debug-e2e.json)及 [full-native02](../../macos/full-native02/README.md)一致。旧候选保留其原有 debug/e2e 覆盖边界。没有重新构建、执行测试、提取内嵌资源或启动应用；内嵌资源身份来自原构建记录，本次只重新核对完整可执行文件字节的 SHA-256。

## 精确输入比较

[inputs.json](inputs.json)记录 17 组有限输入的两个 revision Git tree/blob SHA-1、相等结果、全部非 docs 差异路径、候选 SHA-256，以及原构建的有限配置。tree hash 覆盖完整已提交目录，不展开巨大逐文件清单；Git 对象 SHA-1 与可执行文件 SHA-256 分别标识，不能混用。

以下输入完全相同：

- 全部 `src/`，包含账户页面、确认交互、命令包装与前端状态逻辑。
- `src-tauri/src/account/` 与 `crates/account-auth/`。
- Store、Session 目录及各自入口 `store.rs`、`session.rs`；Sync 目录；原 WebView 测试驱动 `sync_e2e.rs`。
- Cargo manifest/lock、Tauri 配置、plugins、前端 package/lock。
- SDK Cargo manifest 与 provider 资源目录；SDK 生产 Rust 源码无变化，源码差异仅为 `src/tests.rs`。

生产入口的差异限于 `src-tauri/src/lib.rs` 的 headless 接线与新增 `src-tauri/src/sync_headless.rs`。该模块仅在 `sync-e2e && debug_assertions && desktop` 编译条件下存在；headless 运行分支要求同时显式设置 `NOTES_SYNC_E2E_HEADLESS=1` 与 `NOTES_SYNC_E2E=1`。正常 GUI 分支仍使用 `SyncWindows`、原有账户 Runtime 和 `sync_e2e::start`。此处的路径等价结论针对正常 GUI 模式，续验不启用 headless 开关。

其余非 docs 差异为执行器、SDK 测试、SDK `SOURCE.json` provenance 元数据和发布清单，不包含账户/auth/UI 修复。`SOURCE.json` 补录的是旧候选已含的有限 provider 诊断改动，不代表比较区间新增这些生产行为。文档差异不逐个展开，也不作为生产输入等价依据。

## 续验范围与限制

- AUTH-07 仍须真实完成原账户重新登录、确认开启同步、同目录自然退出／重启，以及关闭设置页时的授权恢复与对端观察。
- AUTH-06 仍须真实核对退出确认取消、确认后的原生关闭及 UI 成功提示，以及另一账户登录同库时的归属拒绝。
- 输入等价不等于整仓 revision、source fingerprint 或全部构建输入完全相同；不能声称 `86cf971f` 精确构建已通过。
- 本记录不重分类 full-native02 的历史失败，也不替代尚未执行的 GUI、浏览器或多端结果。用例定义见 [ACCOUNT-TEST-CASES.md](../../ACCOUNT-TEST-CASES.md)。

本次只读取 Git 源码对象、既有构建记录及指定可执行文件。未读取或改变原 Store、数据库、grant、凭据或回跳，未执行构建、测试、应用启动、设备操作或远端写入。唯一写入为本目录的 README、有限 JSON 与 SHA256SUMS；未暂存或提交其他工作。文件完整性见 [SHA256SUMS](SHA256SUMS)，校验表不包含自身。
