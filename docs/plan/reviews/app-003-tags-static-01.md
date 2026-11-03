# APP-003-TAGS-01 独立审查

结论：**BLOCKED**。冻结候选 `96584b74d2356c361e897ed5ad275b15823c21a0` 的真实 App → Rust Store 保存边界独立复现一项 P2；另有一项可由源代码直接推导的 P2 筛选新建问题，未运行界面复现。不得据此宣称原生输入法、设备或像素验收通过。

审查者：`/root/native_ui_research`。日期：2026-11-04。基线 `369637be8c0f5b7ed2bd29aa6973b7b19b488e02`。十个产品文件聚合为 `52382343c616f41791fcb57aeb79a1eecde466797ddf2a6dc631afc91a9eb6f7`，与作者及本轮开场记录相符；收尾重算仍一致，产品未修改。

## [P2] 活动 composition 编辑既有标签时发送不合法文档，真实 App 显示保存错误

位置：`src/Editor.tsx:310–312`、`src/note-tag-extension.ts:103–109`、`src/App.tsx:736` 起的 `saveDoc`。

`appendTransaction` 在 `editor.view.composing` 为 true 时有意不改活动编辑文档，但 `NoteEditor.onUpdate` 仍无条件把 `e.getJSON()` 发送给真实 `saveDoc`。当用户在已有标签内部输入时，文本已经改变，旧 `noteTag.name` 仍在；这个短暂状态不是可提交的合法标签文档。

独立复现保留生产 App、NoteEditor、标签扩展、saveDoc、save intent、保存队列、乐观更新与错误界面，只把浏览器预览中的 saveNote transport 接到隔离的真实生产 Rust Store：

1. Rust Store 建立合法 `#UI对照 `，标签名 `UI对照`，revision 为 1。
2. 在真实 Editor 的位置 4（`I` 与 `对` 之间）设置光标；触发受控 DOM `compositionstart` 并确认 `view.composing === true`。
3. 通过浏览器文本输入插入 `变`。真实 onUpdate 在 composing 为 true 时发送 `#UI变对照`，其 mark.name 仍是 `UI对照`。
4. 真实 Rust validator 返回 `archive_invalid` / `标签完整跨度与名称不符`；生产 App 在 composition 仍活动时显示该错误。
5. 确认 Store 原 revision 1 与原文档保持不变，拒绝具有原子性；compositionend 后扩展移除标签并有后续保存成功，界面错误仍保留。

这是可信保存边界的可见失败，不是后端接受不合法文档或已发生数据丢失的证据。证据：`ime-repro.json`、`invalid-preedit-document.json`、`ime-repro-run02.json` 和完整可审阅复现源 `ime-repro.mjs`。测试 exit 0。Rust 小 harness 离线构建 exit 0。

证据限制：受控 DOM composition 与 Chrome 文本插入验证生产状态／保存链路，**没有验证真实 macOS、Android 或 iOS 输入法键盘**。transport 使用临时 Store.action，而非原生 IPC/Session；没有原版程序 attach、设备、平台构建或 GUI 验收。

建议局部修正：从可信 live Editor 导出独立持久快照时，仅剥除不合法完整 noteTag 跨度的标签身份，保留全部文本、其他 marks、活动 Editor 文档／选区／composition 状态。继续保存 composition 文本，不全局暂停其保存；不改后端严格 validator，不重建 Editor 或队列，不把任意外部／导入非法文档自动合法化。新冻结候选需要重新验证活动输入法状态、文本与其他 marks 保持、真实 App 无错误、Store 接收合法投影及后续结束保存。

## [P2] “含标签的备忘录”筛选中新建后，空白新笔记被过滤而旧笔记仍可能成为当前编辑目标

位置：`src/App.tsx:1261–1269`；关联 `src/App.tsx:537–538`、`557–576`、`3419–3424` 和 `src/search-selection.ts:9–12`。

移动端搜索建议将 `filter` 设置为 `tags`。新建成功后 createNote 清理 tagFilter、query 与 searching，并把 baseNoteId 设置为新笔记，但没有清理 `filter`。`desktopSearch` 在 filter===tags 时即使移动端、空 query 仍为 true；listed 排除没有标签的新笔记。若原来只有一个匹配的标签笔记，projectSearchNote 会直接返回该旧笔记；若没有匹配结果则返回 null。新建操作因此建立了空笔记，却不能把它作为当前可见编辑目标，后续输入可能仍面向旧结果。

这是确定的源代码状态推导，本轮没有追加浏览器或设备复现，也没有证据表明用户已误写或丢失数据。建议新建成功后清除此内容筛选，或以等价的局部状态转换确保新建后的可见可写目标就是返回的新笔记。物理 folderId 的选择逻辑无需扩展成标签目录。

## 窄保存投影的生产出口边界

仅修改 onUpdate 可阻断本轮普通自动保存复现，但需要评估这些实际快照路径，避免合法持久表示与 raw Editor 身份混用：

- `App.tsx:2263` 在 OCR dispatch 前取 `transaction.doc.toJSON()`，`2269` 与 dispatch 后 `instance.getJSON()` 严格相等才登记 `insertedDocument`；`2236–2238` 又把该 insertedDocument 直接送 saveDoc，OcrHost 以它与 ACK 文档相等确认保存。该持久表示应与 onUpdate 的合法快照一致；重试的 `1572–1574` 比较也需对应相同表示，而不是绕过原目标证明。
- 附件插入经正常 onUpdate 保存，awaitAttachmentDocumentAck 重试 pending 文档。但 `1697–1698` 将 raw Editor 文档同时赋给 target.document 和 trustedDocument；引入投影后需保持两种表示各自对应，避免持久 ACK 与 raw 文档不等导致合法操作失败。
- `1984` 捕获 target.document、`1594–1595` 的 editorDocument，以及 attachment-target.ts:62 对原编辑器文档的比较属于 raw 身份约束，应保留。trustedDocument 应继续与其原始可信存储／pending 表示比较。不要全局弱化 documentsEqual、rebindAttachmentTarget、note/version/owner/bookmark/access 检查。

上述为修正边界评估，不是本轮额外运行的 OCR／附件失败复现。

## 已执行与未执行

已独立完成：冻结 SHA／十文件 SHA256 复算、完整产品变更静态检查、真实 App + Rust Store 的 IME 保存失败复现、Store 原文档／revision 原子拒绝核对、pnpm-lock.yaml 与 Cargo.lock 对基线相等、收尾身份复查。自己的 node_modules 临时 symlink 已验证目标后解除，原依赖目录未改。

作者提供的 schema／browser／Rust 通过计数不记作本轮独立通过。原拟追加的 typecheck/schema/access/diff 批次在磁盘 guard 处停止，**任何检查命令均未启动**；没有继续 Rust／浏览器测试。开场 free 2,766,708,736 B；收尾记录 free 1,626,492,928 B，低于约定 2 GiB。无清理、下载、升级、平台构建或源码修补。

本轮 target 已释放，无继续编译计划。证据目录原始约 48 KiB，Rust harness + 两个临时 Store 约 108 KiB，Vite 测试缓存约 11,428 KiB。06:11 小 harness binary 5,606,144 B，本次 incremental 22,082,694 B；deps 匹配文件含硬链接与 binary，不可简单相加当物理增量。未记录 target 前置全目录快照，不能精确归因整个磁盘下降。未清理任何 target 或测试缓存。

证据目录：`docs/verification/app-003-tags-independent-01/`。查看该目录 manifest.json 获取每份证据与本报告 SHA256；manifest 自身不纳入自身聚合。
