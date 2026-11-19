---
id: settings121-update
scope: release updates
status: done
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

模块修复 `5f060a01` 经[独立复审](../reviews/settings121-update-recheck.md) pass，U1–U5已关闭，D5 native版本接点通过。真实宿主退出/ready/安装与最终发行包仍由整合任务单列验收。
