---
id: app-data-management79-ui
scope: attachment-flicker-image-export-data-management-ui-debug-integration
status: done
depends-on: [app-recording-indicator78]
---

# objective

修复附件全屏闪烁，增加图片卡保存/预览原图导出和更多设置的数据管理页，接入约定Rust接口与现有归档。严格按docs/ui/data-management.md；前端模块与后端可按该冻结接口独立开发，最终整合需真实Rust链通过。

# context

docs/INDEX.md、docs/ui/data-management.md、docs/architecture.md、docs/debugging.md、docs/testing.md及现有App/Editor/bridge/debug。已知闪烁来自validatePickerTarget触发全屏trusted同步遮罩，不能绕同步/权限/owner/actual Host commit。

# path

src/**必要实现（新增DataManagement组件/DTO/bridge wrapper）、scripts/debug/**除rust/transport.rs和build-rust-attachments.mjs的UI/fixture/catalog/回归、新独立scripts/check-data-management-ui79.*、docs/verification/data-management79-ui/。不改Rust/plugins、根规格/任务/索引，不创建/删除worktree或合入。现有媒体生命周期保持，不凭猜测重写。

# verification

先修复前真实DOM/rAF/MutationObserver复现并保全，再实现quiet呈现和安全负例；修复后正常附件全过程无cover/全页hidden/Host重挂，强同步/权限prepare/陌生session/失败仍遮挡。图片真实DOM保存/预览/管理页导出原字节，取消/缺文件/写失败/撤权；数据管理真实菜单、stat显示、mtime、分页/搜索/空态/error重试、320/390浅深主题。命令handler和生产排除，默认fixture明确边界，真实Rust集成等后端合入后由根安排。

冻结产品+runnercommit后独审，常规build/production、桌面197+新增、手机notes9/recording43/attachments43+新增一次即可。记录自然exit/wall/指纹/pageErrors和失败原件，不读写原设备数据。根主线完整整合及打包另外执行。

# delivery

2026-11-06：产品与runner经[独审](../reviews/app-data-management79-static.md) SOURCE-READY，已合主线并完成[六项整合](../../verification/data-management79/integration/README.md)。最终准确双端包由父任务继续。原生provider/整窗像素和既有调试CLI耗时波动边界单列，不据此授予设备运行通过。
