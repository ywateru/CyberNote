# account109 服务作者交接

2026-11-13。基于 `737a9dccf4158de4e066db249c13f4c1c9181f9e`，分支
`codex/account109-server`。按最新指示停止扩展，将当前可独立审阅的工作整理提交。
本记录是作者验证，独立审阅及真实部署验收尚未进行。

## 当前实现

- `services/coordinator/` vendor CyberGrid Node 服务 0.2.0，来源冻结为
  `f2a3961536e5c69b13c7dbc661953d9243becbae`。保留真实 Redis/Lua 注册、目录、
  信令、配额、原子状态、进程重启及控制台链；没有用 mock 服务替换主实现。
- `LICENSE` 与上游根权利声明逐字节一致，SHA-256 为
  `8c239b03ee76f4a2e9206e3c5be03c1fbf8dd249026af4c102467498de22431f`。
  41 个 notices 文件、10 个 public 文件全部与冻结源字节一致。
  lockfile 仅修改根包 Node engines 为 `22.x`，依赖版本与 integrity 未变。
- 新增 Bearer `GET /api/v1/account/profile`：真实 jose ES384 验签，固定 issuer、
  resource audience、有效期、client_id、connect 用户 scope、机器 token 拒绝、
  静态 Native 产品允许策略。SPA 和未允许客户端不能读取 profile。
- 成功响应仅含 `schemaVersion:1,subject,issuer,productId,workspaceId`。
  workspace 通过显式 seed 对分域编码的 issuer、subject、canonical product
  HMAC-SHA256 派生 UUIDv8；Native aliases 共享 canonical product。
  必需配置缺失时启动失败，seed 不提供默认值。请求 Host 不参与归属计算。
- 根 `api/index.ts` 使用同一服务；`api/package.json` 选择 Node 22；
  `vercel.json` 指定服务目录内安装/构建、根入口路由、public/notices 包含路径、
  Function 30 秒；内部仍使用上游 25 秒总预算和原 Redis 超时。
  静态路径修正为根 cwd 下的 `services/coordinator/public`。
- 收拢时修复独审 P2：Function 不再把全部用户归到 `vercel-shared`。仅当可信运行
  环境 `VERCEL=1` 时读取 Vercel 覆盖的 `x-vercel-forwarded-for`；要求唯一 raw
  header 与 parsed header 一致，且为严格单个 IPv4/IPv6。重复、多值、缺失、
  域名、端口、zone、空白、畸形地址返回 400。非平台只使用 socket IP，忽略任意
  XFF/Forwarded/x-real-ip。相同公网 IP 仍共享上游限流额度。
  信任前提依据[官方 request headers 说明](https://vercel.com/docs/headers/request-headers)。
  自托管环境不能手动启用该平台标记；额外反代和 Enterprise trusted proxy
  配置不在本次验证范围。
- CyberNote 入口强制静态产品、显式 resource、显式 Redis prefix；不需要 Logto
  Management 凭据。上游 TCP/rediss 适配器源码未修改，证书校验未关闭。

具体配置格式与本地补丁范围见 `services/coordinator/README.md`。

## 已执行检查及其边界

- Node `v22.16.0`，`npm ci --include=dev` 成功。
- `npm run typecheck` 成功，包含根 API adapter 的 TypeScript 检查。
- `npm run build:vercel` 成功：服务 typecheck、上游静态资源构建检查、
  `.vercel-static/robots.txt` 生成均通过。
- 本地官方 `@vercel/build-utils@15.3.0` 对 `api/` 执行版本解析，结果
  `{runtime:"nodejs22.x",major:22}`；核对 `@vercel/node@30.0.0` 构建代码
  确实从入口目录选择 Node。此项只验证版本选择，不等同 Vercel Function 打包或部署。
- 完整回归使用本机 Redis 7.4.3 可执行文件，`REQUIRE_REDIS=1`，每个 fixture
  自建 loopback Redis/临时 namespace。没有连接任何真实 Redis namespace。
  首轮 149 项中 147 通过、2 项失败、0 跳过；失败为未 vendor 的上游根 README
  路径与独立 Node fixture 缺少新增必需配置。调整后完整重跑结果为
  **149/149 通过，0 失败、0 跳过**，总耗时约 50.5 秒。
- P2 修复后再次执行 `npm run build:vercel` 成功；定向执行
  `function-client-ip.test.ts` 和 `account-profile.test.ts`，**6/6 通过**。
  新增两项 IP 测试覆盖平台标记、单值 IP、伪造 forwarded header、重复/异常拒绝，
  并通过实际 `createService` 和 `MemoryStore` 证明两个 IP 各自拥有 10 次认证额度、
  各自第 11 次返回 429。该项没有替换真实服务的限流实现。
- 新增 profile 测试使用真实生成的 ES384 密钥、签名 JWT、jose 本地 JWK
  验证器，覆盖并发一致、跨用户/issuer/product/seed 隔离、Native alias、
  缺 seed、issuer/audience/alg/signature/client/scope/expiry/iat/nbf、
  机器 token、匿名/异常 Authorization、schema、缓存及 method/body/header/query。
  该测试未运行远程 HTTPS JWKS 拉取，也未运行真实托管 Logto。
- 上游真实 Redis 测试覆盖 ES384 与实际 Redis 注册/目录、静态产品隔离、
  原子变更、信令和多进程重启恢复；其他上游单元测试包含显式 fixture/mock。
- 有限静态审计未发现新增私钥块、真实 tenant URL、本机用户绝对路径或带认证
  信息的 Redis URL；未读取、写入或复制真实 secrets。
- 自有代码 `git diff --cached --check` 通过（排除 notices 原文）。完整 whitespace
  检查会报告上游 TypeScript LICENSE 的 CRLF/原始尾空白；为保留许可字节，未改写。

## 尚未完成，不能声称部署或端到端完成

1. profile 与根 Function 入口尚未在真实 HTTPS JWKS/HTTP/Redis 串联环境执行。
   目前 profile 的边界验证使用本地 JWK；上游 Redis 链验证不能替代这一缺口。
2. 本机回归 Redis 使用明文 loopback TCP。仅确认 rediss 代码保留及现有配置测试
   通过，尚未验证 TLS Redis 冷启动、可信证书成功与不可信证书拒绝。
3. 尚未执行完整 Vercel Function 本地打包、真实部署、公开健康及真实认证探测。
4. 未进行真实 Logto 注册/登录/刷新，也未验证 UI、Native、双端同步或 Android。
5. 真实配置由主代理管理；本提交未操作外部 Vercel、Logto、GitHub 或真实 Redis。

本任务提交不修改客户端 src、Rust、根 package/lock 或 `.github`。主代理需要在
独立审阅后继续上述缺口，不能把作者 fixture 结果描述为已部署或真实用户链路通过。
