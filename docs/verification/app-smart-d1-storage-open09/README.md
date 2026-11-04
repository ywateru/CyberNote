# APP-SMART-D1 作者验证证据

本批修复本地数据库打开顺序、兼容初始化与严格物理文件夹解码。数据库仍为版本1；没有实现智能文件夹、改变归档版本、修改前端或新增依赖。本目录由实现作者封存，root 后续提交固定源码并安排独立审查。

## 源码身份与行为

产品基线：`1b1d47aab702eccb29999e8ead404e856dc089c7`。最终测试与封存时 HEAD 为 `ca92b9ee82dc2b9cd8e5ac05f499e2305aeeb41c`（期间 root 只提交了文档）。本批产品仅涉及 `src-tauri/src/store.rs`、新增 `src-tauri/src/store/open.rs` 和 `src-tauri/src/store/open_tests.rs`。精确 SHA-256 见 `source-identity.json`；`product.patch` 包含三个路径（含新增文件）。不 stage、不 commit，不改 root 同时维护的文档。

打开时先读 user_version，再在同一事务中重读版本、识别 schema、验证所有已有文件夹，并初始化可选附件操作表、补真正缺失的系统行/设置，最后仅对版本0提交版本1。版本/schema/文件夹检查成功并提交后才设写入 PRAGMA、创建附件目录和执行原恢复协议。未来版本和坏库不进入补写/恢复。已有系统行和设置不会再次尝试插入，触发器回归覆盖这一点。

schema 采用保守的“识别项目已知 DDL”政策，允许大小写、空白、IF NOT EXISTS 和末尾分号差异，并检查实际 table_xinfo 字段约束；不宣称接受任意语义等价、标识符加引号或约束重排的外部 schema。无关扩展表保留；只有 SQLite 的 `sqlite_*` 内部对象忽略，`sqliteX_extension` 仍被识别为用户对象。

Folder 反序列化严格接受现行六字段（旧数据缺省 parentId 仍可读），验证保留 ID/kind/系统根层级，读取时验证 SQL 行键。未知字段（含 query:null）、未知 kind 和 all 实体拒绝，不添加旧 normal 的 parent/笔记 owner 限制。归档1/2经同一严格解码边界，保持合法旧归档语义。诊断给出稳定 code 和 rowid，不输出文件夹 JSON/正文/密码。

## 实际命令与结果

`run-rust.py` 复用仓库既有 Store/Session harness 的 Cargo.toml/Cargo.lock，直接链接本次生产 Store/Session 模块。设置 CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2、CARGO_TARGET_DIR=src-tauri/target；运行前空间至少2GiB。完整原始命令、源文件前后哈希和空间记录保存在各 run 的 result.json。

最终命令：

```text
python3 -B docs/verification/app-smart-d1-storage-open09/run-rust.py run05
cargo test --locked --offline --features rusqlite/hooks --manifest-path <repo>/docs/verification/app-smart-d1-storage-open09/harness02/Cargo.toml -- --nocapture
```

| 轮次 | 实际结果 | 说明 |
| --- | --- | --- |
| run01 | exit101，编译失败 | 初版 harness 的绝对 path 模块导致 Session 子测试路径解析错误；原 harness 和日志保留，随后改为项目既有的生产模块符号链接方式。属于测试入口配置错误。 |
| run02 | 10通过，0失败，50过滤 | D1 窄测试。 |
| run03 | 57通过，0失败，3忽略 | 首次完整 Store/Session 回归。 |
| run04 | 58通过，0失败，3忽略 | 改为设置行真实缺失才插入，新增已有系统/设置行触发器检查。 |
| run05 | **58通过，0失败，3忽略** | 最终源码；修正 SQLite 内部对象匹配的下划线通配问题并补用户扩展表 fixture。总耗时7.432秒，最终源码前后哈希一致。 |

新增11个真实 Rust 测试覆盖新空库、版本1重开逐行保真、完整版本0兼容、缺失行补写、已有行不再插入、未来版本/坏结构/坏文件夹无损拒绝、运行期严格读取、六阶段实际 SQL 错误的事务回滚与重试、成功后的既有恢复、归档1/2隐藏字段拒绝及合法归档兼容；测试内部包含多组 fixture。既有归档、recordedAt、附件操作和 Session 测试一并运行。最终剩余空间71894343680字节。

## 边界与封存

这是实际生产 Store/Session 的直接调用测试，不覆盖 Tauri IPC、平台打包、移动端或 UI。没有运行前端 build（无前端改动）、平台构建/安装、GUI、ADB 或用户数据库；没有下载、升级或删除缓存。共享 host target 已释放，不再有本批运行中的构建。

`manifest.json` 对本证据目录的常规文件记录 SHA-256，对符号链接记录链接目标且不递归跟随（包括指回仓库 docs 的链接），避免证据循环；清单自身排除。`seal.json` 记录清单、README、源码身份和补丁的哈希。封存后作者停止写入，交 root 固定源码并独立审查。本批不宣称智能文件夹或像素一致验收通过。
