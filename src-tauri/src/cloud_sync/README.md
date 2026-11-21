# 用户云存储模块与整合接口

实现：`cloud_sync` 的 HTTP、加密、逻辑空间规范化、合并、预览票据、加密保护版本和调度入口；`src/cloud-sync` 的中文设置行/内联表单。此树不修改 lib、App、Session、Store 的宿主代码。设计来源为主树只读 `docs/architecture/settings121.md` 和 `docs/plan/settings121.md`；本页是模块接口的唯一说明，不能把尚待宿主接线的行为称为已出包功能。

## 命令与初始化

在 crate 根声明：

```rust
mod cloud_sync;
#[path = "cloud_sync/commands.rs"]
mod cloud_sync_commands;
```

`commands.rs` 已包含真实的 `#[tauri::command] async fn cloud_sync_command`，两套 invoke handler 均注册 `cloud_sync_commands::cloud_sync_command`。它从原生 `Window.label()` 校验 `context.window`，再调用运行时。宿主构建唯一的 `Arc<dyn CloudHost>`（引用已有 SharedSession 与窗口事件 host），以 `CloudRuntime::new(&private_app_data_root, host)` 构造并 `app.manage(runtime: Arc<CloudRuntime>)`。参数是**现有、绝对、无符号链接祖先**的本机应用私有目录，不是 IPC 输入；测试用 canonicalized tempdir。此模块在其下拥有 `.cloud-sync`，不读账户凭据或系统账号存储。初始化失败须保留文件并使云命令返回该安全错误；不要为了让设置页能打开而重置配置，也不要让云配置损坏阻止整个账户页打开。

调用载荷：

```ts
invoke('cloud_sync_command', {
  context: { window, session, token, storeInstance },
  command: { type: 'status' }
})
```

操作全集：

| type | 额外字段 | 结果 / 写入边界 |
|---|---|---|
| `status` | 无 | 纯状态；不启用、不请求 HTTP、不初始化 Store |
| `save` | `patch: ConfigPatch` | 本机 0600 配置 CAS；不传输内容；撤销旧 lease 与预览 |
| `test` | 无 | 已保存配置的认证/只读存在性检查和解密；无 PUT/MKCOL/笔记写入 |
| `preview` | 可选 `recovery: UUID` | 读远端或保护版本、解密、inspect；返回 5 分钟一次性 previewId |
| `sync` | `previewId` | 重读远端、重验预览与库 generation、quiet capture、合并、保护本机、CAS PUT、受检提交 |
| `restore` | `previewId` | 所选历史头产生因果后继，稳定 ID 保留；先保护本机，提交到本机；后续同步上传 |

响应类型为 `runtime::Reply { status, preview?, result?, message? }`。错误 `{ code, message }` 固定中文摘要，不能回显 reqwest URL、服务错误正文、口令或笔记。`result.applied`/`pending` 区分持久接收与已应用；只有 applied 且 pending=0 更新上次完成时间。状态只含 provider 公共字段、各凭据是否已保存、周期/开关、版本 ID，不回传任何 secret。`lastSuccess` 是本次应用运行期间的完成时间。

## OneDrive／百度网盘 OAuth 命令

在原有命令上增加以下原生闭环；授权 URL、Cookie、token 和回调 fragment 都不进入 renderer：

| type | 额外字段 | 结果 / 写入边界 |
|---|---|---|
| `beginConnect` | `provider`、可选 `driver`、可选 `mode` | 原生调用 OpenList `/requests`，把 `driver_txt`／`server_use` Cookie 注入受控 WebView；只返回状态，不返回授权 URL 或 token |
| `connectStatus` | 无 | 只读 attempt 状态；不重新发起授权 |
| `connectionInfo` | 可选 `provider` | 用指定连接（省略时为当前选中项）已保存的 refresh token 刷新并读取账号／配额；不列举笔记目录、不写远端 |
| `disconnect` | `provider` | 先撤销配置引用，再删除本机凭据；保留本机笔记和远端密文 |
| `cancelConnect` | 无 | 关闭原生窗口并废弃 attempt；迟到回调不能复活 |

`driver` 只允许 `onedrive_pr`、`onedrive_go`、`baiduyun_go`。OneDrive 个人版写入模式为 `twoWay`，工作／学校版为 `readOnly`；百度默认 `twoWay`，也允许 `readOnly`／`singleWriter`。`Status` 额外返回 `connections`、`connection`、`connect` 和每个连接的 `capabilities`；UI 必须按能力而不是 provider 名称决定按钮。

凭据由 `auth/vault.rs` 独立加密保存到 `.cloud-sync/credentials.enc`，密钥为同目录 `credentials.key`（0600）。配置只保存 `credentialId`。该目录不在本地备份、云快照或 renderer 白名单内；损坏记录按 `state` 拒绝，不当作空 vault。macOS 使用非持久 `WKWebsiteDataStore` 并在加载前等待 Cookie 写入；Android 使用 `CookieManager`，登录串行并在结束清理两个 auth-state Cookie。

百度远端当前使用 `/CyberNote/heads/` 不可变 head，`create`／`precreate` 与 OpenList 一致使用 `rtype=3`，并发送整文件 MD5、首 256 KiB MD5 和分块 MD5。百度开放平台文档的 `/apps/{appname}` 限制与 OpenList 应用名仍需真实账号验证；若根路径被拒绝，百度写入必须降级为只读或迁移到用户可配置的合法根目录。读取时按 writer 取最新 head，下载、大小校验或解密失败时回退上一份，解密后合并多个 bundle；revision 为排序后的 head 名单。每次写入创建新 head，不覆盖旧对象；当前不自动清理旧 head。

原生登录窗口在 `Failed` 时先记录固定 `network` 错误再关闭；`Closed`／`Destroyed` 和 `openCloud` 失败都会调用 `closeCloud` 移除 handler。迟到回调、重复回调或已取消的 attempt 不能保存第二条凭据或复活连接。

`ConfigPatch` 的 `expectedRevision` 必须提供；`enabled/selected/minutes/provider/fields/secrets/passphrase` 均可省略。缺失保留，布尔 false 和周期 0 真实生效，fields/secrets 中显式空字符串清空该字段；不允许 enabled 且密码/所选服务缺失。三种 provider 配置分别保留，只有 selected 且 enabled 的配置运行。fields/secrets 键名定义在 `Config::validate` 与前端 types/表单中。生产仅 HTTPS；HTTP 入口仅在 Rust `cfg(test)` fixture 中存在。

## 云逻辑身份与账户 Store 身份

**二者分别固定，不要求相等。** 外层密文头包含 app=CyberNote、schema=wire-snapshot-v1、version、逻辑 workspace UUID；workspace 纳入 AES-GCM AAD，正文必须一致。每个云端位置首次由预览确认生成/加入一个逻辑 UUID；成功后保存在本机配置的 approvedWorkspace。同一配置后续见到其他云 UUID 返回 workspace 错误，不能自动当空库重建。更换服务/地址/口令会清除加入许可，下一次重新预览确认；未许可不得自动同步。

实际 `sync/model.rs::WireVersion` 含 workspace_id，且 computed_digest 绑定它。`store_port::rebind` 在**校验来源摘要后**仅替换该 namespace 并重新 seal；其余 entity ID、kind、actor→counter、payload、附件 ID/hash 完全保持：

```text
本机 A 的原 Store workspace A ── rebind(C) ── 云逻辑空间 C
本机 B 的原 Store workspace B ◀─ rebind(B) ── 先校验 C 的密文/摘要
```

`store_port::rows(store, cloud_uuid)` 导出规范化的云版本；`local_versions(store,bundle)` 产生给本机 media preparation 的版本，`validate`/`receive` 使用本机原 workspace 下的摘要进入既有 seen/frontier/head/墓碑逻辑。再次导出回到相同 C 摘要，重复投递不创建新实体。不要把云摘要当成本机 sync_heads 的查找键。

**禁止**为了云加入调用 account adoption、sync_adopt_workspace、替换 device/workspace、创建 Noise 身份、读取 CyberBus grant，或建第二个授权所有者。若已有 Store identity，必须原样保留。只有 capture 明确获准 initialize 且最终短 gate 再次确认 Store 尚无 identity 时，允许 `sync_enable(None)` 初始化本机版本历史；本机 UUID 独立于云 UUID。CloudHost 全程另行固定并重验 Token、Session、Store instance、Store identity tuple 和库 generation。两个不同既有 account/P2P workspace 的生产 Store 已在 fixture 中通过加入、各自修改、稳定合并与身份不变验证；这不等于真实 CyberBus 登录验收。

## 精确 Host trait

以 `engine.rs` 与 `runtime.rs` 为实际类型定义：

```rust
pub trait CloudHost: Send + Sync + 'static {
    fn inspect(&self, context: &Context) -> Result<LocalInfo>;
    fn check(&self, context: &Context) -> Result<()>;
    fn capture(&self, context: &Context, cloud_workspace: &str,
        initialize: bool, lease: Lease) -> Result<Capture>;
    fn validate(&self, context: &Context, bundle: &Bundle,
        lease: Lease) -> Result<()>;
    fn commit(&self, context: &Context, bundle: Bundle,
        expected_generation: &str, lease: Lease) -> Result<CommitReport>;
}
// serde camelCase, Context.token 是现有 Token 的原样 JSON，而非新 token/grant。
Context { window: String, session: String, token: Value, store_instance: String }
LocalInfo { store_workspace_id: Option<String>, store_device_id: Option<String>,
            generation: String, notes: usize }
Capture { bundle: Bundle, generation: String }
CommitReport { applied: bool, pending: usize, conflicts: usize }
Bundle { version: 1, workspace_id: String, versions: Vec<WireVersion>,
         blobs: BTreeMap<SHA256, base64原字节>, settings: Vec<SettingVersion> }
SettingVersion { key: String, vector: Vector, value: Value, digest: String }
```

所有 Host 方法由 runtime 在 `spawn_blocking` 中调用，不得从方法内部启动游离后台任务。`check` 必须按真实参与窗口调用既有 `Session::sync_check_window`/`Session::check`，校验 session ID 和 Store instance；不能以“有 Token 字段/有账户登录”代替验证。原生宿主可反序列化 Value 为现有 `session::Token`。check/inspect 无业务写入，特别不能 sync_flush/bootstrap 或 workspace() 导出解锁内容。notes 是受检本机计数。

generation 需要包含：Store 实例、原 identity tuple、业务 notes/folders/attachment rows、dirty/head/inbox/projection/seen/frontier/counter（复用 synchronization.rs 现有 generation）以及 settings_port generation。**不应把 sync_plan_apply 当作纯 inspect**，它会 flush。请由 Store 所属 `synchronization.rs` 暴露 `cloud_generation()`：已启用时复用其只读 generation；未启用时按 media.rs 的未启用分支取业务行与实例摘要；再纳入已安装的 setting heads/frontiers/dirty/白名单值（未安装时只纳入白名单值）。需要一个公开给宿主的只读 accessor，不需要新 Store。

`Lease::check_workspace(cloud_uuid)` 校验配置代次、操作取消及当前逻辑空间；capture/validate/commit 都必须调用。`Lease::enter()` 现在返回 `CheckedLease<'_>`，持有一次读锁，只覆盖**最终短 gate 的授权重验+SQL事务**；先取 lease guard、再取 Session，避免与配置取消锁形成反序。

最终 gate 的固定用法（Pasteur 的 CloudHost 适配须遵守）：

```rust
let gate = lease.enter()?;
gate.check_workspace(&bundle.workspace_id)?;
let binding = gate.binding()?; // 不再取锁
// 此处再取原 Session，核对 binding.context / Store instance / identity /
// generation / payload hash，并保留 gate 直到该短事务提交完成。
```

持有 gate 时不能再调用 `lease.enter/check/binding/check_workspace`，也不能取
CloudRuntime.state（Save 的顺序是 state→epoch writer）；只使用 gate accessors。
`gate.check()` 及其两个 accessors 只读已持有的 epoch 与 immutable fence，不会
重取 RwLock。未入门的 Lease 查询使用 try_read，writer 已排队时返回 busy，
不会在递归读等待中死锁。Save 仍须在整个最终事务之后才能改变配置 epoch，
并不是删除配置锁或把最终核验提前后释放。超时/关闭配置时取消检查保留。
网络、hash/copy、窗口 ACK 等待期间不得持有 Session guard 或 lease guard。超时/关闭配置会取消 lease；正在运行的阻塞方法须在最终写前 enter，不能只在开始时 check。

### capture 的调用顺序

1. 用现有 quiet probe/prepare 确认真实 IME/TagComposition/PM transaction settle，flush 活动编辑器并收齐 ACK。不要复用会 cover 全窗、停止录音的通用 import/export barrier。保护中的录音/picker/附件操作不能被强停；当前不适合一致捕获时返回 busy，保留所有本机数据。
2. 短 Session gate 固定原身份、instance、Token、参与窗口与 generation，取得 `sync_media_snapshot`；已有 Store identity 原样使用，未启用 bootstrap 才走明确许可的本机初始化。锁外 `snapshot.verify()`。
3. 最终短 gate（lease→Session）重验同一身份/完整 generation，安装 `sync_begin_media`；在 Store 所属事务中 capture 便携设置，再调用 `store_port::rows(store, cloud_uuid)`（内部用原 sync_flush/inventory/version/required_blobs，输出 raw sealed notes）。结束 media scope。
4. 短 gate 取得原 `sync_blob_storage` capability 和所需 reader 证明；锁外 `open_reader/read` 取 raw blob，累计遵守预算，以 `store_port::assemble` 组装。
5. 再次短 gate 重验 capture generation/身份和固定文件证明，才返回 Capture。网络阶段不持锁。不要返回 `workspace()`、普通 archive 或已解锁后的正文。

### validate 与 commit 的调用顺序

validate 先 `bundle.validate()`，经 `local_versions` 转到原 Store namespace，再以本机原 media snapshot 的 receipt_only scope 完整执行 `store_port::validate`，另外在 Store 事务 savepoint 内 dry-run setting capture/apply 后回滚。scope.verify 在锁外，安装和业务验证在短 gate。这发生在远端 PUT 前；不能把错误业务文档先上传后才验证。

commit 在远端 PUT 后仍须重验 expected_generation、身份和 lease。先取得 capability，再锁外对 blob 预算/长度/hash 校验与缓存发布；不得自写 attachment metadata。`local_versions` 生成给 media receipt scope 的输入，经 `store_port::receive` 分批送入原 durable inbox（每批≤128/16MiB，合计≤1024）；分批失败可能留下 durable inbox，不代表业务投影成功，可按 digest 重试。

最终应用继续既有 sync quiet plan/apply、media verify→短 gate、事实事件链。需在 Store 所属 `synchronization.rs` 抽出 `sync_apply_plan_with_cloud_settings(plan, settings)`：沿现有 generation/actual plan 验证和 note/folder/attachment 投影，在同一 tx.commit 之前调用 `settings_port::apply(&tx,settings)`；普通设备同步仍走相同内部实现但不传云设置。仅 settings 改变时允许受检 settings-only 事务，不能因为没有 note targets 假报完成。quiet 结束的已提交 receipt 必须绑定同一 operation 和原 Store instance；锁定/删除导致 Token 升级后，不用提交前 Token 重读另一个会话的结果。保留 notes-metadata / notes-access / notes-sync 和设置事实刷新；commit 只在真正应用后返回 applied=true。若保护操作需要延期，返回 applied=false/pending>0，不能把 durable inbox 当应用成功。

## 可移植设置 SQL（已实现，宿主传现有事务）

`settings_port.rs` 不 open 数据库，不拥有连接。wire 便携设置 schema v1 仍为四个独立因果键 `theme/view/sort/groupDates`，兼容已存 digest/vector；拒绝整行 appearance/presentation、未知键和错误值，缺失保留、false 保持。精确定义：

| Wire key | 实际本机 owner / 范围 |
|---|---|
| theme | AppearanceV2.schemePreference，仅 system/light/dark；不包含 themeId 皮肤 |
| view | PresentationV1.desktop.collectionView，仅 list/gallery；不是整个 per-platform presentation |
| sort | 顶层 updated/created/title |
| groupDates | 顶层 boolean，false 是有效值 |

捕获/dirty trigger/generation 优先读取真实 owner，有 owner 时不把旧 theme/view
投影视为当前值。apply 更新相应 owner 的最小字段并同步 legacy projection；
保留 themeId、desktop navigation/lastNonFocusNavigation/density、mobile 全部字段、
窗口/选中项/账号/MCP/私有目录和所有云/备份/更新调度配置。legacy 缺 owner 时
只在该便携字段实际应用时，按现有 AppearanceV2/PresentationV1 默认结构迁移。
`settings_owner.rs` 是此四键的窄投影适配，不新增 Store/保存队列；严格核对实际
owner 版本、字段与枚举，未知 owner 版本/结构按 state 失败。真实 Store 普通
settings 动作之后不能把已应用值反向重写成旧投影。接口签名保持：

```rust
install(db: &rusqlite::Connection) -> Result<()>;
capture(db: &Connection, device: &str) -> Result<Vec<SettingVersion>>;
heads(db: &Connection) -> Result<Vec<SettingVersion>>;
apply(db: &Connection, incoming: &[SettingVersion]) -> Result<usize>; // 冲突数
generation(db: &Connection) -> Result<String>;
```

install/capture/apply 要求现有事务，任何失败必须 rollback。install 校验自身 7 张表+4 个 settings UPDATE triggers 的准确 schema，以及
control 必须唯一存在 `(singleton=1,capture=1)`。heads/capture/apply/generation
均重复准入核验，不能把丢行或 capture=0 当作空状态；apply 两次切换 capture
和 settings 更新必须准确命中一行，任何失败调用方 rollback，不自动补控制行。

仅准确完整匹配上一版 7+4 DDL 且控制行/owner 有效时，install 在调用方事务内
迁移四个 triggers 为 owner-aware 表达式，保留全部因果表并标记有效便携字段
dirty，再经 capture 形成真实当前 owner 的后继；transaction rollback 同时撤销
迁移与 head 变化。混合/部分/陌生 DDL 或损坏控制行一律拒绝，保留证据。初次
确认才安装；有效 settings 白名单值进入 dirty。后续 settings UPDATE 同事务标记 dirty，普通设置命令无须第二次补写。capture 沿当前投影向量继续本机分支，旧分支编辑必要时分配 branch actor，保留其他冲突。heads/seen/frontiers 保持完整版本事实，apply 仅投影白名单键，保留选中笔记、布局、MCP、账号与所有无关设置。deterministic digest 选头，其他头可恢复；不能将设置冲突计数隐去。

## 协议、预算与保护版本

WebDAV：Basic over HTTPS、PROPFIND Depth:0 验证服务根、GET、最多17级 MKCOL（directory最多16段+cybernote）、PUT If-None-Match:* / If-Match strong ETag。S3：用户 endpoint 的路径风格 bucket/prefix，SigV4（含非 ASCII/空格/+ 的 RFC3986 canonical URI、排序 query、session token、CAS headers），先有界 ListObjectsV2 验证 bucket，只有确切 NoSuchKey 才是空对象；不做 HEAD 后盲写降级。GitHub：固定 api.github.com，要求已有私有 repo 和 branch，Contents SHA 条件更新；GET 元数据 ≤1MiB 时 base64，1–100MiB API 区间通过**同源 raw media 请求**读取，不跟随 download_url；重新计算 Git blob SHA 绑定内容与版本，发生读取竞态则拒绝。模块实际统一预算更保守：密文48MiB、解密 JSON32MiB、单 blob16MiB、版本1024、settings heads128，Store actor64/head32/实体消息16MiB 仍适用；GitHub raw 路径支持大于1MiB，超过统一预算在 PUT 前失败。JSON/附件/密文的 base64 开销计入预算，不静默截断。

连接8秒，单 HTTP 请求连同响应体30秒，每次操作120秒、单操作串行；读取逐 chunk 限额，禁止重定向。401/403、真实缺失、解析失败、网络/超时和 CAS 冲突分开；空密文/HTML登录页/弱ETag不是空库。Argon2id v19 m=19456KiB,t=2,p=1 派生32字节，AES-256-GCM，每次独立随机16字节 salt/12字节 nonce，固定 KDF 参数禁止远端请求任意 KDF 成本。错误密码/头身份/密文篡改在 capture 前失败。

本机 `.cloud-sync` 0700，配置、锁、随机临时文件、保护版本0600，openat/no-follow、owner/nlink验证、文件fsync+原子rename+目录fsync、跨进程lock和字节CAS。损坏配置/权限错误拒绝写入并保留原证据。保护版本先加密落盘再本机投影；初次 bootstrap/join也保留。最多30份，按本机mtime保留新版本，只有当前口令能验证且 workspace相同的最旧自有版本才回收；损坏/旧口令/其他云空间文件不删，预算不足明确失败。恢复先保护当前版本，旧 payload 成为 join 当前已知头的因果新版本，历史并发分支保留，不复用普通 importArchive 的 ID 重映射。保护版本用创建时的加密密码；修改密码不改写旧保护文件。远端 CAS 拒绝不强行覆盖或 apply。

## 前端与生命周期

```tsx
<CloudSyncSettings active={settingsOpen && page === 'account'} ports={{
  context: async () => freshNativeContext,
  confirm: message => nativeConfirm(message),
  onCommitted: report => refreshFromCommittedFacts(report),
}} />
```

导出位于 `src/cloud-sync/index.ts`；插入 `Preferences.cloudSync`，不依赖 CyberBus 登录。组件只调用 cloud_sync_command，ports 类型见 types.ts。复用 settings121-list/row/label/actions/text 与 --settings-*，宿主 `.preferences-workspace` 提供共享样式和浅暗 tokens。active=false 时卸载内容、清除秘密草稿和预览；丢弃旧代次异步回包，内层 Escape 收起并恢复设置按钮焦点。
原生确认在弹出前占用单操作 owner，reject 显示固定安全错误；取消不调用同步。
每次 active 代次分别拥有 status/context/command/confirmation，重进立即释放旧
UI owner并重新读取状态；旧 promise finally 不能清新 owner。已发出的原生任务
仍由宿主负责串行/取消，新请求如遇 native busy 应明确显示，不能点击无声。
密码草稿/预览在离开时清理，旧确认即使随后接受也不得发起同步。无 UI 自动 timer。

`CloudRuntime::automatic(fresh_context)` 是**宿主唯一前台调度器**调用的有界入口，内置周期判断（关闭/3/15/30/60分钟，默认0）。例如已有宿主前台 tick 每30秒检查一次，不因打开设置或读取状态调用 transfer。仅 enabled、周期到期、曾确认相同云UUID且实时权限有效才执行；远端消失或云UUID改变要求重新预览。退出/Session替换/库切换时取消并 join 调度器，调用 shutdown；前台 tick 不得复用历史 Token，也不要求 CyberBus grant。运行时不创建 timer/thread，网络断开不持有 Session 锁。本模块不实现自动本地备份调度。

## 验证范围

harness 编译生产 Store/Session/model/cloud 模块，不编译 Tauri/Noise transport。`engine_tests::Host` 是无窗口隔离 Store 驱动器，**不是生产 quiet 实现**；使用其 headless apply 只建立算法/SQL/媒体事实。窗口 ACK、真实保存屏障、配置生命周期、最终 notes+settings 同事务接线、Tauri commands Send/注册及真实平台行为由整合验证。命令：

```sh
CARGO_TARGET_DIR=/tmp/cybernote-settings121-cloud-target cargo test \
  --manifest-path src-tauri/src/cloud_sync/harness/Cargo.toml --lib --offline --locked cloud
node scripts/verification/settings121-cloud/browser.mjs /tmp/settings121-cloud-ui
pnpm typecheck
pnpm version:check
git diff --check
```

具体完成证据以 scripts/verification/settings121-cloud/RECEIPT.md 为准；本地 HTTP fixture 不证明真实 WebDAV/S3/GitHub 用户服务验收。

## 独立设计复核后的接口补充（最终约束）

已只读核对用户指定的设计审查 f7bacc6312bd2efce6733d8d5b0c27699637cc3c（settings121-review/docs/plan/reviews/settings121-design.md）身份分离追补，采用以下边界：

- `LocalInfo` 最终字段增加 `store_device_id: Option<String>`，与 store_workspace_id 一同报告只读原 Store 身份。
- `Lease::binding()` 返回不可由 renderer 构造的 `CloudFence`：context、config_revision、cloud_workspace、原 store_workspace_id/store_device_id、remote_revision（ETag/SHA/Missing）、confirmed_remote_payload_hash、incoming_payload_hash。capture 前固定确认远端 hash 与原本机身份；capture 后重新 inspect 固定初始化后的本机身份，再把合并的确切 incoming hash 绑定到 validate/commit lease。入共享 inbox **之前**，Host 最终短 gate 必须核对完整 binding、bundle.digest、真实 Token/instance/workspace/device。把同一 fence 传递到 quiet 的 prepare/commit；通用 P2P coordinator 若推进该 quiet，同样不能跳过 fence。
- generation 不可只用 application_generation：仅新增 inbox 不改变 application generation，仍使完整 sync plan/media generation 失效。settings 的 heads/frontier/dirty/白名单值也须纳入。
- receive 成功是接受点，共享 sync_inbox 没有云 source 标签。关闭/切换云停止新传输和新收件，已接受 inbox 作为本机持久事实继续按安全屏障恢复；不承诺撤回。post-receive 必须重新 full media snapshot/verify/quiet apply，旧 receipt_only 作用域不能应用附件。
- 完整 heads 规范化后收敛，但 Store 当前投影按本机摘要排序，跨 workspace reseal 会使并发分支排序可能不同。采用“保留两端各自投影、完整 heads、明确显示冲突，用户显式 sync_resolve 后收敛”的语义。不能把头集合收敛宣称为当前显示正文必然相同，不能自动造 join 版本解决；runtime 有冲突时明确返回此中文提示。账户展开区域继续用既有 sync_conflicts/sync_resolve 显示这些已进入 Store 的分支。
- 账户 A→B adoption 本身由原账户 owner 管理并可能轮换 Store instance；云运行时须 shutdown 并重建 Host/context，旧下载/旧票据/旧 media proof 全部拒绝。不能把旧 response 重绑定到新的账户实例；重新发起明确的云预览后才可继续。

以上为模块实际接口和待接线准入要求，不是生产 barrier 已完成的声明。
