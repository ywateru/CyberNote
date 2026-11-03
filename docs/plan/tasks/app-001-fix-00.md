---
id: app-001-fix-00
scope: archive-transaction-integrity
status: verified
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
- docs/plan/reviews/app-001-fix-00-01.md（原三项已修；唯一剩余P2为文档schema父子/内容结构校验）

## path

src-tauri/src/store.rs、必要的Rust辅助模块与真实临时目录测试；同步docs/architecture.md归档契约和README。只改可靠性所需边界，不顺带更改UI产物。

## verification

独立QA原有失败复现必须修复：合法第一附件覆盖同ID、后续坏Base64→报错→已有附件字节保持；数据库/设置也保持。覆盖坏归档/树循环/缺失引用/重复ID/路径越界/文件发布错误等边界；有效归档进入新工作区和既有工作区后重开保持设置与附件。开发者提交后由独立verify重跑其原探针和新增错误点。不得仅测试实现内部辅助函数或回显输入。

归档文档结构也必须符合当前真实Editor扩展的schema，不仅是节点名称白名单。已知三种坏输入：doc直接含text、paragraph含paragraph、table含paragraph；当前前端schema拒绝但Rust仍接受并持久化。补修后应在写入前拒绝，保留工作区全部原状态；合法复杂文档与默认省略属性仍可用。保留独立qa-fix-00原失败证据，新增复核记录。

## developer delivery — 2026-11-03

实现与开发者自测已完成，等待独立 verify；本任务和完整 APP-001 尚未验收。

- 归档逻辑拆为 `src-tauri/src/store/archive.rs`，启动时恢复未完成导入。校验全部归档后才发布独占新文件，持久化日志配合单 SQLite 事务；同 ID 导入副本，恢复设置与有效选择，错误/中断保留旧数据。契约同步 `docs/architecture.md` 和 README。
- 真实 Rust 回归 13 passed / 0 failed / 1 子进程专用 worker 默认 ignored；worker 实际被恢复测试启动六次，覆盖提交前后退出。Clippy all-targets、warnings-as-errors 通过。
- 原 QA 探针复制到 `docs/verification/app-001-fix-00/store-probes/` 后复测：设置相等、失败导入原附件保留、自环拒绝；原失败目录未修改。更强的合法首附件+坏第二 Base64 回归也通过。
- 开发者证据与边界见 `docs/verification/app-001-fix-00/selfcheck.md`；本轮不改 UI，不触碰系统 Notes，不声称像素一致或全功能通过。按协调计划，独立存储复核通过后再重构建 Mac/Android 产物，当前应用文件仍为首轮基线。

## developer schema supplement — 2026-11-03

针对独立报告唯一剩余 `FIX-00-QA-01` 完成补修，等待独立 verify；本段为开发者自测结果，不改变任务验收状态。

- 抽出实际 Editor 共用扩展 factory，保持扩展顺序、选项和 React 节点视图不变；从真实 ProseMirror schema 生成 Rust 内嵌清单，并以 `pnpm test:schema` 检测漂移。
- 归档在写入前校验 root/block/inline、列表首段、任务、表格行/单元格、叶节点内容基数、marks 位置与互斥，以及应用属性类型/预算。默认省略属性与 ProseMirror 接受的 marks 输入顺序保留；不自动改写导入文档。
- 共享 63 例：7 例合法文档导入、导出/重导入、附件字节及重开通过；35 例实际 schema 非法结构及 21 例额外属性/封装/预算错误在公开归档入口被拒绝，旧状态与源文件保持。原独立三份坏归档只读重跑也全部拒绝，原 QA 正常归档仍可往返。
- `cargo test --offline` 为 15 passed / 0 failed / 1 专用 worker 默认 ignored；真实六中断点仍通过。TypeScript、前端构建、Cargo check、Clippy all-targets `-D warnings` 及真实 Editor schema 对照通过。证据见 `docs/verification/app-001-fix-00-schema/selfcheck.md`。原 `qa-fix-00/` 与 `qa-001/` 未修改；未重构建 Mac/APK 或开展新 GUI/设备验证。

## independent acceptance — 2026-11-03

独立复核已通过，报告 `docs/plan/reviews/app-001-fix-00-02.md`，提交 `0dd11f09d4645158f4265d78c0b469423bbec186`。原三份非法文档在写入前拒绝，旧工作区/设置/附件完整保持；63例schema跨检、额外5组合法默认值往返、晚期数据库失败及六次真实进程中断恢复通过。FIX-00无剩余阻塞。本结论限归档可靠性，已安装产物尚待后续重构建，APP-001整体及UI像素验收继续进行。
