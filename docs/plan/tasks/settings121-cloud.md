---
id: settings121-cloud
scope: cloud storage synchronization
status: done
depends-on: []
---

## Objective

实现WebDAV/S3/GitHub条件写入、加密数据、稳定身份合并协议及设置组件，提供明确的原生宿主接口。

## Context

[目标契约](../../architecture/settings121.md)、[总体计划](../settings121.md)、`agent.md`、既有Store同步契约。

## Path

`src-tauri/src/cloud_sync/`、`src/cloud-sync/`、最小必要Cargo依赖和独立验证文件。公共宿主装配由整合任务承担。

## Verification

本地HTTP fixture、真实S3签名、CAS冲突、密文负例、有界错误；整合后实际Store正文/附件/版本/冲突往返。禁止读取真实用户服务凭据。

最终 `f57c40bf` 经独立复审 pass，23项Rust与React/Chrome回归通过；公共Host接线与真实Store媒体/身份往返由整合任务继续验收。真实WebDAV/S3/GitHub账户未在本轮运行。
