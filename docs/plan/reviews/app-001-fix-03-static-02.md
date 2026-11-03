---
id: app-001-fix-03-static-02
task: app-001-fix-03
baseline: b5dcfa8
result: pending-save-static-p1-closed-limited-tests-pass-gui-not-run
date: 2026-11-03
---

# FIX03 保存基线与副本有限补审 02

**b5dcfa8 已在生产源码中切断补审01的P1覆盖路径，新增有限检查独立执行全部通过。** 这是静态调用链及有限测试结论，真实双窗A/B排队与focus hydrate仍not-run，整个FIX03尚未独立验收。本轮不操作仍由开发持有且锁定的Mac，也未重复旧候选的无关完整矩阵或安装APK。

## 保存基线

`src/App.tsx` hydrate先取pending，再调用`SaveRevisions.observe(id, revision, !!pending)`；生产类仅无pending时采纳外部revision。saveDoc执行及普通错误重试读取`expected`旧基线；失败catch虽仍让队列继续，但后续旧基线保存会继续得到真实conflict，不能借外部新revision成功覆盖。只有本窗口实际保存成功后`confirmed`推进同一链。因此自身成功串行保存仍能推进，外部hydrate不能替旧正文重基线。错误文案明确保留本窗口内容，普通重试不覆盖已保存版。

## recoverConflictCopy完整链

- App冻结目标编辑器、阻止新saveDoc、等待本note既有队列，取最新pending及conflict；锁定/含附件前置拒绝并保留内容。只在真实副本成功返回、随后可信loadWorkspace也成功后，才清原pending/failure并切新笔记。失败分支保留pending并恢复仍存活的编辑器。
- bridge固定action携带源noteId的实时noteEpoch，响应走read模式gate，不当成能跨失效的save/transition确认。
- Session.ordinary先校验process/global epoch、拒pending，recover分支再sensitive检查源noteEpoch、未删及实际授权；不能只凭前端按钮。
- Store重新检查来源未锁/无附件/未删，要求旧baseline，复用真实文档schema/应用属性验证；生成新ID后单条SQLite INSERT，源row不写入。没有把锁定正文解密降级为明文，也不重写附件归属；不支持的分支明确拒绝。

## 独立执行

证据 `docs/verification/qa-fix-03/run-b5dcfa8/`，输入9个变更文件运行前逐字节匹配冻结提交。

| 有限检查 | 结果/实际边界 |
| --- | --- |
| 生产gate与SaveRevisions脚本 | 16pass，含pending外部observe不推进、自身ACK推进、conflict后多次observe/重试仍旧基线、无pending采纳外部revision。类例不替代App真窗链 |
| 新增Rust conflict_copy过滤 | 4pass；合法copy不改源并冷重开保全；非法文档/非旧baseline拒绝；锁定含正确解锁仍拒绝、附件来源拒绝；SQLite authorizer真实拒绝notes INSERT时无新note/源不变；Session旧源epoch、旧global epoch、prepare及删除边界拒绝 |
| TypeScript检查 | pass；不代表真实窗口焦点或编辑器运行 |

## P3非阻塞：副本已保存后同步失败可重复另存

若真实副本INSERT已成功而后续loadWorkspace失败，App正确保留pending并提示“副本已经保存，但列表同步失败……先重试同步并核对新备忘录”。但原saveFailures仍为conflict，另存按钮仍可出现；再次点击会创建另一个副本。未造成原笔记覆盖或pending丢失，现文案也未谎称副本未保存；作为后续去重/已完成副本身份恢复事项记录，不扩大当前安全修复。

独立真窗Q1/Q7/Q8、A真实在途/B排队→他窗保存→focus→冲突/另存、Q2/Q3/Q4可观测请求时序及同源安装产物仍待交接。后续proof-only提前暂停点不自动升级上述not-run；以真实requestId/到达/释放记录及最终文档为准。
