# FIX07 新建响应授权状态候选

本候选基于隔离 worktree `8b9d6af`，只修改 App 的 createNote 状态采纳和定向检查。实际失败先冻结于主任务证据 `docs/verification/app-001-fix-07/android-candidate01/`（e50c520）；该 Android 包是 e117f929…，没有本候选修复，不能追认。

## 已观察问题

实际新建笔记 → 选 Beta → 加粗 → X/Back → 更多/纸张取消 → 再打开/选择 grid-large。选择后 Editor/View/DOM 换实例、选区33..37变1..1，正文相同。一次有界调试复现补齐真正父级 React key 和实际 hydrate 实参：NoteEditor key不变；pending=false，生产比较器返回true，externalBefore=0，session相同；旧 ws.access.notes[newId]缺失、返回数据epoch=0。

createNote 原来只把已验收响应中的 note 加入 notes，却丢弃该响应的 access。首次 refresh 被 hydrate 的既有 undefined!==0 授权变化判定命中，clearSensitive 主动 destroy Editor。该链路依据实际实参和现有源码定位，完整原始前后态/日志见冻结证据；没有用事后 fiber 数据代替前态。

## 最小修改

createNote 将响应类型声明为 `Note & Pick<Workspace, "access">`，同次 setWs 采纳新 note 和 `n.access ?? prev.access`。原有 bridge 的 native action 必须先通过 accept/AccessGate，调用方才接触响应；native 缺失 access 会在 bridge 抛错，不能以 fallback 绕过。fallback 保留无授权快照的现有浏览器预览行为，本候选不改预览桥接协议。

没有修改 hydrate 的 session/epoch 检查、clearSensitive、比较器、纸张关闭/书签逻辑或保存/Store协议。缺失旧epoch仍按既有安全语义清理；真实session/epoch变化仍清理。新建动作响应与正常异步响应一样，过期/失效先由现有 AccessGate 拒绝，因此调用方不会插入该note或替换已更新workspace。没有以忽略字段、missing→0归一化或保编辑器豁免授权变化来通过检查。

## 定向验证与限度

`node scripts/check-document-identity.mjs` 26项通过：实际生产比较器、真实PM schema/state/history、从当前 App AST 抽取的 createNote/hydrate/key，以及实际 AccessGate 的响应拒绝行为。新增路径覆盖已验收新建响应 → 首次纸张hydrate不清理；旧授权条目缺失仍清理；等待响应期间新note/global epoch或process session变化，旧响应触发access_changed且不覆盖最新workspace。原有真实文档差异、授权变化、pending/unauthorized等检查继续通过。

`pnpm typecheck` 通过；`pnpm test:access` 16项通过。checks.json保留检查明细，source-inputs.json仅列有限输入，不冒充完整构建来源。临时只读 node_modules 链接验证后移除，未修改依赖、锁或PM补丁。

这些检查不挂载React、不调用真实native IPC，也不是新安装包验收。当前候选尚未构建APK；仍需主任务合入后同一实际源码冻结、构建、安装，并重跑原生grid-large失败点、完整正文/选区/键盘/Editor身份、授权/外部真实文档更新的有界检查及独立复验。原e117失败记录保留。
