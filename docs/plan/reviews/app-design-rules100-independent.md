# DESIGN100 独立审查

2026-11-09；审查者 `/root/design100_independent`，与实现者不同。基线 `92fba27ca9a380ba481d16f0d884515a245b0085`，作者提交 `1ce8a4502d7a5c53c8984f3a09d1e900c7891bef`，F1修正 `5093adc770de095e31441269a2e4e4b9f00190ca`。最终结论：**F1复审通过，接受源码阶段合入**。首轮拒绝原因与原始失败证据如下保留；产品源码未由审查者修改。

## F1（阻塞）：手机选中行后的操作条仍为22px，按钮覆盖正文并裁切图标

`src/design-controls.css:120` 为行容器设置 `width: var(--interface-hit-min)`，但现有 `src/style.css:804` 的 `.mobile .table-axis-handle.row.chosen { width:22px; }` 优先级更高。因此“选择行”一次点击后的 chosen 状态，外壳仍仅22px，而新统一规则已把内部两个按钮的最短边扩大为44–52.8px。容器平移也仅按22px计算，按钮向右进入单元格，图标半截落在操作条外。

独立真实 App 重现：手机320×640，2×2空表格，点击首格→点击“选择行”→Escape关闭菜单、保留行选区。在最大细节值下：

| 元素 | x | 宽 | 右边界 |
| --- | --- | --- | --- |
| chosen 行容器 | 54.797 | 22 | 76.797 |
| 首按钮 | 55.797 | 52.797 | 108.594 |
| 单元格 | 77.297 | 109.094 | 186.391 |

按钮覆盖单元格31.297px；对单元格左侧8px内实际 `elementFromPoint` 命中操作按钮，不能落入 `td`。默认手机命中区44px也有22.5px覆盖，故不是仅极值问题。桌面与列操作没有此项失败。旧基线按钮与容器均小，不具有这次“按钮扩张而容器保留22px”的新增覆盖因果。

直接证据：`artifacts/design100-independent/selected-row-mobile.{png,json}`；完整16个 chosen 状态观察与4项手机行失败在 `artifacts/design100-independent-chosen-table/result.json`，截图同目录。12/16通过，4/16失败。

需由作者修正选中态容器、按钮、图标与实际 gutter 的几何/优先级，同时维持手机最短边下界和单元格正文可点；勿修改表格文档、选择、历史逻辑或通过缩小按钮掩盖。新增独审工具覆盖 row/column、tiny/huge、默认/最大hit，修正后原工具必须全部通过。

## 已通过的独立核验

- 审查35文件差异：确认所有权入口真实接到 App；CSS在布局后加载；图标仅匹配显式UI位置；portal仍挂真实App并继承变量；层级变量入口统一；原生 `iconScale` / `hitScale` 的类型、默认/边界与独立frame/image投影完整。`DrawingPanel.tsx` 和 `TableControls.tsx` 均无作者差异。
- 复跑 `node scripts/debug/design100.mjs artifacts/design100-independent-real artifacts/design100-rust`：生产 Store/Session/SQLite + 实际App14项全过。覆盖双端五字号/浅色最小和深色最大、真实SQLite拒绝、旧失败→新成功、外部写入与重载、真实长子菜单及模态/访问层级。源码逐文件SHA和二进制SHA核验通过，非Fake后端。
- `node scripts/verification/check-design100-independent.mjs`：6项新增独立真实Store/App边界通过。实际旧workspace响应延迟到新ACK之后仍不回滚；实际持久成功但确认读取失败时真实控件保持旧已确认值，恢复刷新读取SQLite后收敛；速绘正文SVG不被图标倍率缩放，实际纸张菜单portal高于速绘面板且可点，完成后背景写入原笔记。分别覆盖桌面和手机。
- `node scripts/check-design-settings100.mjs`：3组所有权回归通过。
- `node scripts/check-native-toolbar.mjs`：24项投影/控制器回归通过。
- `git diff --check` 通过。

日志：`/private/tmp/design100-independent-{real,extra,chosen}.log`。可复算JSON和截图保留于上述artifacts目录；真实独立transport副本保留 `artifacts/design100-independent/owned-transport`，SHA256 `3c3af4e19565749a6adf73ce30d64c9f889702c59b6b33f609c5bbe2305fae0e`。

独审工具首轮“确认读取失败”探测在预期错误后立即调用debug idle，idle按契约拒绝；已改为显式检查旧控件值并先dismiss预期错误后等待稳定。此项是测试前置修正，修正后6项通过，未修改生产行为。

## 边界

本审查没有native整包、ADB或实体触摸板操作。生产Objective-C/AppKit probe和Rust model30作者证据已审源码与命令，24项原生投影是本次直接运行；不能据此扩大为实际双端安装包几何/输入法/硬件捏合结论。最终native验收仍属于FINAL101。

## F1 独立复审（通过）

核对 `cf39663e33c737a9250ebb92663dcd140ee7d10f..5093adc770de095e31441269a2e4e4b9f00190ca`：仅 `src/design-controls.css` 与任务文档变化。选中行明确匹配旧手机chosen规则的优先级；行列容器计入完整两侧边框。未缩小按钮下界，未修改 `TableControls.tsx` / `DrawingPanel.tsx` / 文档、选择、历史逻辑。

原样执行首轮独立工具：

```sh
node scripts/verification/check-design100-chosen-table-independent.mjs artifacts/design100-independent-chosen-table-fixed
```

**16/16通过**；日志 `/private/tmp/design100-independent-chosen-fixed.log`。固定后原16项配置中的实际按钮均在容器/gutter及视口内，`elementFromPoint`能够命中单元格正文；行列选择不改变文档。

另通过实际App直接探测桌面760×500/手机320×640、极小字体、最大命中倍率的4个行列chosen箭头场景：检查两枚按钮每边均≥平台min、按钮完全位于含边框容器内、实际SVG bounds完全在按钮内、按钮中心命中自身；关闭菜单后再次点击真实箭头能打开对应行列菜单，文档保持相同。原始几何与截图：`artifacts/design100-independent-arrow-fixed/{result.json,desktop.png,mobile.png}`。这覆盖首轮缺失的选中态图标裁切与真实点击区域。

此次为CSS窄修，未重新执行无关Store/native整包回归。此前真实Store/App14项、独立6项、原生投影24项通过记录仍有效；作者还报告未选中10、session14、table95与build通过，本文不将作者运行扩称本次独立再次运行。`git diff --check`通过。允许父级整合源码并继续FINAL101实包验收。
