# immutable11 真实 LAN 与匿名 wss 作者验收

2026-11-06。**本次实际路线运行通过，等待另一代理独审。** 前批 build08 的 Rustls CryptoProvider panic 与原始失败全部保留在上级目录；没有追改旧证据，也没有用新结果给旧 binary 补记成功。

## 冻结来源

- 后端产品 `cd334bc88513a89c490788d2e2e27c7967575f4a`，root 已独审接收。
- 本轮准确 binary `/private/tmp/sync86-transport-build11/notes-current-attachment-transport`，执行前后SHA256均为 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`，由CLI显式expectedSHA核对。本代理未编译、写Rust或借target。
- 后端实际只读源树HEAD `0feb310ddae132adb13652ba909b323a72280c3c`；[source-mapping](source-mapping.json) 保全它与产品commit在指定Rust/manifest/runner输入路径的空diff、exit0。harness采样55个tracked生产及runner输入，前后clean且SHA256同为 `77cae55ece5f66cb0c36a387ab7972056a7ab7c8d64da3da100249a4782a5d98`。这55项不冒充root单独审计的47个产品文件计数。
- 完全沿用冻结 harness产品 `7323d818`，执行时分支HEAD `4e3a3f37` 仅额外旧证据。脚本前后SHA256同为 `6d53b6b3256958046d1f3794f9ccec1513b2dce7e17acc37192bdcd12041f044`，没有为使新运行通过修改脚本、协议、超时、Noise或Store算法。

## 实际结果

[精确命令和父进程退出](run.execution.json)、[原始 stdout](run.stdout.log)、[原始 stderr](run.stderr.log)、[完整结果](result.json)。

- **56项检查通过，命令自然exit0。** harness完整内部92252ms；含父进程启动/退出的外层 **92337ms**。这56项含路线数据断言、进程退出和来源不变检查，不说成56个产品功能。
- 真实LAN：`ws://192.168.0.119:59074`，en0，同一台物理Mac上的两个独立Store/进程。A建笔记→B、B编辑→A；PNG A→B、合成WAV B→A。原客户端新邀请重复pair及原目录冷启，新endpoint连接。只能证明本机真实LAN地址路径，不外推两台硬件。
- 首个匿名外部端点 `wss://develop-empirical-allied-dairy.trycloudflare.com`。真正外部WebSocket Upgrade并close探测后，生产Rust **Noise配对成功，2550ms**，继而笔记双向、图片/录音原媒体真实传输。
- 错误密钥：新合成客户端只把 fresh invitation 内的PSK替换为错误32字节值，其他邀请字段保持；实际经过同一个外部端点和origin后拒绝，2282ms，未启用Store（workspaceId仍缺省）。客户端安全错误码为 **`sync_transport`**，服务端Noise失败关闭连接；没有伪称返回明确authentication错误码。透明origin trace中该尝试有851上行/278下行，真实Upgrade，区别于旧build08在TLS task panic时根本未到origin。本层不解密或记录Noise payload。
- 首个端点停止后，新建第二个独立owned匿名端点 `wss://lung-regular-picking-romance.trycloudflare.com`。由服务端为该新地址**生成全新邀请**，不改写旧邀请URL；原客户端、原Store重复pair成功，1848ms。固定Noise host key和workspace保持，新的endpoint持久存在。第二路线再次通过双向笔记与PNG/WAV完整性。
- 原客户端正常退出后，在**同一目录**新进程启动；服务端再建的新笔记通过新匿名hostname到达。没有重建客户端数据，也没有用全量导入掩盖重连。
- 每条路线的PNG为68字节、WAV为160044字节；WAV由内存PCM生成，没有真实麦克风。远端读取、显式导出和独立受管媒体文件均对原字节SHA；WAV跨多个生产帧。记录于result.checks的源SHA：PNG `c054eec0ca71070d8406b12c9e0b1745c861d337f4818c5fe8334e1b4c0dc425`、WAV `b43dde9816f8047e0c351a5a756f99d75433396ce8f4ac0b36dc1d825f26127e`（准确摘要以原始JSON为准）。

## 准确退出与资源边界

7个Rust进程全部stdin EOF后自然code0/signal null；harness quiet异步错误为空。两个新隧道都只操作各自spawn得到的owned PID，origin透明代理及socket关闭，没有killall或ADB。

- 第一个 cloudflared **PID21663**：先发SIGTERM，已记录 `Initiating graceful shutdown` / `Unregistered`，但等待8秒后仍未退出；harness使用预定fallback **SIGKILL**。最终 `code:null, signal:SIGKILL, forced:true`。这是强制清理，**不能写自然退出**。它发生于完整媒体与错误PSK测试之后，换址流程明确停止旧隧道。
- 第二个 cloudflared **PID21719**：SIGTERM后graceful退出code0/signal null、forced false。
- [owned-cleanup](owned-cleanup.json) 用只读liveness核验7个Rust+2个cloudflared PID均不存活。报告没有将第一隧道强制退出改写成自然exit0。

配置均位于本轮owned输出目录，显式指定非空URL配置、owned不存在的origincert路径，未登录账号、未读改用户既有cloudflared配置、未替换HOME。无修改VPN/路由/防火墙，无下载或更新binary。现有用户隧道未操作。

原Android、旧AVD/emulator5580、原13秒录音、Apple Notes与真实用户库均未触及。邀请/PSK仅内存，没有复制 `.sync` 凭据或SQLite到仓库；证据仅安全计数、非敏感地址、文件摘要和原始进程日志。临时合成目录 `/private/tmp/sync87-routes-build11-final01` 保留供独审。

## 范围及仍未验证

这是实际 Rust/Store/socket/quiet 路线验收，空闲文档参与者由harness明确提供；不代表真实双App DOM、Android原生/provider、整体像素、软件签名或准确新包已经通过。本轮未重跑既有UI56+56、低层实体全矩阵或构建；那些由各自冻结任务接收。

未具备明确owned、可安全连接的WireGuard/EasyTier对端。只读检查仍无 `wg` / `easytier-core` / `easytier-cli`，系统utun和198.18.0.1不能据此认定任何一种产品，故 **实际WireGuard/EasyTier路线未验证**。应用仍以 `ws://可达虚拟IP:端口`（或wss）作为邀请endpoint，系统组网负责网络；本代理不为验收配置用户VPN。一般公网HTTP失败/临时Tunnel无SLA也不能外推永久可达性。

新邀请方式本轮证明新endpoint可用及数据重连；它不是对“自动移除每个历史邀请/旧endpoint”或所有peer状态展示的额外承诺。56项没有把不存在的GUI操作或未测的peer管理推断成通过。
