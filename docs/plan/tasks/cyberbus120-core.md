---
id: cyberbus120-core
scope: crates/notes-cyberbus
status: ready
depends-on: []
---

## objective

实现独立于 Tauri 的 CyberBus 适配 crate，固定官方 SDK 源码版本，实现生产可用的受保护 SecureStore、唯一事件 owner、认证/设备状态、Notes public profile 和有界 Data 字节流桥。不得以旧 CyberGrid 或测试替身作为生产传输。

## context

- `docs/architecture/cyberbus-migration-20261118.md`
- CyberBus `359465e83bd74b571a963f3d1fdc238f50169919` 的 docs/INTEGRATION.md、schema、SecureStore 和实际实现。

## path

- `crates/notes-cyberbus/**`（含自己的测试、examples 与 Cargo.lock）
- 必要的 vendored SDK 位于 `vendor/cyberbus/**`；只能在固定公开 commit 上保留必要源码与许可证，记录来源/修改。
- `docs/verification/cyberbus120/core.md`

## verification

crate cargo check/test，覆盖加密存储的重启、篡改、丢失、独占；SDK 离线真实生命周期；设备与 auth 状态机；桥的分块/顺序/限制/取消/EOF。提供明确公开 API 供账户任务调用，记录真实网络未验边界。独立验证员另行审查。
