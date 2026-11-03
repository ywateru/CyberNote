---
id: app-001-fix-06
scope: android-composition-focus-and-navigation-boundaries
status: pending
depends-on: [app-001-fix-04]
---

## objective

收束FIX04真实候选版仍失败的组字失焦/后台边界。FIX04先冻结空段长停留主路径，允许独立验证该有限修复；本任务未通过前，手机中文输入整体仍阻塞，不能将拆分任务理解为降低原需求。

2026-11-03开发实测candidate01（源码f3071f3，APK d5c6f59b…）中，真实格式入口导致程序化DOM blur，随后观察到`isTrusted=false`的compositionend，data为`ni hao‸`，PM清理后预编辑仍残留在正文。只能确认事件与动作时序；Tiptap blur实现中的DOM blur/removeAllRanges不证明它构造了该事件，真实候选操作也观察到isTrusted=false，不能仅据此分类。实际切后台/恢复也留下本轮预编辑，授权同步后Editor14换为Editor32；该事实不证明同步是残留的唯一原因。旧0aac同条件空paragraph约0.555秒后打开格式，也保留`ni hao‸`；paper脚本在两包的取消路径均保持31..35，失败实际发生于第二次打开后选择大网格纸返回，选区才变为1..1（脚本第285行）。证明这两个有限失败在旧包已存在，不证明全部blur/后台同因，完整证据见FIX04冻结selfcheck。

1. 正常候选提交仍以真实输入法结果替换对应组字段，格式入口、系统失焦、后台、返回与切笔记不留下临时拼音/光标符号，不重复候选、不删相邻已确认文本。
2. 先记录各边界原生输入法实际commit/cancel、DOM事件、事务、焦点与文档时序，再选最小实现。若无真实候选，不猜测汉字；不能按字符串删除`‸`、删光标前固定字符、清整篇或用假compositionend得到通过。需要暂存/回退预编辑时须明确真实起止范围、映射事务、原有选区内容与已确认正文保全，先写契约再实施。
3. 保存/授权屏障与跨笔记隔离继续有效。真实授权变化可销毁旧Editor，但旧组字段不得插入新笔记；不能绕过FIX03遮挡/同步以保住Editor身份。单纯自身保存ACK不能重建正在组字的正文DOM。
4. 不回退FIX04空段长停留、快速/中部输入，也不回退格式书签、Undo/Redo与纸张页取消恢复选区。candidate01与原0aac均在选择大网格纸后预期31..35而实际1..1；取消路径均通过。保留此准确触发，不宣称补丁独有回归，也不能忽略失败。

## context

- docs/requirements.md F03/F04/F14、docs/architecture.md输入/保存/授权与面板书签契约
- docs/plan/tasks/app-001-fix-04.md及其冻结源码/APK/安装身份
- docs/verification/app-001-fix-04/（baseline-34223af、candidate01真实事件、format-paper-candidate01与最终对照；具体索引以冻结selfcheck为准）
- docs/plan/reviews/app-001-android-ime-01.md、FIX04后续独立报告
- docs/ui/interaction-matrix.md、docs/ui/android.md

## path

限Android输入适配、src/Editor.tsx及确有时序证据直接相关的src/App.tsx焦点/面板/导航边界、受控PM补丁与锁输入、必要契约与验证记录。不改存储/授权协议，不混入媒体/扫描/全页外观。先完成FIX04源码冻结和设备独立复验，再串行实现。原失败证据与包不覆盖。

## verification

同设备/Trime版本/Composing text模式、真实按键和候选触摸，空段与已有正文中部各覆盖实际格式入口、系统Back、后台恢复、切笔记。分别记录输入法候选、原始事件isTrusted/data、Editor/View/DOM/node身份、文档JSON和保存确认；最终无断点安装包复验。对取消场景先明确原生实际语义，逐字核相邻已确认内容，无候选猜测。

验证已提交的中文加后续英文、真实删除取消、选区格式/Undo/Redo、纸张取消/选择/Back后选区与键盘状态、强停冷启完整正文。未知因果继续unknown，已观察失败继续blocking。结束恢复原系统输入设置；模拟器不冒充实体手机。
