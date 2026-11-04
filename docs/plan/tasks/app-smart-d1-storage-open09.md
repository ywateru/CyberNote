---
id: app-smart-d1-storage-open09
scope: Store initialization and strict physical folder decoding
status: done
depends-on: []
---

## Objective

修复现有本地库在打开时的版本和文件夹数据保护。此为智能文件夹 D/O/U 的第一项实际产品前置修复，不是智能文件夹交付。root 已根据用户完整本地应用授权定稿本任务；不需要用户对例行实现决定再次确认。

## Context and approved contract

读取 `docs/INDEX.md`、`docs/architecture.md`、`docs/research/smart-folder-data-gate09.md`、`docs/research/smart-folder-contract09-proposal.md` 的 D1 段。提案其他 C1–C8 仍是后续设计输入；本任务只批准以下契约：

1. 当前数据库仍为版本 1，不写 smart、query、definitionRevision，不提前升级 DB2/归档3。任何 schema 创建、journal 恢复、系统行/设置补写之前读取 `user_version`；非 0/1 明确 `schema_version` 拒绝，保全版本、实体、附件、恢复日志。新建根目录/SQLite 文件本身允许，未来版本不能借恢复先清文件。
2. 版本 0 空库允许单事务创建现有 schema、系统行、设置并提交版本1。已有版本0库只在完整识别为当前旧 schema、已有物理文件夹严格合法时兼容；部分/未知结构拒绝，不能以 CREATE IF NOT EXISTS 补齐伪装结构。版本1同样先核已知必需 schema；既有可选 attachment_operations 表按现协议识别/初始化，保留无关用户扩展表而不把它们当必需表。不得重写笔记正文、revision、日期、设置内容或合法文件夹 JSON。
3. `Folder` 的现行六字段严格解码，保留旧合法缺省 parentId=None；未知字段（包括 query/null）、未知 kind、行键与 JSON id 不同、保留 ID/kind 关系错误、系统 parent 非空均明确报错。只接受 default/quick/trash 的固定身份及自定义 normal，不把 all 当实体。读取和归档反序列化共用严格形状，不能宽松吞字段；错误不应变成“不存在”。本批不新增对旧 normal parent/笔记 owner 的能力限制，不修改已有 archive1/2 语义。
4. 系统行只在 SQL 查询真实不存在时补建，已有 JSON 错误、读取错误或错误 kind 均拒绝且不覆盖。初始化/兼容迁移中 schema、缺失系统行、缺失 settings、版本提交同一事务；现行库缺失系统行/设置可按同一事务补建。验证所有已有 folder 行先于任何补写。现行1不反复执行版本赋值。已有 journal 恢复保持原实际协议，但仅在版本/schema/已有文件夹检查成功且初始化事务成功之后运行，不能在坏库上先清理。
5. 错误要含稳定 code 和可定位的诊断（不打印正文/密码）。缺失系统行是本任务唯一自动补建策略；不要顺带修复坏数据、移动笔记、放宽恢复或修改用户设置。事务中途错误应 rollback 全部该事务写入；失败注入仅 cfg(test) 或现有可用真实 SQLite hook，不进入公开生产动作。

## Path

`src-tauri/src/store.rs`；必要时新增 `src-tauri/src/store/open.rs` 和 `open_tests.rs`；若严格身份解码需共享可调整 archive.rs 仅相应读取边界。作者证据只写 `docs/verification/app-smart-d1-storage-open09/`。不改前端/UI、依赖、lock、原生插件或已有封存证据。

## Verification

使用真实临时 SQLite 和目录穿生产 Store.open：新空库；合法v1关闭重开逐行JSON/设置/笔记/日期保持；完整旧结构v0兼容；部分/未知v0与未来版本拒绝且schema/行/附件/journal保持；坏系统JSON、错误kind/ID/parent、未知字段和未知kind分别拒绝无覆盖；缺失系统行合法补建；中途SQL失败回滚schema/系统行/设置/版本且重试可用。归档1/2藏query字段明确拒绝而不损坏目标，旧合法归档和recordedAt回归保持。不要用复制实现或只grep源码验收。

作者可运行离线、限制jobs=2的窄 Rust 测试及相关现有 Store/archive/Session 回归；先检查至少2GiB空间，独占共享host target，禁止删除cache、下载、升级、平台构建/安装、用户DB和GUI/ADB。如现有正式cargo test成本不适合，复用仓库实际 Store/Session 直引的现有 harness，注明边界并验证使用本次源码；不能复用旧二进制冒称新源码测试。记录实际命令和失败，不扩大重复测试。

作者完成停止写入；root提交固定源后，由不同作者独立检查和必要重跑，再进入D2。root负责commit，作者不stage/commit。当前共享分支串行开发，不切换分支覆盖已有任务。仅此源码前置批不发布替换用户包，不宣称智能功能或像素通过。

## Actual delivery

固定源码提交de3c07f，生产仅store.rs/open.rs/open_tests.rs。作者真实Store/Session回归58通过、0失败、3既有忽略；不同作者复核固定产品blob并实际重跑11项open及3项旧归档/日期用例，14通过、0失败，未见blocking，target已释放。详见作者verification/app-smart-d1-storage-open09和独立review app-smart-d1-storage-open09.md。仅Store初始化源码子任务完成，未打包替换用户应用，DB仍1；D2另批升级格式。
