---
id: app-ui-hierarchy8081
scope: integrate-preview-storage-hierarchy-and-deliver-both-platforms
status: in-progress
depends-on: [app-image-preview80, app-storage-overview81]
---

# objective

将80原生层/图片预览和81空间总览两模块组合，保留用户两条本轮要求；独立复核后主线完整回归，交付准确Mac25与Android构建15本地包。

# context

docs/ui/image-preview.md、docs/ui/storage-overview.md、docs/ui/data-management.md、docs/testing.md、docs/debugging.md。

# path

根创建并清理隔离worktree、维护规格/任务/索引、合并、主线全测和本地构建。80代理负责App/Editor/native/图片runner，81代理只负责DataManagement/统计/新runner；80冻后协调在组合候选内整合79导航断言与新增组注册，不并发改相同文件。不同agent执行独立审查/定向验证与核包。

# verification

同源完整链：点击图片→受权媒体/信息→全局预览→原生工具组退让→原字节保存/关闭/撤权清理；打开数据管理→真实快照→类型汇总/比例→明细/返回→单文件导出与归档。原生AppKit双击/拖动/工具栏与DOM层分开验证。构建/production排除、桌面全组、手机notes/recording/attachments和新增UI组自然退出并记录输入与pageErrors；准确Mac25/Android15资源/签名核包，无原Android设备操作，不代替原版整窗像素。
