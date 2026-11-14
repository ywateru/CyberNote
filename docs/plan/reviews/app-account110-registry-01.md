# account110 registry independent review

2026-11-14（Asia/Shanghai）。结论：**PASS，限精确服务端源码；无 blocking source finding，尚未部署**。

源码 `74d1a891d890cd22fec4c5618a5ef6b247f2db02`，11 文件均在 `services/coordinator/**`。依据设计 `542e2c3c6e7047a53062ba1fa7b906355048dd01` 的 [registryKey/revision 合同](../../architecture/account-device-actions.md)、[任务](../tasks/app-account110-device-actions.md)，独立阅读全部实现、测试、`notes-devices.md` 与作者 receipt；结论不依赖作者测试声明。

## Findings / source assessment

- **无剩余 P1/P2 源码阻断。** `account-config.ts:26` 创建真实 registry handler，并在通用 SDK handler 前分派两条 API 和该路径下的有限 404。Node/Vercel 既有入口复用 `createAccountCoordinator`，无替代 fixture、无旧 transient directory fallback。未知方法先返回 405。部署前必须补齐下述 staging 门槛。
- `notes-devices.ts:68` 复用真实 `verifiedAccount`：固定 issuer/audience/signature/lifetime/scope 与静态 Native policy；owner/product 不取请求字段。SDK session 的当前 Native client 映射在 HTTP 层校验；Lua 在同一事务重新校验 live session、purpose、subject、canonical product、static mode 与 incarnation，再检查 key/revision/quota 和写记录。不能以先前 lookup 绕过事务间撤销。
- `redis-script.ts:125` 起以原 key hash 保护已登记 UUID；同账户另一台有效 session 提交错误 key（包括更高 revision）仍拒绝。旧 revision 拒绝；同 revision 同 digest/session 仅投影旧记录，不续租；异内容/session 冲突。严格较高 revision 才能更新，暂停前旧 PUT 不能恢复 `syncAvailable`。不依赖 session expiresAt 排序。
- raw registry/session key 只在请求处理时参与 hash，传给 Redis 的为 hash、digest 与有限元数据；registry/AOF 写入路径及响应投影不包含 raw key/Bearer。GET 不返回 key hash、session hash、revision 或 incarnation。原生专用公开关联仍须由 native 隐去，不是内容授权替代品。
- 每 verified issuer/subject/product 分区64行，首次 claim、容量检查与写入原子执行；满额可更新，不能淘汰离线设备。持久 hash 无 TTL、不进 transient GC；offline 名称保留，摘要及路由关联变 null。online 同时依赖 Redis TIME、registry lease、确切有效 session/incarnation、SDK heartbeat；续 registry 不能代替 SDK heartbeat，presence 不能证明实际 peer 握手。
- 精确字段/8KiB/UTF-8/UUID/32字节规范 key/name/summary/revision 约束，安全整数最大值的 JSON 与 revision decimal text 保真均已核对。错误只用有限消息。既有 enrollment、issuer/workspace seed/signing key、产品 policy、依赖及通用 SDK 的注册/撤销语义未改变。

## Independent verification

在作者树 `/private/tmp/cybernote-account109-test-audit` 只读运行，前后 HEAD 均为上述 SHA、工作树 clean。短暂建立到既有 `/private/tmp/cybernote-account109-jwks-deps/node_modules` 的 service 依赖 symlink，结束已移除，无安装。进程使用显式最小环境，不继承外部服务/凭据变量。

```text
node node_modules/typescript/bin/tsc --noEmit
exit 0
REDIS_TEST_SERVER=/private/tmp/cybergrid-redis-build/redis-7.4.3/src/redis-server REQUIRE_REDIS=1
node --import tsx --test test/*.test.ts
190 pass, 0 fail/cancel/skip/todo; 179 top-level; exit 0
git diff --check 74d1a891^ 74d1a891
exit 0
```

完整套件包含新增 registry 18 项，不另重复跑同组。独立检查了测试确实启动自有 loopback Redis/AOF fixture，覆盖错误 key/并发首次 claim、revision/重放/暂停、撤销竞态、64配额、offline、AOF restart/handler restart、完整 transient namespace reset 和最大安全整数；并非只检查 mock receipt。Redis 二进制 SHA256 `b44cd92670678e3d4cfe413ef04deb1c91f7aa5bf24638bf9435ddf7d36e59b1`，未修改共享二进制或访问外部 Redis。

有限原始证据保留 `/private/tmp/account110-registry-independent01/`：`service.txt` SHA256 `7592bb5dcb229af49471a1c7546765c92242861fc15b5e347f5d27258c3dbb6b`，空 `typecheck.txt` SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`，`checks.json` 记录 exit/environment。未复制作者证据作为独立结果。

## Deployment gate and limits

**旧 staging 清单不能直接复用。** 只读核对 `/private/tmp/account109-stage-reviewed-jwks.mjs`：它取当前 HEAD 和 `artifacts/account109/server-stage.json` 固定路径表。现有116文件清单不含新 `services/coordinator/src/notes-devices.ts`。后续须从已合入的精确 reviewed main 刷新清单、验证模块/构建输入闭包、记录逐文件 hash 和源码身份，再部署；这是部署准备门槛，不是本提交的源码缺陷。

可复用既有 `vercel.json` → `api/index.ts` → coordinator Function/release scripts。沿用唯一 `cybernote-sync` 项目、既有 production 环境和固定 issuer/workspace seed/enrollment signing key，不新增环境 key。既往[部署回执](../../verification/account109/server/jwks-deployment01/README.md)和[正常登录作用域记录](../../verification/account109/server/custom-domain-live01/README.md)支持复用既有 Vercel auth 渠道；本轮未读取 auth 文件、调用 whoami/API 或验证当前权限，不能把历史权限当成当前权限证明。实际执行前须在正常授权渠道有限核对精确 project/scope，再显式选择原项目，禁止交互创建新项目或复制环境秘密。

此 PASS 不证明线上版本、生产 Redis 持久化策略/备份、真实账户发现、native DTO/方向限制或实际双端传输。旧服务可能返回 404 或 generic `INVALID_SESSION`，客户端仍须按 directory/version failure 处理，不能自动 logout 或恢复旧自动广播；服务端文档诚实列出该兼容边界。未部署、未运行 App/ADB/native build、未读取 grant 或私有资料库。
