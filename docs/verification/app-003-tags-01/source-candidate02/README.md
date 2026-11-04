# APP-003-TAGS-01 source candidate02

状态：**SOURCE-CANDIDATE / pending-review**，尚非 SOURCE-READY。日期 2026-11-04。修复基线 `96584b74d2356c361e897ed5ad275b15823c21a0`，契约和冻结独审报告来自 root `e2fc5cc`；作者隔离树 `/private/tmp/apple-notes-tags-01`。原 candidate01、独审 BLOCKED 报告和原始失败证据完整保留。本轮没有平台构建、设备操作或像素验收。

## 窄修改

1. `editorSaveSnapshot` 仅克隆可信 live Editor／其本地事务的 JSON，复用完整 tag span 判断；只从副本移除非法完整跨度的 `noteTag`，保全全部文字、其他 marks、节点属性及合法标签。NoteEditor.onUpdate 继续走既有真实保存链路，活动 Editor/DOM/composition/selection/history 不被副本修改。外部文档、IPC、导入及密文不经过此修复，Rust 严格 validator 不变。
2. OCR 的本地预期事务、dispatch 后对应正文、insertedDocument、pending retry 和 ACK 使用同一合法持久表示；随后仍运行完整原目标重绑。target.document、editorDocument 仍为 raw Editor JSON；初始 trustedDocument 继续保持原 backend/pending 身份，不能提前假定 ACK。附件本地插入后的 trustedDocument 使用对应出站副本，raw document 身份保持。
3. createNote 成功后同时清除 tagFilter 和 filter，再显示真实返回的新 note ID；失败前不清条件。三个入口分别验证失败保原状态和成功后首次文字归属。

没有改变通用 saveDoc、save intent／队列／flush、访问控制、documentsEqual、rebindAttachmentTarget 或 Rust 校验／导入／解密。依赖字节保持不变。没有增加解锁笔记的标签权限。

## 本轮验证

| 检查 | 结果与边界 |
| --- | --- |
| `pnpm typecheck` | pass，最终日志保全 |
| `check-editor-schema.mjs` | 96 document cases，真实 Editor schema/manifest 一致 |
| `check-access-boundary.mjs` | 16 production boundary cases pass |
| `check-tags-save-boundary.mjs` | 11 scenarios pass，53 条实际 Store action 记录 |
| `check-ocr-host.mjs` | 37 cases pass，生产 AST 闭包/OcrHost/bridge/queue/PM，受控平台 I/O |
| `check-attachment-submission.mjs` | 23 cases pass，受控平台 I/O |
| `check-attachment-cancellation.mjs` | 8 cases pass，生产抽取闭包／bookmark／boundary |
| `git diff --check`（排除保全 raw） | pass；原始 typecheck 日志的结尾空行按原字节保留 |

本轮浏览器脚本挂载真实生产 App/NoteEditor，保留 onUpdate、saveDoc、registerSaveIntent、queue、乐观状态和错误界面，只将浏览器 preview transport 接到隔离的真实 Store.action CLI；源码从当前树经 Vite 加载。精确复用独审者既有 executable（SHA256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，5,606,144 bytes），未编译。其源可在独审证据 `harness-main.rs` 审阅；Rust 产品文件与修复基线相同。

覆盖活动 composition 在已有分片标签内部输入 `变` 和后续 `更` 时，真实 Store 接收完整当前文字及合法 copy，其他 bold/italic、heading attrs、合法 #Keep 均保持；ACK 后 raw JSON/DOM/selection/composing/同 Editor 身份仍保持。compositionend、Undo/Redo、重新读 Store 一致。另直接发送非法 raw preedit 给 Store，仍被拒绝且旧 revision/body 不变。

单标签、所有标签、移动搜索建议“含标签的备忘录”分别触发实际新建：控制 create transport 失败时既有条件/编辑器/正文保持；成功后条件清除，`FIRST-*` 首次输入确实只进入返回的新 ID，原笔记未改。

最后一场从生产 App AST 抽取精确 OCR insert、附件 insert 和 validatePickerTarget，接真实 NoteEditor/OcrHost/rebindAttachmentTarget。夹具强制 raw 与合法持久表示不同，验证 OCR body 等于实际 onUpdate body、原 trusted body 在 ACK 前保持、own-pending 重试仍完整重绑、将持久 copy 冒充 raw identity 继续拒绝、ACK/cleanup 完成；附件对应 raw/persisted 身份与 attachment 引用保持。

旧候选的 27 项浏览器和 40 项 Store/Session 测试不是本轮重跑结果。Rust 无修改，主浏览器已对精确既有 Store executable 运行必要保存边界检查；未为了重跑统计而编译。脚本在浏览器启动前检查可用磁盘 >=2 GiB，复用本树已有 Vite cache，不录截图/视频；本轮最终证据约 0.5 MiB。

## 失败记录与夹具修正

完整 staged diff 的 whitespace check 会指出原始 typecheck 日志末尾空行；该日志按原字节保全。排除 raw 后的产品、脚本与报告 diff check 通过。此项不改写原始日志。

- `raw/tags-repair-run01.txt`、`boundary-run01-failure.json`：前 10 场景通过；最后 OCR 本地 fixture 将 React ref 错传为 WeakMap，实际 callback 读取 `.current.get` 时失败。仅修 test env 的 nativeDocumentVersions/nativeEditorOwners/externalVersions 引用形状，run02 全部通过。原文件未覆盖。
- `raw/tags-repair-ocr-host.txt`：旧 OCR AST fixture 未绑定新增 editorSaveSnapshot，首次 confirm 未 dispatch。上轮多脚本批次的最后 exit 0 曾掩盖此单项失败；本轮逐项检查日志后纠正，未将它记作通过。
- `raw/tags-repair-ocr-host-run02.txt`：补 snapshot 后，暴露 candidate01 标签访问闭包所需 setTagFilter 缺失。
- `raw/tags-repair-ocr-host-run03.txt`：继续暴露 filter 状态缺失。最终 fixture 一并绑定真实 tagSelectionAfterAccess、filter/tagFilter/setTagFilter，run04 的原 37 项通过；未改变产品以迁就测试。

## 复查限制与待关注

这是 headless Chrome 的受控 DOM composition 和真实文本插入，未证明真实 macOS/Android/iOS 键盘或 native IPC/Session transport。OCR 平台端口合成；没有原生识别、相机、设备、安装版冷启或原版像素检查。无 SOURCE-READY 或 UI 像素一致声明。

独审可关注：若在单标签筛选下组合编辑其最后一个引用，该合法 copy 会使该标签不再匹配，既有 SearchEditorHost 的最后引用空态停车可能 blur 当前 Editor。当前契约同时要求最后引用消失时清空结果并停车；本轮没有擅自加入“仍可写不匹配笔记”例外，也没有验证该交叉交互的原生行为。根任务需要明确并独立决定其验收范围。

## 重复执行

使用既有同锁依赖，author 本树 node_modules 仅临时 symlink，不提交。禁止下载、升级、平台构建或复制 target。先独立确认可用磁盘 >=2 GiB；脚本另有相同 guard。输出到新目录以保留原失败。

```sh
NOTES_TAG_STORE_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-qa-fix-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-tags-save-boundary.mjs artifacts/tags-repair/review-new-run
node scripts/check-ocr-host.mjs
```

产品 11 文件每文件 SHA、聚合、精确 binary 来源、测试计数和保全 raw hashes 见 `source-sha256.json`。聚合 `392aa3228b93cc3a06441bc4f874417f7ed019e5af9b73eaabb3bed98c426937`。没有用户笔记正文，只有合成测试数据。
