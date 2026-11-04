---
id: app-003-tags-01
scope: committed-document-tags-and-local-tag-browser
status: pending-review
depends-on: []
---

## objective

完成 F17 的第一个可独立验收子集：真实 Editor 中 `#UI对照` 后输入空格提交标签，经既有保存队列写入 Rust，侧栏从已授权文档显示标签并筛选，保存、撤销/重做、删除/恢复、锁定/解锁、重启及归档均保持一致。替换当前 `plainText.includes("#")` 的假标签筛选。此次不实现智能文件夹、标签重命名/多选、数学或笔记链接；这些仍属于父任务，不因本子项通过而关闭 F17 或 APP-003。

本项从 candidate04 后的主线冻结开始；录音/OCR产品源码已冻结，实机验证在主树独立进行，不与其修改 App/Editor。实现只在 root 提供的隔离分支进行。

## context

- `docs/INDEX.md`
- `docs/architecture.md` 中“已提交标签契约”
- `docs/ui/local-features.md` 中“标签”和“标签首批实现边界”
- `docs/research/local-feature-integration.md`
- `docs/plan/tasks/app-003-local-features.md`
- `docs/verification/README.md`

## path

- `src/editor-schema.ts`、`src/Editor.tsx`、必要的独立标签扩展/投影模块
- `src/App.tsx`、`src/types.ts`、已有样式文件
- `src-tauri/src/store/archive/document.rs`、`document-schema.json`、`document-cases.json`
- `src-tauri/src/store.rs` 中必要的真实保存/加密/归档集成验证；不放宽既有访问或保存约束
- 标签相关验证脚本、任务执行记录；保持 package/lockfile/Cargo 依赖字节不变

## implementation

1. 按架构契约实现 `noteTag` mark、文本中真实提交和无效编辑去标记，正文文字不变；共享生产 Editor factory 用于 schema 跨检。不得用样例标签、DOM class 或字符串扫描替代文档身份。
2. 实现纯文档标签投影，供侧栏、计数、搜索“含标签的备忘录”和单标签筛选共同使用。目录覆盖当前有权限的非最近删除笔记，并受访问 prepare/commit/abort 屏障约束；不新增明文持久索引。多窗、保存失败、未保存文档与最后引用删除必须明确更新。
3. 接入真实侧栏与导航，保持既有选择/保存/编辑器生命周期。切换普通文件夹或清除标签筛选恢复原有路径；不能把标签键存成 folder ID，不能将其作为实体笔记所属目录。新建仍进入既有可写物理目录。
4. Rust 对 mark 属性、所在文本和连续跨度做严格验证，旧文档/归档仍可读；导出/导入后的真实 Editor 可打开。按官方限制，有已提交标签不能加锁，锁定笔记即使已解锁也不转换为真实标签；保存/解密不接受锁定文档中的 noteTag。TS/Rust 纯文本投影应逐字相同。
5. 生产输入法路径不得抢占组合输入、选区或其他编辑器；提交与撤销为同一可解释的历史动作，不在只读状态或异步晚事件中写正文。实现若需要细化契约，先回报 root，不自行新增未说明的行为。

### 独审阻塞修复（2026-11-04）

首个源码候选 `96584b74d2356c361e897ed5ad275b15823c21a0` 在真实生产 App/Editor 接真实 Rust Store 的独立检查中，组合输入改动已有标签内部文字时发送了旧 name/新跨度，得到 `archive_invalid` 并显示真实保存错误。输入结束后成功不能关闭这个中间错误。按架构新增的 Editor 出站合法快照契约窄修：保全全部 preedit 文字和其他格式，在副本上移除非法 noteTag，保持活动输入法、Editor、历史、授权与保存队列。检查其他生产 Editor 快照与附件/OCR正文 ACK 的表示关系，外部非法文档继续由 Rust 拒绝。先冻结独审报告，再由开发修复并重新独审；当前不合入产品源码，不标 SOURCE-READY。

独审 [static-01](../reviews/app-003-tags-static-01.md) 另有 P2：搜索建议 `filter=tags` 下新建没有清除此筛选，新空白笔记被排除而旧结果仍可能成为当前目标，属于源码状态推导，首轮未界面复现。同批局部修复并以真实 App 验证新建后目标和首次文字归属；新建失败保全原状态。

candidate02 `a0989b354b539fc06d794f167cd97af615693d44` 独审另确证：同一真实 App/Editor 在单标签筛选内发生受控 DOM composition，出站投影成功保存，但失配后停车触发真实 blur，Editor 仍 composing 且后续实际键盘文字未进入正文。先按架构新增的局部活动组字保留边界窄修，保持结果投影真实、原目标/历史不变；真实结束后执行停车。必须覆盖单标签及所有标签、多个结果时不跳笔记、真实后续文字、结束后不可写、显式导航、普通无 composition 立即停车，以及 access prepare/abort 优先。受控 DOM composition 不能冒充原生中文输入法验收。不得为此放宽通用搜索停车、授权、保存/ACK 相等，或延迟保护屏障。冻结 candidate02 独审失败后再实施、冻结下一候选，交不同作者复验。

## verification

执行现有依赖下 typecheck、真实 Editor schema crosscheck，以及有意义的生产边界检查。至少覆盖：

- 真 Editor 输入与 plain paste `#UI对照` 后真实空格事务，形成 mark；普通 `#`、`a#b`、代码/URL、过长/无效名字不变。
- Undo/Redo、修改已提交标签内部/删除字符、带其他格式分片、光标在标签前后、组合输入、两 Editor 身份隔离；不丢正文/空格，不让旧目标写入新笔记。
- 真 App/Editor 的组合未结束时，实际保存到真实 Store 的快照合法且含全部当前文字，活动 Editor/DOM/选区与 composing 不被副本改写；后续输入、compositionend、Undo/Redo、正文 ACK 与重启一致。旧失败保留，不能只证明最终保存成功或只测纯投影函数。
- 实际 App 目录/单标签筛选，多个引用去重、删最后引用、最近删除/恢复、搜索叠加、无结果、清除/普通目录切换；失败状态不展示“已保存”。
- 真 Rust 临时 Store save/reopen、合法与恶意 mark 拒绝且旧 revision/正文不变、TS/Rust text 一致；有标签 lock 拒绝、已解锁锁定笔记保留普通 #text、普通文档 closeLocks/unlock 不变；正确密码解密伪造 tag 密文时拒绝且无钥匙/正文/revision/密文变化。访问删除屏障仍需证明仅源标签名清除。
- 完整归档导出、同 ID 重复导入、旧无标签归档与坏标签归档原子拒绝，使用现有 FIX-00 路径，不能只测试独立解析器。
- 节制使用已有构建缓存；不下载、不升级、不复制 target，不运行全量平台构建。任何会新增大量输出的 Rust/浏览器检查前确认可用空间 >=2 GiB，低于即停止并保留证据。

提交后交另一代理独立 review；代码与受控检查通过只记 SOURCE-READY。最终安装包 Mac/Android 操作、真实冷启、字体/间距/颜色与 iOS 手机标签页仍需独立实机/原版对比，不能本任务直接宣称像素一致。

## candidate03 执行记录（2026-11-04）

修复从 candidate02 `a0989b354b539fc06d794f167cd97af615693d44` 出发，按 root `4fc78b0ff7b58d77a1a28440c078814b3eec9729` 的活动组合输入保留契约实施。本项仍为 pending-review，未经新一轮独审，不标 SOURCE-READY。candidate02 独审报告和证据逐字保全，未覆盖失败。

生产新增 `TagComposition` 仅观察同一 Editor 的真实 DOM start/end 和 PM root/appended transaction，映射原选区作为最终候选范围；既见真实 end、实际 composing 已结束、后续真实事务已到达且该范围确有 end.data、raw 已到合法表示后，才释放临时保留。微任务仅等待真实 transaction 后的 onUpdate 保存入口，不推测结束，不手改 composing、不 flush DOM、不制造最终正文事务。原合法标签自然恢复匹配时取消不必要的覆盖；空 data 取消不被当成“整个文档应为空”。

App 仅在原本匹配、正在组字且仍有焦点/可写/授权的同一 Editor 经合法出站快照失去标签匹配时捕获临时目标；只覆盖当前显示目标，结果、计数、目录继续按真实合法投影。正常完成后恢复既有停车；显式导航、Editor 销毁、访问 prepare/清除优先撤销保留。既有 access freeze/cover/abort 的实现继续负责保护，abort 不恢复失配编辑器旧焦点。通用 saveDoc、queue、flush、授权、相等/重绑与 Rust 校验均保持原字节。

新增真实 App/Editor→既存精确 Rust Store CLI 的 11 场景通过，149 条实际 Store action：single/all 最后引用、final-before-end、end-before-final replacement、多步替换、空最终删除、非空原选区恢复后的空 data 取消、多个结果不跳转、无 composition 立即停车、显式选别笔记/清筛选、prepare 同步冻结与 abort 后无复活。ACK 前后 raw、PM/DOM 选区、同 DOM 身份保持；实际后续键盘文字归属原 ID，真实结果仍清空或只保留另一笔记；最终正文已被正常保存后才停车，旧目标不可写。

现有保存边界 11 场景、OCR 37、schema 96、access 16 与最终 typecheck 通过。OCR AST fixture 绑定同一新增 clearTagComposition 闭包和对应空 ref，未替换产品访问处理。前 5 轮检查器/夹具失败及原始日志全部保全，原因和终轮结果见 [candidate03 证据](../../verification/app-003-tags-01/source-candidate03/README.md)。没有编译 Rust、平台构建、依赖改动、外网下载或用户笔记数据。

这些是受控 DOM composition 与实际浏览器输入，Store CLI 为真实持久层但未经过 native IPC/Session。prepare/abort 仅改 transport，实际 App/gate 保护代码执行；它不是多窗口原生 Session 屏障验收。真实 macOS/Android/iOS 中文输入法、平台安装版、冷启和像素对照仍 UNKNOWN，由根任务实机与独审推进。
