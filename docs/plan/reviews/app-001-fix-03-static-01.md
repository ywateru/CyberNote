---
id: app-001-fix-03-static-01
task: app-001-fix-03
baseline: fe10c3a
result: p1-pending-save-revision-rebase-static
date: 2026-11-03
---

# FIX03 独立静态发现 01

**P1：可信外部 hydrate 会把旧基线待保存正文的版本号推进到另一窗的新版本，使后续队列保存可能绕过应有冲突并覆盖另一窗更改。** 这是冻结源码调用链的静态发现，尚未在真双窗运行复现；下述顺序是明确的复现条件，不冒充已执行时序。已立即通知 root 与实现者，暂不对旧候选重复安装整轮 Android。

已独立核对 fe10c3a 18 个候选文件与提交逐字节相同。关注源：`src/App.tsx:256` hydrate、`:378` saveDoc、`:1720`错误重试，`src-tauri/src/store.rs:302`真实保存版本检查。

1. W1 在文档基线 revision r 上真实编辑 A，save A 已构造携带 r 的请求而尚未执行完；继续真实输入 B，save B 挂在同笔记队列后方，pendingDocs 保留 B。
2. W2 保存 X，后端变为 r+1。W1 因真实窗口焦点恢复发 loadWorkspace，取得该可信文档。
3. hydrate 第270行无条件将 revisions map 置 r+1；第271、282–291行因有 pending 保留 W1 的旧基线正文 B。因此显示正文与保存基线已分离。
4. A 的真实后端保存以 r 得到 conflict。第425–428行 catch 只记录错误，没有使队列拒绝；对应 Promise 最终 resolved，B 的 then 继续。
5. B 直到第411行才从共享 map 读取 r+1。真实 Store 只比较当前行revision是否等于请求revision，因此接受 B 并保存为 r+2；X 被旧基线 B 覆盖。若 B 是最新 pending，成功还会清除 saveFailures。此分支无需点击错误重试。

错误栏“重试”也直接对 pendingDocs 调 saveDoc，在焦点 hydrate 推进 map 后可同样把旧正文当作新版本重试，但主要发现是无需用户作覆盖选择的队列分支。后端对真正携带旧revision的请求确实拒绝；风险在前端无依据地替待保存文档改写expected revision，不能把后端版本测试通过当此分支通过。

最小修复应把待保存正文/队列绑定到它实际编辑的基线；外部 hydrate 在 pending 期间不能静默推进该基线，冲突后须保留最新 pending 并阻止后续旧基线保存静默继续。若允许覆盖，须有明确冲突解决/用户选择契约，不能把普通重试等同于用户已选择覆盖他窗。须同时保持本窗连续成功保存可以有序推进revision，且保存确认不重建Editor/清Undo/跳选区。

修复后的有限真窗回归：用可观察requestId暂停A，正常键入排队B，W2保存X并明确确认，切W1取得可信hydrate，然后释放A；核对B不能覆盖X、pending B保留且错误可见。再按实现的明确恢复路径保存，确认正常连续键入及Q7/Q8仍成立。固定sleep或直接注入React状态不算复现。

独立执行的现有有限检查：Rust 25 pass/1既有subprocess helper ignored；真实编辑器schema 65例、响应gate 12例、表格转换与Undo均通过，日志在 `docs/verification/qa-fix-03/run-fe10c3a/`。这些测试没有覆盖上述App队列与focus hydrate组合，不抵销此发现；Mac GUI仍未交接，Q1/Q7/Q8及受控时序独立结果均not-run。
