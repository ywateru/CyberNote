# 多网盘登录与同步调研及改进方案

调研日期 2026-11-21。设计已实施并通过本地 fixture 与构建检查，待真实账号登录、真实上传路径和并发验收。CyberNote 源码基线为 `main` 上的 `efcf826b6015be3787db43d16369c0aac8565d2a`（`0.2.6`），本轮实现随 `0.2.7` 发布。

## 结论

- **首批接入 OneDrive 和百度网盘，授权采用 OpenList 兼容 OAuth。** 不申请 CyberNote 自己的厂商开放平台应用，不要求用户填写 client secret。用户点「连接网盘」后，在应用内受控 WebView 登录厂商账号，回调取得 refresh token，再由 CyberNote 验证账号、读取容量并保存连接。[OpenList APIPages](https://github.com/OpenListTeam/OpenList-APIPages) · [OneDrive 授权源码](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/driver/onedrive_oa.ts) · [百度授权源码](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/driver/baiduyun_oa.ts)
- **OneDrive 个人版承担首批双向同步，工作／学校版先完成连接与读取。** 个人版使用显式上传会话，分片完成后向父路径 `PUT` 新 driveItem，body 的 `@microsoft.graph.sourceUrl` 指向 upload session URL；创建用 `conflictBehavior: fail` 加候选 `If-None-Match: *`，更新用 `replace` 加 `If-Match`。工作／学校版的文档化完成方式是向 upload URL 发零长度 `POST`，最终提交条件尚无同等级依据；真实账号并发实测通过前不开放自动双向。最终提交是并发裁决点，不能只在会话创建时检查 ETag。[Graph 上传会话](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
- **百度网盘登录后默认提供多设备读写。** 百度没有可用的内容版本条件提交；`server_mtime` 粒度不足，OpenList 也把返回的 MD5 标为不可信。单对象覆盖会造成多设备静默丢笔记，因此改用不可变 heads：每台设备写自己的新 head，读取时取每个 writer 的最新 head（下载、大小校验或解密失败时回退上一份）、解密合并，再写合并后的新 head。`ReadOnly` 和 `SingleWriter` 仍保留；真实多设备并发和 `/CyberNote` 写入路径仍待账号验收。[OpenList 百度驱动](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/drivers/baidu_netdisk/util.go) · [百度网盘开放平台](https://pan.baidu.com/union/document/entrance)
- **百度登录页“只有标题、没有输入框”的根因是 macOS 内容规则多转义。** `cloudRules` 的通配 host 正则经过 `NSJSONSerialization` 后多出一层反斜杠，`openapi.baidu.com` 的精确规则仍能放行主页面，但 `passport.baidu.com`、`ppui-static-pc.cdn.bcebos.com` 等登录组件资源被拦截，`#psLogin` 无法渲染。已改为 `NSRegularExpression.escapedPatternForString:`，并用同一组规则在 WKWebView 离屏验证：百度登录区域生成 21 个输入控件。随后在本地 macOS 应用中复验，登录窗口实际显示账号、密码和“登录并授权”按钮，账号框可聚焦并成功输入测试值；没有提交真实账号登录。真实账号登录仍需按验收步骤执行。
- **保留现有 WebDAV、S3、GitHub。** 新网盘与 CyberBus 账户、设备授权、Store 身份和保存队列保持分离。任何授权失败都不能删除本机笔记、远端密文或既有连接配置。
- **这是一条兼容授权桥，不是 CyberNote 自有 OAuth 应用。** 用户在厂商页面授权的是 OpenList 的应用；OneDrive 权限为 `Files.ReadWrite.All`，百度为 `basic,netdisk`；OpenList 服务在换票和续期时会接触 refresh token。界面必须在打开登录前明确说明。若 OpenList 服务停止或调整接口，受影响的网盘连接需要迁移到自有应用或暂停。

## 实现落点（2026-11-21）

| 层 | 实现 | 当前边界 |
| --- | --- | --- |
| 受控登录窗口 | `plugins/tauri-plugin-notes-auth` 新增原生 `openCloud`／`closeCloud`；macOS 使用 `WKWebsiteDataStore.nonPersistentDataStore`，在加载前逐条等待 `WKHTTPCookieStore.setCookie`；Android 使用进程级 `CookieManager`，串行登录并在结束清理 `driver_txt`／`server_use`。 | 只接受原生构造的 host 白名单、固定 callback 前缀和两个 auth-state Cookie；无 JS bridge、下载、文件选择、媒体采集、任意新窗口或客户端证书。 |
| OpenList 客户端 | `src-tauri/src/cloud_sync/auth/openlist.rs` | `/requests` 不跟随重定向、只接受 HTTPS／JSON／固定 issuer；只提取 `driver_txt`／`server_use`；`/#base64` 在主框架提交前拦截；`renewapi` 单飞刷新；错误固定为 `authentication`／`network`／`timeout`／`invalid`。 |
| 凭据 | `src-tauri/src/cloud_sync/auth/vault.rs` | 独立 `.cloud-sync/credentials.enc`，设备随机密钥 `credentials.key`（0600）加密；原子写入、字节 CAS、损坏拒绝覆盖。配置只保存 `credentialId`，令牌不进入 renderer、日志、备份或云快照。 |
| 连接状态 | `runtime.rs`／`commands.rs` | `beginConnect`、`connectStatus`、`connectionInfo`（可指定 provider）、`disconnect`、`cancelConnect`；登录 attempt 只允许一个，先预留 attempt 再释放状态锁执行 `/requests`，失败立即退休；窗口/会话/Store 代次在开始和完成时重验。原生失败会保留可重试错误并关闭窗口；连接成功不自动启用内容传输。 |
| OneDrive | `src-tauri/src/cloud_sync/remote/onedrive.rs` | 个人版 `deferCommit` 上传会话，最终 `PUT` 带 `If-Match`／`If-None-Match: *`；写入能力要求 `driveType=personal`，工作／学校版保留零长度 `POST` 实现但连接模式固定为只读，避免在最终条件未实测前自动双向。 |
| 百度网盘 | `src-tauri/src/cloud_sync/remote/baidu.rs` | 当前固定 `/CyberNote/heads/` 不可变 head；文件名含 `writer_id`、单调 `seq`、随机后缀；默认 `TwoWay` 多设备读写，读取每个 writer 的最新 head，下载、大小校验或解密失败时回退上一份，解密后合并；只读和显式单写者仍可选，重连沿用原 `writer_id`；`create`／`precreate` 使用 `rtype=3` 与 MD5 元数据；不覆盖旧对象，不把唯一路径当 CAS。真实根路径写入待账号验收。 |
| 设置 UI | `src/cloud-sync/CloudSyncSettings.tsx` | 服务下拉、OneDrive 账号类型、百度多设备读写／只读／单写者、授权信任说明、单一进度面、取消、账号/位置/容量/能力、查看详情、重新连接、断开。 |

### 手动登录验收步骤

1. 在 macOS 开发机打开最新本地构建 `src-tauri/target/debug/bundle/macos/CyberNote.app`，或退出已有实例后运行 `pnpm mac:dev`；打开「设置 › 账户与同步」。若默认数据目录被占用，可用 `open -n … --args --data-dir /tmp/cybernote-cloud-manual` 隔离启动（macOS 14+）。
2. 在「同步到」选择 OneDrive 或百度网盘；OneDrive 先选个人版／工作或学校版，百度默认「多设备读写」，也可改选只读／单写者。
3. 点「连接…」，阅读授权对象、权限和 OpenList 接触刷新令牌的说明，确认后在内置窗口完成厂商登录。
4. 成功后确认账号、同步位置、容量和能力标签；点「查看详情」重新读取当前展示网盘的账号／配额；测试取消、关闭窗口、网络失败后重试、「重新连接」和「断开连接」。
5. 输入至少 8 位加密口令，先「预览」；配置预览通过后点「保存并继续预览」，再确认同步。百度多设备读写会创建新 head 并在下次读取时合并其他设备；只读不写入；单写者只允许当前设备创建新 head。OneDrive 工作／学校版当前只连接与读取。

本轮已在本地 macOS `.app` 中确认百度登录窗口显示账号、密码和授权按钮，账号框可聚焦并输入测试值；没有提交真实账号。真实账号完成换票、`uinfo`／quota 读取、head 上传和双设备合并仍需按验证页执行。

自动化已覆盖：OAuth callback 的 driver／refresh token／host 校验、`/requests` Cookie 提取与 `/renewapi`、缓存 token 被拒后的强制刷新、凭据加密往返与损坏拒绝、`connectionInfo` provider 绑定、能力保守降级、失败 attempt 退休、百度单写者重连保持 writer、百度 head 解析与分块 MD5、百度建目录／预上传／分片／下载、外域重定向拒绝、百度每 writer 最新 head 选择、最新 head 解密失败回退与多 head bundle 合并，以及 OneDrive 最终提交旧 ETag 拒绝。cloud harness 的 `cloud_sync` 过滤集与新增合并测试通过；全量结果以本轮验证页为准。真实厂商登录、OneDrive 最终提交并发、百度真实上传和多设备并发仍需用合成笔记在准确构建上验收；本地 fixture 不能替代这些事实。

## 当前云同步链路

设置的「账户与同步」挂载 `CloudSyncSettings`，通过 `settings_host_context` 取得受检窗口／会话上下文，再调用 `cloud_sync_command`。原生命令核对窗口身份，唯一的 `CloudRuntime` 读取配置、处理测试和预览、调度同步。现有 WebDAV、S3、GitHub 分别使用本机 `0600` 配置中保存的基本认证、SigV4 凭据和仓库令牌，只有选中并启用的一项运行。云存储授权独立于 CyberBus 的账户及设备授权。[App 接线](../../src/App.tsx) · [原生命令](../../src-tauri/src/cloud_sync/commands.rs) · [运行时](../../src-tauri/src/cloud_sync/runtime.rs)

`Remote::get` 获取密文和对应的远端版本，`Remote::put` 使用 ETag 或 GitHub blob SHA 条件提交，包括首次创建。运行时重验预览、云空间 UUID 和本机库代次，捕获并合并快照，保护本机版本，再提交远端并通过原有 Session 和 Store 应用结果。附件和可移植设置走原有校验与事务。自动同步复用同一入口，默认关闭。新增网盘沿用这些边界和现有预算，密文 48 MiB、解密 JSON 32 MiB、单附件 16 MiB。[HTTP 实现](../../src-tauri/src/cloud_sync/protocol.rs) · [云同步模块契约](../../src-tauri/src/cloud_sync/README.md) · [宿主接线](../../src-tauri/src/settings_host/README.md)

## 开源候选与维护状态

版本取上游 GitHub API 返回的最新正式 Release，日期按 UTC+8。判断持续维护同时看近期正式发布、代码活动和具体驱动。项目表中的覆盖表示上游宣称或源码列出的访问能力，生产接入还需按账号类型、权限和写入语义验证。

| 项目 | 维护快照和许可证 | 覆盖与授权 | CyberNote 用法 |
| --- | --- | --- | --- |
| **OpenList** | AGPL-3.0，[v4.2.10，11-19](https://github.com/OpenListTeam/OpenList/releases/tag/v4.2.10) | AList 社区分支。国内驱动含阿里云盘、百度、115、123、夸克、天翼、中国移动云盘等，也有海外驱动。OneDrive 和百度驱动默认使用在线续期接口，源码中的 `UseOnlineAPI` 默认为 `true`。 | 首批 OneDrive／百度连接的授权与续期参考。自建 OpenList 的常规 WebDAV `PUT` 仍将 `If-Match`／`If-None-Match` 标为待实现，不能替代网盘自身的条件写入。[驱动文档](https://doc.oplist.org/guide/drivers) · [OneDrive 驱动](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/drivers/onedrive/util.go) · [百度驱动](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/drivers/baidu_netdisk/util.go) |
| **OpenList APIPages** | 仓库 `LICENSE` 为 AGPL-3.0，README 徽章标 MIT，存在不一致；[v4.1.0，2025-07-31](https://github.com/OpenListTeam/OpenList-APIPages/releases/tag/v4.1.0)，仓库在 2026-10-18 仍有推送。 | 提供 `/requests`、`/callback`、`/renewapi`，用 OpenList 内置应用完成 OneDrive、百度等网盘的授权和续期。 | 作为首批托管授权桥，只通过 HTTPS API 调用，不复制其代码。服务可用性、条款、许可证和令牌可见性是接入风险。自建需要自己的厂商应用凭据并审查 AGPL，不能当作“免申请应用”的替代。[README](https://github.com/OpenListTeam/OpenList-APIPages) · [源码路由](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/index.ts) |
| **rclone** | MIT，[v1.76.0，11-07](https://github.com/rclone/rclone/releases/tag/v1.76.0) | Dropbox、OneDrive、Google Drive、Box、pCloud、MEGA、iCloud Drive、Proton Drive、PikPak、Huawei Drive 等。部分后端有浏览器授权，账号认证方式和质量由驱动决定。 | 覆盖面和授权流程参考。通用文件操作没有已确认的跨驱动原子条件写契约；`librclone` 为实验性 Go/cgo RPC 封装，Android 打包、凭据归属和进程生命周期需另评估。[服务表](https://rclone.org/overview/) · [后端分级](https://rclone.org/tiers/) · [librclone](https://github.com/rclone/rclone/blob/v1.76.0/librclone/README.md) |
| **Apache OpenDAL** | Apache-2.0，[v0.59.5，10-18](https://github.com/apache/opendal/releases/tag/v0.59.5) | 原生 Rust，列出 Dropbox、OneDrive、Google Drive、阿里云盘、Seafile、WebDAV、S3 等。服务接受已取得的凭据，部分驱动支持换取 access token。 | 在满足接口的服务上按 `services-*` 特性择用。此版本 Dropbox、Google Drive 和阿里云盘未声明原生条件写入；OneDrive 声明 `write_with_if_match`，但最终提交语义仍以 Graph 文档和并发实测为准。[服务表](https://nightlies.apache.org/opendal/opendal-docs-release-v0.59.5/services/) · [OneDrive](https://github.com/apache/opendal/blob/v0.59.5/core/services/onedrive/src/core.rs) |
| **AList** | AGPL-3.0，[v3.66.0，10-21](https://github.com/AlistGo/alist/releases/tag/v3.66.0) | 与 OpenList 有大量重叠驱动，仍在发布。支持 WebDAV 及网盘挂载，各驱动的授权依赖不同。 | 对照 OpenList 的驱动变动与兼容性，维护一套聚合工具研究即可。[驱动文档](https://alistgo.com/zh/guide/drivers/) |
| **Joplin** | [v3.7.24，11-20](https://github.com/laurent22/joplin/releases/tag/v3.7.24) | 活跃的开源笔记应用。Dropbox、OneDrive 授权后使用应用目录，另支持 WebDAV、Nextcloud、S3 等。 | 参考设置与授权体验。同步协议和数据归属是 Joplin 自身契约，代码复用前按对应包核对许可证。[用户指南](https://joplinapp.org/help/apps/sync/) · [同步规格](https://joplinapp.org/help/dev/spec/sync/) |

**不申请厂商开放平台应用的原因。** 首批目标是尽快验证“点登录、拿凭证、看信息、同步”的完整产品路径。OpenList APIPages 已维护 OneDrive 和百度的应用注册、回调与换票，CyberNote 只需实现受控授权窗口和 token 续期。代价是授权对象不是 CyberNote，权限范围不能由我们收窄，OpenList 服务也会接触 refresh token。因此本方案是**兼容桥**，不是长期唯一的授权所有者；一旦服务不可用或条款变化，必须能迁移到自有应用或停用受影响网盘。

**登录后可读写的备选方案。** 评估重点不是“能否挂载”，而是登录后能否安全地创建、更新和读取应用自己的密文，以及失败时是否会静默覆盖。当前实现选择第一条；其余方案保留为迁移或扩展候选，未验收前不显示为可用。

| 方案 | 登录方式 | 读写路径 | 结论 |
| --- | --- | --- | --- |
| OpenList APIPages + 直连厂商 API | WebView 登录 OpenList 内置应用，回调取得 refresh token | OneDrive Graph；百度 xpan；百度使用不可变 heads | 当前方案。无需 CyberNote 自有应用，能同时读写；但 OpenList 接触 refresh token，接口没有可验证 state／PKCE，不能当成长期唯一授权所有者。 |
| 厂商官方 OAuth + CyberNote 自有应用 | state／PKCE，受控 WebView | 同一厂商 API | 长期推荐。权限、回调、应用目录和撤销都由 CyberNote 控制；需要注册、审核、维护 client secret／回调，不能用于当前“先跑通”阶段。 |
| 自建 OpenList + WebDAV | OpenList 登录 | 现有 WebDAV 适配器 | 可覆盖更多国内网盘，复用现有同步；但 OpenList WebDAV 没有完整条件写，服务部署、升级和 refresh token 保管由用户承担。适合高级用户，不作为默认体验。 |
| rclone／librclone | 部分后端支持浏览器 OAuth | 通用文件操作 | 覆盖广，部分后端可读写；librclone 是实验性 Go/cgo 封装，Android 打包、凭据归属、进程生命周期和跨驱动条件写不适合直接嵌入。只作调研和迁移参考。 |
| Apache OpenDAL | 由外部取得凭据 | 原生 Rust 服务接口 | 适合逐个服务评估，尤其是已有凭据和对象存储；不是现成登录方案，Dropbox／Google Drive／阿里云盘等驱动的条件写能力需逐项核实。 |
| 百度官方 `bdpan` CLI／Skill | 浏览器或 OOB 授权码 | 固定 `/apps/bdpan/` | 百度维护，适合百度单服务；依赖外部 CLI、当前为公测能力，不能嵌入应用内统一登录和跨网盘体验。 |

## OpenList 兼容授权契约

以下参数以 `OpenList-APIPages` 源码为准；README 中的 `apps_types` 与实际 `renewapi` 路由不一致，实施和测试使用 `driver_txt`。CyberNote 直接调用 APIPages，不复用 OpenList 驱动的在线续期路径：该路径在 OneDrive 驱动中把 `driver_txt` 固定为 `onedrive_pr`，不能用于 `onedrive_go`。

| 用途 | OneDrive | 百度网盘 |
| --- | --- | --- |
| 登录申请 | `GET https://api.oplist.org/onedrive/requests?server_use=true&driver_txt=onedrive_pr` | `GET https://api.oplist.org/baiduyun/requests?server_use=true&driver_txt=baiduyun_go` |
| 厂商授权地址 | 响应 `{"text":"https://login.microsoftonline.com/..."}` | 响应 `{"text":"https://openapi.baidu.com/..."}` |
| 固定回调 | `https://api.oplist.org/onedrive/callback` | `https://api.oplist.org/baiduyun/callback` |
| 令牌返回 | `302 https://api.oplist.org/#<base64(JSON)>` | 同左 |
| 续期 | `GET .../onedrive/renewapi?server_use=true&driver_txt=onedrive_pr&refresh_ui=<token>` | `GET .../baiduyun/renewapi?server_use=true&driver_txt=baiduyun_go&refresh_ui=<token>` |
| 账号信息 | `GET https://graph.microsoft.com/v1.0/me`、`/me/drive` | `GET https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo`、`GET https://pan.baidu.com/api/quota` |

`driver_txt` 取值：OneDrive 个人版 `onedrive_pr`，工作／学校版 `onedrive_go`，世纪互联 `onedrive_cn`，美国政府 `onedrive_us`，德国 `onedrive_de`；百度 OAuth `baiduyun_go`，OOB `baiduyun_ob`。首批只开放 `onedrive_pr`、`onedrive_go` 和 `baiduyun_go`。国家云和 OOB 需要单独验收。

后续可按同一 `/requests`／`/callback` 契约评估 APIPages 的阿里云盘、115、123、夸克、Dropbox、Google Drive、Yandex 等驱动；每个驱动需单独验证权限、Cookie、回调、续期和写入语义，未验收前不显示为可用。阿里云 PDS 使用设备授权，另走独立设计。

```text
用户                 CyberNote 原生                    OpenList APIPages              厂商
 │  点“连接 OneDrive”      │                                  │                         │
 │───────────────────────>│ 生成 attempt/generation           │                         │
 │                        │ GET /onedrive/requests           │                         │
 │                        │─────────────────────────────────>│ 使用内置 client id      │
 │                        │<─────────────────────────────────│ 返回 authorization URL  │
 │                        │ 提取 Set-Cookie、注入 WebView    │                         │
 │                        │ 打开受控 WebView                  │                         │
 │                        │──────────────────────────────────────────────────────────>│
 │  登录、同意授权          │                                  │                         │
 │                        │                                  │<────────────────────────│
 │                        │                                  │ code -> token           │
 │                        │<─────────────────────────────────│ 302 /#base64(tokens)    │
 │                        │ 拦截最终 URL、解析 fragment、校验 driver                 │
 │                        │ 关闭 WebView、清缓存/历史、原子保存 refresh token         │
 │                        │ GET /me、/me/drive 验证账号和容量                         │
 │<───────────────────────│ 返回已连接、账号、同步位置、配额                          │
```

### 请求与回调

1. `requests` 使用 `server_use=true` 和 `driver_txt=<driver>`，不带 `client_uid`／`client_key`／`secret_key`。服务端使用 OpenList 内置应用；返回的授权 URL 里会带公开的 client id，但不含 secret。`server_use=true` 时仍必须传 `driver_txt`，否则源码无法选择驱动。
2. 授权 URL 只能由原生层从 OpenList 响应中取得，不能由 renderer 拼接或替换 host。允许的主机由原生白名单固定：OpenList 发行方、Microsoft 登录／同意页、百度登录／同意页。禁止任意 scheme、下载、文件选择、媒体采集、HTTP 认证和客户端证书；新窗口默认拒绝，若厂商登录必须弹窗，只允许白名单主机并在同一受控数据存储中打开，不能交给系统浏览器。
3. 厂商回调固定到当前 issuer 的 `/onedrive/callback` 或 `/baiduyun/callback`；官方服务是 `https://api.oplist.org/...`。OpenList 换取 token 后 302 到 `https://<issuer>/#<base64(JSON)>`。原生在主框架导航提交前拦截该 URL，不加载页面。按标准 Base64 解码 UTF-8 JSON 并限制 fragment 长度；要求 `refresh_token` 非空、`driver_txt` 与本次 attempt 一致、没有 `message_err`。OneDrive 回调还要求 `server_use=true`；百度 APIPages 的 OAuth 回调不返回 `server_use`，不能照搬 OneDrive 条件。重复回调只允许一次完成，迟到导航不能生成第二条连接。
4. 成功时立即取消导航并关闭 WebView；token 只在原生内存暂存，`Verifying` 通过后原子保存。清理失败不回滚已保存凭据，但记录安全错误并在下次启动重试清理。不得把 fragment、access token 或 refresh token 写入日志、崩溃报告、剪贴板或普通配置。失败、取消、关闭窗口、切换服务、切换资料库都使 attempt 失效。
5. 如果拦截失败导致 OpenList 页面加载并清空 fragment，只能进入降级路径：打开 OpenList Token 页面，由用户手动复制 refresh token 到原生安全输入框；这是安全降级，必须再次提示令牌敏感。不得通过注入 JS 读取第三方页面 DOM。系统浏览器路径同样只能走这个降级路径，因为回调不属于 CyberNote。

### Cookie 交接（必需）

OpenList 的 `/requests` 不是纯 JSON 响应：它会设置 `driver_txt` 和 `server_use` Cookie，`/callback` 依赖这些 Cookie 选择驱动和换票。原生 HTTP 客户端与 WebView 默认不共享 Cookie，因此不能在原生取到 URL 后直接打开 WebView。

1. 原生使用仅属于本次 attempt 的 Cookie jar 调用 `/requests`，不跟随重定向；只接受 HTTPS、JSON 和固定 issuer。
2. 从响应提取本次设置的 `driver_txt`、`server_use`；只接受与 attempt 一致的值。只复制这两个 auth-state Cookie，不复制 Cloudflare／分析 Cookie。`server_use=true` 下若出现凭据 Cookie，视为异常并丢弃。
3. 在加载厂商授权 URL 前，用平台 API 将 Cookie 写入专用 WebView 数据存储：host-only、`Path=/`、HTTPS 下按 `Secure` 处理，保留服务返回的 `SameSite` 和过期时间；不得扩大到父域。等待 macOS `WKHTTPCookieStore.setCookie` 完成回调、Android `CookieManager.setCookie`／`flush` 完成后再加载 URL。
4. macOS 使用 `WKWebsiteDataStore.nonPersistent()`，成功、失败、取消、超时和窗口销毁后删除该数据存储中的 Cookie、缓存与历史。Android WebView 的 `CookieManager` 是进程级，无法为单个 attempt 创建隔离存储；登录 attempt 必须串行，结束只定向清理 `driver_txt`／`server_use`，厂商登录 Cookie 可能保留到进程结束或用户清除应用数据。这是 Android 的已知边界，不能宣称与 macOS 同等隔离。Cookie 写入失败、数据存储不符合该约束或 issuer 不一致时直接失败，不打开登录页。
5. 清理按 attempt 代次执行；迟到清理不能删除新 attempt 的 Cookie。macOS 若进程在清理前退出，下次启动先清理专用数据存储；Android 不读取或注入第三方页面 DOM，也不清理全局 Cookie／缓存。

### 续期与失败

- 原生按连接串行续期，同一凭据只允许一个刷新请求。成功返回的 `refresh_token` 与 `access_token` 原子更新；响应省略 refresh token 时保留旧值。当前 APIPages 的 `renewapi` 只返回两个令牌、不返回 `expires_in`，实现按保守的 3000 秒缓存 access token；到期前 60 秒再次刷新。
- `401`／`invalid_grant`／明确的授权撤销：标记 `ReauthRequired`，停止自动同步，保留本机笔记、远端密文和配置。不要自动删除远端或重建云空间。
- 网络失败、超时、`429`、`5xx`：保留连接，按有界退避重试；不得把失败显示成“已同步”。
- 刷新请求只发往当前连接的 OpenList issuer。不能因为主站失败就静默切换到另一个 issuer 或第三方换票站。

### 安全与信任边界

- **授权对象不是 CyberNote。** 厂商同意页展示的是 OpenList 的应用。设置页在打开登录前必须显示：“将使用 OpenList 兼容授权服务；授权对象为 OpenList 应用；CyberNote 会保存刷新令牌；OpenList 在续期时会接收该令牌。”用户确认后才打开 WebView。
- **权限范围较宽。** OneDrive 为 `offline_access Files.ReadWrite.All`，百度为 `basic,netdisk`。这不是应用目录权限，不能声称只访问 CyberNote 文件夹。CyberNote 只在自己的 `/CyberNote/` 目录读写，但 token 本身拥有更大范围。工作／学校账号可能要求管理员同意，授权失败要区分“需要管理员批准”和普通拒绝，不能循环重试。
- **没有可验证的 OAuth state 或 PKCE。** OpenList 的 `requests` 不接受 CyberNote 的 state 或 PKCE challenge，回调 fragment 也不回传 state。只能以单活跃 attempt、固定 callback host/path、driver 绑定、generation、即时关闭和严格 URL 校验降低风险，不能宣称具备完整 CSRF 防护或使用了 PKCE。若未来要满足完整 OAuth 原生应用规范，必须迁移到 CyberNote 自有应用和 PKCE + 受控回调。
- **许可证与服务风险。** APIPages 仓库 `LICENSE` 为 AGPL-3.0，README 徽章却标 MIT。CyberNote 只通过 HTTP 调用，不复制、修改或分发其代码；若自建或分发衍生服务，先做许可证审查。托管服务没有 SLA，接口可能变化，需有 kill switch 和迁移路径。
- **撤销。** 断开连接删除本机凭据并停止同步；厂商侧的授权撤销需要打开对应账号的应用管理页，由用户完成。当前 APIPages 未提供统一的撤销接口，不能显示“已自动撤销”的假成功。
- **查询参数中的令牌。** APIPages 的 `renewapi` 和百度部分接口把令牌放在 URL query；代理、CDN、崩溃报告和错误日志可能记录完整 URL。原生日志、错误和遥测只能记录去 query 的路径与固定错误码。
- **WebView URL 也是敏感数据。** 回调 fragment 可能出现在导航日志、崩溃报告或调试工具中；平台层必须关闭 URL 日志，诊断只记录去 fragment 的 host/path 和固定错误码。

## 首批网盘与同步能力

### OneDrive

- 账号：首批 `onedrive_pr`（个人）和 `onedrive_go`（工作／学校）。个人版代码按双向能力发布，但真实账号并发实测仍是验收门槛；工作／学校版先连接、读取和恢复，最终提交条件通过后再开放双向。设置页先让用户选择账号类型，再发起授权。只使用 `/me/drive`，不支持 SharePoint 站点库或共享库。世纪互联、美国政府和德国版不混用同一 token。
- 同步位置：用户 OneDrive 根目录下的 `/CyberNote/`，文件 `notes.bundle`。首次同步用 `POST /me/drive/root/children` 创建文件夹，`@microsoft.graph.conflictBehavior: fail`；遇到同名项必须确认是文件夹，不能把文件当目录。
- 读取：先取元数据，绑定 `id`、`eTag`、`cTag`、`size`、`file` 和 `@microsoft.graph.downloadUrl`；正文通过 `downloadUrl` 获取，不携带 API Authorization，校验 HTTPS 主机，不跟随任意重定向。
- 写入：使用显式提交的上传会话，`deferCommit: true`。个人版在分片完成后向父路径 `PUT` 新 driveItem，body 带 `name`、`@microsoft.graph.conflictBehavior`、`@microsoft.graph.sourceUrl=<upload session URL>`；创建用 `fail` 与候选 `If-None-Match: *`，更新用 `replace` 与 `If-Match`。工作／学校版的文档化完成方式是向 upload URL 发零长度 `POST`；该路径的最终提交条件没有与个人版同等级的文档依据，必须在真实账号上证明，未通过前只读。**最终提交**返回 `412`／`409` 才是并发拒绝；会话创建时的 `If-Match` 不能替代最终提交实测。
- 分片：10 MiB 一片，按 320 KiB 对齐；当前密文上限 48 MiB，最多约 5 片。任何分片失败可查询 upload session 的 `nextExpectedRanges` 续传；过期或 `404` 重新开始。
- 连接信息：`/me` 的稳定账号 ID、显示名；`/me/drive` 的 `driveType`、`quota.total`、`quota.used`、`quota.remaining`。只展示接口实际返回的字段。
- 必须先证明：个人版同一 `eTag` 创建两个上传会话，反序最终 `PUT` 时第二个被 `412`／`409` 拒绝；工作／学校版零长度 `POST` 在并发更新后是否拒绝，若不能拒绝则保持只读或单写者；首次创建两个同名文件只有一个成功；`If-None-Match: *` 在最终提交生效；`downloadUrl` 不把 Authorization 发往第三方主机。未通过前不得宣称对应账号类型的 OneDrive 双向同步完成。

### 百度网盘

- 同步位置：当前固定 `/CyberNote/heads/`，但百度开放平台文档对 `precreate` 声明 `/apps/{appname}` 目录限制；OpenList 内置应用的 `appname` 尚未确认，因此真实账号首次写入是必须验收项。若根路径被拒绝，应改为可配置同步根目录或暂停百度写入，不能把 fixture 通过当成真实可用。
- 写入：先以 `create` + `isdir=1` 确保 `/CyberNote` 和 `/CyberNote/heads` 存在（已存在时核对类型），再 `precreate` → 分片上传 → `create` 到唯一路径。`create`／`precreate` 按 OpenList 实现使用 `rtype=3`，并发送整文件 MD5 与首 256 KiB MD5；分块 MD5 覆盖最后不足 4 MiB 的块。百度不允许空文件；上传完成后重新列出并核对路径与大小。`create` 不提供内容条件提交，唯一路径只降低碰撞概率，不是服务端 CAS。
- head 顺序：文件名至少包含 `writer_id`、单调 `seq` 和随机后缀；`unix_ms` 只能作提示，不能作为唯一顺序。每次写入新对象，不覆盖旧对象。读取时解析文件名中的 `writer_id`／`seq`，不按字符串字典序推断新旧；按 writer 取最新 head，最新一份下载、大小校验或解密失败时回退上一份，再逐个下载、解密、校验。多个 head 的 bundle 用现有版本/设置/附件合并规则合并；无法合并时返回错误，不能当成空库。
- 账号信息：`uinfo` 的可用账号／会员字段，`/api/quota` 的 total／used。接口没有返回的字段显示“不可用”，不猜测。
- 读取：用 `filemetas` 获取 `dlink`，按百度要求把 `access_token` 追加到 dlink 请求，使用固定 `User-Agent: pan.baidu.com`，跟随百度返回的 302 到签名地址；不把 Authorization 头发往第三方主机，并校验最终 HTTPS 主机。
- **不做单对象覆盖。** 百度没有 ETag 条件更新；`server_mtime` 只有秒级，OpenList 明确把返回的 MD5 标为不可信。单对象 `PUT` 会把两台设备的并发编辑变成最后写入者覆盖，丢失另一端的笔记。
- 写入模式：
  - `TwoWay`（默认）：每台设备写自己的不可变 head；读取端按 writer 取最新 head，解密并合并所有分支。并发编辑保留为冲突，不覆盖旧版本。首次连接、重新连接和自动同步都走同一路径。
  - `ReadOnly`：连接、查看、预览、恢复，不写入远端。读取仍合并现有 heads，因此能看到其他设备写入的内容。
  - `SingleWriter`：用户明确指定一台设备负责写入；该设备只创建新的 head，其他设备保持只读。读取仍合并现有 heads。没有分布式锁，切换写入设备前应先停止旧设备；即使误开第二台写设备，heads 合并也不会静默覆盖。

### 能力矩阵

| 能力 | OneDrive | 百度网盘 |
| --- | --- | --- |
| 登录、账号、容量 | 是 | 是 |
| 读取、预览、恢复 | 是 | 是 |
| 条件创建 | 个人版最终 `PUT` + `conflictBehavior: fail`，`If-None-Match: *` 待证；工作版最终 `POST` 条件待证 | 否，仅唯一路径 |
| 条件更新 | 个人版最终 `PUT` + `If-Match`；工作版最终 `POST` 条件待证 | 否 |
| 多设备自动双向 | 个人版通过并发实测后开放；工作版待定 | 是，基于不可变 heads 合并；真实多设备并发待验收 |
| 不可变 heads | 可选 | 是 |
| 主要版本依据 | `eTag`／`cTag` + 内容 hash | `writer_id` + `seq` + `fs_id` + 大小；仅展示，不是 CAS |

## 连接、凭据与状态

**所有者。** `cloud_sync` 继续独占云配置、连接、预览、传输和自动调度。新增 `auth` 子模块只负责授权 attempt、OpenList HTTP 契约和令牌刷新；平台插件只负责受控 WebView，不拥有配置或凭据。CyberBus 账户模块、Store 身份和保存队列不参与网盘授权。

以下结构只用于新增 OAuth 网盘；现有 WebDAV／S3／GitHub 保持原配置字段，不强行迁移。实现时可调整字段名，但边界不变：

```rust
enum CloudAuthMode { OpenList }
enum CloudProvider { OneDrive, Baidu, WebDav, S3, GitHub }
enum DriveMode { ReadOnly, SingleWriter, TwoWay }

struct CloudConnection {
    id: String,
    provider: CloudProvider,
    auth: CloudAuthMode,
    issuer: String,          // https://api.oplist.org 或自建兼容服务
    driver: String,          // onedrive_pr / onedrive_go / baiduyun_go
    account_id: String,
    display_name: String,
    sync_root: String,
    credential_id: String,
    drive_mode: DriveMode,
    created_at: i64,
    last_verified_at: Option<i64>,
}

struct CloudCredential {
    connection_id: String,
    issuer: String,
    driver: String,
    refresh_token: String,
    access_token: Option<String>,
    expires_at: Option<i64>,
    scope: String,
}
```

**状态机。** `Disconnected → Authorizing → Verifying → Connected → ReauthRequired → Revoked`。`Authorizing` 只有一个活跃 attempt，保存 attempt id、generation、provider、driver、issuer 和开始时间；`Verifying` 在保存令牌前调用账号／容量接口，账号验证必须成功，容量失败只显示“不可用”而不阻断连接；401／403／明确无效令牌丢弃令牌，网络或超时保留内存中的 attempt 并允许重试，关闭窗口或应用则丢弃。`Connected` 只表示授权和账号验证成功，不等于内容同步已启用；`ReauthRequired` 停止自动同步但保留配置；`Revoked` 先撤销配置引用，凭据删除验证后才算完成，删除失败保留待清理状态并重试，本机笔记和远端密文始终保留。

**凭据存储。** 新 OAuth 凭据使用云同步专属加密记录，不复用 CyberBus 的 grant 或账户库。当前实现使用 `.cloud-sync/credentials.key`（`0600`）作为设备密钥，配合 `0600` 密文和原子写入；**尚未接入 macOS Keychain 或 Android Keystore**，Android `noBackupFilesDir` 与系统备份排除也需在打包配置和真机上确认。设计目标是后续把设备密钥迁到平台密钥库并显式排除备份；在完成前，验证记录必须把“文件密钥 + 应用私有目录”作为当前威胁模型，不能宣称硬件保护。配置只保存 `credential_id` 和安全元数据，令牌不进入配置、日志、备份、云快照或 renderer。写入顺序为：先原子持久化新凭据，再切换配置引用；删除时先撤销配置引用，再清理凭据。进程中断后只允许“旧凭据仍可用”或“新凭据已完整写入”两种状态，不能出现半条记录。

**刷新与并发。** 每个连接单飞刷新；刷新结果带 generation，旧 generation 的迟到响应不能覆盖新凭据。访问令牌只在内存或短期加密缓存中使用，refresh token 长期保存。切换账号、issuer、driver 或同步目录时，旧凭据不能被新连接复用。

**配置迁移。** 保留现有三个 provider 的字段、显式空值和缺失语义；新增 OAuth 连接使用独立结构。未知或损坏的 provider／credential 引用拒绝写入并保留证据，不能当作空配置或未连接成功。

**命令边界。** 在现有 `cloud_sync_command` 上增加 `beginConnect`、`connectStatus`、`completeConnect`（由原生回调触发，不由 renderer 直接提交 token）、`connectionInfo`、`disconnect`、`reauth`。`beginConnect` 返回 attempt 和授权 URL；renderer 只能把 URL 交给受控原生窗口，不能改写 host。`connectionInfo` 只读账号和容量，不列举笔记目录、不写远端；返回 `conditional_create`、`conditional_update` 和 `drive_mode`，UI 不得按 provider 名称推断双向能力。所有命令继续校验窗口、Session、Store instance 和库 generation。

## 设置页体验

```text
设置 › 账户与同步
  云端同步                         未连接    [连接网盘…]
    选择服务                       [OneDrive 个人版       ▾]
    说明                           使用 OpenList 兼容授权，授权对象为 OpenList 应用
                                   [了解风险]  [取消] [继续登录]

  正在登录 OneDrive                 请在窗口中完成 Microsoft 登录
                                   [取消]

  云端同步                         OneDrive · 已连接
    账号                           a•••@example.com
    同步位置                        OneDrive / CyberNote / notes.bundle
    容量                           已用 2.1 GB / 1 TB
    加密口令                        [输入同步加密口令]
    同步频率                        [关闭               ▾]
    [预览并启用同步]                 [连接详情…]
```

- 服务选择器前部放 `OneDrive`、`百度网盘`，后部保留 `手动配置` 的 WebDAV、S3、GitHub。OneDrive 需要先选个人版／工作或学校版；百度首批只提供 `baiduyun_go`。
- 连接前显示信任说明和权限范围，不能把“登录”做成无说明的一键授权。说明文案使用现有设置页的次要文字和危险／注意表面，不新增营销式卡片。
- 授权中只显示一个进度面和一个“取消”。取消、关闭窗口、切出设置、切换服务都立即废弃 attempt；旧回调不能复活窗口或写入凭据。
- 连接成功后先显示账号、同步位置、容量、授权时间和“查看详情”，不自动开始内容传输。用户输入加密口令、预览并确认后才启用同步；配置预览不发放同步票据，用户点“保存并继续预览”保存配置并重新读取远端，随后才能“确认同步”。
- 百度连接成功后默认显示“多设备读写”，并说明每台设备写自己的不可变 head、读取时合并、并发编辑保留为冲突；只读和单写者模式分别显示“只读”和“单写者”。没有 CAS 的服务不显示“条件更新”标签。
- 授权过期显示“重新连接”，错误使用固定中文摘要；不显示 token、回调 URL、OpenList 内部错误正文或账号敏感字段。断开连接保留本机笔记和远端密文，并提供厂商授权管理页的手动撤销入口。

## 传输与同步模式

**抽取最小远端能力。** 现有 `Remote` 的 `probe`／`get`／`put` 扩展为能力查询和明确的写入模式，不把“有 put”误当成“支持条件更新”：

```rust
struct RemoteCapabilities {
    conditional_create: bool,
    conditional_update: bool,
    immutable_heads: bool,
    account_info: bool,
}
```

`engine::read` 对单对象布局返回一个 bundle 和版本；对不可变 heads 布局读取每个 writer 的最新 head（下载、大小校验或解密失败时回退上一份），解密后调用同一 bundle 合并逻辑，并把 head 名单作为 revision。`runtime` 只有在 `conditional_create` 和 `conditional_update` 都为真时才允许条件写入；heads 布局按 `immutable_heads` 发布多设备写入能力。百度 `TwoWay` 和 `SingleWriter` 进入自动同步，`ReadOnly` 不写入。能力不足时只开放连接信息、读取和显式恢复。

**单对象布局（OneDrive）。** 远端版本由元数据 `eTag`／`cTag` 和正文 hash 共同绑定；写入必须走最终提交条件。个人版最终 `PUT` 已文档化，工作／学校版最终 `POST` 的条件语义待实测；能力按账号类型分别发布。提交成功但客户端超时，先重读元数据并比对 hash，再决定是否需要重试，不能直接再写一次。远端缺失、401、403、429、5xx、412／409、解析失败和签名 URL 失败分别建模。

**不可变 heads 布局（百度）。** 每次写入唯一对象，不覆盖。读取按 `writer_id` 和单调 `seq` 验证；时间戳和文件名只作提示，不能证明新旧。每个 writer 取最新 head，最新一份下载、大小校验或解密失败时尝试上一份；所有成功读取的 bundle 解密后合并。无效 head 不能当成空库，也不能自动删除。当前不做自动清理，旧 head 会保留；读取成本按 writer 数而不是历史写入次数增长。单写者和只读模式仍使用同一布局，只改变写入权限。

**预算与网络。** 沿用现有密文 48 MiB、解密 JSON 32 MiB、单附件 16 MiB、版本 1024、settings heads 128 的预算；OneDrive 分片 10 MiB，百度按会员等级和驱动上限选择分片。所有请求有连接、单请求、单操作和总操作超时；禁止把 API Authorization 带到签名下载／上传 URL；禁止无界重定向和 HTML 登录页当空库。

**不改变现有同步语义。** 预览、云空间 UUID、本机 Store 身份、保护版本、Session quiet apply、附件校验和可移植设置白名单继续由现有 `CloudRuntime`／`Host` 拥有。网盘适配器只替换远端读写，不创建第二个 Store、会话或保存队列。

## 实施拆分

下表保留原拆分与完成条件。1–8 的代码已落地；9 的文档已更新，真实账号与双端真机验收仍待执行。

| 序号 | 工作 | 主要路径 | 完成条件 |
| --- | --- | --- | --- |
| 1 | 受控授权窗口 | `plugins/tauri-plugin-cloud-auth/`（或扩展 `plugins/tauri-plugin-notes-auth/` 的 host-only 模式） | macOS `decidePolicyFor`／Android `shouldOverrideUrlLoading` 在主框架提交前拦截；无 Tauri IPC／JS bridge，禁用文件访问、混合内容、下载和任意新窗口；固定 host 白名单；注入 `/requests` Cookie；关闭清理；取消／销毁事件 |
| 2 | OpenList 授权客户端 | `src-tauri/src/cloud_sync/auth/openlist.rs` | `requests`、Cookie 提取与交接、fragment 解码、`renewapi`、错误分类、单飞刷新；不记录 token |
| 3 | 凭据与连接 | `src-tauri/src/cloud_sync/auth/credential.rs`、`model.rs`、`persistence.rs` | 独立加密记录；原子写入；配置只引用 credential id；损坏拒绝覆盖；迁移旧配置 |
| 4 | 命令与状态 | `src-tauri/src/cloud_sync/commands.rs`、`runtime.rs` | `beginConnect`／`connectStatus`／`connectionInfo`／`disconnect`／`reauth`；窗口与 generation 校验 |
| 5 | 设置 UI | `src/cloud-sync/` | 服务选择、信任说明、授权中、已连接、详情、重新连接、断开、百度模式、OneDrive 账号类型能力标签；窄屏／键盘／浅深色 |
| 6 | OneDrive 适配器 | `src-tauri/src/cloud_sync/remote/onedrive.rs`（或 `protocol.rs` 内聚） | 文件夹、元数据、下载 URL、显式提交会话、个人版最终 `PUT`、工作版零长度 `POST`、`If-Match`／`If-None-Match` 实测、配额、按账号类型发布能力 |
| 7 | 百度适配器 | `src-tauri/src/cloud_sync/remote/baidu.rs` | `writer_id`／`seq` head 写入、每 writer 最新 head 选择、损坏回退、多 head 合并、配额、多设备读写／单写者／只读；不提供覆盖写 |
| 8 | Fixture 与回归 | `src-tauri/src/cloud_sync/*_tests.rs`、`scripts/verification/` | 本地 OAuth／OneDrive／百度 fixture；不访问真实账号；覆盖 Cookie 交接、迟到回调、并发刷新、个人版 `PUT`／工作版 `POST`、412／409、截断 head |
| 9 | 文档与证据 | 本页、`docs/architecture/settings121.md`、`docs/ui/preferences.md`、`docs/verification/` | 设计、实现、验收分开记录；准确 revision 和构建号 |

**实现顺序。** 先做 1–5 的授权闭环（能连接、看信息、断开），再合并 6 的 OneDrive 个人版双向（工作版先只读），最后做 7 的百度多设备读写。百度多 head 合并已落地；真实并发验收和 head 清理策略仍单独跟踪。

## 验收

| 范围 | 必须证明 |
| --- | --- |
| 授权 | macOS 与 Android 都能完成 OneDrive 个人／工作版和百度 OAuth；`/requests` Cookie 正确注入专用 WebView，缺失／错误／跨 issuer Cookie 时不打开登录页；关闭窗口、拒绝授权、重复回调、错误 driver、伪造 host、迟到回调均不产生凭据；重启后能续期；失效后进入重新连接；断开后本机笔记和远端密文仍在 |
| 凭据 | 配置、日志、崩溃报告、备份、云快照、renderer 状态中都没有 token；凭据文件权限／平台密钥保护符合既有边界；损坏记录拒绝覆盖并保留证据 |
| OneDrive | 个人版两设备首次创建只有一个成功；同 `eTag` 反序最终 `PUT` 第二个被 412／409；工作版零长度 `POST` 的并发拒绝单独证明，不能拒绝时自动双向保持关闭；双向正文、附件原字节、MIME、hash、重启恢复、冲突保全与显式解决；48 MiB 密文可分片上传；配额和账号信息正确 |
| 百度 | 连接、查看、预览、恢复；真实账号验证 `/CyberNote` 写入或明确失败；两台设备各自写入新 head，读者按 writer 取最新 head 并合并；损坏／截断的最新 head 回退上一份且不删；并发编辑保留为冲突；不出现单对象覆盖 |
| 回归 | WebDAV、S3、GitHub 现有测试；CyberBus 账户／设备边界；`pnpm typecheck`、`pnpm version:check`、`git diff --check`；macOS／Android 准确构建 |
| 真机 | 使用真实账号和合成笔记，在准确安装包上检查 WebView 登录、Android 返回键／进程回收、键盘、窄屏、浅深色；记录账号类型、地区、日期和构建号 |

自动化使用临时应用目录、可控时钟和本地 OAuth／存储 fixture；不得使用真实用户令牌或笔记库。Fixture 通过不等于真实网盘授权或并发语义通过。

## 风险与未决

- **OpenList 托管服务依赖。** 无 SLA，接口、条款、许可证和可用性可能变化；APIPages 最后正式 Release 为 2025-07-31，虽有后续推送，仍需监控。缓解：issuer 固定、能力开关、失败暂停自动同步、保留手动 WebDAV／S3／GitHub 路径、准备自有应用迁移。
- **第三方授权与宽权限。** 用户授权的是 OpenList 应用，OneDrive 为全盘读写，百度为网盘读写；OpenList 续期时接触 refresh token。必须在 UI 明确披露，不能宣称“CyberNote 只访问自己的文件夹”。
- **无 OAuth state。** 兼容桥不能提供完整 CSRF 防护；只能靠固定回调、单活跃 attempt、driver 绑定和即时关闭。若安全要求提高，迁移到自有应用 + PKCE。
- **OneDrive 最终提交语义。** 个人版 `PUT` 显式提交有文档依据；工作／学校版零长度 `POST` 的最终条件尚未证明。按账号类型分别开放能力，不能因连接成功就宣称双向；若并发拒绝不生效，暂停该账号类型的自动双向，退回只读或手动恢复。
- **中国站域名不一致。** APIPages README 参数表写 `https://api-cn.oplist.org`，徽章写 `https://api.oplist.org.cn`；首轮只用全球站，中国站另做域名、证书、回调与 Cookie 验证，连接保存选定 issuer 后不自动切换。
- **百度无 CAS。** 多设备写入依靠不可变 heads 合并，不依靠服务端条件提交；并发编辑会保留为冲突，不能把“唯一文件名”说成服务端 CAS。真实多设备并发和冲突 UI 仍需验收。
- **百度应用目录限制。** 百度文档声明 `precreate` 仅支持 `/apps/{appname}`；当前固定 `/CyberNote`，且 OpenList 内置应用的 `appname` 不属于 CyberNote。真实账号若拒绝根路径写入，百度写入必须降级为只读或迁移到用户可配置的合法根目录，不能继续宣称上传已可用。
- **百度 head 清理。** 当前不自动删除旧 head；读取只取每个 writer 的最新一份（下载、大小校验或解密失败时回退上一份），因此历史写入不会线性增加读取量，但会占用远端空间。后续需要按 writer 保留窗口和可验证的清理规则，不能删除无法确认已合并的 head。
- **账号类型差异。** OneDrive 个人、工作／学校、世纪互联、美国政府、德国版的登录域、配额和 API 行为不同；首批只承诺前两类，其他单独验收。
- **服务商阻断。** 使用第三方应用凭据可能触发厂商风控或授权政策变化；发现后停止新授权和自动写入，保留本机数据，给出迁移提示。

## 参考

- [OpenList APIPages](https://github.com/OpenListTeam/OpenList-APIPages) · [登录／回调／续期路由](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/index.ts) · [OneDrive 授权实现](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/driver/onedrive_oa.ts) · [百度授权实现](https://github.com/OpenListTeam/OpenList-APIPages/blob/main/src/driver/baiduyun_oa.ts)
- [OpenList OneDrive 驱动](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/drivers/onedrive/util.go) · [OpenList 百度驱动](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/drivers/baidu_netdisk/util.go) · [OpenList WebDAV 写入](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/server/webdav/webdav.go#L432)
- [Microsoft Graph 上传会话](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0) · [driveItem PUT content](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0)
- [百度网盘开放平台](https://pan.baidu.com/union/document/entrance) · [百度开发者答疑](https://developer.baidu.com/article/detail.html?id=293412)
- [RFC 8252 原生应用 OAuth](https://www.rfc-editor.org/rfc/rfc8252.html) · [Apple ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/) · [AppAuth Android](https://github.com/openid/AppAuth-Android)

本次核对了 OpenList APIPages 的路由与源码、`/requests` Cookie 行为、OpenList v4.2.10 的 OneDrive／百度驱动、Microsoft Graph 上传会话文档、许可证元数据及 CyberNote 调用链。代码已实现受控窗口、Cookie 交接、凭据库、命令、设置 UI、百度不可变 heads 多设备合并和两类远端适配器；登录规则离屏 WKWebView 验证生成 21 个输入控件，并在本地 macOS 应用内确认账号框可聚焦输入，Rust 定向测试覆盖每 writer 最新 head 选择、解密失败回退与多 head 合并。真实账号授权、OneDrive 个人版／工作版最终提交并发、百度真实上传路径与多设备并发、双端真机行为仍待执行。
