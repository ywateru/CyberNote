# CyberBus / Logto 服务接入调查

调查日期：2026-11-18，Asia/Shanghai。线上证据采集时间为 19:15–19:26（UTC 11:15–11:26）。状态：只读调查完成；配置复用条件已确认，真实认证与多端业务验收未执行。

## 1. 结论与采用方向

**现有 Logto 已配置 CyberBus 专用 Native、resource、产品允许表及 JWT 脚本；现有 EasyTier relay 提供可连接的公开 TCP bootstrap。隔离接入无需先新建认证、coordinator、设备注册或 relay 服务。** 配置存在和 TCP 可达不能替代真实签发、刷新、Noise、Data/ACK 与 SyncService 验收。

用户确认的目标架构为：彻底移除账户运行链对 CyberGrid/coordinator 的依赖；CyberBus 是唯一 `AuthStart` / `AuthCallback` / `AuthRestore` owner；SDK Data 隧道承载既有 SyncService 的 Noise/WebSocket 字节流。本报告以此为后续实施方向，既有账户文档仅说明待迁出的现状。

关键发现：

1. CyberBus 已有 resource `https://cyberbus.x.aixgg.com/api`、`network:join` scope、专用 Native `s3ny…bhcb` 及唯一产品映射。现项目 Native `il4a…b667` / `https://cybernote.app/api` 为旧 `connect` 配置，不能直接取得 CyberBus 凭证。
2. 当前 Logto `jwt.accessToken` 脚本包含本机参考脚本完整文本；`blockIssuanceOnError=true`、运行进程 `DEV_FEATURES_ENABLED=true`。六项 `ET_*` 变量存在；issuer/resource/client/product/config version 与现有 CyberBus 公共配置匹配。
3. bootstrap pins 为 `tcp://43.155.169.102:11010`、`udp://43.155.169.102:11010`。远端 TCP/UDP listener 均存在，本机 TCP connect 成功；未做 UDP 公网协议探测、EasyTier/Noise 握手或业务发送。
4. 两份受控测试账户 fixture 及 callback 登录驱动存在。只读数据库核对均为账户存在、未停用、密码配置存在且未过期、拥有 `network:join`；本轮未验证密码正确性或执行登录。
5. 当前配置明确 `test_only=true`。现有 relay 位于登录 session scope，未证实由常驻服务监管；真实日志脱敏、签发失败阻断、刷新和多端稳定性仍有验收门槛。

完整 client/product 不在本文展开。实现 agent 应从第 3 节指定的现存配置读取，不能把本文的脱敏 ID 当配置值，也不能从产品名称重新推断身份。

## 2. 调查边界与资料基线

本轮只写本文；未运行、构建、安装、重启或改变用户笔记应用；未改动远端文件、容器、数据库业务数据、Logto 配置、账户、角色、DNS 或 relay。没有发起登录、token 换票、刷新或管理 API 写操作。数据库检查均在 `BEGIN READ ONLY` 事务内，设置 5 秒 statement timeout 后 `ROLLBACK`。

读取秘密配置时仅在检查进程内提取变量名、存在性、布尔比较和脱敏标识；未打印 `.env` 内容、密码、token、JWT、根密钥、seed、私有 JWK、用户标识或授权 callback。未读取运行日志、token 归档和用户资料库内容。

| 基线 | 读取范围 |
| --- | --- |
| 笔记项目 | Git HEAD `eb6f4f2725732a1e7b4dd7cdb3cf93a586f5d264`；开始时 `git status --porcelain=v1` 无输出 |
| 本机 CyberBus | `/Users/water/work/2026/CyberBus`，HEAD `359465e83bd74b571a963f3d1fdc238f50169919` |
| docs-sprint | 已读 `SKILL.md`、documentation-system、delivery-plan；按 analysis 的模块拆分和真实连接枚举组织本文 |
| 项目文档 | `docs/INDEX.md`、`docs/plan/README.md`；[服务总览](../../server/README.md)、[部署手册](../../server/DEPLOYMENT.md)、[账户同步](../../architecture/account-sync.md)、[设备动作](../../architecture/account-device-actions.md)、两份 2026-11-16 SDK/连通性报告 |
| CyberBus 文档 | `docs/INDEX.md`、`README.md`、`INTEGRATION.md`、`logto-deployment.md`、`security.md`、`CLOUDFLARE_FALLBACK.md`、`UNRESOLVED.md`、protocol/sdk-api 相关段落、CLI 与跨网络测试说明 |
| 源码抽查 | CyberBus JWT 参考脚本、ClientConfig、凭证 claim 校验、Auth/Data protobuf；项目 `account/transport.rs` 与 `sync/network/{service,transport}.rs` |

用户只允许写本文，因此没有按通常 docs-sprint 流程更新 INDEX、backlog、任务或独审文件。本文为调查分析，不构成实现、独立审核或线上 E2E 通过记录。

## 3. 可直接供实现使用的公共 pins

### 3.1 可信配置来源

远端已有公共部署清单：

```text
cath-w:/home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/test-public-config.json
```

受限部署目录还保存一份匹配的 `public-config.json`，位置见第 6 节。实际 ID 从现存文件的 `client_id`、`product_id` 读取。当前数据库中的 `ET_PRODUCTS_JSON` 只有一个产品和一个允许 Native；已在内存核对清单中的 client/product 配对与该允许表一致，结果 `true`。

| 字段 / 用途 | 已确认配置 |
| --- | --- |
| `issuer` | `https://auth.x.aixgg.com/oidc` |
| `resource` / `ET_RESOURCE` | `https://cyberbus.x.aixgg.com/api` |
| `client_id` | `s3ny…bhcb`；实际值读取上述文件，不沿用 `il4a…b667` |
| `product_id` | 唯一产品，本文称 `product-1`；实际值读取上述文件 |
| `native_clients` | 宿主配置中的 client → product 映射须与服务端允许表一致 |
| `scopes` | `openid`、`profile`、`offline_access`、`network:join` |
| `redirect_uris`，桌面 | `http://127.0.0.1:18765/callback` |
| `redirect_uris`，Android | `cyberbus://auth/callback` |
| `bootstrap.peers` | `tcp://43.155.169.102:11010`、`udp://43.155.169.102:11010` |
| `test_only` | `true` |
| `public_canary_root` | `false`；受限 root-state 中 `canary=false`，实时 root 与受限备份相等 |
| `ET_CONFIG_VERSION` | 与 SDK 当前要求相等：`true` |

本机 `ClientConfig::from_json` 已支持部署清单：从 `redirect_uris` 选择平台默认 callback，缺少 `native_clients` 时由 client/product 构造映射，缺少 `bootstrap_peers` 时读取 `bootstrap.peers`。因此清单可以作为宿主受信公共配置的输入来源；不必另造 bootstrap HTTP API。应用显式设置持久化和监听策略，不能复制私密部署目录作为客户端配置。

现有 CyberBus 两个 callback 已在 Native 的 `oidc_client_metadata.redirectUris` 中登记。现项目旧 callback 为桌面 `17897` 和 `com.local.notesclone.auth://callback`，并未在 CyberBus Native 中出现。若要求沿用旧回调，需要后续单独的受控配置变更；本轮没有增加回调。

桌面并行客户端可顺序登录，避免同时占用 `18765`。Android 应用需要处理已登记的 URI；与其他 CyberBus sample 并装时，还需核对 URI 归属，不能把系统成功投递给其他应用算作当前候选登录成功。

### 3.2 旧身份配置不能作为 CyberBus 身份使用

| 项目 | 原笔记应用 | 已配置 CyberBus |
| --- | --- | --- |
| Native | `il4a…b667` | `s3ny…bhcb` |
| resource | `https://cybernote.app/api` | `https://cyberbus.x.aixgg.com/api` |
| 自定义 scope | `connect` | `network:join` |
| 网络身份来源 | coordinator profile/workspace、enrollment | 已验签的专用 resource JWT claim |
| 设备发现 | coordinator/Redis 临时与持久目录 | EasyTier 候选 + SDK Noise 认证 + SDK 目录事件 |

旧 Native 不在当前 `ET_PRODUCTS_JSON` 允许表，旧 resource 只有 `connect`。不能仅在宿主声明新 scope 或改 SDK resource 就认为旧 client 已获授权。首轮隔离联调可复用已存在的 CyberBus 测试身份；正式 CyberNote 产品隔离应后续确定，尤其不能把测试产品与其他使用者共享网络的行为当成正式产品隔离。

## 4. 现有 Logto 与公开 OIDC 结果

### 4.1 运行部署

| 检查 | 实际结果 / 限定解释 |
| --- | --- |
| `/home/water/work/codex-work/logto` | 存在 `.env`、`compose.yaml`、`caddy.conf`、`MANAGEMENT-API.md`、`management-credentials.md` |
| 普通用户 `docker ps` | 权限拒绝；改用已可用的 `sudo -n docker` 后只读查询成功 |
| Logto 容器 | `logto-logto-1`，镜像 `ghcr.io/logto-io/logto:1.46.0`，观察时运行约 23 小时 |
| Logto 镜像 ID | `sha256:d5e208ce705cbcf7c79ddba421216eb65413d0b0531aa658fb22a4ba659be983`；这是本机 image ID，不声称是 registry RepoDigest |
| Postgres | `logto-postgres-1`，`postgres:17-alpine`，running/healthy；有持久 volume，未核验备份恢复 |
| 入口 | Logto 只映射 `127.0.0.1:3001–3002`；Caddy active/running，配置有分别指向 3001/3002 的反向代理 |
| 进程公开配置比较 | `ENDPOINT` 是 auth origin：`true`；`ADMIN_ENDPOINT` 是 logto origin：`true`；`TRUST_PROXY_HEADER` 配置启用：`true` |
| 全局脚本特性开关 | `DEV_FEATURES_ENABLED=true`，由容器实际 Env 白名单比较确认 |

`.env` 只列出变量名及非空布尔：`LOGTO_IMAGE`、`POSTGRES_IMAGE`、`POSTGRES_PASSWORD`、`ENDPOINT`、`ADMIN_ENDPOINT`、`SECRET_VAULT_KEK`，均非空。未输出值，也未 source 文件。

### 4.2 公开请求

请求不携带凭据，不使用 `-k` 或 `-L`；连接上限 5 秒、单请求上限 12 秒、正文上限 262144 字节。

| URL / 检查 | 结果 |
| --- | --- |
| `https://auth.x.aixgg.com/oidc/.well-known/openid-configuration` | HTTP 200，TLS verify 0；issuer 精确为 `https://auth.x.aixgg.com/oidc` |
| auth discovery | authorization `/oidc/auth`、token `/oidc/token`、JWKS `/oidc/jwks`；public subject、PKCE S256、authorization_code 和 refresh_token 均在支持列表；ID-token 签名算法含 ES384 |
| `https://logto.x.aixgg.com/oidc/.well-known/openid-configuration` | HTTP 200，TLS verify 0；issuer 是 `https://logto.x.aixgg.com/oidc` |
| 两个域名根路径 | 各 HTTP 302；未跟随，不据此宣布最终登录页或管理 UI 验收通过 |
| 两个域名 `/oidc/jwks` | 各 HTTP 200、TLS verify 0；各 1 把 EC/P-384/ES384 公钥，未出现私钥字段；两份规范化 JWKS 摘要不同 |

**固定 auth issuer 与对应 discovery/JWKS。** 管理域虽然也返回 discovery，并不与 auth issuer 等价。公开 discovery 的标准 scopes 列表没有列 `network:join`，不能据此认定自定义 resource scope 不存在；本轮通过资源表和角色关联确认其已配置。

### 4.3 实时 JWT 脚本配置

从 Postgres `logto_configs` 的 `jwt.accessToken` 记录只读检查 `script`、`blockIssuanceOnError`、`environmentVariables` 的结构与白名单比较。

| 核对项 | 结果 |
| --- | --- |
| 当前脚本长度 / SHA-256 | 10494 bytes / `933b6a2b3c9e32ee8a98753c79dd5aa1d14bb56e815a66a34b4e4bcf965aac12` |
| 本机及远端参考脚本 SHA-256 | 均 `d5600cfea5706cd7259bbe16527406baedc1d179c4222c784058e3e5f81bd5aa` |
| 当前脚本包含完整参考文本 | `true`；当前脚本还有包装文本，不能说三个文件逐字相等 |
| `blockIssuanceOnError` | `true` |
| claim / scope / Native / Web Crypto / denyAccess 分支 | 存在性检查均 `true` |
| 脚本环境 | `ET_ISSUER`、`ET_RESOURCE`、`ET_ROOT_KEY_HEX`、`ET_PRODUCTS_JSON`、`ET_CREDENTIAL_EPOCH`、`ET_CONFIG_VERSION`，均存在且非空 |
| 允许表 | 1 个产品、1 个 Native；与公共清单配对一致 |
| root / epoch 与私密 root-state | 分别在内存比较相等：`true`；未输出值或秘密派生指纹 |

参考实现对目标 resource 要求用户 AccessToken、`network:join`、可信 user/client 上下文和 Native 类型，再按 issuer/account/product/epoch 派生凭证。固定 claim 名为 `https://cyberbus.x.aixgg.com/easytier/credentials/v1`，包含 `account_seed_secret_hex`。该命名空间不是新增 HTTP 服务的地址。

上述是部署和源码检查，不是实际签发验证。尚未证明生产构建中的普通异常、超时或缺少运行 API 时必然阻断；也未证明实际审计、stdout、APM、代理日志全部脱敏。现 root 已非 canary，后续真实测试应先核对已有实际版本的日志验收记录，不用公开 fixture 检查结果替代线上结论。

## 5. CyberBus 需要的服务与 relay 能力

```text
账户界面 / 平台回跳
          │ AuthStart / AuthCallback / AuthRestore
          ▼
CyberBus 唯一认证 owner ── PKCE / token / JWKS ── Logto
          │ 已验证账号、产品与网络材料留在 SDK
          ▼
EasyTier bootstrap / P2P / relay
          │ SDK Noise 认证、设备目录、Data
          ▼
应用字节流适配器 ⇄ SyncService WebSocket + 既有 Noise / 数据同步
```

| 模块 | 是否需要独立服务 | 当前能否满足 |
| --- | --- | --- |
| 用户注册登录、PKCE、token、刷新、JWKS | 需要 Logto | 服务与专用配置存在；真实流程待验 |
| 网络凭证签发 | 现有 Logto User access-token Custom JWT | 已安装；无需新增 seed API |
| 安装身份、设备发现、公开 Profile、屏蔽 | SDK / EasyTier 与客户端持久状态 | 不要求独立设备注册服务；应用仍需接入目录事件 |
| 跨 NAT bootstrap / relay | 需要受信且可达的 EasyTier 联系点 | 当前 TCP 可连接；UDP/跨网协议和可靠运营待验 |
| 笔记正文、附件、冲突与收据 | 客户端 SyncService | 保留业务；需开发 Data 字节隧道与替换旧授权连接链 |
| Cloudflare Quick Tunnel WSS | 可选临时兜底 | 本轮未发现或确认当前存活 URL；不应填入虚构 WSS pin |

CyberBus 当前约束明确不新增凭证服务器、设备注册服务器或通知服务。原笔记应用 `/account/profile`、enrollment/JWKS、notes devices、auth exchange、signals 以及其 Redis 不进入目标账户运行链；无需以这些旧服务健康检查作为新方案启动前置。

### Relay 的实际检查

配置与脚本位于：

```text
cath-w:/home/water/work/codex-work/cyberbus/transport-relay/relay.toml
cath-w:/home/water/work/codex-work/cyberbus/transport-relay/relay.sh
```

- TCP、UDP 均监听 `0.0.0.0:11010`，进程为 `easytier-core`；本轮 PID 为 `1345745`。
- 可执行路径为 `/home/water/work/codex-work/cyberbus/transport-relay/easytier-linux-x86_64/easytier-core`；启动脚本引用上游 v2.7.1 下载地址。没有运行 `--version`，不把下载地址当运行版本实测。
- 配置为 no-tun、DHCP 关闭、exit node 关闭，RPC portal 仅 loopback 随机端口；跨网 relay whitelist 为允许所有网络的配置。relay 不因此获得账号授权，仍由客户端验证账号网络材料和 Noise。
- cgroup 是 `/user.slice/user-1002.slice/session-14558.scope`；系统/用户 unit 查询未发现具名 CyberBus/EasyTier relay 服务，Docker inventory 也未发现 relay 容器。不排除其他监管方式，当前没有持久监管与开机恢复证据。
- 本机 TCP connect 用时约 6ms，未发送应用字节。远端 UDP listener 存在不证明运营商网络 UDP 可达。
- 清单中的历史状态 `verified-macos-android-lte` 只作为原清单文字存在；本轮没有复验该历史场景。

## 6. 受控账户与既有脚本如何使用

### 6.1 私密材料位置，只列路径与布尔

远端受限目录：`/home/water/work/codex-work/logto/.cyberbus-deploy-001`，存在，权限 `0700`。

| 文件 | 本轮核对 |
| --- | --- |
| `test-account.json` | 存在、非空、`0600`；账户及密码字段存在；DB 恰有 1 个匹配账户、未停用、密码存在且未过期、角色授予 `network:join` |
| `registration-account.json` | 同上；它是已存在的注册测试 fixture，不应当作“本轮新注册”证据 |
| `public-config.json` | 存在、非空、`0600`；issuer/resource 与公共清单及实时脚本一致 |
| `root-state.json` | 存在、非空、`0600`；实时 root/epoch 与备份相等，canary 为 false |
| `installed-customizer.json` | 存在、非空、`0600`；未输出内容，不作为当前配置唯一来源 |
| `verification.json` | 存在、非空、`0600`；未读取或沿用其通过声明 |
| `/home/water/work/codex-work/logto/management-credentials.md` | 存在、`0600`；仅初始化/管理用途，不给客户端 |

上述 fixture 的完整路径均由受限目录加表内文件名组成。没有输出账户名、user ID、密码或其指纹。DB 另确认存在授予 CyberBus `network:join` 的默认 User role；新注册是否实际得到权限和令牌仍需真实注册流程验证。

管理文档涉及的变量名有 `LOGTO_ENDPOINT`、`LOGTO_APP_ID`、`LOGTO_APP_SECRET`、`LOGTO_ACCESS_TOKEN`；只是管理员脚本接口，不是客户端配置要求。本轮未获取管理 access token。

### 6.2 脚本分工与副作用

下表远端脚本根目录统一为 `/home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/`；`machine-source/deploy/` 也发现同名副本，后续固定一个来源并校验版本，避免混用。

| 脚本 | 能力 / 正确使用边界 | 本轮执行 |
| --- | --- | --- |
| `drive-hosted-login.py` | `--private-dir`、可选 `--authorization-file`；输出二选一 `--callback-file` / `--deliver-loopback`。读取私密 `public-config.json`、`test-account.json`，校验 SDK 授权请求，完成托管页面交互后交回 callback；不自行调用 token endpoint | 未执行，仅 AST/文本结构检查 |
| `deliver-auth-callback.py` | `--callback-file` 加 `--loopback` 或 `--adb-serial`；传递 callback 到 SDK，检查精确平台入口；不换票 | 未执行 |
| `logto_admin.py` | 管理 API/helper，会取得管理员 token；正常客户端不使用 | 未执行 |
| `initialize-logto.py` | `--private-dir`、`--credentials`、可选 `--activate-private-root`；有 POST/PUT，可创建/更新资源、应用、角色和 JWT 配置 | 未执行；不可为调查重跑 |
| `configure-logto-error-blocking.py` | `--private-dir`、`--compose`；写 compose 并执行 Docker compose up，可能重建运行进程 | 未执行；线上配置已满足读取到的开关 |
| `verify-logto.py` | `--private-dir`、`--credentials`、`--fixture-name`；包含 GET/POST/PUT、创建用户、签发/刷新、JWT 错误探针和 token 归档路径 | 未执行；名字中的 verify 不表示只读，也不应成为应用的第二认证 owner |
| 本机 `check-claims.mjs` / `check-audit-redaction.mjs` | fixture/固定源码检查，可辅助后续验证；不等于当前线上实际日志验收 | 本轮未运行 |

后续 callback-only 流程：由候选应用的 CyberBus `AuthStart` 生成授权 URI → 将 URI 保存在新的私密 `0600` 文件 → 登录驱动仅完成托管交互 → callback 经原生入口提交给同一 SDK operation → SDK 自行 PKCE 换票并发出 `AUTHENTICATED` → 用户显式开启同步后 `NetworkStart`。不要通过 `verify-logto.py` 先签一份 token 再导入应用，也不要复制 refresh token 或安装私钥制造第二端。

驱动会创建 callback 文件并改变正常登录会话，因此它属于后续实际测试步骤，本轮只检查路径和实现。执行环境使用受控 Python 工作目录/关闭字节码写入策略，日志只保留有限状态；不将 callback 文件归档进仓库。

## 7. 实施模块与真实连接验收

现有 `SyncService` 使用具体的 `WebSocketStream<MaybeTlsStream<TcpStream>>`，旧账户 `Bootstrap` 会调用 enrollment 验证，再通过 Gate 授予现有 Noise invitation。**仅替换 CyberGrid 端口映射会保留 coordinator 依赖，不能满足目标。** SDK 已认证设备也不能直接被当成旧 enrollment JWT。

| 后续模块任务 | 输入 → 输出 / 所有权 | 必须接通的真实连接 |
| --- | --- | --- |
| A：唯一认证 owner | 平台登录意图/原始回跳 → CyberBus AuthEvent/AccountSummary；SDK 持有 grant、刷新、租约、锁存 | UI → AuthStart；平台入口 → 同 operation 的 AuthCallback；冷启动 → AuthRestore；禁止旧 account-auth owner 并行换票 |
| B：账户与设备投影 | SDK 已验证 issuer/subject/product、32-byte device ID、目录 revision → 应用安全账户状态和设备卡片 | AuthEvent → 本地账户上下文；WatchDevices → UI；32-byte SDK device ID 与既有同步 UUID 分开存放和绑定 |
| C：Data 字节流适配器 | SDK Send/DataReceived/DataStatus → 有界双向 byte stream | 固定 peer + runtime/generation + stream ID；open/chunk/close/reset、顺序、背压、超时、取消、重复处理全部真实接通 |
| D：既有 SyncService 接入 | 字节流 + SDK 可信 peer/账户上下文 → 原有 WebSocket/Noise、正文/附件/冲突与提交收据 | 可使用严格私有的随机 loopback 桥保留现有 TCP/WebSocket 类型，或抽象 IO；两种路径都必须保持 peer/generation gate，localhost 不能替代认证 |
| E：移除旧运行依赖 | SDK 账户与 peer 证明 → 替换 profile/workspace、enrollment、目录与原邀请授权链 | 不再调用 coordinator auth/profile/enrollment/JWKS/devices/signals；无需 Logto 管理凭据、Redis URL、workspace seed 或 enrollment 私钥 |

需在实施契约中明确：

- SDK Data 是消息与分片接口，不天然是 TCP 字节流。定义应用 Protobuf bytes envelope、流 ID、单调序号/offset、帧边界及结束语义，按 SDK 大小上限分块；不把业务 JSON 直接冒充 SDK Protobuf。
- `Send` 接纳、RECEIVED/ACCEPTED/PROCESSED 和笔记落库收据是不同阶段。隧道 ACK 不能冒充 SyncService 持久化成功；断线未知结果保留 `UNKNOWN_OUTCOME`，不盲目重放字节流。
- 建立 SDK device ID 与原协议 device/Noise public key 的可信绑定。可信来源是当前 SDK 认证连接，不能用未认证 PublicProfile 自报值恢复旧 Gate 权限。
- 原 workspace 与本地资料库生命周期分开；新的远程账户分区由 SDK 已验证的 issuer/subject/product 建立。旧服务端 seed 派生的 workspace 不能成为新链继续访问 coordinator 的理由。
- 退出、换账户、SDK reauth/租约失效、设备 block、generation 变化均关闭字节隧道和业务准入；原 Noise 作为既有业务层保留，不向宿主导出 SDK seed/app PSK 来复造认证。
- 旧持久离线设备列表不由 SDK 在线目录自动提供。若保留离线行，应用维护本地可信历史与明确的离线投影；不能为恢复旧 UI 隐式重新接入 Redis registry。

本机 sample 默认 `persist_grant=false`，退出进程后重新浏览器登录。`AuthRestore` 接口存在不代表所有 sample 都持久保存 grant。正式恢复测试须先选定 SDK 支持的安全存储和显式持久策略，不回退为应用自建 refresh owner。

## 8. 真实账户多端测试前置与判定

| 门槛 | 当前情况 / 后续必须取得的证据 |
| --- | --- |
| 公共 pins、Native、resource、产品和 callback | 已完成只读一致性确认；候选固定读取实际值，禁止用脱敏值 |
| 账号与权限 | 两份 fixture 及权限存在；实际正常托管登录、密码有效性、首次注册授 scope 尚未执行 |
| JWT 运行兼容 | 安装版本、脚本包含关系、开关为已确认；签名、目标 claim、跨 Native 一致、跨账号/产品拒绝、真实异常阻断待验 |
| 日志与监控 | 当前实际版本的审计/导出/stdout/APM/代理脱敏未检查；不要将凭证输出到 UI 或测试报告 |
| relay | TCP connect / 远端 TCP+UDP listener 已确认；不同网络真实握手、端口策略、进程重启恢复和长期监管待验 |
| 两端隔离 | 全新独立资料库/SDK 安装状态，每端独立安装 key；同一测试账户分别正常登录，桌面 callback 串行 |
| 数据链 | 双向目录 → SDK Data ACK → byte stream → WebSocket/Noise → SyncService 真实正文/格式/附件 hash 与业务收据 |
| 第三端与故障 | Android 真机、Wi-Fi/LTE、断网重连、取消/退出/换账户、block、刷新 unknown outcome、lease expiry；逐项记录未测/失败，不以 TCP 可达替代 |
| 零 coordinator 运行依赖 | 定向观察候选账户流程的允许请求类别，确认不存在旧协调 API 调用；可对旧服务不可用做隔离负例，不修改线上服务 |

CyberBus `docs/UNRESOLVED.md` 明确仍有真实 macOS/Linux/Android 握手超时方向、网络切换恢复和三端 ACK 边界。本轮不将部署清单中的历史状态、离线 fixture 或已存在账号升级为新应用 E2E 通过。

## 9. 命令与结果范围

### 9.1 SSH、安全输出与超时

所有远端调用使用同一组选项，通过本机 Python `subprocess.run(..., capture_output=True, text=True, timeout=...)` 有界执行；远端正文为 `timeout Ns python3 - <<'R' ... R`。实际使用 N=25/35/40/45 秒，本机外层为 35/45/50/55 秒，各子命令 5–10 秒。SSH 调用均返回 0，未因超时中断。以下保留实际使用的命令原语及查询范围；Python 白名单提取编排分多轮执行，未在仓库存储原始回执或秘密响应。

```sh
ssh -o BatchMode=yes -o ConnectTimeout=8 \
  -o ServerAliveInterval=5 -o ServerAliveCountMax=2 \
  -o UpdateHostKeys=no cath-w '<有界 Python 只读检查>'
```

`<有界 Python 只读检查>` 是说明标记，不是可直接运行的命令正文。没有禁用 host-key 校验，也没有请求交互密码。第一轮普通 Docker 查询失败记录保留，随后仅提升只读查询权限。

### 9.2 实际命令原语

| 编号 | 命令 / 输入范围 | 本轮结果及不能推断的内容 |
| --- | --- | --- |
| Q1 | `pwd`；`rg --files`；`cat`/Python 文档读取；`git status --porcelain=v1`；两仓库 `git rev-parse HEAD` | 读取第 2 节基线。最初广域文件列表与部分组合文档输出被工具截断，随后定向分段读取；不把截断列表当全盘清单 |
| Q2 | Python `os.walk` 检查 Logto 目录，深度≤2；排除 `.git`、node_modules、数据库数据、logs/backups；单独检查 `.env` 变量名 | 初轮非隐藏文件枚举未列隐藏部署目录；后根据远端部署 README 指定路径确认 `.cyberbus-deploy-001`，非盲目推断缺失 |
| Q3 | `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'`；相同命令加 `sudo -n`；`sudo -n docker inspect <目标容器名>` | 普通查询 exit 1/permission denied；sudo 查询 exit 0。inspect 原始 JSON 仅在内存解析，输出白名单字段及 env 比较布尔 |
| Q4 | `systemctl list-units --type=service --all --no-pager --plain --no-legend`；对应 `systemctl --user` 查询 | 只输出名称含 logto/easytier/relay/nginx/caddy/cloudflared/cyberbus 的 unit；Caddy active。该范围不枚举所有 cron/外部 supervisor |
| Q5 | `ss -lnt`；`sudo -n ss -lntp 'sport = :11010'`；`sudo -n ss -lnup 'sport = :11010'`；读取目标进程 `/proc/1345745/exe`、`cgroup` | listener、进程路径、session scope 已确认；未读取 cmdline/env/log |
| Q6 | `sudo -n docker exec logto-postgres-1 psql -U logto -d logto -X -A -t -v ON_ERROR_STOP=1 -c <只读 SQL>` | information_schema 与指定配置/应用/资源查询成功；每轮 BEGIN READ ONLY + 5s deadline + ROLLBACK |
| Q7 | 同 Q6，fixture 用户比较 SQL 改为 `docker exec -i ... psql ...`，查询经 stdin 传入 | 不把账户值放入命令行；只输出 count 和权限/状态布尔；未选取或输出 password hash |
| Q8 | Python AST 解析指定 deploy 脚本，提取 argparse flags、函数名、文件名、API 路由和副作用标记；`Path.stat()` 检查受限文件 | 未 import/执行部署脚本。远端 CyberBus 搜索主要为深度≤3，并排除 vendor/target/node_modules/状态与日志；初次清单上限 100 项，后定点检查目标路径 |
| Q9 | 下面的 curl 参数；Python `socket.create_connection(('43.155.169.102',11010), timeout=6)` | OIDC/JWKS 有限结果见第 4 节；TCP connect 成功后关闭，未发送应用字节，无 UDP 客户端 probe |

公开请求实际参数：

```sh
curl --connect-timeout 5 --max-time 12 --max-filesize 262144 -sS \
  -w '\n%{http_code}\n%{remote_ip}\n%{ssl_verify_result}' \
  'https://auth.x.aixgg.com/oidc/.well-known/openid-configuration'
```

同参数分别请求 logto 域 discovery 与两个 origin 的 `/`。JWKS 请求相同超时/大小参数，`-w` 为 `\n%{http_code}\n%{ssl_verify_result}`，分别请求两个域的 `/oidc/jwks`。响应先在内存解析，只打印协议字段、状态和公钥结构布尔；不打印 cookie/header 或完整响应。

数据库实际事务包装：

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='5000ms';
-- 单轮限定 SELECT
ROLLBACK;
```

实际 SELECT 范围：

```sql
SELECT table_schema||'.'||table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND table_name ~ '(application|resource|scope|role|user|config|jwt)'
ORDER BY 1 LIMIT 100;

SELECT table_name||'.'||column_name||':'||data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('applications','resources','scopes','roles',
                    'logto_configs','users','jwt_customizers','jwt_customizer_configs')
ORDER BY table_name,ordinal_position;

SELECT json_build_object('key',key,'value',value)
FROM logto_configs
WHERE key ILIKE '%jwt%' OR key ILIKE '%custom%'
ORDER BY key;

SELECT json_build_object('id',id,'name',name,'type',type,
                         'metadata',oidc_client_metadata)
FROM applications WHERE type='Native' ORDER BY id;

SELECT json_build_object('indicator',r.indicator,'scope',s.name)
FROM resources r LEFT JOIN scopes s
  ON r.id=s.resource_id AND r.tenant_id=s.tenant_id
WHERE r.indicator ILIKE '%cyber%'
ORDER BY r.indicator,s.name;
```

后续脚本比较只定点读取 `key='jwt.accessToken'`。原始配置值未输出，始终由远端 Python 只投影字段名、布尔、公共 URL 与脱敏 ID。用户核对仅对 fixture 的匹配用户聚合：`count(*)`、`bool_and(NOT is_suspended)`、`password_encrypted IS NOT NULL`、`NOT is_password_expired`，再沿 `users_roles → roles_scopes → scopes → resources` 判断目标 resource 的 `network:join`；默认角色检查另限制 `is_default=true AND type='User'`。没有查询全体用户详情或输出 credential 列。

### 9.3 未执行项

未执行 `docker compose up/restart`、服务管理写命令、SQL DML、管理 API 写调用、初始化/verify/登录驱动、账户注册/改密/角色变更、root/epoch 轮换、cloudflared 启动、SDK 网络启动、多端传输和笔记应用操作。未进行生产备份恢复或性能验收。

交付判断是“既有服务与隔离接入材料已找到且只读一致性确认”，不是“新账户运行链已实现”或“真实三端同步已通过”。
