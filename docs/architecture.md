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
- Note：id、folderId、document（富文本 JSON）、title、plainText、createdAt、updatedAt、pinned、deletedAt?、originalFolderId?、locked、paperStyle。
- Attachment：id、noteId、kind、relativePath、mime、displayName、size、metadata。
- Settings：theme、list/gallery、sort、dateGrouping、sidebarWidth、listWidth、selection、locale。

ID 由 Rust 生成；时间为 UTC 毫秒，UI 按设备本地时区显示。title 从首段提取，空笔记显示“新备忘录”；摘要跳过标题。删除移到最近删除，保存 originalFolderId；恢复回原文件夹，文件夹不存在则回默认。永久删除为明确确认操作。持久文档包含表格/任务/绘画和附件引用，不能仅保存 innerText。

## 命令契约

允许实现阶段调整命名，但必须在源码与本文同步：

| 命令族 | 输入 | 输出/约束 |
|---|---|---|
| load_workspace | 无 | 文件夹、笔记元数据、设置；只初始化一次默认文件夹 |
| create/update/delete/restore_note | id、document、revision 等 | 完成事务后返回最终笔记；禁止失败时显示已保存 |
| create/rename/move/delete_folder | 父节点、名称等 | 禁止循环和空名称；删除行为包含子树与笔记 |
| search | query、filters | 本地全文与元数据结果；中文子串可用，不只依赖英文分词 |
| store/read/remove_attachment | 文件/字节、noteId | 复制到本地受管目录；拒绝路径穿越 |
| update_settings | 部分设置 | 持久化布局与显示偏好 |
| export/import | 选定范围、文件 | 可恢复的本地归档；版本化格式 |

Rust 错误应结构化：code/message，UI 显示错误并保留未保存内容。自动保存做按笔记串行队列/版本校验，避免切笔记或慢写导致旧内容覆盖新内容。输入法 composition 过程中不改写光标/文档。退出/失焦前清空队列并验证重启内容。附件内容 URL 只从受管路径生成。

## 接入与验证

必须逐项验证真实链路：Shell 选择→Editor 初始化；Editor transaction→保存队列→Rust→SQLite→重启；文件选择→Rust 附件复制→编辑器节点→重启预览；搜索→本地数据→列表选择；删除→最近删除→恢复；移动→计数/列表；录音→实际媒体→附件保存→播放；绘画→JSON/图片→重启编辑。先做核心闭环，然后以同一契约补齐功能，不隐藏未实现入口。
