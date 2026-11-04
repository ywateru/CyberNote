---
id: app-001-mobile-paper-order-02
scope: mobile-paper-selector-reference-order
status: in-progress
depends-on: [qa-android-paper-current06-02]
---

## 问题与原版契约

当前candidate06 Android真实纸张页 `verification/android-paper-current06-02/06-paper-picker-native.png` 显示左列全横线、右列全网格。root与独立验收者均实际查看了当前PNG和保全录屏86秒原帧 `references/mobile/frames-2s/frame-044.png`，确认顺序不符。docs/ui/android.md早已明确按行排列：空白单独第一行，接着密横线/中横线，疏横线/密网格，中网格/疏网格。当前mobilePaperOptions交错line/grid是实际产品缺陷，旧七项可达验收没有证明顺序。

```text
            [空白]  （跨行占位）
[密横线]    [中横线]
[疏横线]    [密网格]
[中网格]    [疏网格]
```

## 实施

串行main树最窄修改src/App.tsx手机选项顺序为plain, lines-small, lines-medium, lines-large, grid-small, grid-medium, grid-large。保持desktop顺序、数据ID、aria标签、key、选择事件、持久化、取消/Back/选区、预览SVG和尺寸不变。不要借此调整尚未测定的geometry/color，不修改存储或Editor。

只做本任务产品/必要说明及真实渲染检查，开发不GUI/ADB/平台构建。复用既有纸张选择页App渲染设施核真实DOM行顺序/七项标签与data-style关联，不新增仅匹配数组常量的同构测试。pnpm build及受影响既有选择返回检查；若旧检查把错误顺序当期待，应按原帧纠正并保留旧失败记录。输出前>=2GiB，不下载升级或清缓存。

不同作者独审后root指定准确提交与构建身份，出新Android APK，数据保留升级并再次真实进入同一QA笔记纸张页，逐行核对顺序、取消/当前选中样式保全。构建前不把源码修复称为安装版完成。整体pixel仍open。

## 源码交付与独审

开发提交8463ed896847f891fd4fd5579affb253a11d681b仅改变App.tsx手机数组与作者自有验证证据。不同作者审查于4d86a7d封存，结论SOURCE-READY仅顺序范围：独立钉住准确App和完整CSS，真实App/Editor一次12步完成，实际行序符合原帧，七项ID/标签与预览保存重开、取消、Escape/背景处理器、桌面分支有限结果支持。

首次点击已选plain后的PM选区3..8→1..1在开发旧/新控制和独立候选中均出现，明确allSelectionPass=false，未修也未追认为全部关闭路径通过。此任务仍in-progress，等待新APK准确身份与保数据升级后实际页面验收；原安装06顺序失败证据保持。
