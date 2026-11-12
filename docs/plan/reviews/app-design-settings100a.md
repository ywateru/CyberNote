# DESIGN100A 独立审查

2026-11-09，审查人 `/root/design100a_verify`，非开发作者。范围 `c06d08e127f132dcf02a602154cf2f9ae02f92a5..b0f64d90cf213e28402126e747c8d6aab023c104`，工作树 `/private/tmp/cybernote-interface-settings`。

## 结论

**pass（100A源码/配置基础范围）：F1由4a49a633修正，经下述独立复审关闭。** 初轮blocked记录保留在下方；本次不关闭DESIGN100全局控件接线、App并发/失败回滚或FINAL101原生门槛。

## F1 独立复审

审查差异 `5e4a8522..4a49a633f3527e6934d9118c2e51c2e9fb4ba056`。开发修复让当前attempt保留最新的非候选外部完整值，成功与失败回执结算均更新confirmed和preview；失败提示仍显示。与候选相同的乐观echo不抹掉已观察的外部更新。没有改动Rust、扩大授权或重写App。

- 原始独立两例未改变断言，重跑均显示外部111，关闭初轮ACK显示101/reject显示100的直接复现。
- 独立扩展probe现含7项生命周期结果：109→111→候选101 echo后ACK/reject仍保持111；随后修改菜单间距产生的完整patch保留111。只有候选echo时ACK确认101，reject回退100且保留错误；reject后新外部对象即使内容与先前失败候选相同仍被采纳，错误清除。控件与示例图标尺寸一致。全部通过；36个parser负例、平台独立倍率和冻结返回值仍通过。
- 独立复跑作者order探针：109→111两条receipt，22.2px示例和后续完整patch均通过，`errors:[]`。
- 独立复跑原真实Preferences/Chrome+Rust Store15项仍全部通过，含三宽度实际SQLite写入拒绝、同内容外部持久恢复、重置/重载。Rust产品无变更，未重复已通过的综合Store编译测试。`git diff --check`通过。

复现工具 `scripts/check-interface-details100a-review.mjs`，结构化结果见相邻 `app-design-settings100a-result.json` 和 `artifacts/design100a-independent/lifecycle.json`。顺序日志 `/private/tmp/cybernote-design100a-independent-f1-{lifecycle,order,browser,expanded-retry}.log`。扩展probe首轮在echo-only分支仅等待数值101，误把上一次已存在101当作新props已经commit；其原日志`-expanded.log`保留。探针已改为等待新对象身份实际render后才结算receipt，顺序重跑通过；这项仪器修正未修改生产组件。

此测试将已render的父props作为外部确认边界。App全局如何标记/排序跨来源权威与乐观状态、避免迟到旧失败覆盖新成功，仍按100任务验收，不由本地组件的内容/身份观察取代。未nativebuild、ADB、用户库操作或全局控件外观推认。

## F1 — 等待保存时的新外部值被永久丢弃

`src/PreferencesInterfaceDetails.tsx:53` 的busy分支遇到外部值时直接return，仅观察与本次候选相同的值；effect依赖只有value。随后onSettings成功在107行确认旧候选，失败在111行恢复更旧的confirmed，均不会重新处理外部最新value。

独立探针使用真实生产React组件和受控延迟settings回执，未模拟或更改组件内部：初始100，键盘ArrowRight提交101，promise未决时父props真实render新完整配置111，再分别resolve/reject原请求。两次结果为：

| 原请求回执 | 当前外部props | 最终slider | 预期 |
| --- | --- | --- | --- |
| 成功 | 111 | 101 | 采纳111 |
| 失败 | 111 | 100 | 保留错误反馈并采纳111 |

props之后不再变化时，控件/示例一直过时；用户再修改另一细节会从旧confirmed合成完整对象，覆盖外部更新。需要在本地保存结算时归并等待期间的新外部配置，保留对本次乐观props失败的屏蔽，不能将失败候选误当外部确认。无需在此阶段重写App全局并发策略。

复现：`node scripts/check-interface-details100a-review.mjs`。当前exit1，两项`ok:false`，原始结果 `artifacts/design100a-independent/lifecycle.json`；日志 `/private/tmp/cybernote-design100a-independent-lifecycle.log`。该probe控制父props及回执，不声称持久化/原生证据。

## 已独立通过的检查

- 复跑 `node scripts/check-interface-details100a.mjs`：15项通过，实际Preferences/Chrome + 真实Rust Store；1200/320/390、SQLite触发器失败、乐观props不覆盖ACK、后续相同内容外部实际保存恢复、重置/重载、极值及菜单几何。日志 `/private/tmp/cybernote-design100a-independent-browser.log`。
- 复跑 `CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 node scripts/check-interface-details-store100a.mjs`：生产Store/archive新增综合test通过，180无关test过滤。17类非法完整对象live patch/归档均原子拒绝；不声称全Rust回归。日志 `/private/tmp/cybernote-design100a-independent-store.log`。
- 独立parser36个缺字段/字段null/布尔/数组/对象/undefined负例全部拒绝；desktop130与mobile101分别映射36.4px/44.44px，返回冻结对象。
- 静态核对实际持久SQL前validator、归档校验、默认旧字段、平台独立保存和reset-only-details；查看320极值截图无横向裁切。
- `git diff --check`通过。未修改产品源码；未native build、ADB或用户库操作。

## 范围保持

100A只交付配置、设置页与示例映射。全局控件消费、共享层级、App全局失败回滚/跨来源排序属于DESIGN100；Mac/Android原生布局及AppKit实际支持属于FINAL101。上述通过项不将这些开放范围计完成。
