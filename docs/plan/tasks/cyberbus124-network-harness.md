---
id: cyberbus124-network-harness
scope: scripts/cyberbus120-network
status: verified
depends-on: [cyberbus120-core]
---

## objective

建立两个独立进程、独立安装/SQLite 的真实 CyberBus → 字节流桥 → 生产 SyncService/Store 定向测试工具，并以已有 callback-only Logto 驱动完成各自 SDK 登录。不能注入 token、复制身份或用 FakeBackend 代替 Store。此工具验证传输和数据组合，不能替代 Tauri 账户/Session 创建链验收。

## context

- `docs/architecture/cyberbus-migration-20261118.md`
- `docs/verification/cyberbus120/TEST-CASES.md`
- `scripts/sync-network-test/account_directions.rs`（已有生产 Store/网络 harness 参考）
- `crates/notes-cyberbus` 公共 API

## path

- `scripts/cyberbus120-network/**`
- `docs/verification/cyberbus120/network-harness.md`

## verification

先 compile/本地控制器契约测试；真实 SDK 网络可用后执行双向富文本、附件、方向隔离、离线/重启/并发/暂停错误。所有授权材料仅受控内存/私密临时文件，不进公开日志；业务结果报告只白名单计数/布尔/测试 SHA。未测层与失败必须明确记录，运行进程有界且自然关闭。
