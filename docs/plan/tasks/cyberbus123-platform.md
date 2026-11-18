---
id: cyberbus123-platform
scope: frontend/platform-packaging
status: ready
depends-on: []
---

## objective

完成账户界面 CyberBus 兼容、Android Keystore SecureStore 宿主、构建/发布清单迁移，和新的 Rust 账户 owner 通过明确 API 对接。

## context

- `docs/architecture/cyberbus-migration-20261118.md`
- CyberBus SecureStore 与 Protobuf 契约

## path

- `src/account-client.ts` 及账户设置相关 UI
- `plugins/tauri-plugin-notes-auth/**`（Keystore 保护实现与受限 JNI 原生入口）
- `scripts/android.mjs`、`src-tauri/build.rs`、`scripts/publish/**`、必要 Android 构建配置
- `docs/verification/cyberbus120/platform.md`

## verification

前端 typecheck/build 与账户 DTO 定向测试；Android 存储/JNI 构建或明确列出不可执行环境；发布清单与 runtime provider 包装测试。不能以明文开发 store 降级，也不能在运行时继续要求 CyberGrid cloudflared helper。
