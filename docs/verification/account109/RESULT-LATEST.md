# 账户同步实际验证结果

2026-11-13，Asia/Shanghai。**双桌面核心同步功能已完成本轮实际数据验证；Android 账户三端仍受 coordinator 网络连接阻塞，整体交付未完成。** 下列结果来自多轮明确候选，不是一次完整 UI 测试全部通过。

## 分析与完善

数据链为 Logto 原生授权 owner → Vercel profile/enrollment → CyberGrid 自动发现与可信连接 → 原有同步 adapter/Session → SQLite 文档与受管附件。设置页不拥有账户 Runtime 生命周期；同步完成需验证实际文档、附件归属及原字节，不能以命令 ACK 或设备 online 判定。完整契约见 [架构](../../architecture/account-sync.md)；两个自定义数据根的 lease/cache 隔离和此前手工同步结果见 [sync108](../sync108/RESULT.md)。

本阶段已收拢的必要改进：

- 服务端把实际 JWKS 获取传输故障与身份验证失败区分为安全的 503/401，保留 issuer、audience、算法及 claims 校验。修复经独审，完整服务 172/172（含 29 Redis）通过，零跳过，并已部署到 canonical 服务，见 [部署记录](server/jwks-deployment01/README.md)。
- 原生错误保留有限的操作阶段和 SDK provider 原因，前端严格校验 DTO，避免第三方原文或凭据进入报告，见 [诊断审阅](native/coordination-diagnostics-review01.md)。
- 测试执行器区分 120 秒连接预算和 60 秒数据预算；保留失败原库与证据。为完成用户允许的命令调用验证，新增只在显式桌面 debug 测试模式生效的无 WebView 入口，使用真实 Session token 与生产协调协议，不修改生产同步权限或提交规则。
- 三端执行器在启动桌面或同步前保存手机原有四篇全文及附件证据，并在合并、补齐和结束检查保全；设备外 37 项及独审通过，但尚无三端实际运行结果。手机起源附件明确列为未执行，见 [复审](macos/three-peer-runner-review02.md)。

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

隔离测试包 `com.local.notesclone.account109` 未覆盖用户原应用。最近一次保数据更新和重启核对保留了四篇合成全文；实际登录终态为 `account_network / coordinator`。同源 Rust/reqwest 探测中六次 coordinator 请求均在约 5 秒连接阶段超时，而 Logto discovery 在 1.093 秒返回 200，见 [原始探测](android/public-native01/README.md)。没有改 DNS、VPN、路由、证书或固定 IP，也未确认精确网络原因。

[12:23–12:25 最新只读复查](android/goal-network-recheck01/README.md)：手机单次 health GET 退出码 7、无 HTTP/TCP/TLS 成功结果，随后主机单次同地址请求为 200。原生桌面访问也仍明确报告 Mac locked。没有新的登录、应用/数据操作或网络设置变更。

真实 ANDROID-01～04 尚未执行。需要测试手机/测试应用能够正常连接 `https://cybernote-sync.vercel.app/healthz`，再完成真实账户授权和三端收敛。A 已因本次退出用例正常退出账户，后续三端需通过真实系统浏览器重新登录 A；最近原生访问曾明确报告 Mac locked，需要可交互桌面条件。不得恢复旧 grant 副本来跳过登录。

WebView IPC、编辑器草稿、物理输入、系统附件 picker、全部登录取消/账户切换/重新登录排列不由无界面结果替代。逐项边界见 [用例](ACCOUNT-TEST-CASES.md)。历史超时原因仍未证明，不能把无界面测试通过描述为 UI 启动故障已修复。

## 工作区与交付

[工作区审计](WORKSPACE-AUDIT-LATEST.md)检查了 20 个当时有效工作树，没有遗漏的未提交第一方产品或执行器代码；279 个历史未跟踪文件按路径判为 Android 构建输出/复制依赖，保留原地。其后新增的原生测试代码、驱动、用例和证据按审阅范围提交，见 [提交记录](WORKSPACE-COMMITS.md)。

最新净化来源为 `3192943d`，已准备 1771 文件、一个全新无父提交的独立 sealed root；原历史、授权文件、原始 DB、过程证据与密钥不进入可发布源树。净化/隐私/许可/依赖与版本检查通过，发布工具 19 项通过。旧封存候选保持原样。此为本地准备，尚未创建 GitHub 仓库、push 或运行 Actions；维持真实测试完成后的交付顺序。
