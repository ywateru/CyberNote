# 账户设备与同步代码阅读

基线为应用 `eb6f4f27` 与 CyberBus `359465e83bd74b571a963f3d1fdc238f50169919`。本文记录迁移前的实现证据和应保留边界，实施规则见[迁移设计](../../architecture/cyberbus-migration-20261118.md)。

## 当前创建链

| 模块 | 入口/输出 | 与其他模块的关系 |
| --- | --- | --- |
| `src/account-client.ts` | 严格命令与状态 DTO、固定安全错误表 | 调用唯一 `account_command`，不持授权材料 |
| `src-tauri/src/account/mod.rs` | 一资料库一 Runtime、登录/恢复/退出和 generation | App 创建；持 `sync::adapter::Runtime`；创建 grant、SDK、worker、目录与操作队列 |
| `account/surface.rs`、`callback.rs` | 内置/系统浏览器授权页、精确 loopback/deep-link 回调 | native presentation 绑定 generation 和 instance；远程 WebView 无本地 IPC 能力 |
| `account/provider.rs` | CyberGrid AuthProvider 与 cloudflared 平台配置 | 从单 grant owner 获取 token；不向 React 输出 token |
| `account/enrollment.rs` | account/profile、短期 JWT、VerifiedWorkspace、Gate | coordinator 验证账户；Gate 把服务端凭证、Noise key 与生命周期绑定 |
| `account/directory.rs` | `/api/v1/notes/devices` 持久 registry 与 Catalog | server 验 transport session、registryKey 与 revision；目标固定 registry ID |
| `account/worker.rs` | 独立发现/内容 owners、设备操作 permit、取消/退役收据 | 暂停内容保留目录；并发 owners 必须一起 drain；大 future 已有堆边界要求 |
| `account/transport.rs` | 两个 SDK 映射、bootstrap、配对和 transfer_once | 一个 authenticated SDK peer 映射两个受限端口；共用绝对 deadline |
| `sync/adapter.rs::activate_account` | 资料库采用与受控 StoreBackend、SyncService | 检查 VerifiedWorkspace/Noise identity；停止旧手工协议；分配 `.account/staging/<device>` |
| `sync/network/service.rs` | Noise/WebSocket inventory/head/blob 与持久收据 | 主动/被动方向限制；不因账户发现自动 cycle；支持独立本地媒体准备 |
| `store/synchronization.rs`、`session/synchronization.rs` | dirty/version/inbox/blob/冲突及 quiet 应用屏障 | 业务事务和授权仍是持久化边界，传输只交版本和媒体 |

## SDK 差异

CyberBus 的 `Client::new` 本身不登录不开网，必须先取唯一 event receiver，再执行 AuthStart/Callback 或 AuthRestore，明确 NetworkStart。认证只返回经过验证的 AccountSummary，私密 seed/network secret 由 SDK 管理。终端不能使用旧 access token provider 绕过 SDK owner。

SDK 设备 ID 为 32 字节安装公钥摘要；Notes 的 registry UUID、Sync identity UUID 与安装 ID 是不同身份。`WatchDevices` 第一条 snapshot，后续有 revision/previous_revision/reset；简单地把 event.devices 数组拼到旧表会丢失 reset/offline 语义。

SDK 的通道是自定义 Protobuf Data 或 RPC，并无 CyberGrid `expose/map/Port/Mapping`。Data 的命令成功只是接纳，DataStatus 的 PROCESSED 是接收宿主完成回执，均不能代替 Notes inbox/blob 落盘及 Session 应用收据。适配流必须处理 SDK 16KiB 分片、背压、消息数量和 UNKNOWN_OUTCOME。

SDK `SecureStore` 要求机密性、完整性、原子替换和跨进程独占；`DevelopmentFileStore` 不满足生产保护。macOS 可用官方 platform-keyring，Android 由宿主 Keystore 适配。重启恢复还要求 persist_grant，不能只把旧 refresh.json 当新 vault。

## 集成必须逐条验证

1. App 创建账户 Runtime → SDK 初始化：安装 marker、SecureStore owner 与数据目录 lease 同寿命，不因设置页卸载释放。
2. 账户登录双入口 → 原始回调 → SDK AuthCallback：同 operation ID；取消/切换后迟到回调不可接管新事务。
3. SDK authenticated event → binding/workspace → profile → NetworkStart：归属只能由已验证账户派生；不因第一次登录自动启用内容合并。
4. SDK devices watch → 本地账户目录 → 前端状态：只有当前代际认证 peer 才在线/可同步，历史条目隐藏摘要。
5. 显式内容启用 → 保存/合并屏障 → activate_account → 两个受限 loopback 端点：继承已有媒体 staging 与 Store/Session 授权。
6. 选定设备/方向 → core map → authenticated bootstrap → Noise 邀请/身份钉住 → transfer_once：不能从目录别名、重新查找或网络恢复改变目标。
7. 远端 Data → 受限桥 → SyncService → 持久 inbox/blob → Session quiet → Store commit：真实本文字节与附件 hash 才构成数据结果。
8. SDK EOF/账户退役/暂停/deadline → Gate revoke → 关闭 map/流 → disconnect + join → 状态终态：超时不等于后台任务已停止。
9. 账户退出 → SDK AuthLogout、数据保留 → 下次账户登录：旧网被隔离，旧资料库内容仍本地可用，新账户默认暂停。
10. 发布脚本 → Rust git pin/core crate/平台存储 → Mac/APK：删除旧 provider 包要求，准确产物必须能独立构建。

## 本轮需要避免的回归

- 不能为迁移简化掉同步方向、绝对 deadline、取消后退役或持久收据。
- 不能让网络处理在 Store/Session mutex 中读文件、哈希、等待 socket 或 SDK。
- 不能用 profile 的 `syncAvailable` 代替 Noise 私钥持有证明。
- 不能把本机 loopback、已登录、在线、SDK ACK、业务已应用混成一个 ready。
- 不能重置安装 ID 掩盖 vault 损坏，也不能在无安全存储时静默使用明文文件。
- 不能把 SDK 尚未验证的三端握手/网络切换当成项目已完成项。
