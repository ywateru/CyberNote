# 账户同步实际验证结果

2026-11-13，Asia/Shanghai。**双桌面核心同步功能已有实际数据验证；本轮桌面访问恢复，新候选原库 relogin02 在真实重新登录操作后因 `responseMetadata` 失败，仍未完成登录补齐。Android 账户三端仍受 coordinator 网络连接阻塞。整体交付未完成。** 下列结果来自多轮明确候选，不是一次完整 UI 测试全部通过。

## 分析与完善

数据链为 Logto 原生授权 owner → Vercel profile/enrollment → CyberGrid 自动发现与可信连接 → 原有同步 adapter/Session → SQLite 文档与受管附件。设置页不拥有账户 Runtime 生命周期；同步完成需验证实际文档、附件归属及原字节，不能以命令 ACK 或设备 online 判定。完整契约见 [架构](../../architecture/account-sync.md)；两个自定义数据根的 lease/cache 隔离和此前手工同步结果见 [sync108](../sync108/RESULT.md)。

本阶段已收拢的必要改进：

- 服务端把实际 JWKS 获取传输故障与身份验证失败区分为安全的 503/401，保留 issuer、audience、算法及 claims 校验。修复经独审，完整服务 172/172（含 29 Redis）通过，零跳过，并已部署到 canonical 服务，见 [部署记录](server/jwks-deployment01/README.md)。
- 原生错误保留有限的操作阶段和 SDK provider 原因，前端严格校验 DTO，避免第三方原文或凭据进入报告，见 [诊断审阅](native/coordination-diagnostics-review01.md)。
- 测试执行器区分 120 秒连接预算和 60 秒数据预算；保留失败原库与证据。为完成用户允许的命令调用验证，新增只在显式桌面 debug 测试模式生效的无 WebView 入口，使用真实 Session token 与生产协调协议，不修改生产同步权限或提交规则。
- 三端执行器在启动桌面或同步前保存手机原有四篇全文及附件证据，并在合并、补齐和结束检查保全；设备外 37 项及独审通过，但尚无三端实际运行结果。手机起源附件明确列为未执行，见 [复审](macos/three-peer-runner-review02.md)。
- `20d62c11` 已补齐手机起源固定 PNG/bin 用例：通过既有产品附件提交路径写入本轮新笔记，比较 C/A/B 完整正文、引用、授权读取原字节及 A/B 受管磁盘文件；[独立检查](native/phone-files-review01/README.md) 21 项通过。此为执行器准备，尚未在手机实际执行。
- 本轮登录恢复修正已合入 `99198fd`、`35ebf385`、`0fe41dca`：只有 HTTP 400 的 typed `invalid_grant` 才归为刷新拒绝；网络/429/5xx、配置与无效响应保持各自有限类别。网络“重试连接”复用保留授权和严格 bind，尊重已暂停状态，状态轮询仍只读；未知错误不能触发 replacement logout。独立 native 25 项、Node policy 6 项、auth crate 与增量反例，以及父级旧 [124 项](native/recovery-integration01.md)、新增手机附件后的 [138 项 Node 整合](native/recovery-integration02.md)均通过。此为源码/fixture 验证，新 GUI 实际恢复结果另列下方。
- `370ee4f4` 已补齐 `responseMetadata` 的固定 tokenOperation/tokenField 诊断，三个 token 校验路径保持原有认证要求；`278bbe28` 只在显式允许、完整启动预算持续 clean signedOut 和历史 owner 摘要匹配时续验 B。前者[独审](native/token-response-review01.md) native 26、auth 26（1 公网默认 ignored）、DTO/helper 31 项通过；后者[独审](native/relogin-signedout-review01/README.md) 29 项通过。父级新整合组 148 项通过、零跳过。它们不解决既有 relogin02 失败，正在构建 `d1a6eadf` 诊断候选进行新的有限实测。

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

真实 ANDROID-01～04 尚未执行。需要测试手机/测试应用能够正常连接协调服务，再完成真实账户授权和三端收敛。A 已因退出用例正常退出账户，后续三端需通过真实系统浏览器重新登录 A；当前桌面访问已恢复，但原库重新登录续验失败待诊断。不得恢复旧 grant 副本来跳过登录。

[正式域名提案](server/custom-domain-proposal01/PROPOSAL.md)只读确认现有项目没有已配置的自定义域；拟议 `cybernote-sync.aixgg.com` 尚未配置或获得该域使用确认。原生 transport 与 enrollment issuer 的拆分已由[独立审阅](native/coordinator-alias-review01/README.md)接受并合入 `4461753f`，12/12 定向测试通过；两个生产常量仍为旧 Vercel 地址，不改变 token 目的地、部署或 DNS。此兼容准备不表示手机可达性已经恢复。

WebView IPC、编辑器草稿、物理输入、系统附件 picker、全部登录取消/账户切换/重新登录排列不由无界面结果替代。逐项边界见 [用例](ACCOUNT-TEST-CASES.md)。历史超时原因仍未证明，不能把无界面测试通过描述为 UI 启动故障已修复。

## 工作区与交付

[工作区新审计](workspace-current02/README.md)检查了 27 个当前有效工作树；正在执行的 token 诊断工作树另列，其余没有未提交第一方产品或执行器代码。279 个历史未跟踪文件为 Android 构建输出/复制依赖，保留原地；历史分支独有诊断代码也保留，不盲目合并或删除。新代码、驱动、用例和证据按审阅范围提交，见 [提交记录](WORKSPACE-COMMITS.md)。

最新已封存净化来源为 `86cf971f`，已[独立准备](publish/recovery-relay-prepared01/review.md) 1771 文件、全新无父 root `b489451a`；与旧 319 候选仅 SDK relay 测试和对应 manifest pin 不同。原历史、授权文件、原始 DB、过程证据与密钥不进入可发布源树。净化/隐私/许可/依赖与版本检查通过，八个旧候选保持原样。此为本地草案，尚未创建 GitHub 仓库、push 或运行 Actions；本轮后续 native 修改需要最终受验来源的后继候选，维持真实测试完成后的交付顺序。

随后匿名中转测试已合入 `f84bb9e1`，`ec4147b6` 只更新该文件的清单 SHA；旧 `3192943d` 封存候选仍保持原字节，未含此次新测试。正式发布前需从最终已验来源重新封存，不能把旧候选称为包含本轮测试。

[本轮净化来源独核](publish/relay-source-check01/README.md)在精确 `ec4147b6` 上通过：发布工具 19/19、零跳过；该次仅校验导出 1,771 文件，未创建新历史或新封存根。八个已有候选的 60,084 项快照保持一致，未执行远程操作。至 `86cf971f` 的后续 main 只增加文档与证据，故该次草案复用相同导出字节；之后 `4461753f` 已修改 native 输入，不再属于相同产品字节范围。
