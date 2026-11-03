---
id: app-001-fix-00
scope: archive-transaction-integrity
status: in-progress
depends-on: [qa-001]
---

## objective

修复独立 QA 确认的备份导入数据损坏与契约缺失，优先于视觉修正。保持 APP-001 隔离分支，完整应用目标继续 in-progress。

- 已确认P1：首个合法附件先覆盖已有文件，后续附件Base64无效时导入报错但前面的覆盖不回滚，损坏既有数据。导入失败必须保持既有数据库、附件、设置完整不变，不仅仅显示错误。
- 导入前校验整个归档：格式版本、ID唯一、合法类型、大小/内容、受管路径、笔记/附件引用、文件夹父引用、树循环与系统文件夹约束。校验失败不可先写生产文件。
- 附件以事务暂存方式准备，数据库更新与文件发布必须有失败恢复；清理暂存不得删除原文件。明确崩溃恢复策略并测试故障点。
- 既有ID冲突的覆盖/合并策略必须明确，不能无意覆盖用户当前数据。正常导入恢复归档设置（主题、视图、有效选中项等）；无效选中引用需有明确处理，不悄悄丢失全部设置。
- 错误返回时保留原归档与原工作区；成功后重开Rust Store验证文档、附件、层级及设置。

## context

- docs/INDEX.md
- docs/requirements.md F02/F08/F12/F15/F19
- docs/architecture.md
- docs/plan/reviews/qa-001-01.md
- docs/verification/qa-001/（独立探针/复现证据，以正式报告为准）

## path

src-tauri/src/store.rs、必要的Rust辅助模块与真实临时目录测试；同步docs/architecture.md归档契约和README。只改可靠性所需边界，不顺带更改UI产物。

## verification

独立QA原有失败复现必须修复：合法第一附件覆盖同ID、后续坏Base64→报错→已有附件字节保持；数据库/设置也保持。覆盖坏归档/树循环/缺失引用/重复ID/路径越界/文件发布错误等边界；有效归档进入新工作区和既有工作区后重开保持设置与附件。开发者提交后由独立verify重跑其原探针和新增错误点。不得仅测试实现内部辅助函数或回显输入。

## developer delivery — 2026-11-03

实现与开发者自测已完成，等待独立 verify；本任务和完整 APP-001 尚未验收。

- 归档逻辑拆为 `src-tauri/src/store/archive.rs`，启动时恢复未完成导入。校验全部归档后才发布独占新文件，持久化日志配合单 SQLite 事务；同 ID 导入副本，恢复设置与有效选择，错误/中断保留旧数据。契约同步 `docs/architecture.md` 和 README。
- 真实 Rust 回归 13 passed / 0 failed / 1 子进程专用 worker 默认 ignored；worker 实际被恢复测试启动六次，覆盖提交前后退出。Clippy all-targets、warnings-as-errors 通过。
- 原 QA 探针复制到 `docs/verification/app-001-fix-00/store-probes/` 后复测：设置相等、失败导入原附件保留、自环拒绝；原失败目录未修改。更强的合法首附件+坏第二 Base64 回归也通过。
- 开发者证据与边界见 `docs/verification/app-001-fix-00/selfcheck.md`；本轮不改 UI，不触碰系统 Notes，不声称像素一致或全功能通过。按协调计划，独立存储复核通过后再重构建 Mac/Android 产物，当前应用文件仍为首轮基线。
