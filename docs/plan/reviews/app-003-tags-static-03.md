# APP-003-TAGS candidate03 独立审查

结论：**BLOCKED**。冻结候选 `6ce6033d845d15f1b45e074da9171db0c5ffb488` 修复了 candidate02 的受控同步 composition 场景，但独立浏览器引擎输入复现了新的 P2：实际最终正文和标签清理均已完成，`view.composing=false`，结果列表为空，原不匹配 Editor 却仍可见、聚焦且可写，之后的普通键入继续持久保存到这篇旧笔记。

日期：2026-11-04。审查者：`/root/native_ui_research`，非产品作者。审查树 `/private/tmp/apple-notes-tags-review01`，精确 detached HEAD 同上述候选。权威局部边界为 root `4fc78b0ff7b58d77a1a28440c078814b3eec9729`。12 产品文件 aggregate `18bbd8e3edfc5a30bcc26e9fe509ee51b0ef8c738b3999fd6631320bfdade0ed`，开闭独立重算相同。产品、依赖和作者工作树均未修改。

## [P2 / blocking] 最终事务先于独立 end 监听，导致组合结束后的不匹配 Editor 继续可写

契约：`docs/architecture.md:82` 要求不显示可写的不匹配旧笔记；`:84` 只允许原目标活动组合延续，实际结束并完成最终事务后须恢复停车，组合结束后的不匹配笔记不可继续编辑。不是无限保留到新一次键入或导航。

代码：`src/tag-composition.ts:41–60` 在单独的 DOM end 监听设置 `finalText`，而只有后续 transaction 且 `finalText !== null` 才记录 `postEndTransaction=true`；`:70–80` 因缺这个标志拒绝完成。既有 `src/note-tag-extension.ts:92–99` 在 PM 的 compositionend 处理中排队真实清理事务。`src/App.tsx:613–639` 继续以该 observer 的 `pending` 保留旧显示目标。

检查挂载真实 App、NoteEditor、PM 扩展、saveEditorDoc/saveDoc、保存队列、乐观 workspace 与停车逻辑。测试 scaffold 复用已审阅作者的服务及 transport 准备；场景由审查者独立编写。只把 preview action/access transport 接到既有真实 Store CLI，没有替换产品保存、matcher、TagComposition、搜索 gate 或事务。后续只读 CDP `Runtime.queryObjects` 读取实际生产 TagComposition 对象；没有设置其字段、改 `view.composing`、强制 flush、伪造最终事务或重写产品源码。

最小复现：

1. 合成文档第一段 `#独审 A`，标签 `独审` 已提交；`#独` 为 bold、`审` 为 italic，另有 heading2 保全格式。单标签筛选 `#独审`，原匹配 Editor 焦点和 PM 选区 position3。
2. Chrome CDP `Input.imeSetComposition({text:"bian",selectionStart:4,selectionEnd:4})`，再 `Input.imeSetComposition({text:"变化",selectionStart:2,selectionEnd:2})`。真实结果立即为空、目录无旧标签；原活动目标保留，Store 真实保存当前合法文字。
3. CDP `Input.insertText({text:"最终"})` 提交。Chrome 引擎产生 start/update/beforeinput/input 的 `isTrusted=true` 事件；本版本的 end 为 `isTrusted=false`，data 为 `最终`。生产代码不按 isTrusted 分支。必须准确称作“浏览器引擎输入序列”；这不是 macOS/Android/iOS 系统输入法实测。
4. 等实际 Store save 完成、`view.composing=false`。raw 文档与 `editorSaveSnapshot(raw)` 完全相同，清理旧标签的真实 PM appended transaction 已执行。真实 Store 保存第一段 `#独最终审 A`；列表依旧为空，原 Editor 却 hidden=false、inert=false、editable=true、contentEditable=true、focused/hasFocus=true。
5. CDP 只读检查同一个生产 observer：`pending=true, cycle=1, from=3, to=5, finalText="最终", rangeText="最终", postEndTransaction=false`。本例范围匹配正确，实际卡点为 postEndTransaction。
6. 首轮按原契约等待停车 7 秒超时；独立终态复跑再次等待 1 秒仍未停车。随后真实浏览器普通键盘插入 `ENDED-ORDINARY`，`view.composing` 仍 false，旧不匹配 Editor 继续可写，Store 实际变为 `#独最终ENDED-ORDINARY审 A`。

没有把等待时长作为结束依据；结束已由实际事件、PM 状态、最终 raw 和真实存储确认。有限观察证明此时保留没有按约结束，并允许下一次普通输入。报告不声称经过任意长时间都不可恢复，或所有系统 IME 均受影响。

核心证据 `docs/verification/app-003-tags-independent-03/blocking-stale-target.json`；完整实际 actions/responses 在 `composition-run03-result.json`，共 19 条 Store action 记录。run02 的交易跟踪保留了候选替换、最终替换，以及 `composing=false` 时去掉整个旧 noteTag 的真实 appended transaction。与此同时生产 observer 的 postEndTransaction=false，结合唯一置位条件表明，该事务发生在 observer 的 end 监听设置 finalText 之前。此浏览器引擎事件分发中的微任务/监听顺序与同一 JS 调用栈内 `dispatchEvent` 的作者夹具不同；仅依赖“end 监听之后再有事务”会漏认已经发生的真实结束清理。之后普通输入会扩展映射范围，又不再等于旧 end.data，不能让该状态自然恢复为合约停车。

用户后果：筛选显示“0 个备忘录/无备忘录”，但正文仍保留可编辑的失配旧笔记，输入法结束后的普通文字会继续保存到它。没有声称跨笔记写错或持久数据损坏；确证的是超出局部组字例外的可写目标滞留。

建议交由原作者仅修事件/真实事务完成识别的窄边界，并重验该引擎序列及 end 前/后最终 input。不得用 timer、额外强制 transaction、伪造 end 或重新 focus 掩盖，也不应放宽通用 queue、equality、搜索停车和访问屏障。本审查没有自行修产品。

## candidate02 修复与本次执行边界

原 candidate02 的独立逻辑场景已在新候选重新执行：同步受控 DOM compositionstart 后插入“变”，Store ACK 前后 raw JSON、HTML、PM 与 DOM 选区完全相同；真实结果为空且目录无旧标签，原 Editor composing/焦点/可写/同 DOM 均保留。再通过浏览器插入“续”，正文及真实 Store 都包含“变续”；受控 compositionend 后正常停车，之后键盘不能写入原目标。这个原问题在该有限受控场景已关闭，不能用来忽略上述浏览器引擎事件顺序的新阻塞。

完整 src-tauri 相对首审 `96584b74d2356c361e897ed5ad275b15823c21a0` 没有 diff。复用精确既有 Store CLI `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-qa-fix-store`，5,606,144 bytes，SHA256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，开闭均核对；没有 Rust 编译，身份确认后立即释放共享 target。通用 queue/equality/access/attachment 及依赖开闭 hashes 不变。

按 root 要求，确认最小阻塞后停止其余宽矩阵。此次没有把作者的 11 场景、schema96、access16、OCR37 或 typecheck 的通过计作独审执行；也没有重新跑未受此次两文件修复影响的全矩阵。原02证据已保全，后续候选仍需其余导航/屏障和实际系统 IME 的适当独审，不能宣称本轮已全部覆盖。

## 失败及环境保全

- run01：原02复现通过；浏览器引擎最终提交后等停车 7 秒超时。这是产品阻塞观察，结果/对应脚本/执行输出均保留；后面的六场景没有执行。
- run02：重新捕获最终状态及真实事务，但检查器错误断言 CDP end 的 isTrusted 必须为 true，导致断言失败。实际为 false。完整失败与原脚本保留，不记产品 trusted-end 失败、不冒称原生输入法。
- run03：只读实际 observer 状态、限定等待、真实普通续字与 Store 结果，明确复现该阻塞。此检查中 `pass:true` 和通用 stdout 的“1 scenarios passed”意为**阻塞复现断言通过**，不代表产品通过。
- 初期 run01/run02 执行 JSON 是工具合并输出的人工转录，其 stdout 字段不代表已分开捕获 stdout/stderr；原转录保持，`tool-output-clarification.json` 保存准确说明及合并输出。

旧02的 untracked 报告和23证据（含 manifest，共24文件）在切换审查树前逐字对 main `75eae7d` 和 candidate03 核对一致，然后整体移动到 `/private/tmp/apple-notes-tags-review02-frozen-preserved-01`，没有删除或覆盖；候选内的已跟踪副本仍完整。每个浏览器/输出阶段 guard>=2GiB，收尾 free 5,045,977,088 bytes；自己的 node_modules 链接已核对目标后解除。无 GUI、ADB、设备、安装、原版 attach、平台包、下载、升级或 target 复制/清理。

当前 SOURCE-READY 不授予。候选保持 BLOCKED，root 与产品作者已收到最小复现。后续必须使用新精确冻结 SHA 重新独审，真实平台 IME、native IPC/Session 屏障、冷启和像素一致性继续 UNKNOWN。
