# 协调服务部署、恢复与排障

更新：2026-11-15。服务关系、现有项目标识及最后归档的生产版本见[服务总览](README.md)。本文提供后续操作步骤，本轮未执行部署或线上配置变更。

## 配置与稳定性约束

配置入口是 [account-config.ts](../../services/coordinator/src/account-config.ts)；可从[无凭据环境模板](../../services/coordinator/.env.example)建立独立开发环境。模板域名和客户端 ID 均须替换；它不是现有生产配置备份。

| 变量 | 要求／操作规则 |
| --- | --- |
| `LOGTO_ISSUER` | 固定 HTTPS issuer，以 `/oidc` 结尾；现有客户端值见总览 |
| `LOGTO_RESOURCE` | 显式 HTTPS audience，具有用户 `connect` scope |
| `LOGTO_BROWSER_CLIENT_ID` | 专用 Console SPA ID，必须属于下方静态产品策略 |
| `CYBERGRID_PRODUCTS` | JSON `version:1`，每个产品有 `id,name,nativeClientIds,browserClientIds`；canonical `id` 自身须在 Native 数组中，Native 与 SPA ID 不可混用 |
| `CYBERNOTE_WORKSPACE_SEED` | 32–96 随机字节的规范无 padding base64url；必须持久保存。轮换会改变同一账户的 workspace ID |
| `CYBERNOTE_ENROLLMENT_JWK` | 专用 EC P-384 私有 JWK，坐标与私钥须匹配；ES384。部署沿用原 key，公钥由 JWKS 发布 |
| `CYBERGRID_PUBLIC_ORIGIN` | 固定 canonical HTTPS origin，无凭据、查询、fragment 或非根路径；同时是 enrollment issuer。现有客户端要求保持 `https://cybernote-sync.vercel.app` |
| `CYBERGRID_REDIS_TRANSPORT` | 本文示例采用 `tcp`；生产实际选择由管理员核对。显式选择避免自动注入的其他配置干扰；变更须保持同一数据库与 namespace |
| `REDIS_URL` | 生产使用证书校验开启的 `rediss://…`。凭据只进入密钥管理／服务环境，不能写入 Git 或命令参数 |
| `CYBERGRID_REDIS_PREFIX` | 必须显式、按环境隔离，1–80 个 `[A-Za-z0-9:_-]`；更换会切换协调与设备登记命名空间 |
| `CYBERGRID_CONSOLE_REDIRECT_URI` | 可选；默认 canonical origin + `/console/callback/`。覆盖值必须是同源专用 HTTPS 路径，并在 SPA 登记 |
| `CYBERGRID_ENDPOINT_PROVIDERS` | 可选，自定义 provider 的 origin/path 白名单；不需要为内置 Quick Tunnel 填自定义 provider |
| `CYBERGRID_BROWSER_ORIGINS`、`CYBERGRID_ADMIN_KEY` | 可选 Console 跨源策略／管理入口密钥；按各自源码配置，未经需求不要扩大开放范围 |
| `CYBERGRID_LIMITS` | 可选 JSON，允许下调内置容量上限，不能突破硬上限 |
| `CYBERGRID_REGISTRATION_MODE` | 默认 `legacy-v1`，另支持 `finite-v2`；与 Redis 现有模式和客户端能力相关，不作为排障临时开关 |
| `CYBERGRID_BIND`、`PORT` | standalone 默认 `127.0.0.1:7400`；容器／反代按网络边界选择，Vercel Function 不靠它们监听 |

上游 Redis 适配也支持 `upstash-rest` 和 `vercel-kv`，但不能据此认为当前生产已改用 REST。显式选择对应 transport 时须提供完整 URL/token 组。没有显式选择时必须恰好只有一组配置。[实现](../../services/coordinator/src/redis.ts)保留 TLS 校验、4 秒连接与约 4.5 秒命令／REST 期限，不通过关闭 TLS 验证解决故障。

现有 CyberNote 使用静态产品策略，不需要运行时 `LOGTO_MANAGEMENT_CLIENT_ID/SECRET`。Logto 管理权限仅用于配置专用 Native／SPA、resource、scope 和角色授权；客户端与协调服务不应获得管理凭据。普通用户须通过角色获得该 resource 的 `connect` 权限。

已有环境复用原 seed、签名私钥、issuer、产品策略和 Redis namespace。它们不是每次构建时生成的随机值；灾备时要能从受控备份恢复这些值。生产与 Preview／开发环境应隔离，禁止开发实例误指向生产 Redis。新环境改变了固定身份输入时，还需构建匹配的客户端。

## 本地开发与 standalone

要求 Node **22.x**、npm，完整 Redis 测试另需 `redis-server`。以下命令在 `services/coordinator/` 执行，使用该目录自己的锁文件：

```sh
cd services/coordinator
npm ci --include=dev
npm run typecheck
npm run build
```

首次独立环境复制 `.env.example` 为 `.env` 后填入专属配置。`npm start` 通过 Node 的 `--env-file-if-exists=.env` 加载当前目录文件，再由 tsx 运行 `src/main.ts`；`build` 主要执行类型检查和静态站点校验，不产生可替代全部源码的 `dist/server.js`。因此 standalone 运行需要源码、运行依赖及静态资源。

seed 和私有 JWK 应由受控工具生成并存入密钥管理。若只为全新本地环境生成，可用下例写入独立文件；它拒绝覆盖，且不会把值打印到终端。生成的 `.env.secrets` 不会被 `npm start` 自动加载，需将其中两项值填入本地 `.env` 的对应占位项：

```sh
node --input-type=module <<'NODE'
import {randomBytes, generateKeyPairSync} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'secp384r1'});
const contents = [
  'CYBERNOTE_WORKSPACE_SEED=' + randomBytes(32).toString('base64url'),
  "CYBERNOTE_ENROLLMENT_JWK='" + JSON.stringify(privateKey.export({format:'jwk'})) + "'",
  '',
].join('\n');
writeFileSync('.env.secrets', contents, {flag:'wx', mode:0o600});
NODE
```

不要为修复现有环境而运行生成流程替换原密钥。完成专属 Redis 与 Logto 配置后：

```sh
npm start
```

监听前会等待 Redis ready。另一个终端可请求 `http://127.0.0.1:7400/healthz`；公开部署需反代终止 HTTPS，listener 自身使用 HTTP。CyberNote 配置仍要求 HTTPS public origin，`CYBERGRID_DEV_MODE=1` 不会解除身份／origin 限制，且在 `NODE_ENV=production` 下禁止启用。不要将原生 loopback OAuth 回跳误当成 HTTP 协调服务支持。

SIGTERM／SIGINT 会关闭 Redis store、listener 和现有连接；当前实现不保证所有在途长请求自然排空，不能将它描述为完整 graceful drain。

## 发布前验证

在不继承真实服务凭据的隔离终端／CI 中运行：

```sh
cd services/coordinator
npm ci --include=dev
npm run typecheck
REQUIRE_REDIS=1 npm test
npm run build:vercel
```

Redis fixture 自动启动独立 loopback Redis、随机端口、临时 AOF 目录和独立 namespace。`REDIS_TEST_SERVER` 可指定 Redis 可执行文件；缺少 Redis 时，`REQUIRE_REDIS=1` 会失败，避免将跳过误计通过。重点回归 `account-profile`、`account-enrollment`、`notes-devices`、`redis`、`function-client-ip` 及 Node／Console 路由；改动 Lua 时必须验证真实 Redis 原子性与重启持久性。

这些检查不会证明真实 Logto、生产部署、手机网络或笔记同步；发布后的匿名与认证验证分别执行。测试计数随版本变化，不照搬旧回执的通过数量。

## Vercel 发布

1. 在有权限的平台确认目标是[总览中的既有项目与 team](README.md)，核对当前 production deployment、域名及环境名称，记录可回滚的最后良好版本。不要因本机未 link 就新建同名项目。
2. 核对生产环境变量是否齐备，保持稳定身份与存储配置。本次只发布代码时，不提交 env override，也不轮换 seed／JWK。Preview 另配隔离环境，不能借 production namespace 做调试。
3. 固定一个已提交的完整 Git revision，先通过上节检查，再从该 revision 构造干净部署目录；不要把并行工作区、`.env`、node_modules、原库或 artifacts 一起上传。

从仓库根目录执行以下准备命令，将 `SERVER_REV` 替换为本次已审提交：

```sh
set -euo pipefail
SERVER_REV='REPLACE_WITH_REVIEWED_COMMIT'
deploy_dir="$(mktemp -d /private/tmp/cybernote-server-deploy-XXXXXX)"
git archive --format=tar "$SERVER_REV" \
  api/index.ts api/package.json vercel.json \
  services/coordinator/src services/coordinator/public \
  services/coordinator/notices services/coordinator/release \
  services/coordinator/package.json services/coordinator/package-lock.json \
  services/coordinator/tsconfig.json services/coordinator/LICENSE \
  | tar -xf - -C "$deploy_dir"
```

此处 `mktemp` 语法适用于当前 macOS 开发机。闭包必须包含 **`api/package.json`**：它声明根 Function 的 ESM 与 Node 22 身份，漏掉曾造成 READY 但 500。不要仅上传 `services/coordinator/`，也不要把 Vercel 的 Root Directory 指向它。

4. 在该临时目录用已登录的 Vercel CLI link **既有** `cybernote-sync` 项目，核对 team、project ID 与生产目标后，再执行部署。示例中的团队 slug 从已授权控制台确认；不要拿其他项目的本地 `.vercel` 配置复用：

```sh
cd "$deploy_dir"
vercel link --project cybernote-sync --scope 'REPLACE_WITH_EXISTING_TEAM_SLUG'
vercel deploy --prod
```

CLI 是后续人工操作入口，本轮没有执行或重新验收该 CLI 流程。已归档成功发布使用平台上传／deployment API，源码闭包相同。若使用 API 发布，保留逐文件摘要与完整 source revision，不在日志中保存授权 header 或原始平台响应。

5. 核对[根 vercel.json](../../vercel.json)的配置未被平台项目设置覆盖：根目录、Node 22、region `iad1`、Function `api/index.ts` 的 `maxDuration:30`，以及所有路径重写至 `/api/index`。install 为 `npm --prefix services/coordinator ci --include=dev`；build 为 `npm --prefix services/coordinator run build:vercel`；output 为 `services/coordinator/.vercel-static`，Function 包含 `public` 和 `notices`。
6. 等待 READY 后核对 production 指向、alias 和域名，再做下节烟测。记录实际输入清单／hash、deployment ID 和结果；失败结果不要覆盖。临时 staging 在记录完成且无进程占用后删除，只清理自己这次创建的目录。

Vercel Function 上限为 30 秒；HTTP request budget 为 25 秒，信令长轮询最多 15 秒。笔记与附件传输不在 Function 长请求中运行。`VERCEL=1` 下 IP 限流信任平台覆盖的单个 `x-vercel-forwarded-for`；自托管不要手动设 `VERCEL=1` 去信任客户端可伪造的 header。[可信 IP 实现](../../services/coordinator/src/function-client-ip.ts)拒绝重复、列表或格式错误的地址。

## 发布后检查

以下是匿名只读请求，不使用登录 token；两个正式域名各执行一次。`curl` 默认校验证书，不加 `-k`，不加 `-L`，遇 3xx 应记录并检查，不把跳转后的成功算成原入口成功：

```sh
COORDINATOR_URL='https://cybernote-sync.aixgg.com'
curl --max-time 10 -sS -i "$COORDINATOR_URL/healthz"
curl --max-time 10 -sS -i "$COORDINATOR_URL/api/v1/account/jwks"
curl --max-time 10 -sS -i "$COORDINATOR_URL/api/v1/notes/devices"
```

| 检查 | 预期与解释 |
| --- | --- |
| `/healthz` | 200 + `ok\n`；503 是服务／Redis readiness 问题 |
| `/api/v1/account/jwks` | 200，仅公钥；与发布前 key 指纹一致，除非正在执行独立密钥迁移 |
| `/api/v1/auth/config?appId=<源码 Native CLIENT_ID>` | 200；核对 issuer、resource、client／product、scopes、provider 策略；不要把占位字符串直接当真实 appId |
| 匿名 GET `/api/v1/notes/devices` | 401 `INVALID_IDENTITY`，表明专用路由的匿名拒绝边界；不能证明登录成功 |
| 匿名 POST `/api/v1/notes/devices`；GET `/api/v1/notes/devices/self` | 405 `METHOD_NOT_ALLOWED` |
| notes GET 返回 `INVALID_SESSION` / 404 | 检查旧服务／遗漏账户路由；不应回退为临时 SDK 目录 |

匿名请求通过后，用两个隔离资料库的客户端分别正常登录同一测试账户，验证设备登记、名称、在线／离线与摘要，再显式执行 Push／Pull／Both 并核对正文、格式及附件原字节。不得复制 refresh token 或 Noise 私钥制造第二端。步骤见[双客户端手测](../verification/account110/MANUAL-TESTING.md)。手机 4G↔Wi-Fi 另验匿名中转，必须观察实际路线；目录在线与一次 health 200 都不能证明中转数据传输成功。

## Redis、备份与回滚

通用协调状态会过期；持久目录独立存于 `{prefix}:notes:devices:<partitionHash>`，无 TTL，不由 SDK revoke／GC／临时 epoch reset 删除。每账户产品分区最多 64 台设备，达到上限显式拒绝，不自动驱逐离线设备。离线行保留名称，但隐藏摘要和连接关联；在线租约／transport heartbeat 门槛约 65 秒。精确规则见[登记契约](../../services/coordinator/notes-devices.md)。

生产 Redis 应启用持久化、备份和适当内存容量，并避免逐出 registry keys。仓库 fixture 的 AOF／重启测试不是生产配置已确认的证据。不要通过 FLUSH、删除 namespace、改 prefix 或换 seed 解决“设备不见了”；这些会切换／破坏登记与身份关联。当前 API 没有设备登记接管／删除接口，丢失本机 registry key 后须新 UUID 登记，不能靠同账号覆盖旧 UUID。

正常代码回滚优先切回平台中已记录的兼容良好 deployment，保持环境和存储。新客户端依赖 account110 registry，不要回滚到尚无该 API 的旧服务后宣称兼容。先核对目标的源码、schema、identity pin 和 Redis registration mode；回滚后重新做双域烟测及隔离客户端验证。

灾备恢复同时需要 Redis 数据、workspace seed、enrollment 私钥和原有 Logto／产品／issuer 配置。仅恢复服务代码无法恢复这些数据；仅有旧瞬时 SDK 目录也无法重建永久设备记录。备份频率、保留期、恢复演练与负责人尚需部署管理员确认并留回执。

## 常见故障定位

| 现象 | 首先检查 |
| --- | --- |
| READY 但全站／API 500 | `api/package.json` 是否在精确上传闭包，根目录／Node 22 与静态路径是否正确，再看脱敏 runtime 错误 |
| `/healthz` 503 或启动不监听 | 必需配置校验、Redis 连接／TLS／限额、namespace；健康检查本身不走 Logto |
| 503 `IDENTITY_UNAVAILABLE` | 固定 Logto JWKS 获取网络、超时或非 200；与 token 无效分开处理 |
| 401 `INVALID_IDENTITY` | token 类型、issuer／audience、ES384／有效期、`connect` 及客户端静态策略；匿名请求得到此错误是预期 |
| `APPLICATION_MISMATCH` | Native alias 与 canonical product 声明，误用 SPA token，或服务／客户端 appId 不一致 |
| 429 / `RATE_LIMITED` | `Retry-After`、共享公网 IP 限流、登记／enrollment 配额；不要重试风暴或改角色绕过 |
| 登记 revision／key 冲突 | 本地持久 revision、registry key、SDK session incarnation；保留本地配置，不删除数据库或接管旧 UUID |
| 在线但不能同步 | 在线只代表发现；检查对端收发许可、固定目标／方向、enrollment issuer／公钥、Noise、隧道及应用收据 |
| 4G 与 Wi-Fi 直连超时 | 匿名 provider 是否启动、动态地址／策略、实际 route observation；Vercel health 不代表 tunnel 可用 |
| 登录完成但客户端仍错误 | 分开看账户认证、SDK 网络、设备登记和内容应用阶段；按客户端有限错误码定位，不重新绑定本地库到用户名 |

日志只保留时间、源码／部署标识、路径类别、状态和有限错误码；不要归档 Authorization、cookie、Redis URL、JWK 私钥、grant、原始平台响应或笔记内容。发布记录继续放在 `docs/verification/`，服务长期规则集中维护本目录，避免用历史任务状态代替当前操作手册。
