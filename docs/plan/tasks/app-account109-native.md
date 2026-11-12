---
id: app-account109-native
scope: Native Logto login and CyberGrid authenticated automatic sync
status: pending
depends-on: []
---

## objective

实现桌面及Android Logto托管登录/注册、持久会话/刷新/退出，真实CyberGridRust设备发现与TCP映射，可信peer自动Noise配对并复用既有Store/Session同步。不得以目录在线或手工复制邀请替代自动同步。

## context

`docs/architecture/account-sync.md`、`docs/ui/account-sync.md`、`docs/plan/analysis/account109.md`；SDK与官方Logto样例冻结f2a39615。先提交原生调查报告冻结明确接线再进入实现。

## path

拟独占`src-tauri/src/account/**`、必要`src-tauri/src/lib.rs`和`sync/adapter.rs`、`src-tauri/Cargo.toml`/Cargo.lock、`vendor/cybergrid-sdk/**`、必要新auth平台插件与Android接线。不得改前端React、服务或CI。配置只读取公开发行参数；secret不放入客户端。测试隔离data-dir/Android测试包，不碰原用户库。

## verification

PKCE/state/nonce/redirect、取消迟到、敏感状态排除、刷新/重启、退出关闭、账号归属不匹配、workspace/device持久身份、SDK真实适配与清理；受影响Rust回归和平台编译。真实Logto与两原生端最终联调由协调者安排。任何已有手工workspace迁移限制须明确保全，不删schema/冲突以通过新测试。
