# Account109 工作区整理与提交

2026-11-13 匿名中转补充：`92f3a290` / `317172a6` 补充跨网用例与 Android 既有证据审查；`f84bb9e1` 合入经独审的 opt-in 真实 Quick Tunnel 回退测试（作者 `d3a5f10e`）；`ec4147b6` 仅刷新该测试文件的净化清单 SHA。生产代码、提供程序资源与部署未改变。[独立公网实测](native/relay-live01/README.md)一次通过，真实账户/手机 4G 与三端未由此验收。旧 sealed root 保持原样，仍是旧精确来源；后续发布需使用包含已审新测试的重新封存候选。

`c43e708c` 收录公网实测和当前用例/边界；精确 `ec4147b6` 的[发布来源独核](publish/relay-source-check01/README.md)随后完成 19/19 与 validation-only export，八个已有候选保持原样。未创建或推送远程仓库，未运行 Actions。

随后 `ca08c3b5` 定义原库 GUI relogin 续验，`8417e23d` 定义正式域兼容准备；`4461753f` 合入作者 `72b397a3` 的固定 transport/issuer 拆分，独审 12/12 通过，生产地址保持旧值。`5a428917` 明确 refresh 请求错误分类与尊重暂停状态的显式恢复契约。桌面访问已恢复，但 relogin01 实际失败在启动 B 的部分 profile 断言，尚无授权或数据变更；不要把旧候选通用 refresh 错误当作 grant 无效。新净化草案来源 `86cf971f`、无父 root `b489451a` 已封存，未含后续 native 修改。当前仍为本地开发提交，未推送任何开发历史。

`cd0ae1d` 收拢经独审的原库 relogin 执行器，旧 binary 的未分类 B 恢复继续禁止；`a2b5be7d` 收录当前访问、失败运行与准备归档，61/61 archive hash 独核通过。`c89e5e41` / `d3706ecb` 补齐 UI 恢复和用例契约。`99198fd`、`35ebf385` 收入有限 refresh 分类，保留 review01 失败反例与后继批准；`0fe41dca` 收入独审 native/UI retained-owner 恢复。`10814415` 只刷新对应 11 个 pin 并新增 recovery.rs 精确源码项，独核导出 1772 文件。父级在此精确 ref 的相关 Node 整合 124 项全过；实际新候选恢复另行记录。

2026-11-13。按用户本轮要求，检查主工作区和当前开发工作树，将已有工作整理为可审阅的本地提交。本轮不扩大登录、部署或发布实现范围。

## 已收拢内容

| 提交 | 内容与边界 |
| --- | --- |
| `737a9dcc`（此前已有） | 账户同步架构、UI 设计、任务拆分与外部服务调研。不是完成实现。 |
| `7c9fb901` | 原生 CyberGrid SDK / Logto 调研、账户 owner 与 workspace 绑定、enrollment 和持续授权缺口、原生任务检查点。没有新增原生登录代码。 |
| `9988a5db` | 忽略本地环境文件、Vercel 状态和签名材料；不改变已跟踪历史。 |
| `2f44391b` | CyberGrid 协调服务源码与许可、固定身份验证的账户 profile、稳定 workspace 派生和 Vercel 入口配置；没有执行真实部署。 |
| `1165633b` | 账户 UI 与显式开发测试能力门控、严格 IPC DTO、fixture 用例和设置回归；默认关闭账户能力。 |

服务作者原提交为 `9a0c7f15`，经 cherry-pick 收入 main。来源 pin 与具体检查见[服务作者记录](server/author.md)。根项目补充 Node `22.x` engines，与协调服务运行要求一致。

UI 作者原提交为 `4cc18c1c`，经 cherry-pick 收入 main，细节与复跑入口见[界面检查记录](ui/README.md)。

## 检查与修正

- 服务独立审阅发现所有用户共用认证限流桶的问题。已改为仅在 Vercel 环境严格接收平台单值 IP，其他环境使用 socket 来源；独立复核接受修复。主工作区重新执行 profile 与平台 IP 定向测试，6/6 通过、0 跳过。
- 主工作区服务 `build:vercel` 通过。作者完整回归在限流修正前 149/149 通过、0 跳过，使用隔离本机 Redis；修正后重新运行构建和上述 6 项定向测试。不能把两次覆盖写成最终版本全量回归已运行。
- UI 独立审阅发现取消失败提前释放登录事务、取消/退出未确认即提示成功、状态恢复后旧错误及重试操作残留三项问题。已修复并补充 fixture 检查。作者桌面/手机账户组 27/28 项、默认设置组 146/159 项、手工同步设置 56 项及生产 debug 隔离检查通过；测试均有明确模拟边界。
- 服务限流修复与 UI 三项修复均由原审阅者在最终合入版本重新只读检查，接受关闭；审阅者未重复作者运行，运行结果仍分别归属作者与主工作区复验。
- 两部分合入主工作区后，重新运行 `pnpm typecheck`、`pnpm build`、`pnpm version:check` 和 `git diff --check`，均通过。前端构建仅有既有大 chunk 提示，未因此增加本轮优化范围。
- `.env`、`.env.local`、`.vercel/project.json`、签名文件和 `artifacts/account109/private/` 的忽略规则已验证。新增源码按精确文件提交，不纳入 node_modules、生成的 Vercel 静态目录或 Android 构建缓存。
- 新增文本做有限密钥模式检查，未发现私钥块、GitHub token 或带真实认证字段的 Redis URL。该检查只针对本轮变更，不是旧历史的发布批准。
- 当前有效工作树中，其他旧任务没有待提交的已跟踪源码修改；旧 Android 工作树残留为插件构建缓存，保留原地，不纳入提交。

## 功能与交付边界

账户界面在原生 `account_command` 实现前仅供显式启用的开发测试，生产和默认开发入口关闭。原设置分类、未登录本地编辑与手工同步保持可用。界面测试使用明确标识的 JS IPC fixture，不等于真实登录或同步验收。

原生授权、账号 enrollment、自动发现和动态映射接入仍待实现；本轮没有重做双桌面/Android 设备验收。既有 sync108 手工同步结果仍按其原记录读取，不能作为账户同步证明。

当前仓库没有 remote，本轮提交只留在本地 main。旧开发历史包含过程材料，后续 GitHub 发布仍必须使用经审计的源码白名单与全新历史，不直接推送本仓库。Vercel 真实部署、真实 Logto 登录及 GitHub Actions 编译打包尚未完成。

## 后续整理检查点（2026-11-13）

本节更新上方早期检查点的状态。主线已继续收拢以下工作，提交仍留在原开发仓库；远程发布继续使用独立的源码白名单和全新历史。

- `73e1c598` 至 `19740840`：独立 Rust 授权 owner 及其 consent、refresh、撤销、持久化和 RFC 9207 issuer 修正。主线认证测试 15 项通过；另显式运行只读真实 Logto discovery 测试，1 项通过。真实 discovery 不等于产品内登录验收。
- `8f968bef`：签名 enrollment、共享 Redis 限流和账户测试用例修正。服务全量回归 155/155 通过，0 跳过；独立限流复核 8/8 通过。`4183af8b` 收敛 advertised scopes 后，相关定向回归 20/20 通过，类型检查与服务构建通过。
- `c1741e80`：固定来源的 CyberGrid SDK、双平台 provider、许可材料和 Noise 持续授权 gate。provider 的上游 notice/module 清单保留原始字节，未为消除空白提示而改变来源指纹。
- `61c3f934`：原生账户 owner、独立 `.account/noise` 凭据、设备发现、签名 enrollment、动态 TCP mapping、生命周期和平台回跳接线。主线原生账户测试 8/8、同步测试 32/32 通过。该提交中的编译与契约检查不替代实际 App 和设备测试。
- UI、发布工具和测试用例的其他已审阅提交已在主线保留；具体测试边界见各自验证文档。生产账户入口仍待原生整合后的候选构建验证。

服务已部署到 `https://cybernote-sync.vercel.app`。本次部署 ID 为 `dpl_7NemtV61Qu94ACyn97jGvxjgSHYo`，状态 READY；部署源码来自 `4183af8b39efb1096d77a254a4a78aa164a89b24`，显式 staging 的 116 个文件摘要为 `8ee35edee965bbfc50e0ecb49b1cd50a7537c28fe277ef518fce47fbecbbcaad`。最终部署复验 health 200、四个 scopes 正确、仅公钥 JWKS 200、匿名 profile/enrollment 401。因本机 fake-IP 路由问题，这组独立 curl 检查仅在测试进程中解析到当前公共 IP，仍使用 canonical hostname 和正常 TLS 校验；产品未添加该绕行。

真实浏览器与独立服务 harness 已验证托管注册、PKCE、profile/enrollment、刷新轮换及撤销；它们没有注入产品 grant，也不构成双桌面/Android 账户同步通过证据。产品内真实用例继续按 [ACCOUNT-TEST-CASES.md](ACCOUNT-TEST-CASES.md) 记录。

主工作区唯一未跟踪项原为 `services/coordinator/node_modules` 临时软链接，已精确移除该链接，依赖源目录保留。私密配置和过程产物仍位于被忽略的目录，不纳入本次提交；没有推送旧历史。当前 Mac 的原生 UI 工具明确返回锁屏且自动解锁失败，真实可见桌面交互验收需要恢复解锁状态。


## 本轮真实同步续验整理（2026-11-13，当前）

本节替代上文较早阶段的“未部署”“锁屏阻碍”“未做双桌面”等当前状态表述，保留早期记录的历史意义。

| 主线提交/材料 | 已收拢内容 | 已验范围 |
| --- | --- | --- |
| `b265cecd` | 服务端区分 JWKS 实际传输失败 503 与身份验证失败 401，保留固定身份校验 | 独审及完整服务 172/172（含 29 Redis），0 跳过；已部署 READY，见 [服务记录](server/jwks-deployment01/README.md) |
| `96410b09` | 原生安全错误阶段和有限 SDK provider 原因，严格前端 DTO | 账户/SDK/DTO 定向测试与独审，见 [原生审阅](native/coordination-diagnostics-review01.md) |
| `159be3d5`、`2b0bd7e2` | 记录 vendored SDK 三处本地变更与净化清单来源 pin | 新净化候选已封存，未推送旧历史 |
| `a070f71b`、`b841913b`、`3d425a58` | 实际双桌面执行器、可恢复网络等待与独立连接/数据预算 | 三轮执行器审阅，最新 full02 十项通过但整轮失败；见 [完整保留记录](macos/full-native02/README.md) |
| `d165efc1` | full02 原始结果、工具字节、过程日志与失败/清理边界 | SHA256SUMS 全部匹配；原有两端数据和待解决冲突保持 |
| `32f9bbcb`、`7936ff8c`、`e037edde` | 三端命令执行器、初始手机四篇全文/附件保全与覆盖边界 | 37 项设备外验证、独立复审通过；真实三端尚未运行 |

手机实际应用及同源 Rust 探测均表明 canonical coordinator 连接阶段超时，而 Logto discovery 为 200，见 [诊断](android/public-native01/README.md)。没有通过改 DNS、IP、VPN 或路由绕过；这不是锁屏结论，也未定位精确网络原因。两个原始桌面真实授权已恢复并自动连接，双向全文及附件字节、暂停恢复和离线重启补齐已有实际证据；冲突保留全部、退出隔离另由命令续验，不能把准备好的工具判为通过。

净化来源 root 保留在独立 sealed 目录；原工作区无 remote，未创建 GitHub 仓库、未 push、未运行 Actions。依照原顺序，在实际测试完成后发布全新历史。密钥、授权文件、原始 DB/凭据副本和本地构建缓存不纳入可发布源树。


### 无界面续验与最终本地整理

- `53bdf876`、`dedc6964` 和 `e5fb6eab`：保留 full02 冲突的命令续验及其独审；原 WebView 续验仍在启动失败，证据收于 `d9b0fe3b`，没有抹去 SIGTERM/清理失败。
- `c4ed6009`：20 个有效工作树只读状态审计，没有发现未提交第一方源码；历史 Android 生成物/依赖保留。
- `983b231d`（作者 `be037f3c`）、`d60be176`：显式 debug/sync-e2e/desktop 双开关的固定原生入口及独立复审，真实 Session 原生参与者保留生产协调规则；7 项和关闭 feature 编译通过。
- `c5ba0435`：新原生专用候选的干净源码、产品指纹、工具链与二进制回执，不声明内嵌前端身份。
- `97223820`（作者 `bb701339`）、`3f64f2ba`：固定 stdio 驱动及原库续验；独立 59 项、四个语法检查通过。
- `f5709809`：实际零窗口临时库 7 项烟测，完整保存重开与两次自然退出通过。
- `3192943d`：净化清单精确更新已审阅的 lib.rs 与新增 sync_headless.rs；其他 pin 不漂移。独立准备 1771 文件的全新单 root，发布工具 19 项和版本/隐私/依赖检查通过，旧封存候选保持。

实际原库 headless continuation01 已 PASS，保留两完整分支与原字节、实际退出后的本地保存/重启和两向排除均通过，三个进程自然退出。精确证据和覆盖限制见 [本轮结果](RESULT-LATEST.md)。历史失败、私有原库和授权保持在各自范围。Android 三端仍需 coordinator 网络条件与后续真实授权；本轮尚无 GitHub/Actions 远程写入，不把本地提交或净化准备称为远程交付。


### 2026-11-13 新 GUI 与手机附件续验

- `4461753f`：固定 coordinator transport 与 enrollment issuer 的独立输入；两个生产值仍保持旧地址，未切换域名或 DNS。
- `99198fd6`、`35ebf385`、`0fe41dca`：保留刷新故障有限分类，仅 typed HTTP 400 invalid_grant 表示刷新拒绝；显式网络重试恢复保留 owner 并尊重暂停。独立审阅及反例见本轮结果。
- `10814415`：更新上述已审来源的净化清单 pin；旧封存根未改动。`b0c8bab9` 保存该来源新 GUI 的精确构建身份，`e21cd0b1` 固定执行器候选及一次恢复决策。
- `20d62c11`：手机新建笔记的固定 PNG/bin 提交与三端全文/引用/授权原字节、双桌面磁盘原字节校验；独立设备外检查通过，真实手机运行尚未执行。
- `30813aec`：收拢 GUI 包静态独核、执行器审阅、手机附件独审及历史 current-access03 记录。

新的父级整合组 **138/138 通过，零跳过**，见 [整合摘要](native/recovery-integration02.md)。本轮桌面已恢复访问并实际运行 [relogin02](native/relogin-live02/README.md)：原库基线、两 GUI ready；一次真实 UI SignIn 后发生 responseMetadata 错误，保留 FAIL；两端自然退出，零强制信号。没有把它作为登录恢复或三端通过。原始 DB/grant 和运行目录保留私有，归档仅包含脱敏结果与已知工具源码。

所有上述提交均为本地 main；截至本记录没有创建远程仓库、push 或运行 Actions。新的 native 修改不包含在旧净化草案中，最终受验来源仍需单独封存。

### 2026-11-13 分类诊断、显式登录与中转观测

- `16a85725`、`370ee4f4`、`d1a6eadf`：token 响应固定 operation/field、三路径拒绝与正确 scope 正例，精确更新九个 export pin。原有认证要求保留。
- `278bbe28` 与后续候选 pin：显式允许的 B clean signedOut 续验，完整只读预算、固定历史 subject 摘要与同账号 gate；不恢复旧 grant。
- `9c19cbef`、`d20f350b`、`298be89f`：实时 Mapping 缓存、三端独立 relay 断言和退役 sampler 竞态修复；初始 P2 与最终解决均保留。
- `08e9a923`、`920fa9cf`：主动登录增加 Login、保留 Consent，后台 restore/refresh 不变，精确更新三个 auth pin。没有修改 Logto 角色/权限。
- `2fb4fe11`、`e97731a4` 等 pin 只替换对应候选常量/说明/构建回执路径；当前 `920fa9cf` GUI 的真实二进制、内嵌前端和干净源码已独立核对。

父级整合组依次 138、148、最终 **156/156，零跳过**，各自源码边界见 recovery-integration02。真实 relogin02/03 仍为 FAIL；第三轮已精确定位 codeExchange/scope，未假定其返回身份。当前候选包含显式重新认证和新中转观测，准备 relogin04 时的锁定后来正常解除，第四轮实际结果另列下方。

[收尾工作区检查](workspace-closing03/README.md)覆盖 35 个有效树；本轮第一方代码已提交整合，原 279 个生成/依赖文件保留未暂存。数据库、grant、原始提供者响应与凭据没有进入本轮归档。最新源码未替换旧封存草案；GitHub 新仓/push/Actions 仍按实际验收后的原顺序待执行。

### 2026-11-13 第四轮实际登录与当前源码草案

- `a6cc1182`：归档 source `920fa9cf` 的真实原库 relogin04；两 GUI/基线通过、一次 B SignIn 后 authorizing 等待超时，没有完成表单或编辑/enable，两端自然退出 0。保留原生登录页可见与扩展清单不一致的有限观察，不推断历史 scope 错误已修复。
- `0e06b715`：限定后续命令行执行器的可选人工授权等待预算，默认 120 秒、最高 600 秒，只作用于三条 SignIn 终态等待。
- `3aa8889a`（作者 `711c6d69`）：实现上述可选等待预算和模拟时钟反例；独立 58/58 与父级整合 161/161 通过，不改变产品或 GUI 候选。
- `bcabf659`：固定 `9010c5ba` 源码的全新本地净化 DRAFT，1772 文件、root `66ad8c52`；九个旧根保留，未创建 GitHub 仓库、push 或执行 Actions。

本轮浏览器控制会话超时重置后，RAM-only QA 登录凭据没有已知恢复来源。没有读取 grant、重置账号或创建替代账号。真实重新登录、Android 4G 三端与匿名中转验收仍需有效 QA 授权和手机 coordinator 可达性；当前正式域名提案未应用。

用户随后要求清理中间文件。父级删除 12 个过期 Cargo target，仅删除经 marker、无 .git 与进程检查的显式目录；文件系统可用量观测增加约 23.47 GiB、结束约 27.30 GiB。独立只读复核确认目录已清理，保留共享 target、当前 GUI 原 SHA256、两原库和新草案均在，见 [清理记录](workspace-cleanup04/README.md)。
