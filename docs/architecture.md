# 架构与数据契约

状态：首版实现契约，允许依据真实对比继续完善。

## 模块与所有权

```text
pnpm / TypeScript / React
    ├── MacShell (macOS 26 三栏、原生窗口、菜单)
    ├── MobileShell (iOS 录屏式布局、手势、键盘)
    └── Editor / 搜索 / 附件 / 录音 / 绘画
                    │ Tauri 2 invoke
                    ▼
             Rust commands
                    │
       SQLite Repository + attachments/
                    │
       平台 app_data_dir (不接入 iCloud)
```

Tauri 2 同时构建 macOS 和 Android；pnpm 管理前端与 Tauri CLI。React/TypeScript 前端分别实现平台壳，禁止把手机仅做成桌面缩小版。Tiptap/ProseMirror 提供结构化富文本、历史、表格、任务列表。Rust 是正式应用数据的唯一写入者。开发预览可有显式浏览器适配器，但不得把它用作打包版本后端。SQLite 采用 bundled 构建，事务写入，附件放在 app_data_dir/attachments/，路径不接受任意越界输入。

## 数据模型

- Folder：id、name、parentId?、kind(default/normal/quick/trash)、sortOrder、createdAt。
- Note：id、folderId、document（富文本 JSON）、title、plainText、createdAt、updatedAt、pinned、deletedAt?、originalFolderId?、locked、paperStyle、revision、sealed?（加密正文/盐/随机 nonce）。
- Attachment：id、noteId、kind、relativePath、mime、displayName、size。
- Settings：theme、list/gallery、sort、dateGrouping、sidebarWidth、listWidth、selection、locale。

ID 由 Rust 生成；时间为 UTC 毫秒，UI 按设备本地时区显示。title 从首段提取，空笔记显示“新备忘录”；摘要跳过标题。删除移到最近删除，保存 originalFolderId；恢复回原文件夹，文件夹不存在则回默认。永久删除为明确确认操作。持久文档包含表格/任务/绘画和附件引用，不能仅保存 innerText。

## 命令契约

允许实现阶段调整命名，但必须在源码与本文同步：

| 实际 Tauri 命令 | 输入 | 输出/约束 |
|---|---|---|
| `load_workspace` | 无 | 文件夹、完整富文档、附件元数据、设置；默认文件夹幂等初始化 |
| `workspace_action` | `action: {type, ...}` | `createNote/saveNote/patchNote/deleteNote/restoreNote/purgeNote`、文件夹管理、`settings`、锁定操作；create 返回新实体，其他通常返回 workspace |
| `store_attachment` | noteId、name、mime、Base64 data | 受管本地附件元数据；100 MB 上限；拒绝越界相对路径 |
| `read_attachment` | id | Base64 data、mime、name；锁定检查 |
| `export_archive` | 本地 path | 写入版本 1 `.notesbackup`，包含密文及附件 |
| `import_archive` | 本地 path | 完整校验、冲突时导入副本并恢复设置；返回更新 workspace |

当前搜索在前端对 Rust 载入的本地笔记正文与元数据做中文子串过滤，没有独立 FTS/search 命令。附件随永久删除清理，没有单独 remove_attachment 命令。MacShell/MobileShell 是概念边界，首轮均由 `src/App.tsx` 分支渲染，富编辑器在 `src/Editor.tsx`，原生存储在 `src-tauri/src/store.rs`。

Rust 错误应结构化：code/message，UI 显示错误并保留未保存内容。自动保存做按笔记串行队列/版本校验，避免切笔记或慢写导致旧内容覆盖新内容。输入法 composition 过程中不改写光标/文档。退出/失焦前清空队列并验证重启内容。附件内容 URL 只从受管路径生成。

### 本地归档可靠性契约（APP-001-FIX-00）

版本 1 归档为完整工作区：所有系统文件夹、笔记、附件元数据/字节与设置。导入先完整校验版本、唯一 ID、受管路径、类型、Base64/声明大小、引用和文件夹树；校验结束前不写生产附件。单归档上限 256 MiB，单附件 100 MiB，解码附件总计 128 MiB，实体总计 10,000；在分配完整对象树前以流式预检限制 JSON 值总数 500,000、深度 120、字段名 4,096 bytes，超限明确报 archive_limit 并保持旧数据。

ID 冲突采用导入副本：既有普通文件夹、笔记、附件保留原 ID 和内容；导入项遇同 ID 时分配新 UUID，并重写父目录、笔记所属、附件所属、文档附件节点和选中项引用。default/quick/trash 系统文件夹复用且必须符合固定身份/根层级；归档内部重复 ID、缺失引用、自环或多节点环明确拒绝。originalFolderId 允许指向已删除目录（恢复时已有默认目录规则），有 note 归属但暂未在文档中引用的附件合法。

归档设置在同一 SQLite 事务完整恢复。有效选中项经 ID 映射恢复；过期 selectedFolder 明确改为 default，过期 selectedNote 明确清空，其他设置保留；缺省选中键仍保持缺省，不为兼容旧归档丢弃整份设置。

附件采用 copy-on-write：在同文件系统 .imports/<UUID>/ 暂存，持久化 journal 后以独占新路径发布到 attachments/，绝不覆盖旧文件；文件就绪后单事务写入全部元数据与设置。数据库失败 rollback，清理本次新增文件。进程中断后 Store.open 按 journal 列表逐项核对数据库当前 relativePath 引用，只清理未引用的新文件，已提交引用的文件保留。发布前文件/日志和发布后的目录执行 sync，避免把两次目录 rename 当作跨 SQLite/文件系统的原子提交。清理失败保留 journal 供下次恢复，已成功提交的导入不冒报整体失败。原归档仅被读取，失败不修改既有文档、附件或设置。

归档导出写同目录暂存文件并原子替换目标；写入失败保留已有目标。结构与事务回归使用真实临时 SQLite/附件目录和进程中断点，独立 QA 重跑原失败探针。

## 接入与验证

必须逐项验证真实链路：Shell 选择→Editor 初始化；Editor transaction→保存队列→Rust→SQLite→重启；文件选择→Rust 附件复制→编辑器节点→重启预览；搜索→本地数据→列表选择；删除→最近删除→恢复；移动→计数/列表；录音→实际媒体→附件保存→播放；绘画→JSON/图片→重启编辑。先做核心闭环，然后以同一契约补齐功能，不隐藏未实现入口。


## 兼容与当前限制

Android 11 自带 Chrome 91 缺少 Array.findLast；Tiptap 3 的事务分发使用此方法。入口在载入编辑器前引入 core-js 对应补全，CSS 根高度提供 100vh→100dvh fallback，Vite 目标 chrome90。原生 MainActivity 将 WebView 内容避开 systemBars，adjustResize 处理输入法；系统 Back 经 Tauri onBackButtonPress 进入同一 React 导航。此配置已在现有模拟器采集实际截图。

锁定使用 Argon2 + AES-GCM，密钥仅保留进程内存；正文从数据库明文记录清除，secure_delete + wal_checkpoint(TRUNCATE) 减少旧正文遗留，标题仍作为元数据可见。当前含附件笔记不支持锁定。归档不依赖跨文件系统的假原子事务；附件引用以 SQLite 提交为准，暂存日志承担中断恢复。
