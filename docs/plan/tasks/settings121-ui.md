---
id: settings121-ui
scope: settings presentation
status: done
depends-on: []
---

## Objective

按本轮截图和参考源码重构设置右侧，保留左栏视觉，移除旧设备同步条目，并保留既有账户与偏好功能。

## Context

[目标契约](../../architecture/settings121.md)、[总体计划](../settings121.md)、`agent.md`。

## Path

`src/Preferences.tsx`、`src/Preferences.css`、`src/AccountSettings.tsx`、`src/AccountSettings.css`、`src/PreferencesInterfaceDetails.tsx`、`src/presentation/PreferencesPresentation.tsx`、`scripts/check-settings121-ui.mjs`。

## Verification

Typecheck、真实React桌面/手机浅暗截图、导航/查找/焦点/权限失败/旧入口移除检查；集成后由独立验证者复核。

模块修复最终 `c68ee19b` 经[独立复审](../reviews/settings121-ui-recheck.md) pass。普通菜单、更新Escape、异步搜索和视觉五项blocking已关闭；实际App账户冲突与新增模块接线不在组件验收内，继续由整合任务验证。
