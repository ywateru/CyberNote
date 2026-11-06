# Sync87 实际路线与既有设备更新连接

2026-11-06。**UI SOURCE-READY；真实 LAN/Store/socket PASS；匿名 wss BLOCKED，尚未完成公网路线。** 本报告为作者证据，等待不同代理独审。Android、真实双 App DOM、原版整窗像素不属于本层。

## 准确输入

- UI 最小修复 `66958c1d`：`src/SyncSettings.tsx` 和已有 `scripts/debug/sync-settings.mjs`。已开启设备可见“更新连接”，复用真实 pair handler；增加取消；关闭/切标签/成功/停止都清理输入；暂停明确要求先“继续同步”。不改首页或建立新身份。正式规格来自主线 `6cfcffa9`，本分支未复制修改该正式文档。
- 路线 harness `7323d818`：`scripts/debug/sync87-routes.mjs`。固定独立合成 Store、真实冻结 Rust binary、真实 socket、一个明确空闲参与者，持续消费并回复真正 quiet probe/prepare。没有 DOM 时仍不绕过生产 quiet；不是实际页面、Android 或 GUI 验证。
- Rust binary `/private/tmp/sync86-transport-build08/notes-current-attachment-transport`，SHA256 `898331177b9f3f40fcc197c84acd1d93622bc3d453da078cf0c1429ebc81acc3`；root 提供生产源码 `fb6a265f` / 作者证据 `1b4c5d87`。本代理未编译或更改任何 Rust/协议/超时。
- 最终路线观察源树 HEAD `c11dcc56`（后续独审纯证据 commit）；其与 `fb6a265f` 在50个 tracked Rust/manifest/transport 输入上无差异。前后路径+内容摘要都是 `4f3ef2ed169455e6a60f8cf892fee28f482253f20cc90878f6bb28e5bb80036e`、clean。binary 前后摘要相等。
- 已安装 cloudflared `2026.7.2`。参数按真实 CLI help 核对，官网文档读取返回403，另保全 Cloudflare 官方相同版本仓库 `quick_tunnel.go`、来源和摘要。该原始源码说明 Quick Tunnel 申请匿名 hostname 与临时连接机制；不能凭它声称产品同步已通过。

## 已通过

| 检查 | 冻结运行结果 | 范围 |
|---|---|---|
| 桌面 sync-settings | 56项，natural exit0，CLI10720ms / 外层11202ms | 真实 React handlers/HTML，明确 JS IPC fixture |
| 手机 sync-settings | 56项，natural exit0，CLI10939ms / 外层11404ms | 390px mobile browser；含320/390/1280浅深布局，非Android原生 |
| pnpm build | natural exit0；完整wall未记录，Vite阶段1.45s | TypeScript和生产前端构建；普通bundle体积警告保留 |
| production exclusion | natural exit0，外层1600ms | 无DEV API/mock标记；URL参数不能打开生产调试入口 |
| LAN final | 21项，natural exit0，内部12323ms / 外层12403ms | 真实独立进程/SQLite/生产socket/quiet |

两个 UI 最终运行使用 clean frozen HEAD `7323d818`；136个前端/调试输入前后未变，SHA256 `8a337220d9354fe82d530c87b76b9592c6063a79663f6919722c34fc5ba81c79`。并行运行只共享只读源码，各自独立浏览器/Store/外部输出路径。保存 [desktop](ui-desktop/summary.json)、[mobile](ui-mobile/summary.json) 的完整真实项名、各自HTML安全快照及窄屏浅深截图。

LAN 真实地址 `ws://192.168.0.119:64617`（准确端口以 [原始 result](lan-final/result.json) 为准），en0。同一物理 Mac 上的独立进程，经本机真实LAN地址连接，不能外推到两台硬件或防火墙穿透。笔记A→B、B编辑→A；68字节PNG A→B；160044字节无麦克风合成WAV B→A；远端 read、导出和独立受管文件全部原字节SHA相同。该层媒体独立文件，不以数据库文本/metadata冒充原媒体。

真实同客户端新邀请重复 pair 保持 device/workspace UUID，增加不同endpoint（本轮LAN地址→127.0.0.1地址），同目录关闭/冷启后新endpoint `connected=true`。这证明后端更新连接路径；UI fixture通过仅证明入口/handler/secret生命周期。没有把目前仍失败的 Quick Tunnel hostname变化流程追认为通过。已有86 localhost全矩阵不重复，本层仅重启新endpoint边界。

## 匿名 wss 的阻断与准确定位

最小最终命令和退出见 [execution](wss-diagnostic.execution.json)。最终原件在 [wss-final/result.json](wss-final/result.json) 和 [cloudflared日志](wss-final/quick-tunnel-1.log)：

1. 仅本轮合成服务由owned cloudflared PID7865公开；使用明确owned非空URL配置和不存在的owned origincert路径，无登录、不读改用户配置、不换HOME。
2. anonymous hostname真实创建、http2 edge注册。Node真实外部WebSocket Upgrade成功，探测 `closed=true` 后才发Rust pair。
3. 透明 TCP origin代理只计方向字节数/Upgrade布尔值，不保存帧内容。仅有一条探测连接：660上行/129下行、HTTP101；Rust pair没有到达origin。
4. Rust pair **22ms** 返回 `sync_timeout`，并非正常5秒或27秒到期。本次命令 natural exit1，外层9988ms；失败完整保留，不能写PASS。
5. 用两个新合成Store和先前owned已停止hostname做单次stderr定位，没有重开隧道。通过本进程 Node child spawn 的stderr监听取得 [原始 panic](tls-panic/result.json)：

   `notes-sync` 线程在 rustls0.23.46 crypto/mod.rs249 panic：无法从crate features自动确定process-level CryptoProvider；应显式install_default，或恰好选择aws-lc-rs/ring之一。pair22ms被报告为timeout。两Rust进程最终仍自然exit0。

已将此原件交root和86后端作者，修复生产TLS配置及通道断开错误分类后，用准确新binary复验受影响wss路线。不得在harness增大协议超时、绕Noise或把WebSocket Upgrade成功当同步成功。**错误PSK拒绝、双向公网笔记/媒体、第二hostname新邀请+原客户端冷启目前均因首个真实pair阻断而未到达。**

cloudflared停止仅SIGTERM本轮PID，graceful code0/signal null；Rust host/client均stdin EOF自然exit0，无killall。origin代理及其owned sockets关闭。既有用户cloudflared进程、VPN、路由、SDK和设备均未改动。

## 保留的原始失败及工具修正

- `initial-no-participant`：设空participants后sync_command被正式窗口校验拒绝；这是harness错误。改为空闲参与者和真实quiet回复后LAN通过。
- `first-wss-timeout`：隧道已注册，真实Rust pair timeout，未凭hostname宣称成功。
- `invalid-http-readiness`：普通HTTP探测得到502/origin EOF；生产监听只接受WebSocket，普通HTTP不能作为就绪判断。这次探测假设错误已保留。
- `ws-upgrade-wss-timeout`：改为真实WS Upgrade通过，Rust仍timeout。随后增加探测close确认、透明计数和22ms定位，没有重复无关实体矩阵。
- UI最初已enabled隐藏“加入同步”是源码明确缺口，本轮66958修复；56项包含既有设备更新、取消、关闭/切标签清secret、停止清表单、暂停提示、失败保留身份与成功singleflight。

前期开发运行的脚本未逐版冻结，故仅将其真实runtime原件作为历史失败/开发诊断，不宣称可凭当前脚本完全复现每一旧版工具行为。最终源码冻结后运行的正确边界各有独立证据。

## 虚拟内网与未验证边界

只读命令发现 `wg`、`easytier-core`、`easytier-cli` 不在PATH；系统现有utun及198.18.0.1代理地址不能证明WireGuard/EasyTier。没有给定明确owned可达对端，所以 **未验证实际WireGuard/EasyTier路线**，不为测试建立或修改用户VPN/路由。应用入口使用相同 `ws://<可达虚拟IP>:<监听端口>` 或TLS wss，再由服务端生成新地址邀请；系统组网客户端负责网络。

没有访问原Android/旧AVD/emulator5580，没有设备/麦克风/Apple Notes/真实用户库操作，没有push或对外消息。原约13秒录音现场保持原样。

[artifacts.sha256.json](artifacts.sha256.json) 包含原件摘要；邀请与PSK只在进程内存，未复制 `.sync` 凭据或测试库到证据。临时合成Store仍保留于原 `/private/tmp/sync87-routes-*` 路径供独审，审查后由root仅清本轮owned数据。
