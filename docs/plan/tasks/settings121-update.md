---
id: settings121-update
scope: release updates
status: in-progress
depends-on: []
---

## Objective

实现本项目发布检查、平台匹配、SHA256下载验证、更新说明/徽标/频率和受保护的安装流程。

## Context

[目标契约](../../architecture/settings121.md)、[总体计划](../settings121.md)、`agent.md`、实际发布资产格式。

## Path

`src-tauri/src/software_update/`、`src/software-update/`、独立验证文件。公共宿主装配由整合任务承担。

## Verification

离线feed/版本比较/平台/坏包/校验失败/安装前提fixture；不得测试时替换现有用户App。报告缺少真实签名或系统安装证据的范围。
