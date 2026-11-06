# Sync85 生产网络模块作者验收

2026-11-06。源码冻结 `f58f63c8`，独立依赖提交 `5759ebe0`；基线 `07adba9f`，分支 `codex/sync85-network`。本记录是作者开发证据，待独立复核，不自行合入。未操作安装应用、原设备、麦克风、真实用户库、隧道或公网服务。

## 已实现

`src-tauri/src/sync/identity.rs` 为独立 `.sync/identity-v1.json` 保存静态Noise密钥、256bit一次性PSK、10分钟过期邀请、已固定双方静态key/device的授权及撤销。目录0700、文件0600、随机临时文件+fsync+rename+目录fsync；拒绝符号链接及宽权限密钥文件。不在settings/备份内。公开服务status和PairingStatus只含安全字段，无PSK/私钥，内部Peer不可对外序列化调用。

配对先完整Noise认证；认证后的凭据先原子保存Prepared，再调用幂等backend.adopt_workspace保留本地业务记录，最后原子标Ready，Ready前不传任何清单/正文。采用失败或最后写Ready失败时保留Prepared，可通过pending_pairings/recover_pairing恢复。它不声称跨文件与SQLite一个原子事务，86必须实现prepare/adopt的workspace拒绝和幂等性。

`network.rs`及network/{transport,wire,staging,service}.rs提供生产WebSocket ws/wss客户端、ws本地监听、snow Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s逐连接新握手和有序AEAD。workspace/protocol/邀请ID绑定prologue，客户端固定host静态key，服务端一次性消费邀请并固定client key/device。每请求前后及空闲200ms轮询检查撤销。错误只含固定类别；未认证只处理有界握手，无业务清单或标题。

数据协议仅inventory/head/blob/prepare+commit/status：清单按digest排序128条一页；head支持16MiB总长、24KiB分片、连续offset、有界重组及64层JSON拒绝；固定plain frame<=48KiB，Noise tag额外16字节。push先完整head预验证，再允许它声明的blob上传，blob完整后CommitHead调用持久inbox。pull也在下载blob前调用同一预验证。required_blobs是强拒绝契约，86必须使用84完整wire字段/摘要/归属/预算验证器，不能只提取JSON中的hash。

单blob<=256MiB；独立transport staging支持offset续传，最多4个partial/512MiB，同hash路径复用，不由远端指定路径。最终hash/size验证后交backend.store_blob原子发布；坏hash删掉partial且不发durable。断线完整版本靠下轮清单重传，partial head丢弃、partial blob保留恢复；无自动同步blob GC。

后台单独Rust Tokio运行时，不依赖WebView定时器。最多4入站连接与4出站worker；stop关闭socket/task；网络错误500ms至30秒退避，协议/预算/授权等错误需明确立即同步重试。每连接65536帧、1GiB累计ciphertext、10分钟预算，达到则断开并用清单重连恢复；单网络阶段5秒，配对总截止25秒，空闲30秒断开。清单单轮最多65536个摘要，超过明确Limit。后台每2秒双向pull/push，并提供sync_now触发。不持Store/Session锁等待网络。

## 接入契约

根合入依赖5759ebe0后，由84所有者在 `sync.rs` 添加 `pub mod identity; pub mod network;`。当前85没有编辑84的Store/model/sync.rs/lib.rs；它尚未在安装包启用。

86实现 `SyncBackend`：workspace_id/device_id、prepare_pairing/adopt_workspace、flush、排序分页inventory、version、完整预验证required_blobs、has_blob/read_blob_chunk、store_blob、receive_head。网络使用opaque Value，不复制版本合并算法。receive_head只能持久inbox，不能直接覆盖活跃编辑器；本轮Receipt.applied=false测试不证明Session安全apply。blob读取先取得本地合法路径后释放Session锁，实际网络/文件传输无Store锁；store_blob在独立stage完成网络后发布。

SyncService::new不自动监听/连接。start_listener、invitation、pair、connect、disconnect、revoke、sync_now、stop_listener/shutdown由86命令接线；pending_pairings/recover_pairing恢复中断配对。UI只序列化安全ServiceStatus/PairingStatus和IdentityStore::paired_devices，不输出内部Peer/完整私有身份文件。

## 必要验证

冻结源码 [result.json](result.json) 中逐项SHA256前后相同。全部自然退出0：

| 命令 | 范围 | 完整wall秒 |
| --- | --- | ---: |
| cargo test --manifest-path scripts/sync-network-test/Cargo.toml --offline -- --nocapture | 7 unit + 6真实socket集成 + 1真实三进程场景 | 17.694687 |
| cargo clippy --manifest-path scripts/sync-network-test/Cargo.toml --offline --all-targets -- -D warnings | 生产模块及test crate | 0.983255 |
| cargo fmt --manifest-path scripts/sync-network-test/Cargo.toml -- --check | owned Rust源码 | 0.067862 |

[tests原输出](tests.txt)、[clippy](clippy.txt)、[fmt](fmt.txt)。实际模块以#[path]进入独立crate，不复制实现；小型target约0.6GiB，不编译Tauri/Android。第一次offline发现未缓存webpki-roots0.26.11，随后只补该包，最终完整测试offline执行。开发中修正过2项编译推断/语法、fixture错误映射及1项clippy建议，产品场景测试均未出现失败后刷绿。

unit包含邀请过期/持久撤销、密钥文件和URL拒绝、真实Noise密文篡改/重放关闭、未鉴权清单/未知协议/超帧拒绝、head总长/深度/未offer blob拒绝、partial预算和重启续传/hash错误不发布。独立socket集成包括131条分页、约540KiB中文head+300123字节blob双向、错误PSK/host/workspace/重复redeem、Prepared采用失败与重启恢复、撤销活连接禁止新双向数据、短连接/停止/重开和凭据持久身份。真实三个独立子进程通过stdin控制，真实127.0.0.1 socket A↔B、C经A转发B、B退出后新进程从独立目录恢复身份并双向收敛。

## 保留边界

测试后端是明确的opaque文件fixture，证明网络和身份层，不证明84 SQLite版本/冲突算法或86 Session安全屏障。此时未连接生产Store、未做两真实App/Android WebView、TLS真实域名/局域网/VPN/QuickTunnel路线、SIGKILL崩溃矩阵、系统前后台和准确出包。wss启用标准WebPKI校验且始终再走Noise，不因编译该能力声称真实公网路径通过。后续87保全PID/协议/文件摘要等完整进程证据。

IdentityStore目录为单进程服务所有；86不能为同一目录创建多个独立IdentityStore后并发写。partial staging达到预算会明确拒绝，不自动删除未完成数据；接入层可让用户重试/维护，不伪装同步成功。Blob缓存总预算/磁盘余量、inbox预算和实际wire预验证属于84/86契约，85不虚构已证明。

官方snow/Noise/tokio-tungstenite资料经urllib实际HTTP200，来源身份见[sources.json](sources.json)；web工具空输出未被当作引用证据。
