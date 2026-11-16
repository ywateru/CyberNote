# 主分支整合与清理记录

2026-11-16，按用户要求完成本地主分支整合。

## 提交与分支

- 整合前 `main`：`86bd998c`。
- `dd7f91a4`：本机设备卡片与后台同步进度、CyberGrid SDK 0.4.0、同步准备竞争、空闲超时、授权续期及网络错误分类修复；调查报告与定向回归一并提交。
- `7e99c4c4`：刷新发布清单，明确纳入新增的三个 SDK 源文件，更新第三方来源版本固定值。
- `main` 快进到 `7e99c4c4`，共纳入原开发分支上的 12 个提交，包括之前的网站、移动账户页和打包工作流改动。没有合并冲突。
- 删除已完全合并的 `codex/github-source-delivery` 分支。
- 三个历史 `codex/sync108-*` 工作区均有独立提交，继续保留；未将历史验证分支批量合并或删除。

本仓库没有配置远程。对 `ywateru/CyberNote` 的 Git 读取与 GitHub API 查询均返回 404，本轮未推送远程。开发库包含历史验证资料；将来远程发布仍应使用 `scripts/publish` 的源码导出流程。

## 清理结果

移除九个明确的构建输出路径，原占用约 14.28 GiB：

- 已结束构建的 `/private/tmp/cybernote-sync108-target`。
- Android 工程 `src-tauri/gen/android/app/build`。
- 本轮 `account-device-card-20261116`、`account-sync-progress-20261116`、`account-sync-connectivity-20261116` 目录下被最终包替代的三个 Mac 应用、两个 APK 及对应两个 APK 签名旁路文件。

清理前保留 release 构建的 Tauri 前端嵌入资源与最终双端构建日志。完整删除清单、字节计数和资源副本保存在本地 `artifacts/main-consolidation-20261116/`。历史交付回执及故障截图、日志继续保留；早期回执中的包路径属于历史记录，其旧包已按上述范围清理。

未修改原始账户、笔记、附件、凭据及应用数据目录。最终包位于 `artifacts/account-sync-sdk04-20261116/`，Mac 应用与手机进程在清理后均仍运行。最终 APK SHA-256 清理前后相同：

```text
3463ae755883e8b5d5c5d20d9e87cf3eb8d5631756d3e4c089c38ab5fa2e3473
```

## 检查与验收边界

合并后的差异检查通过。源码导出只读计划通过，包含 1801 个文件，结果保存在本地 `source-export-plan.json`。本次没有重跑功能测试或重打包；沿用此前的定向回归与安装回执。现有安装包保留其真实构建标识，没有将旧二进制重新标为合并后的提交。

最终 Mac 客户端和 Android APK 已准备好供用户测试。完整资料库同步收敛尚未验证；详情见[同步根因与修复报告](../architecture/cybergrid-sdk04-integration-20261116.md)和本地 `rootfix-handoff.json`。
