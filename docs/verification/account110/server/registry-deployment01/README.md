# account110 registry production deployment

2026-11-14（Asia/Shanghai；最终 production 核对 16:58:40）。**最终 deployment READY，双域匿名边界烟测通过。** 首次打包失败及一次未完成的 canonical health fetch 均保留，未覆盖成成功结果。

- 精确 main：`e220111362084d4c72b6d6fe2dada505b97a6df3`。全部 service/API/Vercel runtime 输入与已[独立审阅](../../../../plan/reviews/app-account110-registry-01.md)的 `74d1a891d890cd22fec4c5618a5ef6b247f2db02` 相同，无产品修正。
- 唯一既有项目：`cybernote-sync` / `prj_GxQsPabn6tJgX57KyIATAX5DmX7N`，scope `team_2ljUqxKg8oifxof0IT3yayWz`。部署前正常授权 API 只读核对唯一项目、Node22/root 配置和两个域：均 verified、无 redirect/branch/custom-environment。[预检](preflight.json)与[请求投影](preflight-requests.json)没有凭据。
- 最终 production：`dpl_8Fewyd8o8HHUouDYJDULDd6XSweY`，READY、aliasAssigned=true；[最终项目读取](production-confirmation.json)确认 production 指向此 ID。两个目标域仍为 `cybernote-sync.vercel.app`、`cybernote-sync.aixgg.com`；既有团队 Vercel alias 保留。
- [最小清单](source-manifest.json)：87文件、385,518字节。包含全部 `services/coordinator/{src,public,notices,release}/`，service package/lock/tsconfig/LICENSE，以及 `api/index.ts`、**`api/package.json`**、`vercel.json`。不含主仓库其他产品、tests、node_modules、私有资料或本地配置。逐文件字节均从固定 commit 读取，SHA256/SHA1 入清单；上传前重新校验，不采用可能已前进的工作树字节。
- 路径、长度、内容分帧 SHA256：`93b40a2e1ffaa37a2f5ce1aa2424cd20f5bb4cdebaba121afe61a908836a751f`。部署 metadata 同时绑定此值和完整 source SHA。87次 `/v2/files` 上传与最终创建请求均成功；[投影](attempt02/deploy-requests.json)只保存 method/path/status。[部署请求](attempt02/deployment-request.json)没有 env/projectSettings override。

## Anonymous result

| 请求 | canonical | custom domain |
| --- | --- | --- |
| GET `/healthz` | 200，单次有限 followup | 200 |
| GET `/api/v1/auth/config?appId=<fixed-native-client>` | 200 | 200 |
| GET `/api/v1/account/jwks` | 200 | 200 |
| GET `/api/v1/notes/devices` | 401 `INVALID_IDENTITY` | 401 `INVALID_IDENTITY` |
| POST `/api/v1/notes/devices`（无授权/无 body） | 405 `METHOD_NOT_ALLOWED` | 405 `METHOD_NOT_ALLOWED` |
| GET `/api/v1/notes/devices/self` | 405 `METHOD_NOT_ALLOWED` | 405 `METHOD_NOT_ALLOWED` |

所有公开请求使用 Node 默认 TLS、`redirect:error`、无 Authorization/cookie/bypass。固定 Native appId 从所部署 commit 的原生配置读取，没有用户输入覆盖。仅保留状态、有限 error code、body hash、固定 issuer/client/resource/product/scope 比较 hash 与公开 JWK 身份指纹，不保留全量配置/JWK正文。

[部署前基线](public-before.json)的 notes GET 在两域均为旧 `401 INVALID_SESSION` fallback。最终为专用 `401 INVALID_IDENTITY`，并有上述405边界，证明确已分派新 API。固定配置和公开签名 key 身份在两域均与部署前一致。最终[首轮烟测投影](attempt02/public-after.json)有11项按预期完成，仅 canonical health fetch 未完成；原结果仍为 `passed:false`。随后仅对该 health 做[一次有限 followup](attempt02/health-followup01.json)，200且正文匹配，聚合结论见[result.json](result.json)，不追认第一次 fetch 成功或推测其根因。

## First packaging failure and repair

第一次部署 `dpl_45Yk8kCgg2osRb74XVPuxyj3n3eB` 虽 READY，但 health/API 观察到 HTTP500，另有未完成 fetch。[全部首次有限回执](attempt01/public-after.json)保留，不能当作成功验收。

本 reviewer 首轮最小闭包漏了已提交 `api/package.json` 的73字节 ESM/Node入口配置。补齐该文件后重新部署；第二次相对第一次**仅新增这个文件**，其余86文件和 source commit 完全不变。最终路由与公开配置恢复并通过上述检查。一次有界 runtime-log 读取没有获得诊断；[失败投影](attempt01/runtime-diagnostic01.json)未保存 raw logs，因此不声称取得具体 runtime exception/stack。首轮遗漏属于部署打包问题，不是已审服务端实现修改。

## Scope and remaining acceptance

使用既有授权登录 token，仅进程内存读取并置于 API header；未输出、写 argv、归档 token 或原始 auth/API/project响应。没有创建项目、修改域名、读取/修改环境值、提交 env override，亦未生成/轮换 workspace seed、enrollment signing key 或 issuer/Redis配置。Vercel 按既有配置执行远端构建；本机未安装依赖或做 native build。没有账户 token、登录/注册、内容同步、原库操作或 authenticated registry PUT。

本次关闭部署及匿名 API 门槛；不证明真实账户设备发现、registry authenticated GET/PUT、生产 Redis 持久化/备份或 native 单向传输。公开配置/JWKS连续性不替代带签名 enrollment 的 live issuer/workspace 验证。小型 JSON/清单及本说明由 `SHA256SUMS` 覆盖；源码 staging 和临时控制脚本位于主机 `/private/tmp/account110-registry-deployment-e2201113-0{1,2}/`，没有作为源码发布或复制进此回执。
