# `cybernote-sync.aixgg.com` 正式传输别名提案（未应用）

本提案准备一次受控的 coordinator transport 增补。目标是让未来指定 Android candidate 通过正式域名访问现有 coordinator，让现有桌面继续访问旧域并验证相同 enrollment issuer。它不迁移 Logto、不替换服务器、不引入转发服务，也不把匿名 peer Quick Tunnel 当作 bootstrap 修复。4G 能否通过新域名成功连接仍待实际验证。

## 精确绑定

| 输入 | 旧桌面 | 拟议 Android | 服务端要求 |
| --- | --- | --- | --- |
| coordinator transport origin | `https://cybernote-sync.vercel.app` | `https://cybernote-sync.aixgg.com` | 两个域名绑定同一项目、同一 production 环境；无跨域重定向 |
| enrollment JWT issuer | `https://cybernote-sync.vercel.app` | **仍为旧值** | `CYBERGRID_PUBLIC_ORIGIN` 保持旧值 |
| Logto issuer | `https://auth.x.aixgg.com/oidc` | 相同 | `LOGTO_ISSUER` 保持原配置 |
| OAuth resource | `https://cybernote.app/api` | 相同 | 显式 `LOGTO_RESOURCE` 保持原配置 |
| native client/product、subject、workspace 推导 | 原绑定 | 同一真实账户/产品规则 | 产品策略、workspace seed、enrollment signer、Redis 实例/namespace、coordination 状态保持原配置 |
| native OAuth callback | 原平台固定回调 | 原 Android 固定回调 | 不增改 Logto 回调或 console 回调配置 |

enrollment issuer 与 Logto issuer 是两个不同身份标识。不得把其中任一个替换为 alias，不做多个 issuer 宽松接受，不从 JWT `iss`、`jku`、`x5u`、请求 Host 或 peer 内容选择验证信任。

## 源码核对与最小后续改动

以下行号对应 [source-inputs.json](source-inputs.json) 的基线，均为只读结论。

1. `src-tauri/src/account/config.rs:2` 固定 Logto issuer/client/resource 和平台回调；`:9` 的 `origin()` 当前返回旧 coordinator。`src-tauri/src/account/mod.rs:264` 获取它，`:269` 传给 SDK `Config.base_url`，`:304` 又传给 `Enrollment::new`；账户 profile 绑定阶段另在同文件 `:202` 构造 Enrollment。后续最小改动应为两个明确固定输入：transport origin 与 enrollment issuer，并覆盖这两个真实构造入口。拟议仅 Android candidate 改 transport，桌面保持旧 transport；不提供渲染层、任意环境 URL 或自动故障切换入口。
2. `src-tauri/src/account/enrollment.rs:62` 只有一个 `origin` 字段，`:105`、`:127`、`:155` 分别用其请求 profile、enrollment、JWKS；`:159` 将它作为 proof issuer；`:190` 与 `:197` 严格检查 issuer。因此**只把 origin 换成 alias 会拒绝服务端仍签发旧 issuer 的 proof**。最小设计是分开存储两个经过严格 canonical HTTPS 检查的固定 origin，请求仅用 transport，JWT 验证只用固定旧 enrollment issuer。保留 redirect none（`:71`）、ES384/kid/JWKS、audience、subject、account issuer、product、workspace、purpose、时间和 Noise/device 校验（`:175` 起），以及所有现有错误 stage。所有 peer proof 与恢复仍通过相同验证器，不加入旧/新 issuer 自动探测。
3. SDK 已支持独立 transport：`vendor/cybergrid-sdk/src/types.rs:111` 验证 `base_url` HTTPS/无凭据、query、fragment；产品仍应坚持更严格的 root-only canonical origin。`auth.rs:361` 从 base_url 获取配置；`:172` 起将 OAuth endpoint 约束在 **Logto issuer origin**，没有要求它等于 coordinator。`client.rs:634` 使用 base_url 发协调请求，`:146` 禁止重定向；`:753` 交给 provider 的身份参数仍为固定 issuer/client/resource。产品 `src-tauri/src/account/mod.rs:285` 与 `provider.rs:16` 继续严格核对这些参数。预计不需要 SDK 协议改动，但必须有后续回归证明。
4. SDK 独立文件凭据确实绑定 server：`vendor/cybergrid-sdk/src/credentials.rs:33` 至 `:40` 要求保存的 `server == cfg.base_url`。不能宣称所有 SDK 凭据可透明跨域，也不能复制或改写 grant。产品当前走 `src-tauri/src/account/transport.rs:164` 的 `login_with_auth_provider`；provider 的 refresh 所有权保持在原生 AuthClient，非该 SDK CredentialStore。后续回归必须覆盖实际原生 restore/re-login，不调用 SDK 独立凭据导入来绕过绑定。
5. 服务端 `services/coordinator/src/account-config.ts:18`、`:23` 将固定 PUBLIC_ORIGIN 传入 signer；`account-enrollment.ts:68` 用 `options.origin` 写 JWT `iss`。`account-profile.ts:23` 至 `:29` 仅按 seed/Logto issuer/subject/product 推导 workspace，不按 transport host。故同一部署保留原 key、seed 和 namespace 时可保持跨旧/新 transport 身份兼容；不能重新部署另一套空状态服务来代替 alias。
6. Vercel 路径的重要细节：`services/coordinator/src/function.ts:14` 至 `:16` 把固定 PUBLIC_ORIGIN 传给 `serveAPI`；`http.ts:93` 至 `:94` 在已配置时直接选它，再在 `:67` 构造内部 Request。因此 alias 的外部 TLS/Host 不会改变内部 `request.url.origin`。`service.ts:58`、`deployment-config.ts:34` 的 console callback 同源检查仍看见旧 canonical origin，**当前 Vercel adapter 下没有必须放宽它的证据**。直接调用裸 handler 并传 alias URL 则可能得到 `INVALID_CONSOLE_REDIRECT_URI`，后续测试须覆盖真实 function/HTTP adapter 边界，不能只测裸 handler。若未来取消 canonical 请求构造，需重新评估。
7. 这是 Rust native 请求，不是 alias 网页 console 迁移。`services/coordinator/src/console-cors.ts:25` 起的跨域限制继续有效；不要给所有 native API 开 CORS。SDK/Enrollment 原生请求未设置浏览器 Origin，后续需验证这一路径。alias 网页 console 登录不在本方案验收范围内。

这些源码论据支持**有条件兼容**，不是当前线上 alias 已可用的结论。本轮没有读取服务器环境变量或将当前 source HEAD 等同线上部署 SHA。

## 准备好的执行顺序（均未执行）

1. **负责人确认。** 确认 `aixgg.com` DNS 管理者、该精确子域的使用权、是否有既有用途/记录，以及现有 Vercel 项目的管理授权。核准将该主机作为带 bearer/session 请求的正式接收方。先核对项目，不通过新项目、代理或 IP pin 改变接收方。
2. **绑定同一项目。** 获授权后，将该精确域名绑定到 `cybernote-sync` 的 production，模式为 alias，redirect=null，非 preview/branch。记录绑定响应和准确 ownership challenge；如果分配冲突或需要额外证明则停止，不能从当前 GET 404 推断全局可自由占用。
3. **DNS 变更草案。** 在 `aixgg.com` zone 创建主机名 `cybernote-sync` 的 CNAME，当前推荐目标 `cname.vercel-dns.com.`，TTL 使用负责人批准的值。实际写入前重新读取推荐值；若 Vercel 给出项目专属目标，以当次确认结果为准。初次验证建议使用普通 DNS 解析模式，避免额外代理层；不得改变现有 DNS 记录而未先确认冲突。所需 TXT ownership 验证仅使用绑定时 Vercel 给出的精确名称和值，当前没有该挑战值，不能编造。推荐 A 不用于客户端 pin，也不与子域 CNAME 并设。
4. **先匿名确认域名。** 配置完成并另获运行授权后，验证权威/公开解析、TLS 主机名及证书、Vercel verified/正确项目 production/无重定向；只对固定 `/healthz`、`/api/v1/auth/config?appId=<现有固定 native client>`、`/api/v1/account/jwks` 做无凭据检查。核对 JSON 中固定身份/策略与 key 身份一致。需核对实际 function adapter、公开 API 与既有保护策略的行为；不关闭防护或加 bypass header。此阶段不发送账户 token。
5. **客户端补齐最小变更及独立审阅。** 在分支拆分上述两个固定输入，仅拟议 Android transport 使用新域。保留旧桌面行为、严格 proof 验证、native grant owner 和 session 恢复规则。此步骤尚未获实现任务，本归档不修改任何代码。精确新 source/binary 身份和 manifest 由后续流程记录，不沿用旧二进制来声称新 transport 已生效。
6. **通过离线回归后有界 4G 验证。** 首先在手机默认 CELLULAR 上进行获授权的匿名 native 检查。若仍不可达，记录有限 DNS/connect/TLS/status 阶段后停止，不无限重试同 GET。匿名路径通过且正式接收方获批后，才允许指定隔离 candidate 的真实账户登录、enrollment、旧桌面与新手机双向正文/附件校验及恢复测试；无手工配对、token 注入、反向转发或原 store 重置。peer Quick Tunnel 验收另行记录，不能用它替代 bootstrap 成功。

## 必需验证缺口与退出条件

本轮只阅读已有测试，没有运行它们。`services/coordinator/test/origin.test.ts:30`、`:49` 已描述 configured canonical origin 覆盖 Host/forwarded host；`account-enrollment.test.ts:48` 至 `:49` 已描述请求 authority 不选择 JWT issuer。它们尚不等于拟议 alias 的完整 Vercel adapter 与两端回归。

后续最小测试集：

- 新 transport/旧固定 enrollment issuer 的签名 fixture 成功；旧桌面 verifier 接受同一旧 issuer 的新手机 proof；反方向同样成功。
- 即使签名 key 相同，也拒绝 alias `iss`、其他 `iss`、错 key/audience/owner/product/workspace/purpose/时限；不访问 JWT 指定的额外 key URL，不跟随重定向。
- profile、enrollment、JWKS、auth config、注册/heartbeat/discovery/logout/recovery 全部使用各自固定 transport；身份参数和 provider owner 不随 host 改变。两个 Enrollment 入口均覆盖。
- 原生 AuthProvider restore/re-login 跨升级回归；独立 SDK CredentialStore 的 server mismatch 仍拒绝且保留旧文件。
- 经真实 HTTP/function adapter 注入 alias Host 的无凭据测试仍返回旧固定身份/回调配置，绝不要求放宽 Origin、issuer、TLS 或产品策略。
- 正式配置完成后才执行真实 4G 匿名路径与获批真实账户验证；不能用主机 200、Vercel READY、domain verified 或 tunnel-ready 替代手机数据同步通过。

任何域名归属/项目/TLS/身份不一致时，停止向 alias 发送认证请求。上线阶段如失败，停止该 candidate 的 alias 尝试，保留日志有限类别和用户数据；旧桌面继续使用旧域。未验证前不删除旧域、签名 key、namespace 或既有凭据。若手机旧路径仍失败，回退只能恢复原配置，不能声称已实现 4G 可用。撤销新增 DNS/绑定属于后续外部写，需按实际授权与记录操作，不由本提案执行。

## 尚缺的负责人输入与授权

- `aixgg.com` 的实际 DNS 管理者、zone 权限、`cybernote-sync` 的记录/用途冲突确认及允许的 TTL/代理策略；同根 Logto 主机不能代替这些输入。
- 把精确主机绑定至现有 Vercel production 的授权及必要域名 ownership challenge 响应。GET config 尚未产生可执行的 TXT 验证值。
- 后续客户端最小变更任务与审阅，以及将新 host 作为正式 bearer/session 接收方、进行有界真实 4G 检查的明确授权。此提案尚未改变任何 token 目的地。

当前可做的只读元数据查询、源码兼容性核对、DNS 记录草案、阶段门槛和回退准备已完成。没有创建资源或发起 DNS 写请求。
