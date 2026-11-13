# ACCOUNT109 跨网络匿名隧道验证

2026-11-13。用户明确手机 4G 与桌面 WiFi 可能无法打洞，必须具备匿名隧道中转。此要求属于既有跨网络同步范围；按现有授权继续核对实现和测试。

## 当前实现与边界

产品在 `account::Runtime::start_network` 显式传入 `cloudflared: Some(provider)`。SDK 无 WebRTC/iroh 的可选 Cargo feature，两者都是实际依赖。默认顺序为 WebRTC（12 秒）、可用时 iroh direct（8 秒）、Cloudflare Quick Tunnel（35 秒），另有整体预算；不能把这些上限当成每次实测耗时。iroh 明确禁用 relay，匿名中转由 Cloudflare 路径承担。

提供程序使用固定资源、loopback origin 和 HTTP/2；对端拨号为 WSS `/connect`，内部继续设备证书 mTLS、业务 enrollment 与 Noise 校验。无需两端共享局域网或允许入站端口。“匿名”表示 Quick Tunnel 无需 Cloudflare 账号；产品账户授权仍是必要前提。

设备注册和 tunnel URL 发布/发现依赖 coordinator。既有 Android `account_network / coordinator` 与匿名健康请求失败发生在此阶段，没有进入 provider 或 WSS 拨号，不能据此判定打洞/中转失败，也不能通过中转地址替换身份源、跳过账户检查来完成验收。

## 本轮工作

1. 独立核对有效配置、provider 启动、发布、fallback 和安全检查。
2. 补齐 `Client::connect/map` 的直连失败后成功回退测试。现有本地 WebSocket 测试直接调用 `dial_ws_endpoint`，现有 fallback 测试只验证失败与预算，两者不构成自动回退成功证明。
3. 优先使用显式 opt-in、默认忽略的真实 Quick Tunnel 提供程序测试，搭配本地合成目录与业务服务；不新增产品任意 endpoint/凭据注入入口。结果只能证明实测的公网隧道传输层，不能替代产品账户或手机 4G 验收。
4. 真实手机场景单列 RELAY-01～04；保留原四篇全文、附件、失败证据及两个桌面库。手机 coordinator 可达和真实账户授权仍是执行前提。

## 已识别但未实证触发的边界

- `tunnel-ready` 当前表示 provider 已输出 hostname 与注册日志；首次 heartbeat 失败仍可能发出此事件。因此它不能单独证明 coordinator 已确认发布、对端可发现或正文已收敛。测试必须检查远端目录、实际 `Mapping::current_transport()` 和业务原字节，不能用该事件判通过。
- Android 每次 provider 启动读取当前 DNS，但存活的 cloudflared 进程使用初始化 DNS；未发现默认网络变化后主动重建 provider 的产品回调。切网时 provider 不退出而旧 DNS 不可达的条件尚未实证。记录为恢复测试缺口；现有“立即同步”重建网络不能替代自动恢复证据。

本任务不以缺乏现场证据的条件性缺口为既有失败根因；若测试发现可复现功能问题，单独补充最小契约、修复和独立复核。
