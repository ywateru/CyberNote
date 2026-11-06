# 双向同步方案研究84

2026-11-06。源码基线f4caa90e尚无网络同步；trusted-synchronization只处理本机授权/多窗，revision和metadata sequence不具有跨端因果。正式契约见[架构](../../architecture/sync.md)。

实际抓取的官方来源、时间、HTTP结果和SHA256见[sources.json](sources.json)，源文件只读副本保存在项目artifacts/sync-research84。系统web搜索两次空输出，连接器曾报transport错误，随后用Python urllib取得primary文档，不伪造web citations。首次WireGuard官网连接重置与CF旧路径404原样保留。

Noise spec及snow官方Rust文档已取得，用标准XXpsk3传输而不是自制消息加密；协议实际安全由85独审与真实篡改/密钥/撤销测试再证明。tungstenite官方库文档已取得，WebSocket承载binary、head与blob均需分片及预算。

EasyTier官方GitHub README已取得，组网只提供可达IP，业务版本/附件一致性仍由本应用保证；尚未实际建立虚拟组网，不将方案当验收。

Cloudflare官方文档仓库当前路径为src/content/docs/tunnel/get-started/quick-tunnels/index.mdx，已取得原文；旧cloudflare-one路径404不追认为成功。官方说明Quick Tunnel可无账号临时公开本地HTTP服务，hostname随进程变化，适合测试开发而无uptime保证。带邮箱交互验证的模式不适合本项目非交互客户端，因此采用应用内Noise配对认证；真实用户库不会自动公开。后续只用隔离合成库实际验证隧道路线。WireGuard官网当前连接失败，尚未取得该页，不把EasyTier资料冒充WireGuard协议证据。

设计独审已纠正：inbox与apply/ACK区分、系统目录排除、完整依赖重投影、单体与全图验证分离、WireAttachment排除path、head分片与总预算、身份/DB跨介质恢复、quiet IME屏障与录音全局epoch重绑。实现通过仍待准确冻结源码审查。
