---
id: app-account109-ui
scope: Account settings and login registration device sync UI
status: ready
depends-on: []
---

## objective

实现账户与同步设置分类，登录/创建账户、等待/取消、已登录profile、开关/立即同步、真实设备列表/状态、退出确认、错误/重试/资料库归属错误。保留现有手工同步、编辑器与未登录本地使用。

## context

`docs/ui/account-sync.md`、`docs/architecture/account-sync.md`、`docs/ui/preferences.md`。账户IPC与安全DTO以架构为准；真实命令未接入前测试平台必须明确fixture，生产不可假成功。

## path

独占`src/AccountSettings.tsx`、`.css`、`src/account-client.ts`、必要`src/Preferences.tsx`/Preferences.css、`src/App.tsx`导航接线、`scripts/debug/account-settings.mjs`与既有debug注册/fixture中必要小范围接线。可新增专门UI检查，不改Rust/服务/CI/根依赖锁。复用现有依赖和CSS变量，账号页不可暴露token或技术协议。

## verification

typecheck/build、真实App浏览器账户组：未登录本地可用、登入/注册真实handler、取消/迟到、状态/错误、退出确认、开关、设备空/在线/离线和冲突入口；320/390/1280浅深主题/字号/焦点/返回/触达/滚动；现有preferences与sync-settings定向回归。截图实际审查布局，测试fixture不冒充真实服务器认证。
