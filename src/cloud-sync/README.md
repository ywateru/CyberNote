# 云存储设置组件

从 `index.ts` 导出 `CloudSyncSettings`、类型和默认 Tauri client。宿主插入 `Preferences.cloudSync`，传入 `active` 与 `CloudSyncPorts`，无需登录 CyberBus。使用 `.preferences-workspace` 下的公共 settings121 CSS primitives/tokens，组件 CSS 只负责内联表单和反馈布局。测试可注入严格类型 `CloudClient`，生产默认只 invoke `cloud_sync_command`。

协议、payload、原生命令注册、Host trait、Store/Session 适配和生命周期由 [后端模块契约](../../src-tauri/src/cloud_sync/README.md) 统一拥有。`types.ts` 是前端镜像，改变 DTO 时须同步两侧。
