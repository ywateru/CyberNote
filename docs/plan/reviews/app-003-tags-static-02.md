# APP-003-TAGS candidate02 独立审查

结论：**BLOCKED**。冻结候选 `a0989b354b539fc06d794f167cd97af615693d44` 修复了原先非法 preedit 出站保存和筛选中新建目标问题，但独立复现了新的 P2：单标签最后引用在活动 composition 中失效时，真实 App 立即隐藏、停用并 blur 原 Editor，后续浏览器输入没有进入原正文。需要 root 先细化该交叉契约，再由开发修正；本审查没有修改产品或 matcher。

日期：2026-11-04；审查者 `/root/native_ui_research`。审查树 `/private/tmp/apple-notes-tags-review01`。11 产品文件聚合 `392aa3228b93cc3a06441bc4f874417f7ed019e5af9b73eaabb3bed98c426937` 开场、收尾均独立复算相同。完整 `src-tauri` 相对 candidate01 没有 diff；复用首轮独审 CLI，SHA256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，5,606,144 B。未进行 Rust／平台编译；target 使用权在身份核对后即释放。

## [P2 / blocking] 最后匹配标签在 composition 中失效，触发即时停车与真实 blur

契约：`docs/architecture.md:72` 要求合法副本不得干预活动 Editor、DOM、选区和 composition；`:82` 同时要求最后匹配引用失效时结果为空、停车原 Editor，不能伪造匹配结果。两条在当前实现的组合输入交叉情形发生冲突。

代码：`src/Editor.tsx:313` 合法保存快照；`src/App.tsx:538` 过滤合法标签目录、`:749` 乐观正文；`src/App.tsx:337–338` 真实 SearchEditorHost 停车并 blur；`src/search-editor-gate.ts:11–14` 将 Editor 设为不可写。

独立场景使用真实 App、NoteEditor、扩展、出站副本、saveDoc、registerSaveIntent、队列、乐观状态及界面。唯一 transport 改动是把浏览器 preview action 发送给隔离的真实 Store.action CLI；没有替换 onUpdate、saveDoc、matcher 或 SearchEditorHost。

| 阶段 | 实际观察 |
| --- | --- |
| 单标签 `#独审` 开始匹配 | Editor focused=true、editable=true、hidden=false、composing=false |
| 控制 compositionstart，浏览器插入“变” | 原 raw 标签临时失效；合法副本保全 `#独变审`、bold/italic 和 heading，真实 Store 成功保存、该标签已不在合法目录 |
| App 乐观结果重算后 | 同一 Editor 仍存活，composing=true，但 hidden=true、inert=true、contentEditable=false、editable=false、focused/hasFocus=false；捕获浏览器 `isTrusted=true` 的 blur，blur 发生时 composing=true |
| 再通过浏览器插入“续” | 文字没有进入原 Editor，也没有进入 Store；Store 保留前一步成功保存的 `#独变审` |
| 隐藏期间受控 compositionend | DOM 监听收到了事件，但观察时 view.composing 仍 true；首轮等待其结束 7 秒也未完成，原失败保留 |
| 清除筛选 | 恢复同一存活实例可写、可见，仍没有焦点，view.composing 尚为 true；测试随后仅为释放合成夹具，再向已恢复 Editor 发出受控 end |

主要证据 `composition-last-reference.json`；完整真实 Store 请求／响应见 `boundary-run02-failure.json` 第一场景。此处不把普通用户输入的既存内容称作丢失：首步完整文字已成功保存；可确证的是产品自身停车导致活动输入目标失焦、隐藏并不可写，随后受控浏览器输入无法继续进入该目标。

证据限制：compositionstart/end 是受控、非可信 DOM 事件，浏览器插入和 blur 来自实际 Chrome；没有宣称已验证真实 macOS/Android/iOS 输入法候选提交，也不能仅据此断言平台永久 stuck。可信 blur 与 editability/visibility 的联动足以证明当前生产 App 违反活动输入保全要求。原生设备细节仍 UNKNOWN。

建议 root 明确极窄生命周期优先级后再修复：仅本次原匹配 Editor、同笔记和同授权的活动 composition 因标签合法投影丢失匹配时，讨论延迟停车到自然 end；列表／目录仍按合法数据呈现空结果，不把不匹配笔记加入结果。真实导航、目标变化和访问 prepare 必须有明确终止规则；不得恢复旧焦点、绕授权或用计时器推测组合结束。此为待落定的契约方向，本报告未实现该例外。

## 原两项 P2 修正与其他边界

- 普通未筛选 composition：真实 Store 接收合法副本及全部当前文字，保留其他格式和合法 `#Keep`。ACK 前后 raw JSON、DOM HTML、PM 与 DOM 选区相同；同 Editor、composing/focus/editability 保持。后续“续”、实际受控 end、Undo、Redo 与重新读取 Store 一致，App 没有旧 `archive_invalid` 可见错误。直接将该 raw 非法文档发给 Store 仍严格拒绝，原 revision/body 保持不变。原非法出站问题的局部修正有效，但整体交互受上项新阻塞影响。
- 单标签、所有标签、移动“含标签的备忘录”三个真实入口：控制 create transport 拒绝时，笔记数量、原正文、现有 Editor 存活和筛选 UI 保持；成功后筛选清除，首次 `FIRST-INDEPENDENT-*` 文字只进入后端返回的新 ID。移动场景另加无标签笔记作对照，失败前后搜索结果均排除它。原新建目标 P2 在这些有限场景关闭。
- OCR / 附件：重用冻结作者脚本已审阅的 AST 抽取夹具骨架，只运行生产 OCR insert、attachment insert、validatePickerTarget、真实 NoteEditor 与 OcrHost 一场，并独立增加真实 Store `conflict` 拒绝 → 原 insertedDocument 保留 → 第二次保存成功 → 按实际 Store 文档 ACK/cleanup。raw 与持久文档确实不同，持久 copy 冒充 raw Editor 身份仍被 rebindAttachmentTarget 拒绝；OCR 原 trusted body 在 ACK 前不被提前替换，附件 raw/持久两种表示与附件引用保持。OCR 原生识别、权限和 cleanup 平台端口是合成；附件只验证本地插入／身份表示，未把虚构附件提交到实际 Store 或声称原生文件端到端验证。
- 静态检查确认通用 saveDoc、documentsEqual、原目标 owner/version/bookmark/access 检查和 Rust 严格 validator 未被放宽；出站修复只在可信 live Editor／本地事务出口使用。

## 独立执行结果与失败保全

本轮独立执行 `pnpm typecheck` exit0、生产 Editor schema 96 document cases 通过、AccessGate 16 边界通过。没有把作者其他通过计数并入本轮。

自写 App/Store 夹具的 run01 因错误假设“停用 Editor 收到受控 end 后会退出 composing”超时；结果与原脚本保留。run02 记录了完整停车风险，并完成未筛选组合、单标签新建、所有标签新建断言，之后因移动页不存在 `.tag-browser` 的夹具假设等待失败。此失败不记作移动产品失败，也不把整次 run02 标成通过；已完成场景以保留结果内的断言和原始状态为依据。run03 只补跑移动建议入口，改用实际 UI 标题／结果行与无标签对照，exit0。OCR targeted replay exit0，真实 Store 两次 ACK 尝试分别为 conflict / 成功。

所有原始失败、对应脚本版本、stdout/stderr 以及成功补跑均保存在 `docs/verification/app-003-tags-independent-02/`，没有覆盖首轮 01 证据。自己的临时 node_modules symlink 已验证目标后解除，实际依赖未改，pnpm/Cargo lock 对 candidate01 相同。开场 free 4,474,249,216 B，每个新浏览器／输出阶段均 guard≥2 GiB，收尾 free 4,257,443,840 B。无 GUI、ADB、设备、安装、原版 attach、平台构建或像素验收。

SOURCE-READY 未授予；候选保持 BLOCKED。后续需新冻结 SHA 对窄生命周期修正重做交叉场景，不能把本轮局部通过外推为原生 IME 或 UI 像素通过。
