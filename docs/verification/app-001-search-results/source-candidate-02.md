# F07 源码修订 02：停放写门槛与授权变化后的目标归属

状态：源码修订，待独立复审。基线候选 `c072a93887f0786cbc2fc2853b1f3b1556ceac5e`；不覆盖 candidate-01 或独立审查证据。本轮没有 GUI / 应用构建 / 像素通过声明。

独立审查确认原候选有两处 blocker：停放 Editor 只冻结一次，既有 access abort、冲突副本 finally 或纸张恢复会异步把旧实例重新设为可编辑；另外，停放 A 的真实授权变化会无条件清 query，使活动 B 回到 A，却可能保留 B 的绘画/录音面板并使用最新 A 目标。原 5 组检查不能排除这两个真实生产组合，原候选不应据其检查结果合入。

## 最小修订

`SearchEditorGate` 是生产可编辑门槛，按真实 Editor 弱引用记录停放时的期望 editable。host 的 park / activate 与现有四处 restore（冲突副本 finally、access abort、closePaper、note 切换的 paper 恢复）统一经过门槛。停放目标的 late restore 只更新期望状态，同步保持不可编辑；不依赖未来 render 才重新冻结。activate 在真实 blocked note 上继续冻结。移除结果宿主时 layout cleanup 先 park，再允许原宿主激活，避免脱离 DOM 但尚未被原 NoteEditor 被动清理的结果实例继续可写。只在实际值需要变化时调用 `setEditable(..., false)`，不发正文 onUpdate；原 Editor 生命周期/授权检查仍由既有调用点负责，没有改写 Editor 全局方法。

```text
prepare / 冲突冻结 A=false
  → 搜索 B：gate.park(A)，A=false，B=true
  → late restore(A,true)：只记 A 期望 true，A 仍 false，B=true
  → clear：B layout cleanup park=false
           A activate(blocked=true) 仍 false
           A activate(blocked=false) 恢复 true
```

授权变化只命中停放 A、当前 B 仍有效时，生产 `shouldClearSearchAfterAccessChange` 保留 query / B 投影，不再无必要地 B→A。真正命中可见 B（或原无结果 / 非桌面投影）仍走原清 query 协议；命中当前 B 的分支仍同步关闭其 note-specific overlay / targets。因此两条路径都不会把 B 面板留到 A 上。

所有已捕获的 `nativeAttachmentTarget` 在 clearSensitive 后保留脱敏拒绝上下文（editor / bookmark = null），而不是变成 null。系统 picker 晚返回或录音完成不会把该已失效意图误认作普通入口，再 fallback 到新的 current.id。仅对新增的 desktopSearch 模式，现有普通文件/照片/相机/扫描/录音入口也捕获同款上下文，以便既有首次及 await 后 `nativeAssert` 拒绝旧 scope / Editor / stamp；非搜索和手机的普通入口未增加新校验流程。没有加入持久附件 operation、补偿或修改录音实现，系统面板 focus 的旧代次问题仍由独立附件任务处理。

## 检查与限制

- `pnpm typecheck`：通过。
- `node scripts/check-search-selection.mjs`：7 组通过。第 5 组已改为执行生产 SearchEditorGate 与真实 Tiptap / ProseMirror 完整正文、同状态对象及 Undo / Redo；第 6 组穿过生产授权变化选择规则，确认停放 A 变化不会把有效 B 投影清回 A；第 7 组执行真实 Editor 的 prepare→park→late restore、blocked activation 与 explicit false，确认停放原目标不能被 access / conflict / paper 恢复为第二个 writer。
- `git diff --check`：通过。
- 没有更改原过滤/排序、NoteEditor、schema、saveDoc、flush、权限 policy、附件存储或依赖。

检查执行真实生产门槛和选择函数及安装的 Tiptap / ProseMirror 状态，不是 mounted React / 原生窗口实测。overlay 与系统 picker 的拒绝链仍需要独立静态复核，并在统一包通过有限真实链路验证；本报告不把迟到面板、原生焦点或实机 Undo 标为已通过。原版零结果像素证据范围也没有扩大。
