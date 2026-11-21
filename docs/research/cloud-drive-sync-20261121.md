# 多网盘登录与同步调研及改进方案

调研日期 2026-11-21。状态为待实施。CyberNote 源码基线为 `main` 上的 `2932a965df1f85fd177b6f222180934531229964`（`0.2.5`）。

## 建议

- **首发直连 Dropbox。** 用户点「连接网盘」，在系统授权界面登录并同意应用目录权限，返回设置后即可查看连接信息。官方 API 有基于 `rev` 的严格条件更新和同名冲突控制，适合验证当前同步模型。macOS 与 Android 首次建库和并发写通过后再开放。[Dropbox OAuth](https://docs.dropboxapi.com/dropbox-api/docs/oauth) · [上传冲突规范](https://github.com/dropbox/dropbox-api-spec/blob/main/files.stone)
- **国内并行验证阿里云盘开放平台和百度网盘开放平台。** 尽早申请 CyberNote 自有应用，比较审批、最小目录权限、双端回调和续期。可先验证连接及同步空间信息。双向同步需要证明原子创建和按版本更新，先通过的国内网盘优先上线。[阿里云盘开发者门户](https://www.alipan.com/developer/f) · [百度网盘开放平台](https://pan.baidu.com/union/document/entrance)
- **用 OpenList 和 rclone 扩大候选覆盖，用 OpenDAL 降低个别 Rust 适配器的实现成本。** 三者都进入技术选型。默认发行包先用现有 Rust HTTP 路径和薄适配器。自建 OpenList 的常规 WebDAV `PUT` 缺少本项目依赖的条件写入，当前只能作为研究或单独设计的只读入口候选。[OpenList v4.2.10 的 WebDAV 源码](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/server/webdav/webdav.go#L432)

## 当前云同步链路

设置的「账户与同步」挂载 `CloudSyncSettings`，通过 `settings_host_context` 取得受检窗口／会话上下文，再调用 `cloud_sync_command`。原生命令核对窗口身份，唯一的 `CloudRuntime` 读取配置、处理测试和预览、调度同步。现有 WebDAV、S3、GitHub 分别使用本机 `0600` 配置中保存的基本认证、SigV4 凭据和仓库令牌，只有选中并启用的一项运行。云存储授权独立于 CyberBus 的账户及设备授权。[App 接线](../../src/App.tsx) · [原生命令](../../src-tauri/src/cloud_sync/commands.rs) · [运行时](../../src-tauri/src/cloud_sync/runtime.rs)

`Remote::get` 获取密文和对应的远端版本，`Remote::put` 使用 ETag 或 GitHub blob SHA 条件提交，包括首次创建。运行时重验预览、云空间 UUID 和本机库代次，捕获并合并快照，保护本机版本，再提交远端并通过原有 Session 和 Store 应用结果。附件和可移植设置走原有校验与事务。自动同步复用同一入口，默认关闭。新增网盘沿用这些边界和现有预算，密文 48 MiB、解密 JSON 32 MiB、单附件 16 MiB。[HTTP 实现](../../src-tauri/src/cloud_sync/protocol.rs) · [云同步模块契约](../../src-tauri/src/cloud_sync/README.md) · [宿主接线](../../src-tauri/src/settings_host/README.md)

## 开源候选与维护状态

版本取上游 GitHub API 返回的最新正式 Release，日期按 UTC+8。判断持续维护同时看近期正式发布、代码活动和具体驱动。项目表中的覆盖表示上游宣称或源码列出的访问能力，生产接入还需按账号类型、权限和写入语义验证。

| 项目 | 维护快照和许可证 | 覆盖与授权 | CyberNote 用法 |
| --- | --- | --- | --- |
| **rclone** | MIT，[v1.76.0，11-07](https://github.com/rclone/rclone/releases/tag/v1.76.0) | Dropbox、OneDrive、Google Drive、Box、pCloud、MEGA、iCloud Drive、Proton Drive、PikPak、Huawei Drive 等。部分后端有浏览器授权，账号认证方式和质量由驱动决定。 | 覆盖面和服务行为参考，可做隔离的桌面验证工具。通用文件操作没有已确认的跨驱动原子条件写契约。`librclone` 为实验性 Go/cgo RPC 封装，Android 打包、二进制增量、凭据归属和进程生命周期需另评估。[服务表](https://rclone.org/overview/) · [后端分级](https://rclone.org/tiers/) · [浏览器授权](https://rclone.org/commands/rclone_authorize/) · [librclone](https://github.com/rclone/rclone/blob/v1.76.0/librclone/README.md) |
| **Apache OpenDAL** | Apache-2.0，[v0.59.5，10-18](https://github.com/apache/opendal/releases/tag/v0.59.5) | 原生 Rust，列出 Dropbox、OneDrive、Google Drive、阿里云盘、Seafile、WebDAV、S3 等。服务接受已取得的凭据，部分驱动支持换取 access token。用户授权、续期持久化和应用回调仍由 CyberNote 管理。 | 在满足接口的服务上按 `services-*` 特性择用。此版本 Dropbox、Google Drive 和阿里云盘未声明原生条件写入。OneDrive 声明 `write_with_if_match`，仍需验证首次创建以及上传会话最终提交。[服务表](https://nightlies.apache.org/opendal/opendal-docs-release-v0.59.5/services/) · [Dropbox](https://github.com/apache/opendal/blob/v0.59.5/core/services/dropbox/src/backend.rs) · [Google Drive](https://github.com/apache/opendal/blob/v0.59.5/core/services/gdrive/src/backend.rs) · [阿里云盘](https://github.com/apache/opendal/blob/v0.59.5/core/services/aliyun-drive/src/backend.rs) · [OneDrive](https://github.com/apache/opendal/blob/v0.59.5/core/services/onedrive/src/core.rs) |
| **OpenList** | AGPL-3.0，[v4.2.10，11-19](https://github.com/OpenListTeam/OpenList/releases/tag/v4.2.10) | AList 社区分支。国内驱动含阿里云盘、百度、115、123、夸克、天翼、中国移动云盘等，也有海外驱动。服务授权、二维码、账号密码、Cookie、分享挂载对应不同驱动。APIPages 可协助授权和刷新令牌。 | 国内驱动与交互研究首选。独立自建服务有 WebDAV 和 API，需要运营服务器并保管其凭据。固定版本的 WebDAV 写入代码将 `If-Match` 和 `If-None-Match` 标为待实现，`LOCK` 也不能等同后端条件提交。嵌入或分发前须审查 AGPL 和依赖条款。[驱动文档](https://doc.oplist.org/guide/drivers) · [APIPages](https://doc.oplist.org/ecosystem/official_APIpage) · [WebDAV 写入](https://github.com/OpenListTeam/OpenList/blob/v4.2.10/server/webdav/webdav.go#L432) |
| **AList** | AGPL-3.0，[v3.66.0，10-21](https://github.com/AlistGo/alist/releases/tag/v3.66.0) | 与 OpenList 有大量重叠驱动，仍在发布。支持 WebDAV 及网盘挂载，各驱动的授权依赖不同。 | 对照 OpenList 的驱动变动与兼容性，维护一套聚合工具研究即可。若考虑分发，独立审核当期构建、依赖与授权服务来源。[驱动文档](https://alistgo.com/zh/guide/drivers/) |
| **Joplin** | [v3.7.24，11-20](https://github.com/laurent22/joplin/releases/tag/v3.7.24) | 活跃的开源笔记应用。Dropbox、OneDrive 授权后使用应用目录，另支持 WebDAV、Nextcloud、S3 等。 | 参考设置与授权体验。同步协议和数据归属是 Joplin 自身契约，代码复用前按对应包核对许可证。[用户指南](https://joplinapp.org/help/apps/sync/) · [同步规格](https://joplinapp.org/help/dev/spec/sync/) |

登录实现也有独立候选。Dropbox 官方 Rust SDK（Apache-2.0，GitHub 记录 11-03 仍有推送）暴露 OAuth 和类型化 API，可与现有 `reqwest` 小适配器比较。Android 官方 `dropbox-sdk-android` 使用 PKCE、支持 API 26+，对应 Java SDK [v8.0.2，07-16](https://github.com/dropbox/dropbox-sdk-java/releases/tag/v8.0.2)。通用 OAuth 可评估 Rust `oauth2`（[5.0.0](https://github.com/ramosbugs/oauth2-rs/releases/tag/5.0.0)，2025-01-21，2026-02 仍有提交）用于协议层。Android AppAuth 可参考 Custom Tabs 与回调生命周期，中央仓库正式版仍为 2021 年的 `0.11.1`，2026-03 有代码活动，加入依赖前应评估对当前 Android 浏览器及依赖版本的支持。[Dropbox Rust SDK](https://github.com/dropbox/dropbox-sdk-rust) · [Dropbox Android SDK 示例](https://github.com/dropbox/dropbox-sdk-java/tree/v8.0.2/examples/android) · [AppAuth](https://github.com/openid/AppAuth-Android) · [Maven 版本记录](https://repo.maven.apache.org/maven2/net/openid/appauth/maven-metadata.xml)

## 网盘覆盖与开放顺序

| 网盘 | 登录和访问依据 | 建议开放范围与待验证事项 |
| --- | --- | --- |
| **Dropbox** | 官方 OAuth code + PKCE，离线授权，App Folder 权限。 | 先做双向。`add` 和 `update(rev)` 均关闭 `autorename` 并使用 `strict_conflict`。从下载响应绑定正文与 `rev`，验证远端删除后旧 `rev` 更新、同内容和首次同时创建时均拒绝过期写。验证两端授权是否落在同一应用目录，以及生产应用审批和回调。[OAuth](https://docs.dropboxapi.com/dropbox-api/docs/oauth) · [文件规范](https://github.com/dropbox/dropbox-api-spec/blob/main/files.stone) |
| **OneDrive** | Microsoft Graph，优先个人账户的应用目录和离线授权。 | 第二个海外双向候选。使用稳定的 drive/item ID。分别证实同名条件创建、小文件条件覆盖，以及分片会话之间最终落盘的竞争语义。`createUploadSession` 接受 `If-Match`，仍需验证创建会话之后发生的竞争。企业、学校和国家云按账号独立验证。[应用目录](https://learn.microsoft.com/en-us/graph/api/drive-get-specialfolder?view=graph-rest-1.0) · [上传会话](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0) |
| **Google Drive** | 桌面用系统浏览器和 Google 支持的 loopback。Android 按 Google Identity Services 支持的授权流程，离线 server auth code 换取刷新令牌需要后端。 | 优先研究 `drive.appdata` 或 `drive.file`。同目录允许同名，独立设备自行生成不同文件 ID 会创建两份，不能靠按名称取第一条。须证实共同确定对象和实际内容更新路径的条件写入。Android 另验无 Google Play 服务时的可用性，按实际能力发布。[原生 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) · [Android 授权](https://developers.google.com/identity/protocols/oauth2/resources/oob-migration) · [应用数据目录](https://developers.google.com/workspace/drive/api/guides/appdata) · [创建与重试](https://developers.google.com/workspace/drive/api/guides/create-file) |
| **阿里云盘** | 消费者网盘开放平台有 OAuth 入口，OpenList 与 OpenDAL 都有相关实现。 | 国内优先申请。核实 CyberNote 获批的客户端类型、读写范围、容量和令牌轮转，测试入库读写及条件提交。需要保密客户端密钥的流程要单独评估服务端换票。阿里云 OSS 与 PDS 的授权和能力另行认定。[开发者门户](https://www.alipan.com/developer/f) · [OpenList 驱动](https://doc.oplist.org/guide/drivers/aliyundrive_open) · [OpenDAL 驱动](https://opendal.apache.org/docs/rust/opendal/services/struct.AliyunDrive.html) |
| **百度网盘** | 开放平台 OAuth 和应用目录。OpenList 也记录了其他驱动配置路径。 | 与阿里云盘并行申请。核验实际上传审批、应用目录、分片上限、限速和最终提交。公开开发者资料能确认上传途径，按旧版本原子覆盖的依据仍待补。应用身份使用 CyberNote 自己获批的注册。[接入文档](https://pan.baidu.com/union/document/entrance) · [百度开发者答疑](https://developer.baidu.com/article/detail.html?id=293412) · [OpenList 驱动](https://doc.oplist.org/guide/drivers/baidu) |
| **115、123 云盘** | 115 有开放平台授权及扫码路径，OpenList 的 115 移动扫码 PKCE 标为待实现。123 Open 的文档描述开发者密钥对访问关联账号。 | 115 下一批验证厂商授权和正式上传权限。123 先作为开发者配置候选，待确认存在可供普通用户使用的公开委托授权，再提供「连接网盘」。读写承诺按各自测试开通。[115 Open](https://doc.oplist.org/guide/drivers/115_open) · [123 Open](https://doc.oplist.org/guide/drivers/123_open) |
| **夸克、UC、天翼、移动云盘、迅雷、微云、蓝奏** | OpenList 生态有这些服务的驱动或分享适配。夸克文档说明其「Open」驱动并非真正意义上的开放接口，UC 文档包含 Cookie 路径，其他服务的账号访问和分享能力也各不相同。 | 收录为后续调查名单。按厂商开放范围逐个确认授权与续期。分享只读、网页会话和未经厂商许可的客户端凭据不进入正式连接流程。[夸克](https://doc.oplist.org/guide/drivers/quark) · [UC](https://doc.oplist.org/guide/drivers/uc) · [天翼](https://doc.oplist.org/guide/drivers/189) · [移动云盘](https://doc.oplist.org/guide/drivers/139) · [其他来源范围](https://doc.oplist.org/ecosystem/official_worker) |
| **Box、pCloud、Huawei Drive** | rclone 有浏览器授权或厂商 OAuth 的参考。Box 需核对组织审批，Huawei Drive 需获准使用华为账号开放服务相应权限。 | 第二批扩展候选。验证最小目录权限、设备上撤销和更新语义。区域域名与账号类型分别记录。[Box](https://rclone.org/box/) · [pCloud](https://rclone.org/pcloud/) · [Huawei Drive](https://rclone.org/huaweidrive/) |
| **MEGA、iCloud Drive、Proton Drive、PikPak、Koofr** | rclone 列出驱动。登录方式随服务而异，例如 iCloud Drive 驱动使用 Apple 账户登录、2FA 和信任令牌，Koofr 驱动使用应用密码。 | 候选覆盖。先找厂商支持的授权和文件 API。已有协议入口可评估用应用密码连接，主账号密码、浏览器会话 Cookie 和设备信任令牌不作为 CyberNote 的正式授权方案。[rclone 服务表](https://rclone.org/overview/) · [iCloud Drive](https://rclone.org/iclouddrive/) · [Koofr](https://rclone.org/koofr/) |
| **坚果云、Nextcloud、ownCloud、Seafile 及对象存储** | 按用户实际服务通过已有的 HTTPS WebDAV／S3 兼容入口，使用服务提供的应用密码或访问密钥。 | 可在服务选择器的「手动配置」下提供文档或预设。具体网关逐一核验响应、认证、上传限制和条件写入；服务名预设本身不构成认证或兼容通过。[WebDAV 厂商示例](https://rclone.org/webdav/) · [S3 兼容服务](https://rclone.org/s3/) |

GitHub 可在后续为现有私有仓库增加浏览器授权。优先研究 GitHub App 限定安装仓库和 Contents 读写权限，以及设备流和刷新支持。已有的手动 Token 与仓库配置可继续使用。[GitHub App 权限比较](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps) · [设备流和授权](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## 设置页体验

```text
设置 › 账户与同步
  云端同步                         未连接    [连接网盘…]
    选择服务                       [选择网盘             ▾]
    Dropbox                        [在浏览器中连接]
    正在等待授权…                   [取消]

  云端同步                         Dropbox · 已连接
    账号                           a•••@example.com
    同步位置                        Dropbox 应用目录 / CyberNote
    加密口令                        [输入同步加密口令]
    同步频率                        [关闭               ▾]
    [预览并启用同步]                 [连接详情…]
```

- 常用服务在选择器前部按已开放能力排列，末尾保留「手动配置」中的 WebDAV、S3、GitHub。新增网盘共用同一行内表单和连接状态。使用 `PreferenceSelect`、现有主题与焦点管理，窄屏控件排在标签下方，返回或取消后焦点回到发起按钮。[设置控件规则](../ui/preferences.md#控件选择规则)
- 系统授权成功后展示已验证的账号别名、同步位置、授权状态和最近一次成功应用时间。连接详情按需展示可获得的容量、数据大小、配额、权限及脱敏错误。接口不提供的字段显示「不可用」，连接状态查询只读取限定范围的元数据。最小权限足够时才读取账号显示信息。
- 登录确认和内容同步分别由用户触发。登录完成形成原生暂存连接，预览只读已授权目标。用户确认启用或显式保存连接才持久化。首轮内容同步仍用现有预览确认、加密口令和保护副本。切出设置或取消时作废未保存连接。可在「连接详情」中重新授权、暂停或断开。断开清除本机授权状态并在厂商支持时撤销令牌，保留本机笔记和远端密文。
- 换账号或目录时清除旧云空间确认，自动同步暂停，重新预览加入目标。授权过期显示「重新连接」，取消或拒绝授权后允许重试。只读候选在通过验收后可以明确标为「查看连接」，并显示其允许的操作。

## 建议接入结构

**一个连接所有者。** 在 `cloud_sync` 中持有每个服务的授权尝试与凭据，`CloudRuntime` 继续独占配置、预览、传输和自动调度。原生平台桥只负责打开授权界面、接受受控回调并交给对应尝试。每个发行版按厂商注册自己的客户端，代码中仅放可公开的 client ID。需要保密密钥及 HTTPS 回调的服务，逐个验证后才考虑独立换票后端，明确服务可见的凭据、保留期限和撤销方式。开发优先走能在客户端完成的授权路径，第三方公共换票站不参与默认流程。

**系统授权窗口。** macOS 使用厂商登记的回调配合系统浏览器，可用 `ASWebAuthenticationSession`，或按支持情况使用仅本机监听的短时 loopback。Android 使用 Custom Tabs、系统浏览器或厂商官方 SDK，回调使用受支持的已验证 App Link 或厂商要求的精确 scheme。两端均按厂商能力使用授权码、PKCE S256、一次性 `state` 与期限。原生核对回调及当前服务、窗口和库代次，拒绝重复、过期与迟到结果。关闭授权窗口、切换服务、断开或切换资料库会取消待处理尝试。授权码和凭据全程留在原生边界，普通 Tauri WebView 仅显示进度和安全状态。[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) · [Apple 授权会话](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/) · [AppAuth Android](https://github.com/openid/AppAuth-Android)

**本机凭据。** 新 OAuth 凭据使用云同步专属加密记录。Android 用 Keystore 保护并存放在排除系统备份的私有目录，macOS 评估与现有 ad-hoc 分发兼容的本机加密存储。复用底层平台能力时使用独立命名空间和密钥，CyberBus 凭据库继续由账户模块独占。按连接和账号保存稳定 ID、授权范围、到期时间和令牌，原生按需串行刷新。刷新成功且响应省略 refresh token 时按厂商契约保留旧值。令牌确定失效或被撤销时提示重连，短暂断网和限流保留连接。配置以稳定连接引用关联加密记录，写入和清理顺序需考虑进程中断与配置 CAS。状态、日志、备份和云快照仅能取得安全字段。旧 WebDAV、S3、GitHub 配置的升级验证覆盖缺项、显式空值和损坏，迁移若失败须保全凭据和目标配置。

**按能力支持同步。** 抽取 `Remote` 已经使用的最小操作，读取密文及其服务端版本、按缺失条件创建、按期望版本更新，再增加有限的连接信息读取。版本值及稳定目标标识必须与返回的密文对应。目标绑定包括服务、已验证账号、稳定容器／文件标识、配置和会话代次。只有确切对象缺失可以进入首次建库流程，认证失败、限速、权限遮蔽的 404、重复目标和损坏都给出独立状态。条件必须在服务端最终落盘时执行。对过期版本拒绝写入，对写入回执丢失先重读并验证实际远端内容，再沿原预览及提交边界恢复。签名下载或上传 URL 如有必要，以服务专属策略校验 HTTPS、目标、期限和大小，禁止携带给 API 的授权头跨域发送。[现有传输契约](../../src-tauri/src/cloud_sync/README.md#协议预算与保护版本)

缺少原子条件提交的服务可评估只读信息；备份如需覆盖这类服务，另行设计独立的加密不可变版本、上传回执和显式恢复。首轮网盘扩展保留当前同步格式。将来若设计多对象增量日志，需要另行证明可发现对象、并发、恢复和旧版本兼容。

## 实施顺序与验收

| 阶段 | 实施 | 通过标准 |
| --- | --- | --- |
| 1. 最小闭环 | 抽取远端接口并回归原三个服务。实现 Dropbox 双端授权、暂存连接、专属凭据、连接详情和条件传输。并行申请阿里云盘与百度网盘应用。 | 同一正式应用目录下，macOS 和 Android 均可授权、重启续期、撤销再连。两端完成创建、双向编辑、附件字节及 MIME 往返、冲突保全及显式解决。竞争时旧写被拒，原 Store 身份保持。 |
| 2. 扩展直连 | 先验证 OneDrive 个人版，推进首先满足准入的国内服务。分账号类型和平台记录能力。 | 每项独立验证应用准入、续期、确切缺失、首次写和并发更新。大文件或会话上传单独复测最终提交条件。证据不足的服务范围限定为已验证的连接信息与读操作。 |
| 3. 扩大覆盖 | 跟进 Google Drive 双端授权、Box 等国际服务及其余国内开放平台。评估自建网关的部署成本及接口能力，再决定是否作为高级入口。 | 可交付的连接方式有官方范围依据、权限可撤销、能维护。逐服务公布可用平台和能力。网关须在实际挂载目标上通过相同条件提交用例才能承担双向同步。 |

- **自动化。** 用临时应用目录、可控时钟和本地 OAuth／存储 fixture，覆盖拒绝授权、伪造或重复回调、会话切换后的迟到响应、并发刷新和新旧凭据切换时中断。对 WebDAV、S3、GitHub 和新适配器覆盖创建竞争、更新竞争、远端删除、登录页／重定向、401／403／404／429、超限、连接断开、提交成功但客户端超时。检查失败后密文和本机笔记的真实状态。[云模块测试入口](../../src-tauri/src/cloud_sync/README.md#验证范围)
- **首次接入服务。** 使用专用测试应用、测试网盘和合成笔记。真实账号上执行双设备并发首写和更新，在分片上传两端均建立会话后反序提交，验证未获准的写入是否被拒。另测不同账号重连、断网重启、撤销、动态配额和应用目录可见性。匹配准确构建记录 macOS、Android 安装体验，包括浏览器接力、Android 进程回收、返回键、键盘、窄屏和深浅色。
- **发行与维护。** 比较准确版本的双端包体、启动、依赖和签名影响。记录每个开放网盘的厂商应用类型、账号与地区、授权范围、上传路径、驱动版本及最近实测日期。跟进上游安全修复、API 和授权政策变动，必要时暂停受影响服务的自动写入并保留本机内容。[仓库交付与验证规则](../../agent.md)

本次核对了公开项目发布、许可证元数据、官方授权文档、指定版本的写入源码及 CyberNote 调用链。真实账号授权、服务并发语义、服务审批、双端构建与真机验收均待执行。
