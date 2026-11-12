# Account109：CyberGrid 原生 SDK / Logto 接入调查

调查日期：2026-11-13，Asia/Shanghai。研究范围：SDK、两个官方 SDK 宿主样例与 CyberNote 原生同步接线；不涉及协调服务实现、Logto 控制台配置、UI 设计或部署实现。

- CyberGrid worktree：`/private/tmp/cybernote-account109-cybergrid`，核对 HEAD `f2a3961536e5c69b13c7dbc661953d9243becbae`。当前 Rust SDK **0.3.0，准备配套未发布 v0.8.0**；不能把这些 API 当作旧 v0.7.0 下载包已经具有的能力。
- CyberNote 主项目：`/Users/water/work/2026/Apple-Notes-Clone`，调查时 HEAD `e3b3cc55826f9db7ddcbcd55bb6733531e47f685`。
- 本轮只读源码/公开配置/许可证并写此报告；未读 `.env`、凭据、私钥或用户笔记文件；未编译、运行测试、联网登录、操作设备、clone/fork、改产品源码或提交。

## 1. 结论及现有能力的实际边界

**最小可信路线是“官方 Logto 登录 → 单一授权 owner → CyberGrid 原生发现/TCP 映射 → 账号 enrollment/bootstrap → 现有 WebSocket + Noise → 原 Store/Session 同步管线”。** 不必重写版本向量、附件、inbox 或 quiet apply；但现有代码没有账号 owner、稳定账号 workspace、账号授权 bootstrap 或动态端点解析，不能仅加一个登录按钮与 `map()` 就宣称自动同步完成。

| 能力 | 源码已有 | Account109 需要补的边界 |
| --- | --- | --- |
| 同账号设备发现 | SDK `Client::devices()` / `directory(cursor)`，目录作用域为可信协调会话的用户与应用/产品 | 只选择 CyberNote 服务；持久同步设备与临时 SDK 设备的关联及过期处理 |
| TCP 连通 | 原生 WebRTC → iroh direct → Cloudflare fallback，内层 mTLS；`map()` 或 `Peer::dial()` | 宿主先启动真实 loopback 服务，再发布；维护 Mapping 生命周期 |
| 用户登录 | Mac 官方 JS SDK，Android 官方 Android SDK；SDK 消费资源 access token | 固定配置绑定、owner 生命周期、重启恢复、账号变更隔离 |
| 笔记同步 | Noise、持久配对凭据、版本向量、冲突、多端转发、原字节附件、quiet apply | 账号所有权证明与免人工复制邀请的 enrollment；动态 route resolver |
| 业务授权 | SDK `BusinessAuthorization` 是**宿主设置的状态投影** | 必须真正拦截业务请求，不能 `set_business_authorization(Authorized)` 后就认为 SDK 替宿主鉴权 |

源码依据：[S1–S8]。Vercel 在此模型中承载有限 HTTP 身份/协调/账号绑定请求；原生 listener、Noise 连接与附件字节仍在端上。不要设计成在 Vercel Function 常驻 TCP listener，也不要把普通 Native SDK 连接替换成 RAM sample 的浏览器 Gateway。

## 2. SDK 如何真实发现并连接一个 TCP 端口

### 2.1 宿主调用顺序（真实 API，不是同步协议替代品）

1. `Client::new(Config { base_url, app_id, cloudflared, .. }) -> Result<Arc<Client>>`。`app_id` 是**真实 Logto Native client ID**，与 Android `applicationId` / Tauri identifier 是不同概念，不能填 `com.local.notesclone` 代替。
2. `auth_config().await` 取得并验证固定协调来源的 issuer/client/resource/scope/端点。绑定单一授权 owner，采用下文的 grant handoff 或 `AuthProvider` 路线之一。
3. 登录后取得 `Session { user.id, app_id, product_id, device_id, coordinator_epoch, incarnation, ... }`；session key 不对 WebView 序列化。
4. **先**在本机启动真正的 CyberNote WebSocket/Noise listener，例如 `127.0.0.1:0`，得到实际端口；再 `expose(Port::tcp("cybernote-sync-v1", actual_port, "notes-sync/1"))`。`Port::tcp` 只描述已有服务，不创建业务 listener。
5. SDK 新 Client 的 inbound gate 默认为关闭。`expose()` 只记录意图；宿主明确 `enable_remote().await` 后才发布并开放入站。登录本身不等于允许入站。产品可以在用户一次性明确启用“账号自动同步”后持久保存该意图并自动执行，不能绕过 SDK 的显式 gate。
6. 主动 `devices()` 或 `directory(cursor)` 获取有限快照。新目录验证 product/epoch/policy/revision、设备排序和端点；`devices()` 在支持新目录时委托 `directory(None)`，旧服务才回退 `/devices`。这不是 mDNS，不应依赖同一 LAN，也没有“订阅后必然收到所有设备变化”的承诺；按状态事件唤醒并以有界退避刷新目录。
7. 按**准确 port ID、协议版本、非自身、online** 选择设备；`name` 只是展示值，`type_` 只是描述，不能承担账号或 workspace 认证。目录 entries 不携带任意 CyberNote workspace 元数据，不能借用 browser `bridges` 字段塞私有业务协议。
8. `client.map(&remote.id, "cybernote-sync-v1", "127.0.0.1:0".parse()?).await -> Mapping`。宿主将 `ws://{mapping.addr}` 交给现有 WebSocket 客户端；业务 WebSocket 帧和 Noise 帧原样穿过映射。

真实字节路线：

```text
现有 Sync client → ws://127.0.0.1:MappingPort
  → SDK local TcpListener → mTLS + mux/port-id
  → WebRTC / iroh direct / Cloudflare fallback
  → 对端 SDK 查本机 exposed port，检查 remote gate
  → TcpStream::connect(127.0.0.1, actual_port)
  → 现有 WebSocket listener → Noise → 原同步 wire
```

`map()` 本身先 `connect()`，再 `Peer::dial(port)` 探测一次并丢弃探测流，随后创建 loopback listener。该探测可能让业务服务看到一次无完整 WebSocket 握手的 EOF；这不能当作笔记同步失败。成功 map/transport-ready 也不证明 Noise 成功、inbox 持久化或正文已应用。[S2,S3]

### 2.2 传输与恢复的限制

- 默认顺序为 WebRTC、iroh 直连、再 Quick Tunnel；可显式配置 WebRTC/iroh 并行。iroh relay 禁用，TURN 不受此配置支持；Cloudflare 是最终字节回退方，中央 CyberGrid 协调服务不代理业务字节。
- 三条路径均经过 SDK 内层 mTLS：客户端按已认证目录的 device ID + fingerprint pin，对端 server 从目录构造客户端 pins，并在握手后刷新目录核验 incarnation/指纹/代际。不是信任任意自签证书。[S4]
- `Peer::dial(port_id) -> tokio::io::DuplexStream` 可避免本地 Mapping listener；但 CyberNote 的 `Socket` 当前具体固定为 `WebSocketStream<MaybeTlsStream<TcpStream>>`。首版选 `map()` 可少改传输类型；直接 `dial()` 方案需要泛型/trait IO 抽象，并不能直接代入现有别名。
- Mapping listener 在协调恢复中可存活；旧 TCP 流终止，SDK **不会重放旧应用流**。必须让原同步协议用 inventory/digest/blob offset 恢复，不能自动重放已发的业务写命令。
- 当前默认 connect 预算顺序合计可达 12s + 8s + 35s；CyberNote Noise/network 单步超时是 5s，pair 外层 25s。应在 resolver/连接管理阶段先完成 SDK map/代际就绪，再进入原 Noise 截止；不要把所有 wire 超时一起放宽。Mapping 恢复时的 lazy 重连也可能超过 5s，manager 需在新代际重新准备可用 Mapping，不能只看本地端口仍监听。

### 2.3 Cloudflare fallback 需要显式打包

`Config::default().cloudflared` 为 `None`，不会因为用了 SDK 就自动具备本机 fallback provider。

- Mac arm64：`CloudflaredConfig::bundled(app_private_cache)`，预置固定 SHA/尺寸资源，每次启动校验，不搜索 PATH、不运行时下载。
- Android arm64：宿主打包唯一 `jniLibs/arm64-v8a/libcloudflared.so`，使用 SDK 附带的资源准备逻辑、保留字节/no-strip，并按说明配置 legacy native packaging / `extractNativeLibs`。`CloudflaredConfig::android_native(ApplicationInfo.nativeLibraryDir, appCache)`。
- `env_provider` 每次 spawn 读取当前 ConnectivityManager/LinkProperties DNS 和 app-private TMPDIR，不能缓存旧运营商 DNS 或静默改用公共 resolver。只传 SDK 允许的非秘密环境。
- 当前预置 provider 明确覆盖 Mac arm64、Android arm64/API28+；CyberNote 声明 minSdk26。需明确 account 功能/打包支持下限，不能从当前 Samsung Android9 可用推断 API26/27 或 Intel Mac 已支持。SDK crate `rust-version=1.91` 也需进入后续工具链检查。[S1,S11]

## 3. owner 由什么鉴别，哪些“身份”不能混用

| 身份 | 可信来源与用途 | 不能替代 |
| --- | --- | --- |
| Account owner | 固定 issuer 下经签名验证的 Logto `sub`；SDK 成功交换后 `Session.user.id` 并与本机已验证 subject 对齐 | email、显示名、未经验证的 JWT decode 结果 |
| Product scope | 可信 `AuthConfig.product_id`；无 product 扩展时固定 Native app ID | 任意前端传入 productId、SPA client、包名 |
| CyberGrid device | 当前 Client 注册/会话与目录中的 device ID、incarnation、fingerprint | 持久同步 actor/device UUID |
| CyberNote sync identity | 既有 Store device UUID / workspace UUID 与 `.sync` Noise static identity | SDK 临时 device ID、会话号 |
| OAuth grant owner | 唯一有权消费/刷新/撤销同一 refresh grant 的对象 | 业务 workspace owner；这是生命周期概念，不是用户 ID |

建议持久账号域是 `(canonical issuer, sub, productId)`，issuer 保留精确配置绑定，不能靠 email 归并。最简单的 Mac/Android 配置是同一个 Native client ID；当前 0.3 源码也支持经可信配置声明的 canonical product 组合多个真实 Native client，**不是任意跨 client 互见**。旧 `docs/lab-browser-login.md` 对“只同 client”的描述属于较早契约，以当前 `AuthConfig`/`Session`/目录校验为准。[S1,S2,S5]

`Client::new` 自己生成 RAM registration key；一个 Client 生命周期的恢复保留该 key/用户与意图，关闭后新建 Client 不是稳定同步 actor 的复用承诺。持久记录应分别保存 syncDeviceId、Noise 公钥、账号绑定；当前 SDK 设备/指纹只作可更新的路由关联，不进版本向量键。

**重要缺口：`map()` 把对端数据接到 loopback TCP 后，业务 listener 看见的是 127.0.0.1，并没有 SDK 对端主体附带给每条本机 TCP 流。** 仅凭来源 IP 或“此 port 由 SDK expose”不足以授权业务；同机其他进程也可连接该 listener。`Peer.device_id` 在主动连接端可读，不等于现有 Sync listener 能拿到入站 peer principal。必须在业务握手中验证账号/workspace/Noise identity 的绑定。[S3,S4]

RAM sample 的 `native-jwt.ts` 是较完整参考：验证 ID JWT 的签名、issuer、Native audience、sub/exp/iat；资源 access JWT 另验 resource audience、scope、client_id/azp、有效期，且 subject 必须等于先前已验证 ID subject。Lab 的 `decodeAccessToken` 主要用于取元数据，不能复制成“decode 即验签”的实现。SDK 的远程 session 交换由可信协调服务验证资源 token，本报告不重复研究其服务端实现。[S6,S7]

## 4. 如何免人工配对并保留现有 Noise / 版本向量 / 附件

### 4.1 不能直接省略的步骤

现有 `Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s` 的 prologue 绑定 workspace/invitation；客户端验证 host static key；服务端原子消费邀请并绑定 client static key + sync device。后续每个 RPC 继续检查授权。自动同步应自动提供经过认证的一次性邀请，**不应改成“同账号不做 Noise”**，也不能把 OAuth access token、email 或可猜 account hash 当 PSK。

现有同步本身没有 account owner 字段；仅同账号 mTLS 未证明对端获准操作这个 workspace。必须先定义可验证的 enrollment 协议。以下是建议的新接口，**不是 SDK 已实现 API**。

### 4.2 建议的 bootstrap 契约

```text
Logto 本机 owner
  → 固定账号服务验证资源 token
  → account workspace + device enrollment proof
  → CyberGrid 同账号/产品目录，选择实际在线服务
  → 受限 bootstrap RPC（经 mapped TCP，逐请求验证 proof + nonce）
  → 内存一次性邀请（PSK不入协调目录/日志）
  → 原 pair / Prepared → Store adopt → Ready
  → 原 Noise / inventory / heads / blobs / quiet apply
```

必要的服务/原生交界契约交给主代理服务端研究落实，不在本轮实现：

- 原子取得同账号唯一 `workspaceId`，避免两台首次登录各自创建 workspace；可以是服务生成随机 UUID 的 get-or-create，不能每台 `StartHost` 后才尝试改 workspace。
- 以资源 token 证明 owner，并发放可端上验签的短期 enrollment/capability，至少绑定 owner域、product、workspace、**持久 syncDeviceId 与 Noise 公钥**、audience/purpose、有效期、nonce/撤销代次。它不应是可编辑的 `userId` 字段。由主代理决定签名、公钥分发与撤销接口；没有这一契约不要实现“假验证成功”。
- 可以另开 `cybernote-enroll-v1` loopback port 承载有界 bootstrap，也可做严格区分的 account bootstrap listener；它只支持 enrollment/challenge/invite，不返回实体清单/标题/附件，不开放普通 Tauri invoke 或任意端口代理。
- 对端 proof 必须与本机 owner/product/workspace 一致，再生成只给预期 peer 的短命邀请。现有 `Grant` 只在首次 Noise 握手时 pin 第一个 client，自动 bootstrap 需要增加“**预期 client 公钥/device**”约束，或等价的私有 account enrollment 校验。不能简单预填旧 `client_key` 冒充已消费：旧代码借此区分已配对与未消费邀请，其过期语义会改变。X25519 static key 不是 Ed25519 签名 key；其私钥持有证明由 Noise 握手完成，不要自造 X25519 签名。
- host key、workspace、对端设备应与 enrollment proof 对齐；已有 pin 变化明确报错，不悄悄 TOFU 重配。邀请只在私有内存/现有私有 identity 持久化路径，不能发到公开 ports metadata。

### 4.3 需要新增的本机入口

1. **账号化启动入口**：现有 `Command::StartHost` 会 `sync_enable_with_device(None, device)`，先创建随机本地 workspace；不适合账号新设备。新增 Rust 内部 `activate_account(VerifiedAccountBinding)`，在 proof 校验后以 `Some(accountWorkspace)` 走 `prepared_store` / `sync_enable_with_device`，保留既有本地数据和 device identity。`VerifiedAccountBinding` 只能由原生 verifier 产生，不允许 WebView 反序列化任意 account/workspace 后直通。
2. **动态 endpoint resolver**：现有 `IdentityStore::Peer` 持久保存 endpoint，`client_loop` 重连始终复制旧 `peer.endpoint`。新账号 link 保存稳定 `(owner/product/workspace, remoteSyncDeviceId, serviceId)`；每次重连按当前已验证 SDK 关联取得 Mapping，再把当前 `ws://127.0.0.1:port` 仅用于这次连接。不得把临时端口当永久身份；现有 pin/PSK 保持不变。现有手工 ws/wss link 走原 resolver 分支。
3. **持续业务 gate**：账号 link 在 client RPC 与 server 请求处理边界都核验 membership/owner generation；logout、撤销或失效时先关 gate 并断开流。不能只在首次配对检查一次，让旧 PSK 永久绕过账号撤销；失败也不能回退到手工授权分支。
4. **拓扑**：首版可在当前同账号在线设备中选一个 rendezvous，但不能假定“永远有 Mac A 在线”。设备离线要重选可服务 peer；两台手机在线也应可在 SDK 支持的前台生命周期内作为 listener。多个设备用同一 workspace，继续以既有向量合并；通过确定方向/去重限制同时连接数，尊重当前 sync listener/client 4 个并发连接预算。

对 account service 之外的业务层，继续使用 `StoreBackend`、`receive_head`、附件 hash/staging/inbox 和 `Runtime::coordinate`。不做 SQL 业务行插入，不给已收件 ACK 冒充 applied，不在 Session mutex 中等待 SDK/OAuth/磁盘全量 IO。[S8–S10]

### 4.4 旧库与账号切换

现有 Store 对已启用的不同 workspace 明确返回 `sync_workspace_mismatch`。需要产品契约决定“首次认领既有未绑定 workspace”或“显式迁移到账号 workspace”；不能直接改 UUID、重建 identity 文件或删库让测试通过。新的本机未启用库可认证后 adopt 并合并已有数据。已有另一个 workspace 的库必须保持拒绝，直到有独立、可恢复的迁移设计。

退出 A 后登录 B 时，本机仍可能含 A 的数据和旧邀请。没有新的明确工作区切换/迁移契约，默认拒绝把相同 Store 自动绑定给 B，不自动发布 A 的笔记。账号退出只关闭账号网络与授权，**不删除本地笔记、原附件或手工同步凭据**。账号模式与手工模式需要显式 namespace/kind，避免失效 account link 被误当 manual link 放行。

## 5. Mac / Android 最可靠的 Logto 登录与注册回跳

### Mac：系统浏览器 + 先绑定的 loopback + 官方 JS SDK

- 采用 `@logto/client` 3.2.2 + `@logto/browser` 3.1.2 的官方 Authorization Code + PKCE 流程；不在业务 WebView 内嵌账号密码页，不使用 Device Flow。
- 登录前先启动专用 `127.0.0.1:PORT/callback` listener，成功绑定后才开系统浏览器。现有 Lab 和 sample 均用固定 17896；CyberNote 应分配并登记自己的精确固定回调，避免与 Lab/并行测试实例冲突。端口占用明确报错，不能临时漂移到任意端口；是否允许动态 loopback port 需主代理核对实际 Logto URI 策略，本轮没有验证。
- 优先参考 **sample `oauth_callback.rs`**：最多 16 个探测、16KiB header、读取/等待截止、唯一精确 Host、拒绝 Forwarded/X-Forwarded-*、精确 `/callback?`、no-store/referrer/CSP。Lab 旧 receiver 只判断存在匹配 Host 行，不能当作同等严格版本直接复制。
- native callback receiver 只筛选 HTTP 来源形状；官方 SDK 校验 state、PKCE 和 callback，另做签名 JWT 验证。只收到 code 或 Activity/浏览器回前台不能标记登录完成。
- 用受限原生 `oauth_fetch/browser_fetch` 做 exact discovery/JWKS/token/revoke allowlist、禁止 HTTP redirects、请求/响应大小及截止控制，保持 CyberNote 当前 CSP；不为了登录放开 WebView 任意 HTTPS fetch 或任意 open_url。
- 系统浏览器 opener、callback receiver 和 grant owner 都需要 transaction/generation 绑定；关闭/重载 WebView 不得丢掉仍在消费 refresh 的所有者。

### Android：官方 SDK 3.0.0 Custom Tabs + 专属精确 scheme

- 参考 Lab `BrowserLoginBridge.kt` / `BrowserGrantOwner.kt`，使用 `io.logto.sdk:android:3.0.0`；manifest placeholder `logtoRedirectScheme` 与实际 signIn redirect 完全一致。CyberNote 使用自己的 scheme/package，例如经最终应用标识确认的 `com.local.notesclone://com.local.notesclone/callback`，不能复用 Lab 的 `tech.tinadev.cybergrid.lab`。
- SDK 的浏览器返回走其 Android callback Activity/manifest 合并路径；Lab MainActivity 没有自行实现 OAuth `onNewIntent`。后续必须检查**合并后的 manifest**确保唯一 callback 路由并符合 exact redirect，不手写一条过宽的 MainActivity VIEW filter 冒充 SDK 集成。Android App Links 可作为有域名/assetlinks/签名治理后的后续选择，本轮未验证 SDK3/API28 与部署链，不列作当前已经可靠的路径。
- Rust 发起 SDK 调用需真实 Activity/UI thread；参考 `android_browser.rs` 的 Wry/Tauri dispatch，不能把 NDK Application context 当 Activity。平台 `ApplicationInfo.nativeLibraryDir` 则可以从 application context 读取，这两种用途不同。
- 保留 CyberNote MainActivity 已有 keyboard/IME、edge-to-edge 与 insets 生命周期，不整文件替换为 Lab 的简化 MainActivity。JNI 包名和 native 方法符号需随宿主 package 更新，或抽为正规的 Tauri mobile plugin。
- `BrowserGrantOwner` 的串行 worker、callId、防重复 completion、取消标记和 ACK 后清内存值得复用。SDK3 没有公开 refresh export API；Lab 依赖固定版本 `open` 类的 protected 字段子类，关闭 `usingPersistStorage`，是**版本敏感扩展**，不是反射/稳定公共导出 API。
- 取消不等于 Custom Tab 已消失。无公开强制取消 API 时，等待实际回调并处理晚到 grant；不能强停、注入回调或允许第二个 owner 并行消费。进程被系统杀死后，RAM 事务消失，不宣称任意 killed-process OAuth 能恢复；重新发起登录和独立授权恢复按持久 checkpoint 契约处理。

### 注册入口

“注册”也使用 Logto 托管页面及同一官方 Code+PKCE 流程，不在 CyberNote 自己收密码、不创建本地伪账号。可以先复用托管登录页的注册跳转；本仓库的现有 helper 没有实现独立 signup 参数，`firstScreen`/额外授权参数是否受所固定 JS/Android SDK 支持应由实施者查对应版本类型，不能未经核对硬加一个方法名。用户在浏览器完成注册后，仍必须经过同一资源 token、owner、enrollment 校验才可自动同步。

## 6. 两种 token owner 路线，建议与局限

| 路线 | 现有实现 | 生命周期与适用性 |
| --- | --- | --- |
| Lab：浏览器 grant → Rust owner | JS/Kotlin 官方 SDK 完成登录与资源 token；`import_browser_grant(AuthConfig, OAuthTokens)`；之后 Rust CredentialStore refresh | 适合需要重启后恢复的第一版，但 protected Android handoff 与私有 pending journal 要完整移植；不能只复制 signIn |
| RAM sample：官方 SDK 一直是 sole owner | `RamOwner` 串行队列 + TokenBroker/IpcProvider + `login_with_auth_provider` | 结构清晰，不让 RT 进入 Rust/Web Storage；但 sample 桌面 RAM-only，进程重启必须重新授权，没有完整 Android 同类 owner，不能满足“记住登录”而假称自动恢复 |

建议第一版采用**统一 Rust owner + 固定版本官方 SDK 初始 handoff**，或明确选择 RAM-only 的产品契约；不要混合为 JS、Kotlin、Rust 三处长期刷新同一 RT。

关键约束：

- 首次 grant 和每次 RT rotation 要在下一次可失败网络调用前取得私有 owner。`OwnedPersisted` 才允许设备登录；`OwnedPending` 也表示源 SDK 必须交出所有权并清内存，但 Rust 必须保留 Client/store，重试 checkpoint 或撤销，不能继续注册或丢弃 pending owner。
- 使用 `use_credential_store(store)` 要在签发/导入前；SDK v4 CredentialStore 绑定 server/app/client/issuer/resource/scope/endpoints，0600 regular file、无 symlink、flock、原子替换；**这是私有文件，不是 OS Keychain/Keystore 加密存储**。如需系统安全存储，另做单 owner 适配，不能声称现有文件方案已经使用系统钥匙串。
- Lab native `Transaction::stage/fetch/commit/recover/cleanup` 提供 grant journal 与丢 ACK 协调，不复制其令牌文件/用户凭据；只参考实现。
- `AuthProvider::access_token_for` 必须尊重完整 AuthTokenRequest：issuer/client/resource/scopes、min_validity、force_refresh、reason、generation、cancel；遗留 `access_token()` 缺少这些保障。sample TokenBroker 的 requestId、owner/sdk generation、有限 receipt 与 drain barrier 是可复用结构。
- 取消等待者不能丢弃已经发出的 token rotation future；late reply 必须回到原 owner。`ExchangeOutcomeUnknown` 保留同一个 Client/请求材料重试，不能 new Client 绕过 uncertain registration fence。
- `close()` / `disable_remote()` 结束 SDK device session，不等于 Logto grant logout；grant 撤销失败不能删除唯一恢复凭据。RAM sample `end()` 是清本机 RAM，也不保证全局 SSO 登出或已撤销云端 grant。[S1,S2,S6,S7]

## 7. 建议新增的 API / types / 生命周期

以下名称是**拟议宿主边界**，不是现有 SDK 方法：

```text
OwnerBinding { issuer, subject, productId, nativeClientId }
VerifiedAccountBinding { owner, workspaceId, syncDeviceId, noisePublicKey,
                         membershipRevision, expiresAt }
PeerServiceRef { ownerScope, workspaceId, remoteSyncDeviceId, serviceId }
AccountGeneration / GrantOperationId / MappingLease

AccountRuntime:
  begin_login / cancel_login / grant_checkpoint / resume / logout
  enable_account_sync(VerifiedAccountBinding) / disable_account_sync
  refresh_directory / resolve_peer(PeerServiceRef) / shutdown
```

`VerifiedAccountBinding`、grant、MappingLease 必须留 Rust 私有态；公开 snapshot 只给脱敏账号展示、固定 phase/reason、可重试性、同步 pending/conflict 和 route 状态，不输出 token/邀请/Noise 私钥、OAuth 原始响应或业务正文。业务 IPC 验证本地可信 main window + origin 与相应 Session/Store token，不能让独立笔记窗口或任意远端文档发起 account switch / token_reply。

建议状态层分别维护 `auth`、`coordination`、`publication`、`transport`、`membership`、`replication`，不要用一个 online/成功布尔串联。SDK `watch_state()` 先借当前值，再 `changed()`；broadcast lag 后重新 snapshot。Connected 不能显示成“已同步”，后者须来自真实同步版本/inbox/apply 进度。

生命周期顺序：

1. 启动：本地笔记先可用；读取账号同步显式 opt-in 与只属于此 Store 的绑定，再串行恢复 grant/SDK，不在 status 查询中生成身份或弹浏览器。
2. 启用：验证 owner/membership → 相同 workspace 的原子 enable/adopt → 启动本机 loopback 服务 → login/expose/enable_remote → 确认 publication → 刷目录/map/bootstrap → 原 Noise replication。
3. 网络/epoch 变化：关闭过时代际业务 gate，等待单 owner 完成已派发 grant；由原 Client recovery 或明确定义的新生命周期恢复。刷新设备关联、Mapping 和 Noise；不重放旧流，不把未知撤销显示成功。
4. Android 回前台：接到 `RunEvent::Resumed` 唤醒 account manager，再唤醒原 sync foreground；不依赖 WebView timer，也不承诺系统杀进程后的常驻后台。认证未完成时不绕过用户认证。
5. 关闭远程同步：先关 account bootstrap/replication gate 与现有流，再 close mappings / `disable_remote()`；记录 LocalClosed 与 CoordinatorRevocation Pending/Confirmed，保留本地 Store、数据与 Logto owner。SDK disable 结束此 Client，恢复需同一授权 owner 创建新 Client 并重新 expose/enable。
6. logout/退出：冻结新操作 → join grant/IPC 交接 → 关映射与 SDK → 按策略撤销 grant并checkpoint → 最后释放 owner/listeners。不能等到 `RunEvent::Exit` 才 fire-and-forget async 网络清理。需扩展现有 `ExitRequested`（目前 recording_window 占用此钩子）统一的异步阻止退出/完成确认，不互相覆盖。

## 8. 可复用代码、许可和建议写集

### 8.1 复用清单

| 来源 | 优先复用/参考 | 不直接照搬 |
| --- | --- | --- |
| `sdk-rust` | Client/Config/AuthProvider/AuthConfig、目录/Mapping、provider 资源校验与恢复 | 修改 SDK 来隐藏账号/同步契约缺口；以 trace ready 冒充业务 ACK |
| RAM sample desktop | 严格 `oauth_callback.rs`、受限 `oauth_transport.rs`、`auth_provider.rs` TokenBroker、`ram-owner.ts`、`native-jwt.ts`、IPC caller 与 async exit 结构 | RAM synthetic business、browser bridge/Gateway 当作真实 Noise 引擎；默认 factory=None 的入口不具备远端业务 |
| Lab | grant journal/checkpoint/恢复、Android BrowserGrantOwner + JNI Activity 调度、provider platform glue | 公开测试 client/endpoint、测试凭据路径、ADB 队列、消息/probe 服务、较弱旧 callback receiver；不引入测试控制入口到产品 |
| CyberNote | StoreBackend、identity/pairing Prepared→Ready、Noise、wire/staging、quiet apply、Resumed/Exit 生命周期 | 现有 `StartHost(None workspace)` / `0.0.0.0` 监听直接当账号模式；临时 Mapping 地址永久持久化 |

许可实读结论：CyberGrid 根 LICENSE 与 `sdk-rust/LICENSE` 为 **all rights reserved / 未授予原始源码开源许可**。没有发现覆盖 Lab/sample 原始 helper 的独立宽松许可，不能因为叫 example 就推断可随新公开 repo 任意再分发。若用户拥有该代码权利，可由 owner 明确授权集成/发布方式；否则保留为私有/获授权依赖或独立按已验证协议实现宿主。此次研究无需停下，但新 GitHub 公开发布前必须落实这一事实边界。

第三方官方 `@logto/client`、Android3 SDK 的收集 LICENSE 是 MIT，保留 copyright/license；其他 Logto/browser/JOSE/Tauri 依赖随 pin 保留原 notices。随包 Cloudflared 资源 LICENSE 为 Apache-2.0，并有第三方 union notices/来源与 SHA 约束；这不自动给 CyberGrid 原 helper 授权。不要把其他 example 提到的外部 Noise/AGPL Gateway 引入本项目来替换已有 snow 管线。[S12]

### 8.2 建议实施写集（供主代理拆任务，不在本轮实施）

- `src-tauri/src/account/{mod,auth,callback,grant_owner,enrollment,cybergrid,types}.rs`：分别拥有 OAuth、账号 proof 与网络 manager；不要塞入现有版本合并模块。
- `src-tauri/src/sync/network/service.rs` / `transport.rs`：新增账号 route resolver、业务 gate/预期 Noise identity 校验，保留 manual 分支和原所有 frame/budget/授权检查。
- `src-tauri/src/sync/identity.rs`：审计需要的 account link/预期 peer pin；如修改严格 identity schema，提供显式可恢复版本迁移，或把账号 metadata 放独立私有文件，不悄悄更改旧凭据语义。
- `src-tauri/src/sync/adapter.rs`：Rust 内部 verified account activation、loopback listener、继续现有 `prepared_store` 与 `coordinate()`；不改同步向量或普通业务表。
- `src-tauri/src/lib.rs`：注册 AccountState、受限 account IPC；整合 setup/Resumed/ExitRequested/Exit 的 join 与 shutdown，保留媒体、录音、IME 和多窗行为。
- `src-tauri/Cargo.toml` / lock、`package.json` / lock：授权来源明确的 SDK依赖、官方 Logto 固定版本、必要 opener/jni/平台依赖。新 repo 不留 `/private/tmp/...` 绝对 path 依赖；依赖获取方式/许可证由整合方案决定。
- Android `MainActivity.kt`、独立 auth Kotlin 文件、Gradle依赖/placeholder、manifest 合并及 native provider packaging：最小增量，不替换现有键盘/insets处理。callback scheme按最终包标识统一。
- 账号 frontend controller 与 IPC types：只负责呈现/触发，token owner 模块与普通 UI state分开；UI设计交主代理。
- docs：账号绑定/迁移/退出/后台限制、grant owner与服务协议；后续 Actions应校验pin/许可/源指纹及双端包，不把本轮未执行调查写成认证测试已通过。

建议独立验证任务：同账号不同设备真实 body/hash；跨账号、跨产品、同email不同sub、换Noise key拒绝；两台同时首次登录同workspace；旧库冲突不改数据；不同账号切换不上传旧库；callback duplicate/forwarded host、PKCE/state/cancel/晚到token；pending RT写失败/丢ACK/重启恢复；目录epoch重置及Mapping端口变化；撤销后既有流立即封闭；退出等待owner和provider正常结束。Mac/Android系统浏览器真实回跳与后台/网络切换仍需独立原生验收，现有 sample tests 不替代它们。

## 9. 源码定位

以下只指向此次读取的源码/公开说明，未引用任何密钥文件。

- **S1**：[SDK集成/授权/恢复说明](/private/tmp/cybernote-account109-cybergrid/sdk-rust/README.md:1)，[Config/Port](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/types.rs:8)，[crate约束](/private/tmp/cybernote-account109-cybergrid/sdk-rust/Cargo.toml:1)。
- **S2**：[AuthTokenRequest/AuthProvider](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/client.rs:29)，[Client生成registration key](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/client.rs:142)，[session交换身份校验](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/client.rs:1070)，[expose](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/client.rs:1359)，[remote gate/close](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/client.rs:1692)。
- **S3**：[map/dial/serve](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/peer.rs:282)，[目录及devices](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/capabilities.rs:31)。
- **S4**：[mTLS客户端核验](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/secure.rs:211)，[mTLS服务端核验](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/secure.rs:287)。
- **S5**：[AuthConfig](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/auth.rs:41)，[grant交接结果](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/auth.rs:237)，[Session/User](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/types.rs:288)，[业务授权状态](/private/tmp/cybernote-account109-cybergrid/sdk-rust/src/state.rs:61)。
- **S6**：[RAM官方JS owner](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src/ram-owner.ts:1)，[签名JWT与subject绑定](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src/native-jwt.ts:1)，[TokenBroker](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src-tauri/src/auth_provider.rs:1)，[严格loopback callback](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src-tauri/src/oauth_callback.rs:1)，[受限OAuth transport](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src-tauri/src/oauth_transport.rs:1)，[生命周期/IPC](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/desktop/src-tauri/src/lib.rs:1)。
- **S7**：[Lab官方JS登录](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src/browser-login.ts:1)，[native journal/Transaction](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/src/browser.rs:275)，[Android owner](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/gen/android/app/src/main/java/tech/tinadev/cybergrid/lab/BrowserGrantOwner.kt:1)，[Android SDK bridge](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/gen/android/app/src/main/java/tech/tinadev/cybergrid/lab/BrowserLoginBridge.kt:1)，[Activity调度JNI](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/src/android_browser.rs:1)，[Lab设计与版本限制](/private/tmp/cybernote-account109-cybergrid/docs/lab-browser-login.md:17)。
- **S8**：[现有Noise与固定Socket](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/network/transport.rs:1)，[invite/pin/authorize](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/identity.rs:331)，[pair/prepare/adopt](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/network/service.rs:162)，[固定旧endpoint重连](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/network/service.rs:620)。
- **S9**：[StoreBackend短锁与prepared adopt](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/adapter.rs:96)，[Runtime与service](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/adapter.rs:290)，[StartHost创建本地workspace](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/adapter.rs:476)，[Store拒绝不同workspace](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/store/synchronization/schema.rs:138)。
- **S10**：[SyncBackend](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/sync/network.rs:50)，[主App setup](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/lib.rs:652)，[运行生命周期](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/lib.rs:901)，[现有同步契约](/Users/water/work/2026/Apple-Notes-Clone/docs/architecture/sync.md:1)，[quiet apply契约](/Users/water/work/2026/Apple-Notes-Clone/docs/architecture/sync-coordinator.md:1)。
- **S11**：[provider打包/平台边界](/private/tmp/cybernote-account109-cybergrid/sdk-rust/provider-assets/README.md:1)，[平台glue](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/src/platform.rs:1)，[SDK3 Gradle pin](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/src-tauri/gen/android/app/build.gradle.kts:80)，[CyberNote Android已有生命周期](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt:1)。
- **S12**：[根LICENSE](/private/tmp/cybernote-account109-cybergrid/LICENSE:1)，[Rust SDK LICENSE](/private/tmp/cybernote-account109-cybergrid/sdk-rust/LICENSE:1)，[Logto JS MIT](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/notices/npm/@logto__client-3.2.2/LICENSE:1)，[Logto Android MIT](/private/tmp/cybernote-account109-cybergrid/apps/tauri-test/notices/android/io.logto.sdk/android-3.0.0/upstream-LICENSE:1)，[provider Apache2](/private/tmp/cybernote-account109-cybergrid/sdk-rust/provider-assets/LICENSE:1)，[RAM sample明确无默认真实Gateway](/private/tmp/cybernote-account109-cybergrid/examples/ram-only-workspace/README.md:1)。
