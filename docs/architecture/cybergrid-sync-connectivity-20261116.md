# CyberNote / CyberGrid 同步连接诊断与 SDK 改进建议

日期：2026-11-16。状态：已完成一次带服务端诊断的真机复现；尚未确认稳定传输修复。

已提交上游：[CyberGrid issue #1](https://github.com/ywateru/CyberGrid/issues/1)。公开内容为去身份化证据与改进建议，没有上传真机截图、账户或原始内容。

## 结论和证据边界

两端能够互通。用户此前的 Android → Mac 拉取操作已确认 3 / 199 项版本，接收 714.2 KB，手机笔记数从 13 增至 16，随后以传输连接错误失败。不能把这一现象描述成「两端完全无法连接」。之前操作缺少传输路径、服务端处理和关闭原因日志，不能回填本次诊断的路径或超时原因。

本次诊断复现确认两条连接均使用 `iroh-direct`。第一条连接就绪距点击开始约 25.6 秒，第二条约 49.3 秒；随后完成应用层认证并收到 BeginTransfer 和 Inventory。Mac 处理 Inventory 用了 37,373 ms，而 Android 的单次账户 IO 等待预算为 30 秒。处理开始约 30 秒时记录两条 `mapping-disconnected`；处理完成后服务端读到 Transport 错误。Android 最终显示超时，总耗时约 1 分 22 秒。

这次复现暴露了应用本地处理耗时与等待预算不匹配。它没有证明 CyberGrid 的 QUIC 本身不可用，也没有证明 SDK 的 30 秒保活计时器首先触发。当前 SDK 事件没有结构化关闭原因，仍需进一步定位谁先关闭以及具体计时器。

**构建限制：Mac 使用临时 debug 诊断构建，Android 使用原有 release 测试包。37.4 秒不能直接代表优化后的 Mac release 性能，或解释之前在传输 3 项版本后失败的全部原因。**

## 复现环境与步骤

- CyberNote 使用 vendored CyberGrid Rust SDK 0.3.0。
- Mac arm64 与 Samsung SM-G9500 arm64 Android 真机；正常恢复现有账户，保持本机同步权限开启。
- 不修改 DNS、代理、网络路由；不清理应用数据、不重新登录。
- 在 Android「账户与同步」选择在线 Mac，方向选「从此设备拉取」，点击开始一次。
- Mac debug 客户端以 `CYBERNOTE_SYNC_DIAGNOSTICS=1` 启动。仅输出固定阶段、传输路径、毫秒耗时与应用错误枚举，不输出身份、端点、凭据或笔记内容。最多 8192 条记录，普通启动和 release 均关闭。

时间线（相对于点击开始，毫秒四舍五入）：

| 相对时间 | 观察 |
| --- | --- |
| 0 s | Android 开始显式拉取 |
| 25.6 s | 第一条 multiplexer-ready，iroh-direct |
| 49.3 s | 第二条 multiplexer-ready，iroh-direct |
| 49.3 s | 同步端口探测 TCP 打开后关闭，62 ms、Transport；尚未进入应用认证，符合 map 探测行为，不是本次最终失败 |
| 50.1 s | 真实同步 TCP 连接被接受 |
| 50.3 s | 应用层认证完成 |
| 51.9 s | BeginTransfer 接收并返回，处理低于 1 ms |
| 52.0 s | 收到 Inventory |
| 82.0 s | 两条 mapping-disconnected 事件 |
| 89.3 s | Inventory 处理结束，耗时 37,373 ms |
| 89.4 s | Inventory send 返回；后续读取 Transport，服务端连接关闭 |

`send()` 成功只代表本地发送调用成功，不能证明手机收到了结果。当前两条断开事件没有映射相关性 ID，不能准确指认每一条事件所属的端口或流。

## 已核实的 SDK 行为

已对照 GitHub `ywateru/CyberGrid` 的 `f2a3961536e5c69b13c7dbc661953d9243becbae`：`sdk-rust/src/peer.rs`、`mux.rs` 与应用 vendor 文件逐字节一致。本地 CyberGrid 检出 HEAD 为 `ac14cd2b5e329d659ec9a9a9c12bfe4b4b15738d`，不能误当作远端最新版本。

1. `Client::map(device, port, local)` 每次执行 `self.connect(device)`，没有复用前一个 map 的已认证 Peer。
2. CyberNote 依次为 enrollment 和 sync 调用 map，因此一次业务操作会依次经历两次连接选择。每次还通过 `Peer::dial(port)` 探测端口后丢弃探测流。
3. SDK **已有**全局参数：WebRTC direct 12 s、iroh 8 s、fallback 35 s；默认 `DirectStrategy::Sequential`。已有 `Parallel` 仅并行两个 direct 路径，仍在 direct 均失败后尝试 fallback。不能把这些参数或并行能力描述为完全缺失。
4. `Peer::dial()` 的远端端口打开超时固定 10 s；映射重连可能重新经历完整连接选择，应用目前不能逐次设定同一个绝对截止时间。
5. `Mapping::close()` / Drop 关闭所属 Peer。不能简单把同一 Peer 填入两个现有 Mapping，否则关闭其中一个可能破坏另一个。
6. `mux.rs` 有每 10 s 的 NOP 和 30 s 入站活动检测，但内部错误被丢弃；公开 Event 主要是 phase、transport、peer_id 和自由文本 message，不能安全、准确地提供结构化关闭原因。

另有 2026-11-14 独立 SDK 探测记录：同样两个 map 依次耗时 33,026 ms、28,400 ms，合计 61,426 ms，两者走 cloudflare-tunnel。该记录是另一轮 CLI 探测，只支持「重复建连会放大等待」的判断，不证明本次操作经过 relay 或应用传输成功。

## CyberNote 侧需要处理的问题

- Inventory handler 同步调用 backend.flush() 和 backend.inventory()。flush 走媒体快照、文件验证和数据库固化流程；当前 37.4 秒记录包含全部 handler，尚未分别测量每个步骤，不能只凭调用路径认定 SHA 或 SQLite 为单一瓶颈。
- SyncService 使用单线程 Tokio runtime，handler 在 async 网络任务里直接执行同步后端工作。应该隔离阻塞工作，并在取消后等待工作实际结束，避免网络循环、停止和超时处理被阻塞；不能用丢弃 spawn_blocking JoinHandle 的方式声称工作已取消。
- 分别测量 Session 锁等待、快照生成、媒体验证、flush 和 inventory；用优化构建复核。减少无更改情况下的全库重复工作时，必须保留媒体完整性、generation 和权限校验，不能通过跳过校验消除耗时。
- 账户 IO 30 s、传输 120 s、外层请求 185 s、登记证明最大 300 s 是不同预算。单纯延长 SDK 建连超时不能解决 handler 超时；也不能只把应用总预算改成十分钟而忽略证明更新和生命周期栅栏。
- 若引入准备/处理中进度帧，应版本化协商，并保留绝对截止时间，不能让任意保活无限延长请求。进度的「已确认」仍仅表示对端持久化确认。

上述为待实现项。本轮添加了诊断观测，没有宣称已修复这些性能或超时问题。

## 建议提交 CyberGrid 的改进

### P1：一次认证会话，多端口拨号 / 映射

提供显式会话所有权，例如 `connect_with_options(device, options) -> PeerSession`，允许同一会话多次 dial 或 map 不同端口。示意 API 不是当前可调用接口。

- 传输选择和当前目录身份校验只执行一次，端口分别验证。
- 会话持有认证 generation、目标和取消域；子映射关闭只释放自己的 listener / stream。
- 显式关闭会话或 SDK runtime 失效时关闭全部子映射；关闭过程必须可 await 到实际退出。
- 断线后的重连只影响新流，禁止自动重放已有业务数据。
- 不透明全局缓存容易改变旧 map 的所有权语义，优先显式 session，旧接口保持兼容。

### P1：逐次调用选项与同一绝对截止时间

在现有 Config 之外提供调用级 options：总连接 deadline、单阶段预算、端口打开预算和 cancellation。每阶段、重试、重连都受剩余总时间约束，不重新计满。

- 正式列出 Sequential、DirectParallel 的现有语义。
- 可评估带延迟的 relay 竞速模式，只有通过现有 mTLS 和目录验证的路径能赢；失败或被取消路径必须关闭并 join。
- 明确总预算覆盖设备查询、信令、连接、mTLS、端口探测的范围，以及清理是否可能超出截止时间。
- forced-path 作为诊断选项时，失败不能偷偷切换路径；普通产品继续采用明确的自动策略。

### P1：结构化、安全的关闭原因与阶段耗时

增加固定枚举和非敏感的本地 attempt/session/stream 相关性标识，避免消费者依赖自由文本日志。至少区分本地主动关闭、调用取消、总截止、阶段截止、keepalive 超时、远端 EOF / FIN、底层 IO、协议错误、身份/证书失效、generation 变更、协调租约失效及未知。

记录可确认的本地观察，未知远端原因就报告 unknown，不从 EOF 推测远端超时。事件包含实际 transport、stage、elapsed、retryability；不泄漏端点、设备身份、证书、令牌或笔记数据。事件丢失时提供可查询快照，诊断消费者应能处理 broadcast lag。

### 验收条件

1. 同一 session 打开两个端口只出现一次实际连接选择；原两端口业务验证仍全部执行。
2. 关闭一个端口映射后，另一个映射继续可用；关闭 session 后全部任务退出。
3. direct 不可达、relay 可达时，在调用规定的总预算内成功或返回明确原因；超时和取消后无泄漏流和 listener。
4. 重连不复用失效 generation、不自动重放现有请求；权限关闭、登出、身份/证书变化立即失效。
5. 对真实 EOF、调用取消、keepalive timeout、协调失效等分别注入故障，输出不同结构化原因；不把普通探测流 EOF 记成整次业务失败。
6. 用两台真机验证多端口持续传输和半关闭。应用附加故意较慢的处理请求，分别验证应用超时与 SDK 保活，并能指出哪个预算先到。
7. 比较连接建立时间、端口打开时间、业务首字节、有效吞吐和完成率，不用 map 成功代替整次同步成功。

## 本地证据

- `artifacts/account-sync-connectivity-20261116/android-current.png`：用户上一轮 3 / 199、714.2 KB、120 s 的失败界面。
- `android-diagnostic-running.png`：本次连接中，33 s。
- `android-diagnostic-result.png`：本次约 82 s、传输阶段超时。
- `mac-diagnostic.log`：固定枚举诊断日志。
- `reproduction-start.json`：点击开始时间及方向。
- `upstream/`：本次核对的 GitHub 上游源码文件。

截图仅保留在本地，不随公开 issue 上传。公开 issue 使用去身份化时间线和源码引用。
