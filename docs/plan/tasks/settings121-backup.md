---
id: settings121-backup
scope: local backup lifecycle
status: in-progress
depends-on: []
---

## Objective

实现本地备份版本、目录、校验、保留、间隔与设置组件，以及现有导入/导出与宿主保护的定型端口。

## Context

[目标契约](../../architecture/settings121.md)、[总体计划](../settings121.md)、`agent.md`、现有归档/保存屏障。

## Path

`src-tauri/src/local_backup/`、`src/local-backup/`、独立验证文件。公共宿主装配由整合任务承担。

## Verification

临时目录真实写入、原子manifest、checksum损坏、symlink拒绝、保留清理、新备份失败不清理旧版本；整合后录音/权限/重启/恢复屏障验证。
