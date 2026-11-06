# 同步模块与集成责任

2026-11-06，正式[架构](../../architecture/sync.md)。

|模块|生产职责|边界证据|
|---|---|---|
|84 Store|dirty原子捕获、heads/inbox、冲突墓碑、blob、完整投影|真实独立SQLite/进程，锁明文/崩溃/乱序/媒体|
|85 Network|Noise配对身份、WebSocket、分块、生命周期与安全预算|实际socket，先opaque backend再真实84|
|86 UI|数据标签同步区域、实际IPC wrapper、调试入口|真实React/HTML＋显式fixture，不外推网络|
|86 Adapter|创建SyncService并注入Session短backend、Prepared adoption、安全apply协调|两个真实Rust进程＋真实App，无Stub残留|
|87 E2E|局域网/隧道/VPN端点路径、隔离Android前台重连、准确包|原设备不动，失败/能力边界分开|

集成链逐条验收：run/setup→SyncService（默认off）→独立identity→Store enable/adopt；business SQL→同事务dirty→checkpoint→inventory；peer socket→Noise→head/blob→独立staging→Store inbox（durable）；inbox→plan/quiet prepare→实际PM settled与flush ACK→generation重验→Session短gate→Store apply→notes-metadata/必要access→App hydrate。远端不取得本机Token/IPC。UI sync_command→production service，debug只调用同handler。UI fixture、Network opaque tests、真实Store integration、Android IME各自独立记账，前层通过不能替代后层。

根做规格、编排、合并与主线完整整合，develop实现，独立verify冻结准确commit；一次发现失败保持原件，只修与复验受影响边界，不刷无关全套。

86生产接线拆为文件不交叠的Rust adapter与[frontend](../tasks/app-sync86-frontend.md)，共享固定[本机窗口协议](../../architecture/sync-coordinator.md)。两者从已独审合并模块的同一基线创建worktree，最终同一真实Rust/DOM集成门槛。
