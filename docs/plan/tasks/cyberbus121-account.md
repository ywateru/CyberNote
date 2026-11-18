---
id: cyberbus121-account
scope: src-tauri/account
status: ready
depends-on: []
---

## objective

按迁移设计实现新的 CyberBus 原生账户 owner 与既有 SyncService 的完整接线。开发可按 core 的书面 API 在独立分支开始，组合验证与交付必须等待 core 合入。旧 CyberGrid 不再属于生产依赖。

## context

- `docs/architecture/cyberbus-migration-20261118.md`
- `docs/architecture/account-sync.md`（非传输旧规则）
- `docs/architecture/account-device-actions.md`（方向、收据和资料库保全）
- `docs/architecture/sync.md`、`sync-coordinator.md`

## path

- `src-tauri/src/account/**`
- `src-tauri/src/sync/network.rs`、`src-tauri/src/sync_e2e.rs`、必要的 sync adapter 接口
- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
- `docs/verification/cyberbus120/account.md`

## verification

真实 SDK → 账户 → SyncService → Store/Session 的类型检查与定向测试；保留完整的本地数据、冲突与附件；取消/退出需等待写任务退役；未完成生产存储与真实账号网络验证不得标为完成。与 UI/Android 存储任务只通过明确接口联动。
