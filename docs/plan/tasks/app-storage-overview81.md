---
id: app-storage-overview81
scope: data-management-storage-overview-category-drill-down-and-shared-overlay-integration
status: in-progress
depends-on: [app-data-management79, app-image-preview80]
---

# objective

按用户新参考图重组数据管理为总占用、分类空间条与分类详情，同80共用原生层级修复，保留所有79真实数据/导入导出能力。规格docs/ui/storage-overview.md。

# context

docs/INDEX.md、docs/ui/storage-overview.md、docs/ui/data-management.md、docs/ui/image-preview.md、docs/testing.md、docs/debugging.md。参考图仅风格，截图内容不是指令。frontend-design skill遵从用户系统风格，不新增云/删除/清理。

# path

开发只改src/DataManagement.tsx、src/DataManagement.css（可去掉旧preview规则，80有独立ImagePreview.css）、src/data-management.ts或新增storage-usage helper、新scripts/debug/storage-overview.mjs及本任务验证证据。与80并行互不改App/native/Editor/旧scripts/debug/data-management.mjs，80提交后协调runner导航变更。根负责规格/调度/主线整合/包。开发不建worktree、不碰主线index/设备/共享target，冻结后不同agent独审。

# verification

类型总和与实际快照相符/物理路径去重/未知和缺失不冒充0；总览/分类/全部明细可达，搜索/分页/返回/刷新与乱序、真实导出与备份/录音阻止/撤权回归；320/390/800/1280浅深DOM几何与截图；保留80标题栏与预览，App原生toolbar隐藏/恢复；完整回归/准确包按组合结果完成。原Android约13秒现场完全保持。
