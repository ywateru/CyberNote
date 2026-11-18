# CyberNote 正式产品 Logto 配置回执

日期：2026-11-18。状态：**Management API 产品增量成功，完整配置读回与预期精确相等；公开 fixture 14 项通过。** 应用登录、真实签发/刷新和多端 Data/SyncService 验收不在此次执行范围。

关联：[原服务调查及架构边界](../../plan/analysis/cyberbus-logto-deployment-20261118.md)。本次沿用 docs-sprint 的证据与连接边界记录方式；用户明确授权受控管理操作，不 spawn，不变更应用源码或全局 sample 脚本。

## 1. 实际变更

通过 `cath-w` 上既有 `logto_admin.Admin` 和受限 `management-credentials.md` 调用 Management API。成功操作时间为 **2026-11-18 19:48:39 Asia/Shanghai（11:48:39 UTC）**。

唯一配置变化是现有 User access-token customizer 的 `environmentVariables.ET_PRODUCTS_JSON` 追加以下产品：

```json
{
  "productId": "cybernote",
  "nativeClientIds": ["il4abzwbu1ohjwv5mb667"]
}
```

原 `cyberbus` 产品及其 Native 数组原样保留。两产品共用既有 resource 和权限，但派生输入包含不同 product ID；公开 fixture 确认同一个测试账户在两个产品中得到不同网络材料，原 cyberbus 结果不变。

应用、回调、resource、scope、角色与测试账户均无修改。两个测试账户已经有 `network:join`；已有一个默认 User role 授予该权限，因此不需要添加角色或重设权限。其他默认角色缺少该 scope 的现状保持不变，避免扩大无关角色权限。

## 2. 准确公共 pins

macOS 的直接 SDK 配置：

```json
{
  "issuer": "https://auth.x.aixgg.com/oidc",
  "client_id": "il4abzwbu1ohjwv5mb667",
  "resource": "https://cyberbus.x.aixgg.com/api",
  "product_id": "cybernote",
  "native_clients": {
    "il4abzwbu1ohjwv5mb667": "cybernote"
  },
  "redirect_uri": "http://127.0.0.1:17897/callback",
  "bootstrap_peers": [
    "tcp://43.155.169.102:11010",
    "udp://43.155.169.102:11010"
  ],
  "listeners": [],
  "offline_access": true,
  "persist_grant": false,
  "enable_p2p": true
}
```

Android 使用相同 pins，显式将 `redirect_uri` 设为 `com.local.notesclone.auth://callback`。所需 scopes 为 `openid profile offline_access network:join`；SDK adapter 申请 scopes，不能把旧 `connect` 当作 `network:join`。

管理 API 读回确认目标应用 `type=Native`，两个原有 callback 均已登记。`oidcClientMetadata` 和 `customClientMetadata` 完整保持原值，没有更改刷新策略或启用其他授权流程。

**两个平台都应显式设置 `redirect_uri`。** 当前 SDK 从 `redirect_uris` 自动选择时仍使用 sample 的 `18765` / `cyberbus://auth/callback` 默认值；仅传旧平台回调数组可能被拒绝。已额外保存带显式平台字段的配置，见第 5 节。

`persist_grant=false` 继续采用内存授权；它不承诺跨进程自动恢复登录。后续若启用持久恢复，由 SDK 和正式存储适配器持有 grant，不由应用另起 token owner。

## 3. 检查与读回证据

### 公开 fixture

先读取实时原脚本和拟追加的 products 数组，再在独立 Node VM 中以公开 fixture root、公开账户上下文执行。真实 root/epoch/seed 不作为 fixture 输入，不输出任何派生材料。

远端宿主没有 Node 可执行文件，首次 fixture 启动报 `FileNotFoundError`，当时尚未修改配置。随后使用运行中 Logto 镜像内的独立 Node 进程执行同一公开测试；未修改容器、未重启服务。

14 项全部通过：原产品输出一致、新 Native 映射 cybernote、跨产品材料不同、同产品确定性、旧配置拒绝新 Native、未知 Native 拒绝、非 Native 拒绝、subject alias 不一致拒绝、user 上下文不一致拒绝、缺少 scope 拒绝、M2M 拒绝、混合 audience 拒绝、重复 client 映射拒绝、旧 `https://cybernote.app/api` audience 行为不变。

这是实际安装脚本的公开材料执行检查，未经过真实 Logto token 签发/刷新管线。

### API 操作与兼容情况

1. 从既有私密凭据取得管理 token，仅驻操作进程内存；所有原始记录存入远端私密目录。
2. GET 目标 Native、应用列表、资源列表及各资源 scopes、全部相关 User role scopes、两个 fixture 用户及其 role 关联，备份原 JWT config。
3. 公开 fixture 通过后，再次 GET JWT config，确认与备份完全相等，防止覆盖已发生的并发变更。
4. 首次 `PATCH /api/configs/jwt-customizer/access-token` 仅提交完整 `environmentVariables`，返回 **400 `guard.invalid_input`**，错误路径为 `script`，expected string / received undefined。随后读回与备份完全一致，证实未应用该请求。
5. 根据既有初始化工具和该安装版本的完整输入要求，改用 `PUT /api/configs/jwt-customizer/access-token`，提交原 `script`、原 `blockIssuanceOnError` 和完整环境，仅 `ET_PRODUCTS_JSON` 有差异。GET 读回与拟更新的完整对象精确相等。
6. 再次 GET 应用、资源、角色、各资源 scopes、User role scopes、fixture 用户角色，逐项与备份比较，均一致。

总计 2 次配置写请求，其中 1 次被拒绝、1 次成功；成功配置更新只有 1 次。没有直接 SQL 写库，也没有执行初始化、通用 verify、服务重启或 root/epoch 轮换脚本。

| 读回不变量 | 结果 |
| --- | --- |
| 完整 JWT config 与预期相等 | true |
| 原 script 字节内容保持 | true |
| 原 `blockIssuanceOnError` 保持 | true |
| `ET_ROOT_KEY_HEX` 保持 | true |
| `ET_CREDENTIAL_EPOCH` 保持 | true |
| 除 `ET_PRODUCTS_JSON` 外全部环境字段保持 | true |
| 原 products 数组元素及顺序保持 | true |
| 追加 cybernote 映射精确一致 | true |
| Native 详情、应用列表保持 | true |
| 全部资源和各资源 scopes 保持，含原 connect 资源 | true |
| 角色、User role scopes、测试用户角色关联保持 | true |

未降低 Native/subject 检查，没有向 SDK 提供管理凭据或网络根秘密。此次仅使正式产品具备签发配置，不代替日志脱敏、token 签发、强制刷新、跨账号拒绝和真实网络数据验收。

## 4. 登录 runner 的输入与限制

callback-only driver 位置（远端）：

```text
/home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/drive-hosted-login.py
```

使用 `--private-dir` 指向 runner 自己新建的 `0700` 目录，其中准备：

- `public-config.json`：本轮 client/resource/product 和 `redirect_uris` 数组；可直接复制第 5 节新建 QA 输入，不能继续使用原 sample public-config。
- `test-account.json`：复用受控 fixture，权限 `0600`；只报告路径，不输出账号或密码。
- 授权 URI 文件、callback 文件：私密 `0600`，不归档内容。授权 URI 必须由实际候选的 CyberBus AuthStart 生成。

调用参数形状如下，路径均由 runner 的私密目录提供：

```text
python3 drive-hosted-login.py
  --private-dir <本轮私密目录>
  --authorization-file <SDK生成的私密授权URI文件>
  --callback-file <私密callback文件>
```

该路径从本轮配置动态校验 client/resource/允许回调，不硬编码 cyberbus client。读取生成的 callback 后由 runner 交给候选原生回跳入口及同一 SDK operation，SDK 独占 PKCE、换票、刷新和授权恢复；没有 token 导入步骤。

**不要使用 `--deliver-loopback`**：原 driver 该模式固定要求 `18765`。原 `deliver-auth-callback.py` 也固定只接受 sample 的 `18765` 和 `cyberbus://auth/callback`，不能用来投递本轮 `17897` / `com.local.notesclone.auth` 回调。callback-file 模式源码检查未见这一限制，无需全局修改 sample 脚本；如 runner 需要投递助手，应在自己的私密范围处理精确新 URI，保持 SDK operation 校验。

本轮没有执行 driver 登录，所述兼容性来自源码检查和新配置输入准备，实际托管交互仍待 runner 验证。

## 5. 私密备份、回滚输入与 QA 路径

以下路径均在 **cath-w**。此次独立操作目录：

```text
/home/water/work/codex-work/logto/.cybernote-product-20261118T113336Z/
```

目录及子目录权限均为 `0700`，检查到的所有文件均为 `0600`。

| 相对文件 / 目录 | 用途 |
| --- | --- |
| `before-jwt.json`、`rollback-jwt-put.json` | 完整原 JWT config，实际可用的完整 PUT 回滚输入 |
| `rollback-jwt-patch.json` | 保存的原环境映射；本版本仅环境 PATCH 已被拒绝，因此不要直接用它执行回滚 |
| `proposed-jwt-put.json`、`after-jwt.json` | 拟更新及实际读回；包含私密环境，不打印或提交仓库 |
| `before-native.json`、`before-applications.json` | 原应用详情及列表 |
| `before-resources.json`、`before-all-resource-scopes.json` | 所有资源和 scopes，包含旧 connect 配置 |
| `before-roles.json`、`before-role-scopes.json`、`before-test-users.json` | 原角色、权限和测试账户关联；其中账户记录属于私密内容 |
| `management-openapi.json` | 实际版本的管理 API schema |
| `fixture-runner.cjs`、`fixture-results.json` | 公开材料 fixture 及 14 项结果 |
| `patch-rejection-private.json` | 被拒绝的首次 PATCH 原始错误，仅私密留存 |
| `post-update-checks.json`、`receipt-redacted.json` | 布尔读回结果和脱敏回执 |
| `cybernote-public-config.json` | 公共共享 manifest，含允许回调数组 |
| `cybernote-public-config-macos.json` | 显式设置 `redirect_uri=17897/callback` 的 macOS 配置 |
| `cybernote-public-config-android.json` | 显式设置 Android 原 URI 的配置 |
| `qa-primary/public-config.json`、`qa-primary/test-account.json` | 本轮配置 + 复用原主测试账户的 driver 输入 |
| `qa-secondary/public-config.json`、`qa-secondary/test-account.json` | 本轮配置 + 复用原注册 fixture 的 driver 输入 |

原 fixture 来源未改动：

```text
/home/water/work/codex-work/logto/.cyberbus-deploy-001/test-account.json
/home/water/work/codex-work/logto/.cyberbus-deploy-001/registration-account.json
```

回滚尚未执行。若后续确需恢复，先通过已有 Admin helper GET 当前 config，与 `after-jwt.json` 完整比较；若发生并发变更则停止覆盖并合并审阅。确认仍为本轮状态后，使用 `rollback-jwt-put.json` 对同一路径 PUT，再 GET 验证完整原配置。回滚不重建 root/epoch，也不调用原初始化脚本；它会移除 cybernote 映射，应先停止该产品的新登录测试。已签发 token 和已建立旧网络不会因回滚自动消失，不能据此声称实时撤销。

## 6. 执行范围

SSH 使用 BatchMode、ConnectTimeout=8、UpdateHostKeys=no；每阶段远端 `timeout` 为 10–65 秒、本机 subprocess 上限为 20–75 秒，工具异步返回以保留进度。既有 helper 的 token 请求上限 30 秒、管理 API 请求上限 40 秒；没有在异常后盲目重试写请求，先读回确认实际状态。

执行内容是管理配置增量、私密备份、公开 fixture 和读回比较。没有运行笔记应用、修改应用源码/全局 sample 脚本、重启 Logto/relay、SQL 写库、创建用户、改密、重设角色权限或进行真实账户多端业务测试。
