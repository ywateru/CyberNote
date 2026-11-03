# F07 搜索唯一结果 / 零结果 / clear 源码候选 01

状态：源码候选；独立静态审查、统一构建、Mac 运行与手机 smoke 待执行。没有 GUI / build / 像素通过声明。

任务：`docs/plan/tasks/app-001-search-results-01.md`。基线 `a2dcde9`；独立 worktree `/private/tmp/apple-notes-search-zero-01`，branch `task/app-001-search-results`。原版证据：`docs/research/original-search-zero-result-01/`。

## 选择与宿主

原 folder / note 选择保留为真实状态；非空桌面搜索用临时 note 投影。唯一结果使用真实命中 id，零结果使用 null。多结果不添加首项自动选择，只保留仍在当前结果内的已有选择；过滤、字面 includes 匹配和排序算法逐字未改，不扩展引号/模糊语法。

```text
无查询          原 folder / 原 note ── 原 Editor 可见
唯一匹配        原 folder / 原 note ── 原 Editor 隐藏、inert、不可编辑
                              └──── 命中 Editor 可见，动作归其 note.id
零匹配          原 folder / 原 note ── 原 Editor 隐藏、inert、不可编辑
                              └──── 投影 null，正文空，无日期/动作目标
clear           原 folder / 原 note ── 原 Editor 原实例可见，不强制正文焦点
```

宿主使用原有 `note.id + sessionId + note epoch + externalVersion` key，正常搜索切换不重建原宿主，最多同时存在原选择与当前命中两个不同 id 的宿主，Set 去重避免同 note 双实例。只有真实存在、非删除且仍获授权的 note 才能建立 Editor。原目标已删除时不复活 Editor；锁定目标按原锁定界面处理；真实 session / note epoch / 外部正文变化继续通过原 key 销毁并重建。

`SearchEditorHost` 不修改 NoteEditor / schema / 文档。停放使用 `setEditable(false, false)`，不发 onUpdate；清空后恢复原可编辑状态并尊重 blocked note。访问屏障 abort 若已恢复同实例，宿主保留该恢复结果。所有已挂载实例的 docChanged 交易仍更新其 native documentVersion；活动实例的格式/纸张 bookmark 逻辑保持按当前 note 归属。真正授权失效会遍历并销毁对应原宿主/结果宿主，未把搜索视为授权撤销。

## 动作和保存

`current`、活动 `editor`、列表选择与 native context 全部使用相同的投影 id。零结果没有活动 Editor 或 selected note，native toolbar 的既有 `toolbarState` 因此禁用格式、清单、表格、附件、共享与 note-more；全局新建和搜索不跟随禁用。原 nativeSelection / nativeAssert 校验保留，scope 增加 query，旧查询对应的笔记动作不能跨查询直接继续。搜索转换关闭旧临时菜单/单篇查找状态。

NoteEditor 的 onUpdate 仍把创建该 Editor 的真实 note.id 传给原 saveDoc。saveDoc / pendingDocs / queue / flush / 窗口关闭保存屏障不跟随临时选择改写或释放；clear 不写空文档、不清 pending、不覆盖选中设置。搜索中用户点选结果只改临时选择；选择文件夹、新建、真实删除等已有动作继续拥有真实选择状态。访问 prepare 仍先 flush 所有真实 note 队列；隐藏原宿主在 prepare 前已不可编辑。

本次没有改附件/录音/纸张/权限候选、依赖、原生搜索控件或样式。移动端/独立 note 不启用这次桌面搜索投影；手机仍只有其原活动宿主，未据 Mac 原版证据重设计手机页面。

## 定向检查

- `pnpm typecheck`：通过。
- `node scripts/check-search-selection.mjs`：5 组通过。直接编译并执行生产 `search-selection`、`native-toolbar-state`、`editor-schema`；验证唯一→零→clear、临时选择只能指向结果、非桌面投影关闭时真实选择保持、零结果原生操作禁用且全局新建/搜索可用。
- 第 5 组使用安装的真实 Tiptap 与 ProseMirror history、生产 schema。创建正文并加入待保存编辑，再关闭可编辑性且关闭 update 事件；确认完整文档、同 EditorState 对象和 pending 引用保持；恢复后实际执行 Undo/Redo 并核完整 JSON。该组验证停放原语与生产选择函数，不模拟 React 生命周期，不构成实机撤销通过。
- `git diff --check`：通过。
- 与基线逐字比较：listed filter/sort、saveDoc、flush、createNote、fileSelected 块均相同；SHA 在同名 JSON。

仍待统一包运行：原 folder/完整正文→唯一真实命中→零结果 AX/图片、禁用动作与快捷路由、clear 原实例和一次实际 Undo/Redo、Rust 完整正文冷启、真实删除/锁定边界、一次有限手机导航 smoke、同条件零结果区域图片/叠图/差分。未运行 GUI、未构建、未声称材质/颜色/几何/全页面像素一致。
