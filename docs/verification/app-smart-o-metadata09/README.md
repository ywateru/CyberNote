# O 作者验证：元数据顺序与编辑器所有权

2026-11-04。对应 `docs/plan/tasks/app-smart-o-metadata09.md`。本目录是作者实施证据，仍须固定提交后由不同作者独审；不能据此开放 U 的 renderer 智能文件夹能力。

本批为 Store 增加调用隔离的显式提交收据，为 Session 增加独立于 access epoch、笔记 revision 和定义 revision 的进程内元数据序号，并经 bridge 接到 App 的被动 hydrate。收据在 public SQL 真正提交后立即记录；维护或响应读取失败仍保留提交事实、错误及安全的新实体 ID。设置与纯 access 变化不计元数据；附件私有 journal 和幂等确认不计。每次命令实际提交 public facts 后只推进一次，上限为 JavaScript 安全整数且不回绕。

前端区分 observed 和实际 hydrate 后的 applied；有效的旧 save ACK 仍确认原保存意图与 revision，不能发布旧正文。被动刷新保留 pending、编辑器实例、基线、组字、Undo、书签及本窗偏好。pending 清除后强制读取权威正文，即使序号未再增加。新进程必须走可信 access 同步。内部生产 Session 智能 CRUD/CAS/projection 已接入，全部 renderer 可达路径继续保留原能力 gate，没有新增智能命令。

## 检查结果与证据边界

| 记录 | 实际结果 | 说明 |
| --- | --- | --- |
| `run01` | 4 通过，72 筛除；7.195 秒 | 真实 Session 收据/序号/无操作/事件隐私、内部智能 CAS 与公开 gate、安全整数溢出、附件幂等分类。 |
| `run02` | 4 通过，76 筛除；4.378 秒 | 真实 SQL 回滚、purge/cancel 文件清理失败、提交后读取失败与 lock checkpoint 失败。 |
| `run04-access-regression` | 12 通过，69 筛除；6.820 秒 | 修复下述真实访问回归后的窄检查。 |
| `run05-final-regression` | 78 通过，0 失败，3 项既有忽略；5.395 秒 | 最终 Rust 源码完整 Store/Session 回归，包括最后一序号被屏障排空保存占用后的安全 abort。 |
| `transport-build03` | exit 0；2.405 秒 | 最终生产 Store/Session 持久测试进程编译。 |
| `browser04` | 6 通过，0 失败；6.717 秒 | **较早实现阶段**的 3 项 bridge 场景和 3 项实际挂载 App/Editor 场景；不是最终源码全量挂载回归。详见下文身份限制。 |
| `browser05` | 1 通过，0 失败；4.001 秒 | 最终源码实际挂载 App 的新进程恢复：先遮挡并可信同步，旧 token 被真实 Session 拒绝，可信响应后才发布新内容。 |
| `access-regression01` | 16 通过；0.401 秒 | 最终 AccessGate 生产响应边界回归。 |
| `frontend-build01` | exit 0；5.783 秒 | 最终 `pnpm build`，含 `tsc -b` 与 Vite 构建。此前单独 `pnpm typecheck` 也通过，但该次仅有工具输出，没有本目录独立记录。 |
| `host-check01` | exit 0；2.794 秒 | 唯一一次最终真实宿主 `cargo check --locked --offline --lib`；11 项 dead-code 警告与尚未向 renderer 开放的内部智能接缝有关。 |

每次 runner 记录源文件前后 SHA-256、完整参数、退出码、耗时及剩余空间。Rust 检查使用相同共享 `src-tauri/target`，独占、jobs=2、locked/offline、至少 2 GiB、每次 600 秒上限。`run-rust.py` 直接链接生产 Store/Session 模块并记录既有 D2 证据普通文件前后哈希；旧证据未变。未更改依赖、生产锁文件、插件、Editor 源码或样式，未下载依赖、清缓存或执行平台打包。

`browser04-data/results.json` 的旧 transport 二进制 SHA-256 为 `b21d8f5f127c344fdbd2fa8ce1d3052df17b582d6b47163fc3bf4294de4b89b2`，对应 `transport-build02` 的 Rust 源码；三个挂载场景分别验证保留 Editor/DOM/组字/Undo/书签/pending/本窗偏好、旧 ACK 清 pending 后同序号权威重读，以及丢通知后的可见性恢复。三个 bridge 场景分别验证 ACK observed 不代替 applied、旧工作区不能先移除新笔记授权，以及较新 access 后保留创建 ID 且只创建一次。第三个 bridge 场景经过真实 delete 屏障，但不能用它证明后来修复的锁定正文屏障路径。

`browser04` 记录源与最终源还存在 `src/App.tsx`、`src/bridge.ts`、`src/metadata-client.ts`、`src/types.ts`、`src-tauri/src/session.rs`、`src-tauri/src/session/metadata.rs`、`src-tauri/src/store.rs`、`src-tauri/src/store/metadata_tests.rs` 差异；这些差异在 `source-identity.json` 明列。没有因为 hash 不同而机械重复六项旧检查。最终 Rust 全量回归、最终前端构建、最终真实宿主检查、最终新进程挂载检查的记录源均与最终源码逐项一致。独审须据最终身份核验必要窄路径，尤其是屏障提交后的撤权与响应重读。

对四个前端差异逐项限定：`App.tsx` 后续有实际行为变化，包括初始可信加载完成后才允许被动刷新、重试按钮触发元数据读取、冲突副本清 pending 后再读权威内容；其最终六项旧场景未全部重跑。`bridge.ts`、`metadata-client.ts`、`types.ts` 的历史记录仅保存 hash，未封存 browser04 时的逐字源码，因此不能证明差异仅为格式化，按最终相关分支未被这六项旧检查覆盖处理。最终新进程场景实际使用最终四个文件，但仅证明该特定路径。最终构建通过不能代替这些运行时分支验证。

`browser05-data/results.json` 的最终 transport SHA-256 为 `036d509015f9dfde7f2fd0a82826da6e02857785a92b6bc7752d721b788e906c`。受控浏览器脚本只模拟 Tauri transport，所有请求持久转交同一个真实 Rust Store/Session 进程；`transport.jsonl` 记录实际请求、响应和事件。没有另造保存队列或智能求值模型。App/Editor 通过真实生产模块挂载，组字为受控 DOM 事件，不能据此宣称真实设备 IME、Tauri IPC 运行时、多原生窗口、截图或像素验证已通过。

## 保留的失败记录

`transport-build01` exit 101：测试 transport 的模块相对路径及 token 类型推断错误，已修复；后两次构建通过。`browser01` 因本地监听权限 EPERM 失败，随后在已授权的受控环境运行。`browser02` 因测试插桩在转换后注入 TypeScript 语法失败，改为有效 JavaScript。`browser03` 的首项通过，第二项因测试提供了实际 schema 不接受的空 `content:[]` 失败；改为合法空 paragraph。

`run03-final-regression` 为 **77 通过、1 失败、3 既有忽略**：既有 `close_locks_rejects_late_commands_and_delete_response_cannot_publish_decrypted_body` 断言暴露了真实产品回归。动作返回的工作区在撤销密钥前已含解密正文，不能随屏障成功响应发布。保留原断言，修复为屏障成功后先 bump/revoke/清 intent，再重新读取工作区，并独立保留收据；提交后读取或维护失败仍发 access commit 而不是 abort。修复后窄检查 12/0、完整回归 78/0/3 ignored 均通过，原失败日志完整保留。

## 交接

作者未 stage 或 commit。最终身份与各检查源对应关系见 `source-identity.json`。源码已停止修改，共享 target 已释放；所有本批工具会话均已完成，浏览器脚本的 finally 已关闭 context/browser/Vite/HTTP listener 并结束 transport 标准输入。额外的全机 `ps` 清点被环境以 operation not permitted 拒绝，没有为此升级权限或清理其他进程。U 仍 pending；本批没有启动 GUI、ADB、访问用户备忘录库、安装包或删除原备忘录实验。
