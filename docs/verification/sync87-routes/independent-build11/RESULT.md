# sync87 immutable11 路线独立复核

2026-11-06。**PASS-INDEPENDENT-ROUTE-EVIDENCE-AUDIT；本路线交付无 blocking。** 独立代理只读审阅冻结脚本、生产入口、作者原始日志和保留的合成文件，另写独立审计，未修改产品或作者证据。此结论限定于实际网络路线，不能替代完整桌面／Android 同步验收。

独立审计 [audit.py](audit.py) **32 项检查自然 exit0，外层 1681ms、内部 1636ms**；原始命令和退出见 [audit.execution.json](audit.execution.json)，stdout/stderr 原件保留，逐项结果及文件摘要见 [audit.json](audit.json)。没有独立重跑公网或 LAN 矩阵：作者本次的生产路径、精确冻结来源和完整合成输出足以核对，本轮没有发现需要反例重跑的矛盾。作者的 56 项／92.337 秒是被独审的实际运行证据，**不改称本代理重新执行的测试**。

## 准确来源与独立核对

| 对象 | 本轮独立核对结果 |
| --- | --- |
| 作者提交 | `bd4e531e`，证据 `../build11/` |
| 冻结路线脚本 | 工作树与 `7323d818:scripts/debug/sync87-routes.mjs` 对象逐字节相同；SHA256 `6d53b6b3256958046d1f3794f9ccec1513b2dce7e17acc37192bdcd12041f044` |
| 后端产品 | `cd334bc88513a89c490788d2e2e27c7967575f4a` |
| 不可变 binary | `/private/tmp/sync86-transport-build11/notes-current-attachment-transport`；25,614,448 字节、0555；SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800` |
| builder 元数据 | 原始 `build.json` 的成功 `--locked --offline`、源 commit、不可变 binary 摘要一致；47 项 builder 输入逐项匹配产品 git 对象，复制的生产模块也匹配。47 是 builder 输入数，包含脚本／manifest，不重新定义为纯生产文件计数 |
| 路线指纹 | 用 git 历史对象独立重算产品及实际观察源 `0feb310d` 的 55 项选择集，均为 `77cae55ece5f66cb0c36a387ab7972056a7ab7c8d64da3da100249a4782a5d98`；该选择集历史 diff 为空 |
| 作者归档 | 9 个 manifest 文件的实际大小与 SHA 全匹配；56 项 JSON 检查逐项对应 raw stdout 的 56 行，stderr 空，failures 空，92252ms 内部／92337ms 外部一致 |
| 保留的合成目录 | result 中 31 个导出文件、独立附件文件、配置和 SQLite 文件，实际大小／SHA 均匹配；未打开数据库、未读取 `.sync` 身份文件 |

## 路线与实现审阅

路线脚本直接导入 `rust-backend.mjs`，它使用明确 binary 路径 `spawn`、严格 requestId/stdin 协议，并禁止 fault configure，没有 Fake fallback。不可变 binary 的实际 transport 导入生产 `current/session.rs`、`current/store.rs`、`current/sync.rs`，`sync_command` 进入生产 `sync::adapter::Runtime.command`，`sync_window_reply` 进入 `Runtime.reply`。路由脚本的 80ms event pump 消费 access／quiet 的 probe／prepare，并明确提供空闲文档参与者；没有调用 `headless_apply`、没有伪造同步元数据，也不构成真实 UI 编辑器 flush 的独立证明。

- **LAN**：作者使用 en0 实际 `ws://192.168.0.119:59074`，两个独立 Store／PID，生产新建、反向编辑、PNG／WAV 传输；新邀请更新 endpoint，原目录不同 PID 冷启后连接。此处是同一物理 Mac，不宣称两台设备。
- **首个匿名 wss**：实际 cloudflared 日志的注册 hostname 与 result 一致，先通过真实 WebSocket Upgrade／close，再由 Rust 配对并双向传输。PNG 68 字节、合成 WAV 160044 字节，分别核对远端读回、显式导出和独立受管文件；实际文件 SHA 已另行核对。WAV 大于生产 48KiB 帧上限，涵盖分帧传输。
- **错误 PSK**：源码确认由 fresh invitation 仅替换 PSK 为错误的 32 字节，仍访问同一 wss。作者执行顺序和透明代理第三条连接对应：真实 Upgrade／101，851 上行／278 下行字节，随后关闭；该合成客户端 pair 2282ms 返回 `sync_transport`，status 未采用 workspace。生产服务端从原 invitation 查询真实 PSK，Noise 解码失败会关闭连接。因此这次拒绝确实到达 origin 并经过 Noise，不能与旧版 TLS provider panic 混同。安全错误码是 transport，不冒称专门 authentication 返回值；本轮不记录／解密 Noise payload。
- **换 hostname 与原目录重启**：第一个 owned tunnel 明确停止后创建第二个 tunnel。源码为新地址生成全新 invitation，既有客户端／Store 重复 pair；host key 与 workspace 相同，新的 endpoint 保留。正常关闭后从同一客户端目录启动不同 PID，服务端新建笔记再次到达。第二 tunnel 的第三条已关闭连接有实际回传字节，与冷启新数据断言对应。此处不额外承诺自动移除历史 peer endpoint。

## 凭据与 owned 清理

邀请解码和修改仅保存在局部内存。独立扫描 9 个归档文本原件，未发现完整 invitation token、PSK 或 private key 值；归档没有 `.sync` 凭据或 SQLite 副本。透明代理只记录字节计数、时序和 Upgrade 布尔值。错误路径的 console stack 在本次没有输出，raw stderr 为空。

7 个不同 Rust PID 的实际生命周期均自然 code0／signal null、pending0、quiet errors 空；LAN 和 Tunnel 各自 client/restart 的 root 一致、PID 不同。两个 cloudflared 的配置、工作目录、URL、origincert 路径均是本轮 owned 路径，显式参数覆盖用户配置，未登录账号或更改系统网络。清理只使用各自 spawn child 句柄，没有 killall 或按泛化名称结束进程。

**第一 cloudflared PID21663 确实在 SIGTERM 后 8 秒仍未退出，随后 SIGKILL，forced:true，code:null／signal:SIGKILL。** raw 日志保留 graceful shutdown／Unregistered，不能表述为自然退出。第二 PID21719 收到 SIGTERM 后自然 code0，forced:false。9 个 children 的记录退出与作者 cleanup 原件逐项一致，所有 origin 连接均记录关闭。独审没有向这些历史 PID 发送信号，也没有用当前 PID liveness 推测它们仍是原进程。

## 边界与恢复记录

WireGuard／EasyTier 仍未具备 owned 对端，明确 unverified；generic utun 不能推断其中任一产品已验。未编译 Rust、未占 target、未再次建立公网隧道、未修改 VPN／路由／防火墙、未触碰用户数据库、原 Android／AVD／约13秒未保存录音、真实麦克风或 Apple Notes。此前失败证据均原位保留，没有用本次通过覆盖旧 binary 的失败。

上下文恢复初段误将已交付 gallery83 当成当前任务，在主工作树重复执行 quick-home 手机 45 项和 tsc；两者最终自然0，无源码修改，输出保留 `/private/tmp/notes-android-home-recheck-20261106-01/`。这两项明确记为 **redundant，完全不计 sync 或本路线门禁**。quick-home 在打印结果后退出清理曾等待，最终自然0；独审确认 owned PID 已不存在，没有结束其他进程。接到 root 纠正后未再在主工作树运行测试或写入，本次纯证据提交仅包含当前目录。
