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

## implementation decisions

生产扩展负责空格输入事务和整跨度失效清理，纯投影模块负责 JSON 文档中的合法跨度与授权目录。输入与提交共用一个事务；组合期间不改跨度，实际 compositionend 后只在同一仍存活、可写 Editor 上检查，禁止计时器猜测。link/code 的用户格式优先，由 schema 排他规则和整跨度清理共同去掉旧标签。筛选共用已有 SearchEditorHost 停车逻辑，包括无搜索文字的标签条件；标签选择不持久化。访问 prepare 同步按排除目标后的合法目录降级选择，不保留待 abort 恢复的名称。

## execution candidate01

已实现 mark/整跨度编辑清理、真实授权乐观文档标签投影、侧栏和搜索过滤停车、UI/Rust 标签与锁定互斥、保存与完整归档入口严格校验。证据在 `docs/verification/app-003-tags-01/source-candidate01/`，产品源码哈希及命令结果见其 README/source-sha256.json。依赖未改，无平台构建。

当前为 SOURCE-CANDIDATE、pending-review，不能称 SOURCE-READY：自查发现真实 IME 在既有 tag 内改字的中间状态可能仍经既有 onUpdate 发送非法跨度到 Rust，短暂制造保存错误；受控浏览器仅验证组合期间不提交新标签、实际 compositionend 后再提交。独审须精确复现并决定阻断；不能用最终清理后能重试成功代替中间合法性。本提交按 root 指示先冻结，不擅自改全局保存队列/flush/授权或跳过所有 composing 保存。

## blocking repair scope

Scope follows root docs ac79f42/e2fc5cc and frozen independent review static-01. Only trusted Editor onUpdate and same Editor local OCR/attachment transaction snapshots use the outgoing legal copy. Keep raw target.document, bookmarks/version/owner/access, general equality, queues and strict Rust validation. OCR insertedDocument/pending/ACK share the persisted representation. Attachment target.trustedDocument matches the corresponding local outgoing representation after insertion; initial captures keep the original backend/pending body. Clear tag/search conditions only after createNote succeeds; failed creation keeps its original state.

## execution candidate02

按冻结独审的两项 P2 窄修 Editor 出站合法副本及新建成功后内容条件清除；OCR/附件的局部持久表示与 raw 目标身份分别对应，通用 equality/rebind/queue/access 与 Rust 产品保持原样。证据在 `docs/verification/app-003-tags-01/source-candidate02/`：真实 App/Editor 接既有精确 Rust Store binary 的 11 场景、schema96、access16、OCR37、附件提交23、取消8、最终 typecheck 与产品/脚本/报告 diff check 通过（原始日志的结尾空行保全）；早期 fixture 失败全部保留。旧候选 broader tests 未声称本轮重跑，未构建。

当前仍 SOURCE-CANDIDATE / pending-review，待独审新冻结 SHA；作者不自行将旧阻塞标成关闭或宣称 SOURCE-READY。单标签最后引用在 composition 中失效与既有空态停车的交叉行为已回报 root 并在证据限制中明确，未擅自扩展可写筛选例外。移动原生输入法、设备、冷启与原版像素仍 UNKNOWN。
