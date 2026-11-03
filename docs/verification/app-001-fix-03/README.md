# FIX03：受控夹具准备，未执行修复验收

日期：2026-11-03。生产基线 `8124911`。本目录仅准备后续多窗口授权修复所需夹具与动作顺序，**不是 FIX03 pass**；没有修改共享生产源码、构建主应用或操作 GUI。

## 夹具与密码

所有内容均为合成数据。固定测试密码为 `FIX03-synthetic-only-2026`，不得复用为实际笔记密码。公开标题用于识别夹具；正文含独立 `PRIVATE-…-2026` 标记，以便后续检查工作区、搜索、迟到响应或归档是否泄漏正文。

| 文件 | 正确解密后的内容 | 后续预期 |
|---|---|---|
| `fixtures/valid-rich.notesbackup` | 标题、中文正文、bold/highlight、hardBreak、短划线列表、清单、引用、表格 | 解锁成功并完整保留 |
| `fixtures/valid-drawing.notesbackup` | 标题、正文、pen/marker 真实笔画 | 解锁成功并完整保留 |
| `fixtures/invalid-structure.notesbackup` | paragraph 内嵌 paragraph | 解锁明确拒绝，密文与授权保持 |
| `fixtures/invalid-drawing-attribute.notesbackup` | drawing 笔画 tool 为不支持的 spray | 解锁明确拒绝，密文与授权保持 |

相邻 `.document.json` 是供审查的合成解密原文，并非应用导出的明文泄漏。非法绘画的结构可满足编辑器 schema，却不满足应用笔画属性约束，因此可区分“只校验树结构”和“复用完整文档规则”。本夹具没有外部附件，不越过“含附件笔记暂不能锁定”的现有边界。

## 实际生成方式与基线观察

`fixture-generator/src/main.rs` 通过 `#[path]` 引入真实 `src-tauri/src/store.rs`，连同其原有 archive/document 模块直接编译，没有复制、重写或替换密码派生与加解密算法，也没有包装测试版生产行为。生成器在本目录的独立 Store 根中执行：

1. createNote → saveNote 写入对应合成文档。
2. 明文 export_archive 经过真实 schema/应用属性校验；两份合法成功，两份非法得到 archive_invalid，结果保存于 `fixture-result.json`。
3. 当前基线 saveNote 仅查文档根类型，因此能先写入非法内部文档。再真实 lockNote（Argon2默认参数、随机salt/nonce、AES-256-GCM）→ export_archive 生成密文夹具。
4. 另开无密钥的冷 Store 真实 import_archive。四份外层归档均成功；正文/plainText仍隐藏。此时归档导入没有密码，不能校验未知密文内部，成功是允许行为。
5. 错误密码均由真实解密拒绝。正确密码可以完整还原两份合法内容。当前基线正确密码也会接受并发布两份非法内容，结果以 baseline… 字段如实记录，**这正是待修缺陷，不是预期通过**。

原始日志在 `checks/fixture-generator.log`。输出文件、生成器与生产输入 hash 在 `fixture-manifest.json`。夹具生成使用随机ID/salt/nonce，因此重跑不会产生字节一致的密文；归档与预期原文的对应关系以本次 hash 和 noteId 为准。生成器和归档都不读取真实用户 Store。

复现当前基线夹具生成：

```sh
cargo run --offline --manifest-path docs/verification/app-001-fix-03/fixture-generator/Cargo.toml
```

该命令只在本目录内重建自己的 fixture-work，未触碰应用数据；会覆盖本目录的合成夹具。后续若 saveNote 已正确拒绝非法文档，生成器在写入非法夹具时失败属于预期，不应放宽生产验证。后续验收应优先使用本次已冻结的四份归档；如需重新生成非法样本，在隔离的8124911源码快照使用本生成器，或清楚记录独立密文构造，不能在共享源码中临时放松规则。

`fixture-work/` 含合成 SQLite/明文中间文件，`fixture-generator/target/` 为局部编译缓存，两者忽略提交。只交付合成归档、原文、结果与可复现源码。

## 后续验收入口

`late-actions.md` 定义多窗口受控保存/读取顺序、应记录的实际窗口ID与授权版本、成功/失败边界和事件丢失恢复。它是尚未执行的计划。真实实现及安装版多窗口证据完成前，窗口同步、晚到结果失效、失败不丢编辑、复制/分享来源、编辑器历史清除均保持 unknown。
