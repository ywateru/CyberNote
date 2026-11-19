---
id: settings121-integrate
scope: application host integration
status: pending
depends-on: [settings121-ui, settings121-cloud, settings121-update, settings121-backup]
---

## Objective

将四个模块接入生产应用的命令、Session、窗口和调度生命周期，迁移旧sync导航/冲突，完成导入导出与更新退出保护，确保没有未连接的模块或假操作。

## Context

[目标契约](../../architecture/settings121.md)、[总体计划](../settings121.md)、四个模块的实际接口和独立审查、`agent.md`。

## Path

`src-tauri/src/lib.rs`、`src/App.tsx`、`src/DataManagement.tsx/css`、必要Session/Store适配、`src/SyncSettings.tsx`冲突专用模式、既有调试fixture与整合验证。

## Verification

两套invoke handler完整注册，唯一Store/Session、保存与quiet barrier、授权失效、后台任务停止；浏览器真实入口至命令、真实Store与本地服务往返、生产构建与版本/账户回归。最终独立审查通过后再报告已完成范围。
