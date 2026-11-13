# 账户与跨网络同步

2026-11-13。新增Logto托管登录/注册，以CyberGrid建立同一账号、同一CyberNote产品的原生端互通；保留现有本地编辑、SQLite、版本向量、冲突、Noise和附件SHA同步链。未登录时可继续完整本地使用。

## 配置与服务职责

- Logto可信issuer固定为部署配置的HTTPS issuer，使用应用专用Native客户端，authorization code＋PKCE S256、state/nonce、精确回跳；注册入口进入同一Logto托管注册页。客户端不能包含Management客户端secret。用户可选择独立内置 WebView 或系统浏览器，均由同一 native owner 持有授权；内置转浏览器复用本次 RAM 事务，仅向 React 返回有限账户状态。远程 WebView 无本地应用权限，窗口生命周期与取消代际绑定，见[双入口契约](../plan/tasks/app-account109-login-surfaces.md)。
- Vercel Node22服务采用固定CyberGrid源码版本`f2a3961536e5c69b13c7dbc661953d9243becbae`，Redis通过验证证书的TLS TCP连接。每个环境使用独立namespace；Redis存协调状态而非笔记/附件。
- 协调HTTP transport按平台编译固定：Android为`https://cybernote-sync.aixgg.com`，桌面仍为`https://cybernote-sync.vercel.app`。profile绑定与网络创建两处Enrollment、SDK的base_url均使用同一平台固定值，不提供运行时URL覆盖或自动降级。enrollment proof的`ENROLLMENT_ISSUER`仍严格为`https://cybernote-sync.vercel.app`，不接受transport别名作为issuer；Logto固定输入、provider、签名key、workspace seed和owner验证不随host改变。新域在DNS、Vercel验证、TLS及固定匿名接口通过前不发送账户授权材料，见[已授权域名任务](../plan/tasks/app-account109-approved-domain.md)。
- CyberNote专用API resource提供connect用户scope；专用SPA仅用于服务控制台。Native与SPA静态产品策略限定同一产品，其他Logto应用的token不可加入。
- `/api/v1/account/profile`接受Bearer资源access token，验证issuer/audience/ES384/expiry/client_id/connect和产品允许策略后返回`{schemaVersion:1,subject,issuer,productId,workspaceId}`。workspace UUID由固定服务端随机seed对issuer＋subject＋canonical product的分域HMAC派生；seed必须显式配置，部署后不能随意轮换，不能用请求Host/未验证JWT字段生成账号归属。
- Logto身份校验仅在固定issuer的远程JWKS获取发生网络/超时、响应体传输失败或非200响应时返回`503 IDENTITY_UNAVAILABLE`及固定安全提示；签名、claims、未知/无效密钥和JWT错误仍返回`401 INVALID_IDENTITY`，不透传上游异常或响应内容。此区分不代表已证明某次原生运行失败的原因。
- 管理凭据仅供本地配置Logto；运行服务只持Redis和workspace派生seed等必需服务端配置。登录密码只进入Logto页面，不交给CyberNote协调服务。

## 原生认证与设备授权契约

授权采用成熟 Rust OpenID Connect/OAuth2 库实现 Code + PKCE 和 ID token 校验，所有平台使用同一个 Rust grant owner；不将 refresh token 交给 WebView。系统浏览器由平台 opener 打开，Mac 使用精确 `http://127.0.0.1:17897/callback` loopback 回跳，Android 使用独立 `com.local.notesclone.auth://callback` deep link。owner 串行刷新并在每次 rotation 后先原子保存私有凭据，再启动依赖新 grant 的网络请求。私有 0600 regular 文件不等于 OS Keychain/Keystore；不作系统钥匙串存储声明。

CyberGrid 将 peer stream 接入本机 TCP 后，业务 listener 不能从 `127.0.0.1` 判断对端账户。自动配对必须额外验证服务签发的短期设备凭证：

- `POST /api/v1/account/enrollment`：Bearer 资源 JWT，body 严格为 `{deviceId,noisePublicKey}`。deviceId 为持久同步 UUIDv4，Noise 公钥为 canonical base64url 32 bytes。服务按已验证账户派生 workspace，不接受客户端 subject/workspace。
- 响应 `{schemaVersion:1,token,expiresAt}`，时间为 epoch seconds。token 为 ES384 JWT，`iss` 固定为旧协调 origin `https://cybernote-sync.vercel.app`（不随transport改变），`aud=cybernote-enrollment-v1`，`sub` 为 Logto subject；附 `accountIssuer,productId,workspaceId,deviceId,noisePublicKey,purpose=pair,iat,exp,jti`，有效期 300 秒。专用稳定 `CYBERNOTE_ENROLLMENT_JWK` 与 workspace seed 分离。
- 签发请求接入同 Redis 原子配额：验 JWT 前按可信来源 IP 每分钟 30 次，验证后按 issuer/subject/product 每分钟 60 次；超额返回 429 / Retry-After 60，公钥读取不消耗签发配额。
- `GET /api/v1/account/jwks` 只发布签名公钥。端上从平台固定transport origin获取，验证算法、kid、固定旧enrollment issuer、audience、purpose、有效期及本机账户/workspace/product，再通过 Noise 握手证明对端持有绑定的私钥。不得接受 JWT 内任意 jwks URL。
- bootstrap 双向交换凭证；host 只给预期 deviceId 和 Noise key 生成一次邀请，client 校验 host proof 与邀请的 host key/workspace。nonce/challenge 只在受限 bootstrap 业务流内使用，邀请不入目录/日志/前端。
- 账号配对与 manual 凭据明确区分；暂停、退出、凭证过期或账号代际变化必须关闭现存账号业务流与新请求，不能降级成永久 manual 配对。对旧手工空间仅允许相同 workspace 的明确兼容路径，不清空其历史以迁移。

## 创建链与所有权

```text
账户页 → account_command → 原生账户Runtime
  → 内置托管页或系统浏览器Logto授权/注册 → 原生回跳/PKCE换票 → 验证身份
  → Vercel account/profile → 确定账号workspace
  → CyberGrid Rust Client（官方token provider）
  → 申报本机loopback同步入口、发现同owner/product设备
  → 真实SDK端口映射＋mTLS → 对端私有bootstrap → 自动Noise配对
  → 既有sync::adapter → Network → Store/Session/quiet → 正文/附件提交
```

账户Runtime由App创建一次，独立于设置页的挂载/可见性。设置页只订阅安全状态和提交用户操作；关页不结束同步。每次登录/退出/恢复有代际，取消与迟到结果不可恢复旧账号连接。状态查询不创建身份、不启动网络；注册/登录入口明确启动授权。启动可恢复已持久授权；刷新时须区分实际网络故障、授权服务器拒绝和无效响应。不能把所有 OAuth 请求错误都当作凭据失效。只有认证拒绝才提示重新登录；网络故障保留原授权与绑定，提供明确的有界恢复操作，不无限循环或冒称已连接。恢复操作不得静默启用用户已暂停的同步，`status` 仍只读。某次旧候选显示认证失败不构成该次 grant 已撤销的证明。

同一数据根只可绑定已确认的一个账号，绑定含issuer/subject/product/workspace。换账号不得把已有账号数据发给另一个账号；拒绝不匹配并提供明确恢复说明。退出账户先封闭自动连接和邀请、停止SDK映射及本轮账号同步，再撤销/删除本地授权；本机笔记继续保留。没有明确账号库迁移和冲突保全证明时，不清空同步元数据或偷偷改workspace。已有手工同步workspace不兼容必须明确报告，并保全原库，不能为了通过新测试清数据。

首次为尚未开启同步的本地库登录时，以真实已验账号workspace原子启用现有Store同步schema，保留所有现有笔记并bootstrap。已绑定同账号重启保持workspace/device；多端并发首次登录必须得到同一workspace。自动配对邀请仅通过已认证的CyberGrid peer业务流交换，不进入Redis设备描述、日志、前端快照、命令argv或Git。端口仅loopback监听；不增加未认证公网邀请服务。

自动连接必须与真实应用同步状态区分：已登录、设备在线、TCP通道成立、同步进行、已应用是不同事实。待处理数/冲突/最后成功时间来自原有同步Runtime；目录心跳不等于数据同步成功。断网保持本地编辑，重试有界退避；恢复复用原账号/设备身份和dirty/inbox。手工设备同步入口保留。

## 原生IPC与前端契约

单一`account_command`，请求deny_unknown_fields，操作为`status`、`signIn`、`signUp`、`openLoginInBrowser`、`cancel`、`signOut`、`syncNow`、`setEnabled`。`signIn/signUp` 可传 `surface: 'embedded'|'browser'`；`openLoginInBrowser` 只接续当前内置授权。不得提供任意URL/token注入的生产IPC。下列为状态摘要，完整字段及严格验证以 `src/account-client.ts` 为准：

```typescript
type AccountStatus = {
  state: 'signedOut'|'authorizing'|'connecting'|'ready'|'paused'|'error';
  authorizationSurface?: 'embedded'|'browser'; // 仅 authorizing 时
  enabled: boolean;
  profile?: { subject: string; displayName: string; username?: string };
  devices: { id: string; name: string; online: boolean; current: boolean; connected: boolean }[];
  lastSyncAt?: number;
  pendingCount: number;
  conflictCount: number;
  error?: { code: string; message: string };
};
```

状态不返回access/refresh token、Noise密钥、邀请、管理secret、Redis配置。可选择的错误分类包括登录取消/过期、认证失败、协调不可用、资料库归属冲突和同步失败。返回安全中文操作说明，不能将原始第三方异常/响应串直接显示。命令完成不是网络收敛证明，UI只按实际运行状态展示。

完整DTO另含有限的错误 `stage/reason/providerReason/tokenOperation/tokenField` 和可选实时 `transportGeneration/devices[].transport`。传输观测只在匹配代际、远端在线、样本年龄不超过3000ms时接受；`sync='cloudflare-tunnel'` 才能作为该样本时点的业务中转证据，目录 online 不足以证明中转。观测不追踪每个数据字节。实际手动步骤见[手动测试指南](../verification/account109/MANUAL-TESTING.md)。

## 验收

真实Logto托管注册→登录、取消/错误state、回跳校验、refresh/重启恢复、退出关闭、跨账号拒绝；同账号两个独立桌面数据目录自动发现/配对，完整中文格式document/plainText与PNG/文件原字节双向一致，离线补齐、并发冲突、重启身份保持；少量真实Android同账号发现/同步/恢复。测试必须说明真实边界，fixture不能替代Logto/Vercel/Redis/CyberGrid和实际原生同步链。服务器验JWT负例、产品隔离、无认证请求、并发workspace一致和TLS Redis冷启动；公开部署健康及真实认证API通过后才称部署完成。
