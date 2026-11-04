# APP-003-TAGS-01 source candidate03

状态：**SOURCE-CANDIDATE / pending-review，未经本轮独审，尚非 SOURCE-READY**。日期 2026-11-04。作者隔离树 `/private/tmp/apple-notes-tags-01`，基线 candidate02 `a0989b354b539fc06d794f167cd97af615693d44`，活动组合输入保留契约来自 root `4fc78b0ff7b58d77a1a28440c078814b3eec9729`。本轮不合入主线、不构建、不运行安装版、不作像素验收声明。

candidate02 [独审 BLOCKED 报告](../../../plan/reviews/app-003-tags-static-02.md) SHA256 `728cd3946d43590b437833e3aa8e9e21fdc6a3acb88e69e213e2a740c46d84fa` 保全。[独审目录](../../app-003-tags-independent-02/README.md) 与原 reviewer tree 全部 23 文件（含 manifest，636,024 bytes）逐文件字节相同。旧失败未重写为通过。

## 产品窄修改

- `src/tag-composition.ts` 观察每个原 Editor 的真实 DOM compositionstart/end 和真实 PM root/appended transactions，映射原组合选区。不改 DOM、正文、选区、历史、view.composing，不 flush DOM、不用定时器、不派发伪结束或最终正文事务。
- `src/App.tsx` 仅在原匹配笔记由自己的合法 Editor 出站快照失去标签匹配时捕获原活动目标，验证同 Editor、同 composition cycle、原 scope、当前授权、可写与真实焦点。临时覆盖仅用于显示目标；真实结果、计数和标签目录照常立即投影，多个结果不在组字中跳到其他笔记。
- 完成条件同时要求：实际 end 已观察；PM composing 已结束；post-end 真实事务已到达；映射范围的真实文字与 end.data 一致；真实 raw 文档已达到合法持久表示。观察微任务仅等待该 transaction 对应 onUpdate/save 入口执行，不推测 native 输入结束。如果最终输入晚于 end，原目标等待该实际文字到达。完成后通过原 saveDoc（仅必要时补入最终合法快照）再恢复既有停车。
- 原标签自然恢复匹配时即取消无必要的覆盖；空 data 的取消不要求整个文档为空。显式选别笔记、文件夹/标签导航、筛选/scope 改变、目标销毁和访问 prepare/清除可先撤销保留。访问屏障原有的同步 freeze、cover、清除和 abort 实现继续负责保护，不等待输入结束；abort 不让失配编辑器重新获得焦点。

相较 candidate02，生产仅 `App.tsx` 和新增 `tag-composition.ts` 改动。原 `SearchEditorHost`/`SearchEditorGate`、projectSearchNote、通用 saveDoc/save intent/queue/flush、AccessGate/bridge、documentsEqual、rebindAttachmentTarget、Rust validator/Store 和依赖字节不变。其余 candidate02 标签、合法快照、新建修复保留。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `check-tags-composition-retention.mjs` | 11 场景通过，149 条真实 Store action |
| 既有 `check-tags-save-boundary.mjs` | 11 场景通过，53 条真实 Store action |
| `check-ocr-host.mjs` | 37 生产边界场景通过 |
| `check-editor-schema.mjs` | 96 document cases，真实 Editor schema/manifest 相同 |
| `check-access-boundary.mjs` | 16 场景通过 |
| 最终 `pnpm typecheck` | pass |

新增检查挂载真实生产 App、NoteEditor、PM extension、onUpdate、saveEditorDoc/saveDoc、乐观 workspace、保存队列、错误 UI 和停车生命周期。只把 preview action transport 接到精确既有真实 Rust Store executable；访问事件只替换 transport，实际调用生产 accessGate.invalidate 和 App handler。正文通过真实浏览器 keyboard.insertText/Backspace 进入原 Editor；受控 DOM start/end，不手改 composing、不调用 observer flush、不制造最终事务。Editor selection 命令仅设置实际测试输入选区。

复用 executable SHA256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，5,606,144 bytes，准确路径和 harness 来源在 `source-sha256.json`。Store 内只有本轮隔离的合成数据。浏览器与每个新场景前均检查空间 >=2 GiB，复用已有 Vite cache，无截图/视频、无依赖下载或 target 复制。

新增 11 场景：

1. 单标签最后引用：保存合法副本后真实结果为空、目录无旧标签，原 DOM/Editor 可写聚焦且 composing，后续 `续` 真正写到原 ID。ACK 前后 raw JSON、PM selection、DOM selection 相同。最终候选先进入，再 end；保存最终正文后正常停车，旧目标不能继续写。
2. 所有标签：同上述最后引用行为，结果保持真实为空，完成后停车。
3. end 先于最终替换：end.data 为 `终`，真实正文仍为 `变续` 时保持原目标；实际浏览器替换为 `终` 后才释放，最终 Store 正确，旧目标不可写。
4. 多步骤候选：`变`→`中间`→`完成`，真实替换映射后 end，保存完整最终正文并停车。
5. 空最终删除：原非空选区被 preedit 替换，end.data 空，随后真实 Backspace 删除候选；最终 `# A` 保存并停车。
6. 空 data 取消恢复：原非空内部选区 `独`→`变`→`独`，原合法标签自然匹配恢复；end.data 空不误清正文。后续普通非 composition 修改失配仍立即停车，无过期保留。
7. 多个匹配：原笔记失配后列表仅另一条 Other，但组字保留原目标且后续实际文字只写原 ID；完成后既有投影显示另一条，旧目标不可写。
8. 无 composition 的普通修改：立即执行既有停车，无额外例外。
9. 显式选 Other：立即停车旧目标；晚到 end 不改原 Store，不影响新 Editor。隐藏编辑器的 PM 可继续报告 composing，这是已停车目标内部状态，检查不伪造其结束。
10. 清除标签筛选：scope 离开保留；原笔记在普通目录自然可写，正常 end 后保留该合法可见性。
11. prepare/abort：prepare 调用内同步 setEditable(false)，随即真实 cover；期间实际键盘不能写入。abort 解除 cover 后，原失配编辑器仍 hidden/inert/noneditable 且无焦点；晚到 end 不复活。

既有 11 场景重新证明无筛选组合输入、合法副本、非法 raw Store 拒绝、Undo/Redo、三个新建入口失败与成功后的首次输入目标、OCR/附件 raw 与持久表示的本地 ACK/重绑没有回归。OCR fixture 仅增加真实 clearTagComposition 闭包及其空 ref，使既有访问处理继续可执行；没有给产品访问分支换实现。依赖与未改文件 hashes 记录在 manifest。

## 保全的检查失败

保留 `composition-run01` 至 `composition-run05` 的 result、原始 stdout；run01–04 同时保全当时检查器源码，run05 与 run04 同源码。产品代码没有为了这些失败放宽条件。

- run01：前五场景通过，取消恢复检查把跨 text node 的正文当作 JSON 中连续字串，等不到。run02 改成真实文档递归文本检查。
- run02：取消 fixture 选择到标签末端，真实输入按非 inclusive mark 语义丢失插入部分标签身份，恢复相同文字并不等于恢复合法标签。检查错误地期望一条结果。run03 改为内部原非空选区替换/恢复，真实标签恢复后通过。
- run03：前八场景通过，显式导航已安全停车，但 helper 错要求隐藏编辑器的晚到 compositionend 必须使 PM composing=false，因而超时。run04 改查旧目标不可写、无复活、正文不变，不触碰 PM 内部状态。
- run04：前八场景通过，导航后新 Editor 对 Store 原 seed 的 mark 顺序做 schema 正常排列，检查器把未打开的 seed JSON 顺序当作 Editor 输出直接比较。run05 是一次检查器修改断言失败后误重跑的同源码/同失败，记录保留。run06 的期望通过真实 schema.nodeFromJSON 读取；原 Store 字节不变另有严格检查，产品 documentsEqual 未改。
- run06：11 场景全部通过，无 pageerror。新增两个 ACK 前后原 JSON/PM/DOM 选区一致性检查也通过。

`raw` 原始 typecheck stdout 结尾保留空行，冻结独审证据也按原字节保全；不为 whitespace check 改写原始记录。最终差异检查排除这些保全材料。

## 验收限制与复验

**原生中文输入法、macOS/Android/iOS 安装版、native IPC/Session、多窗口真实屏障、冷启和原版像素对照均未在此验证。** 受控 DOM composition 不能作为原生键盘验收。空 data 或平台范围信号不充分时允许安全保留原输入，显式导航与访问保护仍立即优先；新一轮独审应关注范围映射和实际终态顺序。没有 SOURCE-READY 或完全一致声明。

保持原依赖，在空间 >=2 GiB 下使用新输出目录运行：

```sh
NOTES_TAG_STORE_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-qa-fix-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-tags-composition-retention.mjs artifacts/tags-composition/new-review-run
```

12 产品文件聚合：`18bbd8e3edfc5a30bcc26e9fe509ee51b0ef8c738b3999fd6631320bfdade0ed`，算法与逐文件/脚本/证据 hashes 见 `source-sha256.json`。冻结后停止编辑，由不同作者独审。
