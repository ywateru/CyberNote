# APP-001-FIX-00 文档 schema 补修：开发者自测

日期：2026-11-03。实现代理：develop_app。基于生产修复 `9b724a5` 与独立报告 `docs/plan/reviews/app-001-fix-00-01.md`，仅处理唯一剩余阻塞 `FIX-00-QA-01`。本记录等待独立复核，不代表整应用或像素一致性验收。

## 实现边界

`src/editor-schema.ts` 抽出真实 Editor 既有扩展配置与附件/绘画 schema，原扩展顺序、选项及 React 节点视图保持；`Editor.tsx` 使用该 factory。`scripts/check-editor-schema.mjs` 从同一生产 factory 创建实际 ProseMirror schema，对照 Rust 内嵌清单和共享样例，不复制一套近似编辑器配置。

`src-tauri/src/store/archive/document.rs` 在附件发布与数据库修改前校验实际内容表达式：root/block/inline、列表首段与嵌套任务、表格行与单元格、叶节点、非空文本、父节点允许的 marks、重复/互斥 marks，以及属性类型/值。标题级别、清单状态、表格跨度/列宽/对齐、链接/颜色、附件与绘画按应用契约额外检查；表格逻辑网格限 100,000 格，原深度 64/节点 100,000 限制保持。未知内容表达式明确拒绝。

默认属性允许省略；真实 schema 允许空表格行，所以该输入保留兼容。ProseMirror `nodeFromJSON` 会排序输入 marks，Rust 也接受顺序不同但无冲突的 marks，保存原 JSON，不改写或丢弃输入内容。附件所属与类型引用仍按原契约检查。归档事务、独占新文件发布及恢复机制未改变。

## 实际结果

| 检查 | 结果与证据 |
|---|---|
| 真实 Editor schema | 19 节点、8 marks；生成清单完全相等；共享 63 例与声明的实际 schema 接受/拒绝结果一致，见 `frontend-schema.json` |
| 合法文档 | 7 例经公开导入、原 JSON 保持、导出/重导入、实体及附件字节比较、重开通过；复杂例覆盖全部受支持节点/marks、嵌套列表/任务、表格、附件及绘画 |
| 非法结构 | 35 例实际 schema 非法结构/marks/text 与 21 例应用额外属性/封装/预算错误在公开导入入口拒绝；完整旧 workspace/settings/files、重开与源归档不变，`.imports` 清理，见 `rust-tests.txt` |
| 原独立三份坏归档 | 只读使用 `qa-fix-00/schema-fixtures/*.notesbackup`，Rust 全部返回 `archive_invalid`，独立进程重开后完整旧 workspace/settings/全部附件字节相等，源文件 SHA-256 相同，见 `qa-fixture-result.json` 与 `recheck_fixtures.py` |
| 同三份归档的实际前端检查 | 实际 factory schema 全部拒绝；同源 SHA-256 与具体错误见 `frontend-schema.json` 的 archives |
| 原有效归档兼容 | 原 `qa-001/store-probes/fixtures/valid.notesbackup` 导入、导出/重导入、笔记/设置与附件字节保持，见 Rust 测试 |
| 事务/恢复回归 | 原全部测试仍通过，含真实 `process::exit(77)` 六个中断点；15 passed / 0 failed / 1 默认 ignored 的专用 worker，worker 实际由恢复测试调用六次 |
| 原加强探针 | 隔离复制的原探针重跑 late settings trigger、合法首 blob+坏第二 Base64、重复导入/引用映射/旧编辑版本保留，见 `independent-result.json` |
| 构建与静态检查 | `pnpm typecheck`、`pnpm build`、Cargo check、Clippy all-targets `-D warnings`、格式检查通过；前端构建仍有既有 chunk-size 提示 |

63 例中的 `schemaAccepted` 与 `importAccepted` 分开声明。ProseMirror 的 JSON 解码会为缺失属性填默认值，也会接受部分未指定类型的属性或忽略额外封装；归档边界按已记录的应用属性/预算契约明确拒绝这些输入。21 例额外错误并不声称都是 ProseMirror 自身拒绝。

往返实体比较仅排除物理附件 `relativePath`（副本发布使用新文件名）、数组顺序以及目的工作区复用系统文件夹的本地 `createdAt`；笔记正文/元数据、其余文件夹属性、附件元数据、设置逐项比较，附件内容另行按字节检查。

## 重跑

```sh
pnpm test:schema --reject-archives docs/verification/qa-fix-00/schema-fixtures --output docs/verification/app-001-fix-00-schema/frontend-schema.json
cargo test --offline --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo build --offline --manifest-path docs/verification/app-001-fix-00-schema/store-probes/Cargo.toml --bin independent
python3 docs/verification/app-001-fix-00-schema/recheck_fixtures.py
docs/verification/app-001-fix-00-schema/store-probes/target/debug/independent
```

原 `qa-fix-00/`、`qa-001/` 与上轮开发者证据保持不动。此次未重构建或安装 Mac/APK，未执行 GUI/设备检查，没有新增像素一致性结论；生产共享 factory 的构建/类型通过仍需独立代码复核。
