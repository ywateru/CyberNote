---
id: settings121-ui
scope: settings presentation
status: in-progress
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
