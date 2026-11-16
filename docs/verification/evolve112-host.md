# evolve-112：私有宿主 IPC / 授权模块

日期：2026-11-17。分支：`codex/evolve-112-host`。工作树：`/Users/water/work/2026/Apple-Notes-Clone-evolve112-host`。

**状态：模块实现及独立模块验证完成；尚未接入桌面宿主、真实 Session/SQLite、stdio 适配器或前端，不是最终端到端验收。** 未启动真实用户应用。

## 修改范围与边界

只新增 `src-tauri/src/agent_host/**` 和本文。未改 `lib.rs`、根 Cargo 文件、application、agent_access、Store 或前端，也未写入 111 工作树。实现遵循 `docs/architecture/agent-mcp.md` / `agent-ipc.md`；外部应用授权使用 111 的真实 `TrustedContext` / `Revocation` 接口。

文件职责：

- `mod.rs`：导出类型；仅 Unix 且非 Android 导出运行时。
- `types.rs`：严格 IPC DTO、typed 设置 / 创建授权结果、持久 grant / credential record，以及固定九工具目录。
- `files.rs`：私有目录、descriptor-anchored 文件操作、原子替换/fsync、workspace 生命周期锁、短路径与 socket inode 清理。
- `runtime.rs`：启停、认证、持久授权、共享 context、限流、期限、交付复核、内存近期审计，以及应用 handler 注入。
- `harness/`：独立模块测试项目；直接编译上面真实模块、111 真实 agent_access，从 111 文件提取真实 `ToolError` / `ToolResult` / `now` / `valid_id` 定义，不创建 Session 或 Store。`ProbeHandler` 仅观察 handler 边界，不实现业务工具，不替代最终真实 service。

## 装配 API

```rust
pub struct HostConfig {
    pub runtime_dir: PathBuf,
    pub workspace_id: String,
    pub incarnation: String,
}
// macOS 才提供：HostConfig::macos_default(workspace_id, incarnation) -> ToolResult<HostConfig>

pub type HandlerFuture = Pin<Box<dyn Future<Output = ToolResult<Value>> + Send + 'static>>;
pub trait ApplicationHandler: Send + Sync + 'static {
    fn call(&self, context: TrustedContext, tool: String, arguments: Value) -> HandlerFuture;
}
// 同时支持 Fn(TrustedContext, String, Value) -> Send + 'static Future 的 closure。

AgentHost::open(config, Arc<dyn ApplicationHandler>) -> ToolResult<AgentHost>
host.settings() -> ToolResult<HostSettings>
host.start().await -> ToolResult<HostSettings>
host.stop().await -> ToolResult<HostSettings>
host.create_grant(CreateGrant) -> ToolResult<CreatedGrant>
host.revoke_grant(grant_id: &str) -> ToolResult<HostSettings>
```

`CreateGrant` 是 `clientId` / 显式 `scopes` / 显式物理 `folderIds` / Unix 毫秒 `expiresAt` 的严格对象。允许 scope 仅 `notes:read`、`notes:create`、`notes:update`；目录集合和 scope 不得为空，目录 ID 复用真实 `valid_id`，最多 10,000 个，grant 最多 256 条（含撤销记录）。不自动递归，不在此模块查询目录数据库。

`HostSettings` 返回 enabled、hostSessionId、workspaceId、incarnation、必需的 runtimeDir、grant 列表及最多 200 条 recentOperations。runtimeDir 始终来自本实例已验证的私有目录绝对路径，供 UI 重载既有 grant 后准确复制连接配置；不进入 recentOperations。这里 hostSessionId 标识本次传输宿主实例；工具 capabilities 仍由真实 application 返回其 service/session 身份与实际能力。

`CreatedGrant` 返回 `GrantInfo` 和 `ConnectionConfig { workspaceId, credentialRef, runtimeDir }`。UI 用这些引用字段组装适配器配置，并自行提供适配器完整可执行路径；**结果没有 credential、credential hash 或笔记正文**。Secret-bearing 请求 / 文件 DTO 不实现 Debug；credential 文件结构不是 UI 命令返回类型。

### 最终 handler 的职责

宿主只持有注入的 handler，不访问/创建 Store，也不伪造窗口权限。最终 lib 装配应捕获既有进程拥有的 Session/应用协调器：

1. 查询及 `notes_get_operation` 调真实 `NotesApplicationService::query`；查询、锁定、trash、实际 note 所在目录、分页和工具 DTO 由 application 验证。
2. 写入走真实 `external_write` → 窗口 probe/prepare → `external_tick` / `external_reply` / `external_abort`；完成后沿真实 metadata / release 通知和 `finish_delivery` / `check_delivery` 返回回执，不得自行拼成功 DTO。
3. 在读取、提交和交付前使用同一 TrustedContext 复核实时 workspace/incarnation、scope 与对象目录。`notes_get_operation` 不额外要求 notes:read，必须验证原工具 scope 和当前目标范围。
4. handler Future 因断连、超时、第二请求帧、stop 或 Drop 被取消时，装配必须有取消清理，释放尚未提交的 barrier；已经提交的事实通过原幂等键/operationId 恢复。host 不用假 Store 或假回执掩盖这些工作。
5. 切库、恢复、退出、lease/owner 交接前必须 `stop().await`，然后用真实新 identity 重建 host。`start/stop` 要求 `&mut self`，装配层串行调用，不跨 await 持有 Session 的同步锁。

已读取最新 111 API：`from_verified_grant(...) -> ToolResult<(TrustedContext, Revocation)>` 未变；application 已有 `finish_delivery`。release 的 `noteIds`、probe reply 的 `unsavedNoteIds` 留给最终前端独立 parser，本模块不解析窗口消息。

## 安全及生命周期行为

### 默认关闭与多库共存

`open` 和重启后始终 enabled=false，只有显式 `start` 建立 listener，创建授权要求先启用。stop 关闭 listener、取消连接/handler、撤销所有已分发的 context clone，并按 inode 身份清理自身 socket；重新 start 从有效持久 grant 建立新一组 context。Drop 是兜底取消；需要同步完成端点清理及释放锁的路径应等待 stop，随后 drop host。

macOS 默认目录为 `$HOME/Library/Application Support/com.local.notesclone/agent-runtime`，与适配器契约一致。非 macOS Unix 测试显式传入 runtime_dir。目录必须绝对、UTF-8、祖先无 symlink，现有父目录必须存在；本模块只创建 runtime 末级和 credentials 子目录，不创建任意父目录。最终应用应使用其既有应用支持目录；路径太长时明确配置较短私有目录，不静默回退。

同一 runtime-dir 可容纳多个 `--data-dir` / workspace 实例：

- registry：`grants-<sha256(workspaceId)[0..12]>.json`；内容仍严格验证完整 workspaceId 与 incarnation。
- 生命周期锁：`host-<sha256(workspaceId)[0..12]>.lock`，同一 workspace 第二 host 拒绝；不再锁住整个 runtime-dir。
- socket：`<sha256(workspaceId + ':' + hostSessionId)[0..12]>.sock`，完整路径 UTF-8 字节数必须小于 104（计入 NUL 后兼容 Darwin）。不加深 workspace UUID 目录。
- credentials：共享 `credentials/<uuid>.json`；创建/更新/撤销只操作本 grant 引用。

socket 名称每次 open 随实例变化；start 将仍有效 grant 的 credential 文件重新指向本实例端点。任何已有同名节点均拒绝绑定，不自动删“陈旧”节点；退出只删除 owner/type/mode/父目录及 dev/inode 身份均匹配的本端点，替换文件、symlink 或另一 host socket 不删除。

registry 完整 identity 不符时返回 WORKSPACE_UNAVAILABLE，不继承旧授权，不覆写异库记录。逻辑恢复/维护轮换 incarnation 后，应用须在停止旧 host 后明确清理该 workspace 的旧授权状态或选用新的短私有 runtime；本模块不自行猜测恢复身份，也不通过关闭资料库校验复用旧 grant。

### 文件与凭据

runtime / credentials 目录 owner 为当前 euid，精确 0700；registry、锁、credential 文件为当前 euid、精确 0600、regular file、单 hardlink。目录 no-follow 打开，文件通过目录 fd + openat/O_NOFOLLOW/O_CLOEXEC 操作；读文件上限 registry 4 MiB、credential 16 KiB，拒绝类型、owner、mode 或链接异常。新文件使用 0600 排他临时文件、内容 fsync、同目录 rename、目录 fsync。

credential 是 OS RNG 32 字节（256 bit）的随机值，原始值仅写入私有 credential 文件并在请求内传输；registry 仅保存 SHA-256 verifier 和授权元数据，比较 verifier 不按首个不同字节提前返回。凭据不进入 CLI 参数、设置/创建结果、审计、错误消息、笔记库、备份或同步。错误不拼接原始 I/O 异常、请求正文、预期 token 或 socket 物理路径。

成功返回的创建/撤销均经过持久化。撤销先使共享原子 generation 失效，再持久化 tombstone，最后删除 credential 文件。即使最后文件删除失败，持久 tombstone 仍拒绝该 token。持久化失败会返回错误、关闭当前授权状态并保留待重试状态；成功 flush 之前不能重新启用，不能向 UI 报撤销成功。磁盘失败时不承诺尚未成功 fsync 的状态已跨进程持久化。

### IPC、排队、交付与审计

- 一个连接一个请求/响应，严格 UTF-8 JSON + LF；MAX_FRAME=2 MiB **含 LF**，读取分块有界，输出序列化也有界。无终止 LF、CRLF、非法 UTF-8、同读批次额外帧、未知字段、重复字段、无效 UUID、非对象 arguments、未知版本/工具均拒绝。有效 requestId 在错误中原样关联；无法取得合法 ID 的帧错误使用空 requestId，适配器视为传输错误，不当成正常关联响应。
- 接收帧最多 5 秒；认证后执行/排队/正常交付共用自接受连接起算的读 5 秒 / 写 20 秒期限。超时或半途关闭不证明未提交；不生成替代幂等键，也不自动重试写入。客户端须发送 LF 后保持连接双向打开，不通过 write-half-close 声明帧结束。
- 最多 64 个连接任务；每 client 在该 workspace 内跨 grant 共享最多 4 个执行读、1 个执行写、8 个等待写；超额拒绝，不无界 spawn 或排队。应用层跨客户端提交串行性由既有 coordinator 保证。
- 每 grant 在当前启用周期仅保留一对 context/revocation，认证、出队、handler 返回后、每次非阻塞写响应前复核；revoke 能使已经进入应用队列的 context clone 同时失效。所有非阻塞响应写入与 revoke 的 host mutex 排序。已经写到 socket 的字节无法追回；撤销发生在部分响应之后就关闭连接，不接着写旧正文或在尾部拼一个错误帧。
- peer euid 不匹配或无法读取 peer identity 时直接拒绝；不提供公网 listener。
- recentOperations 是内存环形列表，最多 200 条，重启不保留；仅 client、固定 tool、已成功返回的可见 note ID、时间、白名单结果码，不保存 arguments、正文、title、preview、token 或任意错误文本。已认证的 scope / 显式目录拒绝也记录结果，不把未认证调用者的任意字符串写进审计。审计失败不回滚业务提交。

## 实际检查

环境：Darwin 25.4.0 arm64，rustc/cargo 1.97.1。编译输出在 `/tmp/evolve112-host-target`；socket、grant 和 credential 均在测试创建的短 0700 临时目录中，测试结束清理。

运行命令（在本工作树根目录）：

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-target \
cargo test --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked

EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-target \
cargo clippy --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked --all-targets -- -D warnings

rustfmt --edition 2021 --config skip_children=true --check \
  src-tauri/src/agent_host/*.rs src-tauri/src/agent_host/harness/*.rs

git diff --check
```

结果：21 个模块测试通过，Clippy 严格检查通过，格式/差异检查通过。harness 仅对只读上游 `agent_access` 的八参数构造器加局部 `clippy::too_many_arguments` 允许；没有修改上游代码或给 host 模块放宽检查。

覆盖：

- 默认关闭、typed 设置/创建结果及 secret 不出现在结果/registry/审计，真实 Unix socket round-trip/requestId。
- 严格 envelope、重复/未知字段、UUID/version/tool、JSON 类型、UTF-8、LF/EOF/CRLF、两帧拒绝；恰好 2 MiB 边界及超限拒绝；响应超限与非对象业务结果拒绝。
- 凭据/client/workspace、scope、显式 folder、创建/调用时 expiry、执行中到期后的交付抑制、无 read scope 的 operation 查询入口。
- 持久 grant 重启默认关闭、端点刷新、同一库 incarnation 拒绝；撤销持久化、credential 清理失败后仍拒绝、持久化失败后关闭/flush 恢复。
- 同 grant 多请求复用原子 generation，撤销使应用持有 clone、执行中响应、等待写请求失效；stop/re-enable 不复活旧 context。
- 跨 grant 同 client 的读4/写1/等待8，连接64上限；读5秒/写20秒期限使用 Tokio 虚拟时钟验证，取消释放 permit；真实断连及 stop 取消未完成 handler。
- 受阻响应写入中 revoke，不完成旧正文交付。
- symlink、错误 mode、hardlink、同 workspace 第二 host、长 socket 路径；inode 更换/替换 symlink 时不删替代端点。foreign-UID 拒绝分支已编译，未通过提升权限构造 foreign-UID 文件/peer。
- **同一 runtime-dir 两库同时启用，registry/credential/撤销隔离；A stop/restart 不删 B 端点，B stop/restart 不删 A 端点，两库均可继续请求。**
- 205 次调用后审计仅保留 200 条，参数正文标记与 token 不进入审计。

## 尚未接入 / 不属于本次通过证据

- lib 模块声明、状态注册、Tauri command / Settings UI / 适配器启动配置复制，均待串行装配。
- 真实 handler 到唯一 Session / NotesApplicationService、窗口 probe/prepare/release / parser、取消 barrier 清理、真实 metadata/同步通知，待串行装配。
- 没有运行 stdio → host → SQLite receipt → 真实窗口 → 重启/Android 的最终链路；未据本 harness 声称业务落盘、锁定隐私、CAS、幂等、同步或窗口保护通过。
- 不修改资料库维护路径；incarnation 轮换后的旧本机授权清理/重新授权入口由应用装配明确执行。

## UI 独审阻塞修复：设置携带权威 runtimeDir

2026-11-17 develop 增量，基线 `29404612`。只修改 HostSettings DTO、settings 生成、模块回归和本文；未修改独审报告、任务状态、lib/Session/其他模块。待 Parfit 独立复核，不自行给修复独审通过结论。

- `HostSettings.runtimeDir` 是必需 String，来自 `inner.runtime.path`，与 CreatedGrant.connection.runtimeDir 同源。默认关闭、启用、停止、重启重载已有 grant、撤销返回都提供准确目录，不猜适配器默认值。
- 新增真实 host 回归在自定义临时私有目录创建 grant、实际 Unix socket 请求、停止/重开/启用/撤销，验证 runtime 不丢失；序列化 settings 不含 raw credential，audit 不含 runtime 路径或 runtimeDir 字段。
- 新增容量契约回归真实创建 257、10,000 个目录的 create-only grant，读取 settings 并真实撤销，核对原目录集合和 runtime；10,001 拒绝且 registry 无额外 grant。开启显式环境变量时输出 settings/created/revokedSettings 安全 DTO，供 UI 读取真实 host 结果，正常测试不写仓库 fixture。

实际执行（仅隔离 `/tmp/evolve112-host-fix-target`，未使用主 Tauri target）：

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-real-host-settings-fix.json \
CARGO_TARGET_DIR=/tmp/evolve112-host-fix-target \
cargo test --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked

EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-fix-target \
cargo clippy --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked --all-targets -- -D warnings

rustfmt --edition 2021 --config skip_children=true --check \
  src-tauri/src/agent_host/*.rs src-tauri/src/agent_host/harness/*.rs
git diff --check
```

结果：23 passed、0 failed；Clippy 严格检查、格式和 diff 检查退出 0。日志 `/tmp/evolve112-host-fix-tests.log`、`/tmp/evolve112-host-fix-clippy.log`。生成文件 `/tmp/evolve112-real-host-settings-fix.json` 只含安全返回 DTO，原临时 runtime/凭据在测试结束清理；UI 可核对路径准确性，不应使用该已清理路径尝试连接。真实最终 Session/SQLite/窗口/适配器装配边界不变。
