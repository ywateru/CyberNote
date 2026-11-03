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
| `import_archive` | 本地 path | 解析并按 ID 合并归档；返回更新 workspace |

当前搜索在前端对 Rust 载入的本地笔记正文与元数据做中文子串过滤，没有独立 FTS/search 命令。附件随永久删除清理，没有单独 remove_attachment 命令。MacShell/MobileShell 是概念边界，首轮均由 `src/App.tsx` 分支渲染，富编辑器在 `src/Editor.tsx`，原生存储在 `src-tauri/src/store.rs`。

Rust 错误应结构化：code/message，UI 显示错误并保留未保存内容。自动保存做按笔记串行队列/版本校验，避免切笔记或慢写导致旧内容覆盖新内容。输入法 composition 过程中不改写光标/文档。退出/失焦前清空队列并验证重启内容。附件内容 URL 只从受管路径生成。

## 接入与验证

必须逐项验证真实链路：Shell 选择→Editor 初始化；Editor transaction→保存队列→Rust→SQLite→重启；文件选择→Rust 附件复制→编辑器节点→重启预览；搜索→本地数据→列表选择；删除→最近删除→恢复；移动→计数/列表；录音→实际媒体→附件保存→播放；绘画→JSON/图片→重启编辑。先做核心闭环，然后以同一契约补齐功能，不隐藏未实现入口。


## 兼容与当前限制

Android 11 自带 Chrome 91 缺少 Array.findLast；Tiptap 3 的事务分发使用此方法。入口在载入编辑器前引入 core-js 对应补全，CSS 根高度提供 100vh→100dvh fallback，Vite 目标 chrome90。原生 MainActivity 将 WebView 内容避开 systemBars，adjustResize 处理输入法；系统 Back 经 Tauri onBackButtonPress 进入同一 React 导航。此配置已在现有模拟器采集实际截图。

锁定使用 Argon2 + AES-GCM，密钥仅保留进程内存；正文从数据库明文记录清除，secure_delete + wal_checkpoint(TRUNCATE) 减少旧正文遗留，标题仍作为元数据可见。当前含附件笔记不支持锁定。归档导入文件写入与数据库提交尚非同一原子事务，失败中断恢复需后续补强。
