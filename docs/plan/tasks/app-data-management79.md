---
id: app-data-management79
scope: attachment-flicker-image-export-and-local-data-management
status: done
depends-on: [app-recording-indicator78]
---

# objective

完成用户goal：附件添加不再全屏闪烁；图片可保存/导出；媒体独立本地文件；更多设置新增真实数据管理及完整导入导出。规格docs/ui/data-management.md。

# context

docs/INDEX.md、docs/architecture.md、docs/ui/data-management.md、docs/testing.md。两独立模块backend/UI按冻结接口实现，最终集成必须使用真实Rust实现而非只通过fixture。

# path

根负责规格/任务/索引/主线整合/本地交付；[后端](app-data-management79-backend.md)和[前端](app-data-management79-ui.md)分离开发、不同agent独审。先独审后端并合入，再将前端同基线分支合入并验证全部真实接线。子代理不创建worktree，工作树/缓存由根管理。

# verification

修复前闪烁原因证据；实际图片保存/导出与管理页显示；真实磁盘文件/mtime/大小/所有分类；SQLite无媒体BLOB；真实Session归档与fresh重开逐字媒体；Android URI实现与准确构建边界；产品/runner冻结独审→串行主线完整回归→本地Mac新包独立核包。保留原Android约13秒现场，原生/真实Rust/browser/原版像素结论分别记录。用户已授权直接运行，无需重复确认。

# delivery

2026-11-06：本轮限定范围完成。[交付](../../verification/data-management79/README.md)、[独审](../reviews/app-data-management79-static.md)、[主线六项](../../verification/data-management79/integration/README.md)及[独立核包](../../verification/data-management79/native-independent/README.md)均已留证。Mac24/Android构建14本地可取；后者未安装。原Android录音现场保留，原生provider/整窗像素及调试CLI性能波动边界单列，原项目完整像素目标仍继续。
