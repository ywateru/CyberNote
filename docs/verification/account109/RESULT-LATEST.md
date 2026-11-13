# 账户同步实际验证结果

2026-11-13，Asia/Shanghai。**双桌面核心同步功能已有实际数据验证；最新 `9e7c46d2` GUI 的 [fresh cancel-local-live02](native/cancel-local-live02/README.md) 五项通过，涵盖本地完整正文保存、发起/取消登录、继续编辑及自然重启保持，两进程自然退出 0。旧 `920fa9cf` 的原库 relogin04 浏览器授权未完成、fresh live01 ready 超时仍保留。Android 账户三端仍受 coordinator 网络连接阻塞。整体交付未完成。** 下列结果来自多轮明确候选，不是一次完整 UI 测试全部通过。

本轮新增用户要求：[应用内托管页与系统浏览器双入口](../../plan/tasks/app-account109-login-surfaces.md)正在实施，包含内置授权转浏览器的同事务交接。上述 `9e7c46d2` 结果属于新增需求前的候选，不能作为双入口验收；新的精确构建和实际窗口/取消检查须另记。

## 分析与完善

数据链为 Logto 原生授权 owner → Vercel profile/enrollment → CyberGrid 自动发现与可信连接 → 原有同步 adapter/Session → SQLite 文档与受管附件。设置页不拥有账户 Runtime 生命周期；同步完成需验证实际文档、附件归属及原字节，不能以命令 ACK 或设备 online 判定。完整契约见 [架构](../../architecture/account-sync.md)；两个自定义数据根的 lease/cache 隔离和此前手工同步结果见 [sync108](../sync108/RESULT.md)。

本阶段已收拢的必要改进：

- 服务端把实际 JWKS 获取传输故障与身份验证失败区分为安全的 503/401，保留 issuer、audience、算法及 claims 校验。修复经独审，完整服务 172/172（含 29 Redis）通过，零跳过，并已部署到 canonical 服务，见 [部署记录](server/jwks-deployment01/README.md)。
- 原生错误保留有限的操作阶段和 SDK provider 原因，前端严格校验 DTO，避免第三方原文或凭据进入报告，见 [诊断审阅](native/coordination-diagnostics-review01.md)。
- 测试执行器区分 120 秒连接预算和 60 秒数据预算；保留失败原库与证据。为完成用户允许的命令调用验证，新增只在显式桌面 debug 测试模式生效的无 WebView 入口，使用真实 Session token 与生产协调协议，不修改生产同步权限或提交规则。
- 三端执行器在启动桌面或同步前保存手机原有四篇全文及附件证据，并在合并、补齐和结束检查保全；设备外 37 项及独审通过，但尚无三端实际运行结果。手机起源附件明确列为未执行，见 [复审](macos/three-peer-runner-review02.md)。
- `20d62c11` 已补齐手机起源固定 PNG/bin 用例：通过既有产品附件提交路径写入本轮新笔记，比较 C/A/B 完整正文、引用、授权读取原字节及 A/B 受管磁盘文件；[独立检查](native/phone-files-review01/README.md) 21 项通过。此为执行器准备，尚未在手机实际执行。
- 本轮登录恢复修正已合入 `99198fd`、`35ebf385`、`0fe41dca`：只有 HTTP 400 的 typed `invalid_grant` 才归为刷新拒绝；网络/429/5xx、配置与无效响应保持各自有限类别。网络“重试连接”复用保留授权和严格 bind，尊重已暂停状态，状态轮询仍只读；未知错误不能触发 replacement logout。独立 native 25 项、Node policy 6 项、auth crate 与增量反例，以及父级旧 [124 项](native/recovery-integration01.md)、新增手机附件后的 [138 项 Node 整合](native/recovery-integration02.md)均通过。此为源码/fixture 验证，新 GUI 实际恢复结果另列下方。
- `370ee4f4` 已补齐 `responseMetadata` 的固定 tokenOperation/tokenField 诊断，三个 token 校验路径保持原有认证要求；`278bbe28` 只在显式允许、完整启动预算持续 clean signedOut 和历史 owner 摘要匹配时续验 B。前者[独审](native/token-response-review01.md) native 26、auth 26（1 公网默认 ignored）、DTO/helper 31 项通过；后者[独审](native/relogin-signedout-review01/README.md) 29 项通过。父级新整合组 148 项通过、零跳过。它们不解决既有 relogin02 失败；`d1a6eadf` 诊断候选已构建并通过[静态身份独核](native/gui-token-diagnostics-build-review01/README.md)，实际 relogin03 结果见下。

- `08e9a923` 在显式 SignIn/SignUp 保留 Consent 并增加 Login，后台 restore/refresh 不变。只读核对确认 [QA 与应用权限配置一致](server/logto-scope-config01/README.md)，没有修改角色或放宽 connect；[独立检查](native/auth-explicit-login-review01/README.md)通过，SSO 是否为历史根因仍未证明。
- `9c19cbef`、`d20f350b` 增加实时 Mapping 只读缓存与退役 sampler 取消栅栏；[独审](native/relay-observation-review01.md)发现并复审关闭一项 P2。作者最终 native 33/33，独立初版 native 31、Node 55 及最终源码复审通过；父级两项整合后 Node 156/156、零跳过。普通三端数据 PASS 与显式 RELAY-02 的新鲜中转样本断言分开，尚无真实 4G 运行。
- 精确 `920fa9cf` debug E2E GUI 已[构建](macos/920fa9cf-debug-e2e-build01/README.md)并[独立核包](native/gui-explicit-login-build-review01/README.md)，SHA256 `bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`，1,654 输入、四份 lockfile 与实际二进制内嵌身份一致；runner 已 pin 并实际运行 relogin04。新候选不是正式 release。
- `3aa8889a` 在第四轮后增加可选人工授权等待预算，默认 120 秒、最高 600 秒，仅用于三条显式 SignIn 终态等待；[独审](native/authorization-timeout-review01.md) 58/58、父级[整合](native/recovery-integration02.md) 161/161 通过、零跳过。未再次发起真实登录，启动/连接/数据预算与严格身份门槛不变。
- `ae4b7e33` 增加仅 fresh 临时库的 GUI 本地保存/取消/重启执行器，[独审](native/cancel-local-review01.md) 11/11；父级在 `44a9f43f` 整合 172/172、零跳过。随后真实 [cancel-local-live01](native/cancel-local-live01/README.md) 在 prepare.ready 超时，详见下文，不能将 fixture 通过当作实机用例通过。
- 启动 handoff 保持原 `startupReady` 条件，采用同步 commit 取消及双 rAF/250ms 有界后备；debug idle 改为有界重新采样，保留命令双 rAF 和全部真实 busy/save/error 门槛。固定启动诊断在 ready 前只读开放，严格拒绝额外参数，显式测试 slot 对 owned 窗口请求一次正常激活。[独审](native/startup-debug-review01.md)关闭 serde 参数解析发现并实际执行 native 2/2；父级[整合](native/startup-debug-integration01.md) **214/214**，零跳过。新精确 [GUI 构建](macos/9e7c46d2-debug-e2e-build01/README.md)经[独立身份核验](native/gui-startup-build-review01/README.md)后实跑 live02，通过不证明 live01 的精确根因或真实账号授权。

## 实际桌面证据

两个原始专用数据根保持为：

```text
/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a
/private/tmp/account109-desktop-real-90b8b28b-01/desktop-b
```

没有清库、复制 grant、手工配对或为续验重造冲突。

| 记录 | 结果与可证范围 |
| --- | --- |
| [full-native02](macos/full-native02/README.md)，source `39c1420d` | 十项通过：真实授权恢复、自动连接、A→B 与 B→A 完整格式 document/plainText、附件引用/授权读取/磁盘原字节、暂停排除、恢复补齐、离线重启补齐、账户 UI 关闭期间同步及并发共同基线。整轮仍为 `NATIVE_TIMEOUT` 失败，后续 keep-all/退出没有完成。 |
| [WebView continuation01](macos/full-native02-continuation01/README.md) | 两分支基线匹配；A 启动 loading/documentProbe 超时，B 未启动，清理有 SIGTERM。没有解决冲突或退出。此失败保留。 |
| [headless smoke01](native/headless-smoke01/README.md)，source `be037f3c` | 全新临时库 7 项通过：真实原生参与者、零 WebView、未登录、完整正文保存、同 ID 重开一致及两进程自然退出。 |
| [headless continuation01](native/headless-continuation01/README.md)，同一对原库 | 91.131 秒，整体 PASS。启动前两套完整分支基线只读匹配；双方原生 conflict digest 精确匹配后，仅执行一次生产 keep-all。双方均保留两个完整分支与原始 PNG/bin，冲突归零。A 实际退出后新建本地笔记、自然关闭并重启，原有全部全文/附件和本地新建均保留，两向新数据排除通过，B 始终保持登录 ready。三个进程实例自然退出，零强制信号，结束后无 notes-clone 进程。 |

keep-all 比较完整字段，仅正规化新副本必须改变的身份 ID、投影 revision 与物理路径。文档每个附件引用必须属于对应笔记；生产授权读取与实际受管文件原字节分别核对。两份完整分支在两个桌面形成四条独立证明，细节和 SHA256 见原始结果。

退出排除为重启前 27 次/3005.8665ms、重启后 29 次/3009.147083ms 的重复采样。它不构成无限期排除证明，也不包含退出后重新登录或账户切换 UI。

新的原生候选 SHA256 为 `f5b64d0dbaa7001b2e00ee94f40fcdc69f6da7f0584f44dc6c42cf3bc2405add`，与旧 WebView 候选不同；[构建回执](native/headless-build01/receipt.json)保存干净源码、1653 项产品输入、工具链及编译前后一致性。不声明内嵌前端身份。原生 7 项与关闭 feature 编译、Node 59 项均独立复核通过。

## Android 与剩余条件

手机 4G 与桌面 WiFi 可能无法打洞的要求已单列 [匿名中转用例](ACCOUNT-TEST-CASES.md#4g-与-wifi-匿名中转)。产品已显式配置 Quick Tunnel；默认先尝试 WebRTC/iroh direct，再回退至 Cloudflare，中转内部保留 mTLS 与产品 enrollment/Noise 检查。

新增 [RELAY-01 独立公网回执](native/relay-live01/receipt.json)：精确测试源码 `d3a5f10e`，一次执行 44.639 秒、退出 0。使用真实预置 provider 和正常 heartbeat 发布，公开 `Client::map` 经 WebRTC 受控失败、iroh 明确关闭后，实际选中 `cloudflare-tunnel`。64 KiB 合成字节往返、EOF/SHA256、错误 fingerprint 在真实 WSS upgrade 后被内层 mTLS 拒绝均通过；operation pass、cleanup 无错误，本次一个 provider PID 已回收。测试默认 ignored 且要求显式网络开关，无新增生产配置或认证绕过。协调面和身份为本地 fixture，所以此结果只验收真实公网中转传输层，不验收 Logto、产品 enrollment/Noise、Android provider、4G/WiFi 或切网恢复。

隔离测试包 `com.local.notesclone.account109` 未覆盖用户原应用。最近一次保数据更新和重启核对保留了四篇合成全文；实际登录终态为 `account_network / coordinator`。同源 Rust/reqwest 探测中六次 coordinator 请求均在约 5 秒连接阶段超时，而 Logto discovery 在 1.093 秒返回 200，见 [原始探测](android/public-native01/README.md)。没有改 DNS、VPN、路由、证书或固定 IP，也未确认精确网络原因。

[此前 12:23–12:25 只读复查](android/goal-network-recheck01/README.md)：手机单次 health GET 退出码 7、无 HTTP/TCP/TLS 成功结果，随后主机单次同地址请求为 200。当时原生桌面访问明确报告 Mac locked。没有新的登录、应用/数据操作或网络设置变更。

后续当前条件更新：[13:09 手机复查](android/current-access02/README.md)的 active-default 为 CELLULAR，单次 canonical GET 仍 curl 7／HTTP 000、无 TCP/TLS 完成；host control 200。父级原生 Chrome AX 已成功，随后 [13:18 全新库 GUI preflight](native/gui-access02/result.json)在旧精确候选上约 3.3 秒 ready，interactive/startupDetached 为 true，正常读取空库与 signedOut，进程自然退出 0、无强制信号且已消失。桌面本轮访问前提已恢复；此通过不追认此前 WebView 超时原因，也未打开原库或发起登录。

[13:24 有限路由分类](android/coordinator-route-class01/README.md)补足了此前记录缺少的尝试地址类别：同一次 curl 中观察到 public IPv4/IPv6 与文本归约的 ETIMEDOUT，没有观察到 benchmark-reserved 地址。此为 shell UID 2000，不证明 app UID 路径或精确根因；原始 IP/verbose 未保留。ADB 已释放，不重复相同 health 检查。

13:40 原库 GUI relogin01 实际执行失败，仍使用 source `39c1420d` 的旧精确候选。启动前两个原库重叠文档/附件基线一致；A/B 均真实 GUI ready。A 为 signedOut，B 为 `account_authentication / identityRefresh` 且仅有部分 profile，随后 runner 的 username 断言过早报 `CHECK_FAILED`。没有发起 SignIn、enable 或编辑，两端自然退出 0、零强制信号。私有原始输出保留在 `/private/tmp/account109-desktop-relogin01`，不收录数据库或授权材料。旧认证库把所有 refresh HTTP/OAuth 请求错误折叠为 RefreshFailed，因此本次不证明 B grant 失效；[修复契约](../../plan/tasks/app-account109-refresh-recovery.md)要求保留网络/拒绝/响应类别，并在新候选和新输出目录续验。

[后来当前访问检查](native/current-access03/README.md)再次被 Mac locked 阻止；记录于 14:50，精确 AX 操作时间未单独返回。新 `10814415` GUI 已构建，尚未在原库运行 relogin02 或发起新的授权。13:18/13:40 的可访问状态仍按其历史时点保留，不作为当前已解锁证明；不尝试绕锁或改变系统设置。

15:06–15:07 的[新原库 relogin02](native/relogin-live02/README.md) 使用 source `10814415`、SHA256 `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f` 的 debug E2E GUI。启动前原库重叠基线一致，两端 GUI ready。B 启动错误在新实现上明确分类为 HTTP 400 `invalid_grant`；执行器核对实际“重新登录”界面后调用一次产品 SignIn handler，状态从 authorizing 转为 `account_auth_identity_invalid / responseMetadata`，本轮失败。浏览器前后观察未发现新增标签；这不证明期间从未短暂打开页面，也尚未确定底层原因。没有编辑笔记或 enable，A 的 SignIn、补齐、双向修改及重启未执行；两端自然退出 0、无强制信号。原始私有输出保留 `/private/tmp/account109-desktop-relogin02`，不收录 DB 或 grant。新的[包静态独核](native/gui-recovery-build-review01/README.md)和[执行器独审](native/relogin-review03.md)不替代这次失败。

15:50:43–15:52:56 的 [relogin03](native/relogin-live03/README.md) 使用上述新诊断候选，原库基线与两个 GUI ready。B 在完整 120 秒只读观察内持续 clean signedOut，随后一次实际 UI“登录”进入 authorizing，并返回 `account_auth_identity_invalid / responseMetadata`，明确 `tokenOperation=codeExchange`、`tokenField=scope`。这证明授权码交换的已解析响应中，返回 scope 未包含当前客户端要求的 connect；不证明具体账号、Logto 角色配置错误或 resource access JWT 的 scope。ID-token 身份校验尚在后续，故不能假定本轮已验证为预期 QA 身份。父级未完成浏览器表单操作，前后可见标签清单没有新增授权页，不据此否认曾有短暂/复用页面。没有笔记编辑、enable 或后续同步阶段；两端均自然退出 0、无强制信号。私有原始目录 `/private/tmp/account109-desktop-relogin03` 保留，只读配置核对与公开源码研究随后完成，未发现 QA 缺权限依据；新显式 Login+Consent 已实现，但尚未实际验证是否解决本轮错误。

真实 ANDROID-01～04 尚未执行。需要测试手机/测试应用能够正常连接协调服务，再完成真实账户授权和三端收敛。A 已因退出用例正常退出账户，后续三端需通过真实系统浏览器重新登录 A；本轮曾恢复桌面访问，但[准备第四轮时再次锁定](native/current-access04/README.md)，原库重新登录续验尚未通过。不得恢复旧 grant 副本来跳过登录。

[正式域名提案](server/custom-domain-proposal01/PROPOSAL.md)只读确认现有项目没有已配置的自定义域；拟议 `cybernote-sync.aixgg.com` 尚未配置或获得该域使用确认。原生 transport 与 enrollment issuer 的拆分已由[独立审阅](native/coordinator-alias-review01/README.md)接受并合入 `4461753f`，12/12 定向测试通过；两个生产常量仍为旧 Vercel 地址，不改变 token 目的地、部署或 DNS。此兼容准备不表示手机可达性已经恢复。

WebView IPC、编辑器草稿、物理输入、系统附件 picker、全部登录取消/账户切换/重新登录排列不由无界面结果替代。逐项边界见 [用例](ACCOUNT-TEST-CASES.md)。历史超时原因仍未证明，不能把无界面测试通过描述为 UI 启动故障已修复。

此前准备第四轮的 CUA 只读访问明确返回 Mac locked；[current-access04](native/current-access04/README.md)保留该历史记录。随后正常桌面访问恢复，16:46:44–16:50:54 的 [relogin04](native/relogin-live04/README.md)实际运行新候选：两 GUI ready、原库重叠基线通过；B 完整 120 秒 clean signedOut 观察后发起一次产品 SignIn，保持 authorizing，等待终态超时。父级未填写表单，没有编辑/enable，后续数据阶段未运行；两端自然退出 0、无强制信号，结束后两个 PID 已不存在。原生 Chrome AX 曾出现登录页，但扩展清单未列出对应页；期间一次 AX 读取超时导致控制会话重置，精确 AX 操作时间未记录。这不证明 opener 失败、历史 scope 故障解决或返回身份正确。私有原始目录保留 `/private/tmp/account109-desktop-relogin04`。

控制会话重置后，仅存在于该会话 RAM 的受控 QA 登录密码不可恢复；协作者也未持有可恢复来源。未重置密码、读取 grant、复制授权或创建替代账号。再次真实授权需要受控凭据来源重新提供，或由用户在新一轮有效登录页完成 QA 登录。Android 的正式域名提案仍待负责人输入，未改变 DNS、部署或 token 目的地。

17:21:37–17:22:37 的 [cancel-local-live01](native/cancel-local-live01/README.md) 只创建了全新临时库。45 秒 ready 等待中页面保持 complete，但 root aria-hidden/inert、startup=loading、WebView visibility=hidden；未获得 interactive，没有任何文档编辑、SignIn 或 cancel。关闭亦超时并由 driver 对 owned PID 27714 发 SIGTERM，整体 FAIL/cleanup failure；结束后单独确认 PID 不存在。原结果 `pidAbsent:false` 是 close 抛错后检查未执行的字段，原样保留，不据此判定进程仍运行。之后 Finder AX 正常成功，精确操作时刻未留存，不保存其原始内容，不把此成功追溯成测试期间状态或锁屏根因。失败临时库仅 72 KiB allocated，保留供调查。

## 工作区与交付

按用户追加的磁盘要求已[清理 12 个过期 Cargo target](workspace-cleanup04/README.md)，保留当前共享 target、候选、原库和全部证据。目录原 du 合计 42.56 GiB，不等于真实回收；文件系统空闲量观测增加约 23.47 GiB，结束时约 27.30 GiB 可用。后续优先复用保留的构建目录。

[详细工作区审计](workspace-current02/README.md)覆盖当时 27 树；本轮[收尾复查](workspace-closing03/README.md)覆盖 35 个有效树，第一方产品/执行器代码均已提交整合，待提交仅为本轮结果与归档文档。279 个历史未跟踪文件为 Android 构建输出/复制依赖，保留原地；历史分支独有诊断代码也保留，不盲目合并或删除。新代码、驱动、用例和证据按审阅范围提交，见 [提交记录](WORKSPACE-COMMITS.md)。

最新已准备的净化来源为 `9010c5ba`，见[当前源码草案](publish/current-source-draft01/README.md)：1772 文件、95,275,206 字节，全新无父 root `66ad8c52`，独立 Git、单一 main、无 remote 或历史残留；精确 inventory、隐私/许可/依赖闭包、版本和 `verify --new-root` 通过。与 `920fa9cf` GUI 候选相比，该固定源 ref 只增加过程文档与验证脚本，没有产品路径改变。九个旧净化根保持原样。原历史、授权文件、原始 DB、过程证据与密钥不进入可发布源树。此为真实验收尚未完成的本地 DRAFT，尚未创建 GitHub 仓库、push 或运行 Actions；最终受验来源若改变产品输入需新建后继候选，维持真实测试完成后的交付顺序。

该 DRAFT 已补齐[实际 Node/前端前置](publish/current-source-node-preflight01/README.md)：独立临时 clone 中离线锁定安装、净化 checkout gate、版本、typecheck、发布测试 19/19 与前端 build 均通过。固定净化 root `66ad8c52`、fingerprint `87db73de…877585`、1621 输入与前后 clean/四 lockfile 一致；这与开发 GUI 候选的输入计数不同，不混用身份。采样最大新增分配量 301.32 MiB，回执保存后已删除该次 clone/依赖/dist，仅保留小型证据。没有 native 编译、实机验证或实际 Actions。

随后匿名中转测试已合入 `f84bb9e1`，`ec4147b6` 只更新该文件的清单 SHA；旧 `3192943d` 封存候选仍保持原字节，未含此次新测试。正式发布前需从最终已验来源重新封存，不能把旧候选称为包含本轮测试。

[本轮净化来源独核](publish/relay-source-check01/README.md)在精确 `ec4147b6` 上通过：发布工具 19/19、零跳过；该次仅校验导出 1,771 文件，未创建新历史或新封存根。八个已有候选的 60,084 项快照保持一致，未执行远程操作。至 `86cf971f` 的后续 main 只增加文档与证据，故该次草案复用相同导出字节；之后 `4461753f` 已修改 native 输入，不再属于相同产品字节范围。
