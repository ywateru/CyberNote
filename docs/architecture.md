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

FIX-01 编辑契约：默认空笔记直接输入从一级标题开始，Enter 后为正文；仅首次、仍为空的一块标题/正文文档，在明确仅有 text/plain 的粘贴时按全部正文插入，已有内容或 HTML 粘贴不走该特判。短划线列表使用真实 bulletList 的 `listStyle: "dash"` 属性，与默认 `"bullet"` 区分，旧文档省略该属性仍有效。表格转换按各单元格内部 LF、列 Tab、行 LF（含末行 LF）生成正文，保留末空格，选中完整转换块，并以一个独立历史事务支持单次 Undo。格式面板保存当前 noteId 和映射后的 ProseMirror SelectionBookmark，面板命令不调用 focus；X 还原选区并恢复键盘，Android Back 关闭面板并保持键盘隐藏，切笔记清除旧 bookmark。Mac 画廊同主窗进入笔记，返回恢复相同文件夹/查询/排序/滚动；独立窗为显式菜单入口。

移动端格式面板与键盘附加栏互斥：`menu === "format"` 时不渲染 `editor-tools`，面板保留自身的圆形关闭按钮；X 恢复编辑焦点后，按编辑状态重新显示附加栏。面板仅依赖原有底部空间与原生 WebView 布局，无额外键盘高度抵扣。补修的真实原生触摸回归见 `docs/verification/app-001-fix-01-format/`。

paperStyle 合法值为 plain、lines-small、lines-medium、lines-large、grid-small、grid-medium、grid-large，依此按空白独占首行、其余两列三行显示。选择立即保存到当前笔记，取消只关闭选择页。纸纹用于绘画/手写区域和选择预览，不给普通键入文字整页铺纹；已有六种值无需迁移。绘画编辑与保存后的绘画节点使用相同样式，切换纸张不改笔画。

移动端纸张页单独保存 noteId、editor、SelectionBookmark 和原 editable 状态。打开前同步 blur 正文、冻结 editable 并调用原生隐藏键盘，避免 Android 系统 Back 只藏键盘但留下编辑焦点后再唤起 IME。纸张页期间书签随事务映射；取消、选择、Back、Escape 或 backdrop 关闭时恢复同笔记选区与 editable，保持键盘隐藏，切笔记作废旧目标。这是纸张页的项目交互契约，不扩展到其他弹窗或菜单。

## 命令契约

允许实现阶段调整命名，但必须在源码与本文同步：

| 实际 Tauri 命令 | 输入 | 输出/约束 |
|---|---|---|
| `load_workspace` | 无 | 文件夹、已授权文档、附件元数据、设置及 access 快照；屏障目标正文脱敏 |
| `register_save_intent` | noteId、intent、expected | Rust注入真实调用窗口；保存入队时预登记当前note epoch，prepare后不接受目标新登记 |
| `workspace_action` | `action: {type, ...}`、expected | 通用变更检查进程会话/全局epoch；saveNote须带登记的saveIntent，按真实窗口及note epoch检查；返回值带access |
| `acknowledge_access` | operationId、success | Rust注入真实窗口；未完成的目标保存不得成功ACK |
| `read_note_text` | id、expected | 执行时检查实时授权与屏障，返回title/text及access；拷贝/分享统一使用 |
| `store_attachment` | noteId、name、mime、Base64 data、expected | 受管本地附件元数据；100 MB 上限；实时授权/屏障检查 |
| `read_attachment` | id、expected | Base64 data、mime、name及access；按附件真实归属note检查 |
| `export_archive` | 本地 path、expected | 写版本1密文归档；屏障期间拒绝；标题仍可见 |
| `import_archive` | 本地 path、expected | 完整校验、冲突副本和设置恢复；先执行全部窗口保存屏障，成功清钥匙并更新epoch |

当前搜索在前端对 Rust 载入的本地笔记正文与元数据做中文子串过滤，没有独立 FTS/search 命令。附件随永久删除清理，没有单独 remove_attachment 命令。MacShell/MobileShell 是概念边界，首轮均由 `src/App.tsx` 分支渲染，富编辑器在 `src/Editor.tsx`，原生存储在 `src-tauri/src/store.rs`。

Rust 错误应结构化：code/message，UI 显示错误并保留未保存内容。自动保存做按笔记串行队列/版本校验，避免切笔记或慢写导致旧内容覆盖新内容。输入法 composition 过程中不改写光标/文档。退出/失焦前清空队列并验证重启内容。附件内容 URL 只从受管路径生成。

### 进程授权与多窗口保存边界（APP-001-FIX-03）

Rust Session拥有随机进程sessionId、全局epoch与逐笔记epoch，Store.keys是唯一解锁授权。renderer不保留独立unlocked集合。notes-access只广播prepare/commit/abort、操作ID、目标ID、真实参与窗口及access元数据，不带正文/密码/钥匙。设置锁、移除锁、关闭全部锁、删除笔记/文件夹、永久删除和归档导入均先冻结目标，真实窗口集合来自AppHandle.webview_windows，调用窗口身份由Tauri注入，不能通过action自报。

prepare后新读取脱敏、目标新保存登记拒绝；prepare前登记的保存可以继续执行，窗口严格等待队列且确认pendingDocs与保存失败集合均空后才ACK。Rust也拒绝带未完成intent的成功ACK，保存失败直接使当前屏障失败。异步workspace_action/import_archive将10秒有界Condvar等待放在spawn_blocking中，等待时释放Store mutex且离开GUI线程。任何失败ACK、保存冲突、超时或参与窗口消失均abort，不撤销旧授权、不丢弃pending编辑；已成功排空的保存仍持久保留。abort恢复prepare前editor的editable，包含纸张页冻结状态。

全部ACK后才执行变更、提升目标epoch、撤销目标钥匙，再从权威Store重新生成响应；commit立即destroy受影响Editor及历史，清正文/预览/搜索/find、纸张/格式书签、绘画/录音/媒体目标。原先进行中的保存响应只确认revision，不回填正文；读取与变更响应经进程、epoch、renderer generation检查，失效结果不进入缓存。启动先订阅事件再取快照，重新聚焦/回前台先遮挡旧内容再同步；同步失败继续遮挡并提供重试，事件丢失后仍以可信快照恢复。系统剪贴板或用户已经明确交给系统分享的副本不在撤销契约中，不读取/清理用户剪贴板，不等待系统分享无限结束。

解锁在正确密码解密后、插入key前复用真实Editor schema和应用属性校验；正常/加密save与首次lock同样校验。未知密码归档只校验外层密文格式，非法内部节点或drawing属性在正确密码解锁时拒绝，密文与旧会话不变。lockNote已持久提交但WAL整理错误用lock_committed报告真实状态，仍commit授权边界并提示维护错误，不能假abort恢复旧正文。

仅显式启用Rust feature access-boundary-proof且Vite VITE_ACCESS_BOUNDARY_PROOF=1的额外测试包包含固定暂停/记录适配器：只暂停真实save执行或真实读取结果交付，按prepare/commit释放；不改请求/结果，不写Editor/React状态。默认生产包不编入Rust记录命令，Vite消除整个测试模块。测试包与生产包指纹和运行证据分别记录。

### 本地归档可靠性契约（APP-001-FIX-00）

版本 1 归档为完整工作区：所有系统文件夹、笔记、附件元数据/字节与设置。导入先完整校验版本、唯一 ID、受管路径、类型、Base64/声明大小、引用和文件夹树；富文档同时按当前 Editor 共享扩展生成的 schema 契约校验父子/基数（block、inline、列表首段、表格行/单元格、叶节点）、marks 位置/重复/互斥及实际属性类型；默认属性可省略，坏输入明确拒绝，不自动修复或丢弃内容。共享 factory 与 Rust 内嵌 schema 清单通过真实 ProseMirror crosscheck 防止漂移。清单布尔、标题级别、表格跨度/列宽、链接/颜色以及绘画笔画按应用属性契约验证，表格逻辑网格不超过 100,000 格。校验结束前不写生产附件。单归档上限 256 MiB，单附件 100 MiB，解码附件总计 128 MiB，实体总计 10,000；在分配完整对象树前以流式预检限制 JSON 值总数 500,000、深度 120、字段名 4,096 bytes，超限明确报 archive_limit 并保持旧数据。

ID 冲突采用导入副本：既有普通文件夹、笔记、附件保留原 ID 和内容；导入项遇同 ID 时分配新 UUID，并重写父目录、笔记所属、附件所属、文档附件节点和选中项引用。default/quick/trash 系统文件夹复用且必须符合固定身份/根层级；归档内部重复 ID、缺失引用、自环或多节点环明确拒绝。originalFolderId 允许指向已删除目录（恢复时已有默认目录规则），有 note 归属但暂未在文档中引用的附件合法。

归档设置在同一 SQLite 事务完整恢复。有效选中项经 ID 映射恢复；过期 selectedFolder 明确改为 default，过期 selectedNote 明确清空，其他设置保留；缺省选中键仍保持缺省，不为兼容旧归档丢弃整份设置。

附件采用 copy-on-write：在同文件系统 .imports/<UUID>/ 暂存，持久化 journal 后以独占新路径发布到 attachments/，绝不覆盖旧文件；文件就绪后单事务写入全部元数据与设置。数据库失败 rollback，清理本次新增文件。进程中断后 Store.open 按 journal 列表逐项核对数据库当前 relativePath 引用，只清理未引用的新文件，已提交引用的文件保留。发布前文件/日志和发布后的目录执行 sync，避免把两次目录 rename 当作跨 SQLite/文件系统的原子提交。清理失败保留 journal 供下次恢复，已成功提交的导入不冒报整体失败。原归档仅被读取，失败不修改既有文档、附件或设置。

归档导出写同目录暂存文件并原子替换目标；写入失败保留已有目标。结构与事务回归使用真实临时 SQLite/附件目录和进程中断点，独立 QA 重跑原失败探针。

## 接入与验证

必须逐项验证真实链路：Shell 选择→Editor 初始化；Editor transaction→保存队列→Rust→SQLite→重启；文件选择→Rust 附件复制→编辑器节点→重启预览；搜索→本地数据→列表选择；删除→最近删除→恢复；移动→计数/列表；录音→实际媒体→附件保存→播放；绘画→JSON/图片→重启编辑。先做核心闭环，然后以同一契约补齐功能，不隐藏未实现入口。


## 兼容与当前限制

Android 11 自带 Chrome 91 缺少 Array.findLast；Tiptap 3 的事务分发使用此方法。入口在载入编辑器前引入 core-js 对应补全，CSS 根高度提供 100vh→100dvh fallback，Vite 目标 chrome90。原生 MainActivity 统一设置 WebView 容器的 systemBars / IME 避让：底部取两者 inset 的最大值，并扣除已处理的 inset 后传给子视图；保持 adjustResize 配置，避免旧 WebView 在 edge-to-edge 下仅被键盘覆盖而不缩小布局。前端只使用该实际布局高度的 resize，不再叠加键盘 offset。系统 Back 经 Tauri onBackButtonPress 进入同一 React 导航。Android11 / Chrome91 原生坐标触摸的键盘→格式→X / Back 回归见 `docs/verification/app-001-fix-01-ime/`，待独立复验。

锁定使用 Argon2 + AES-GCM，密钥仅保留进程内存；正文从数据库明文记录清除，secure_delete + wal_checkpoint(TRUNCATE) 减少旧正文遗留，标题仍作为元数据可见。当前含附件笔记不支持锁定。归档不依赖跨文件系统的假原子事务；附件引用以 SQLite 提交为准，暂存日志承担中断恢复。
