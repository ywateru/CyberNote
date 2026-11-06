# APP-SYNC85 认证网络与配对

状态 in-progress。根规格：[sync](../../architecture/sync.md)。84并行实现Store；本任务先独立生产网络/凭据服务，随后统一适配。冻结后独审。

实现 `src-tauri/src/sync/network.rs`、`identity.rs`（可子目录）、对应真实网络/crypto tests；不得修改84持有的Store/model/sync.rs。可在独立test crate #[path] 编译实际模块；最终Cargo.toml snow/tungstenite/rustls等依赖通过单独patch交根整合，不在主线运行。标准库线程或runtime均可，socket网络绝不持Store锁。生产服务设计SyncBackend trait短暂调用持久层，返回Opaque JSON版本及摘要/本机blob reader，网络不猜Store细节。

核心：WebSocket(ws/wss)承载Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s；一次性256bit邀请、pinned host static key+client static key、过期/撤销、每次请求授权检查、原子0600凭据文件与不进入备份；监听关/开、有限线程/连接/时间/帧预算、停止与重连退避、分块blob和分页inventory、双向push/pull、状态。不得公开任意IPC/debug/path；未鉴权无标题/实体清单。完整端到端Noise覆盖隧道TLS终止。配对后workspace adoption交86适配，不能偷偷重置有数据Store。

必须作者实际socket多进程/至少独立连接证明双向opaque数据流、错误PSK/hostkey/workspace/篡改/重放/过期/重复redeem/撤销活连接/大包/短连接/停止重启；假后端只证明网络层，不代表84 Store。保证接口允许后续两个生产Store接入。API先给根再做大规模实现。不要运行旧77测试/编辑旧UI；旧任务完全结束。

官方资料优先 docs.rs/snow 与 noiseprotocol.org/noise.html；HTTP已确认可读，浏览器搜索工具当前无返回，保留实际来源与抓取证据，不编造引用。云隧道只设计同一wss端点兼容，自动公开真实库禁止。源码冻结commit、必要tests及未解决风险交根，不自行merge。

独审设计修订：receive_head仅持久inbox，Receipt{durable,applied}区分已收与已应用；16MiB head必须分片重组，有总量/时限/深度预算，非仅blob分片。Prepared凭据→幂等DB adopt→Ready崩溃恢复，不允许身份文件与Store workspace失配时发数据。

2026-11-06作者冻结：依赖5759ebe0、产品f58f63c8、证据dad423fc。14项真实网络/身份测试与clippy/fmt作者通过，独立verify进行中；未合入、未接生产Store，不视为双端同步交付。

独审2026-11-06已确认阻塞：两个已配对client对相同hash均获得offset0并同时首块，Staging::write的旧offset被Protocol永久停；scripts/sync-network-test/tests/independent85.rs保留真实socket确定性栅栏复现及exit101原件。必须修复同hash正常并发的自动恢复并复验，不允许手动sync_now/串行化测试掩盖。作者新freeze后独审原测试保持不变。

2026-11-06复审通过：产品c88982a6、作者证据7d206973、独审59fc3f32；完整19项真实网络/身份测试自然0，原共同offset0失败用例未改且自动收敛。自然连接预算走Transport自动退避重握手。仅85模块pass，待与84一起合入和86真实接线，不等价完整同步已完成。
