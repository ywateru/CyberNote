---
id: app-data-management79-backend
scope: rust-real-inventory-original-attachment-export-and-android-document-io
status: in-progress
depends-on: [app-recording-indicator78]
---

# objective

实现用户数据管理79的Rust后端：真实只读磁盘快照、附件原字节导出、Android content URI导入导出；证明媒体独立文件。严格依据docs/ui/data-management.md的DTO及API，保留原Session/token/附件journal/归档合并事务和屏障。

# context

docs/INDEX.md、docs/architecture.md、docs/ui/data-management.md、docs/debugging.md、docs/testing.md；store.rs及store/{archive,attachment_operations}、session、lib.rs、已有notes-scan host集成。原Android保留现场不动。

# path

仅src-tauri/**必要源码/测试、plugins/tauri-plugin-notes-scan/**的host文档流IO、scripts/debug/rust/transport.rs及必要build-rust-attachments.mjs接口、新独立scripts/check-data-management-rust79.*、docs/verification/data-management79-backend/。不改src/**前端、scripts/debug/runtime/fixture/scenarios/catalog等共享前端路径，不改根规格/任务/索引。不新增外部依赖，除非本机已存在且必要并先说明。

# verification

先冻结产品/原生源码commit，真实Rustfresh合成目录stat/metadata/独立媒体文件/无BLOB/新PID重开/单件导出原字节/路径保护/缺文件/撤权/写失败/归档全媒体roundtrip及取消临时清理；暴露实际Session方法至现有真实Rusttransport供UI集成，不伪造命令。cargo编译及Android Kotlin/Rust构建检查，Android provider动作仅新隔离设施或不触设备的编译/原生harness，不操作原模拟器。保留输入hash、自然exit、wall和失败原件。不和前端agent共享dist/index/cargo target；根分配缓存。独审由另一agent完成，证据仅自己目录，提交后交还占用。
