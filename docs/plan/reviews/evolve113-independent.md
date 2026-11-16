# evolve-113 独立源码与组件验证

日期：2026-11-17。审查者未参与本轮实现；此前参与的是演进设计文档审查。

- 工作目录：`/Users/water/work/2026/Apple-Notes-Clone-evolve113`
- 被审提交：`6309967fc66ae2c368a56ceaa2d46d2bffde6d3b`
- 比较基线：`e609586e`
- 结论：**SOURCE_PASS / native-open**。本次没有发现阻止113源码模块交付或114基于它继续开发的 P1/P2 问题。
- 本次只新增本审查文件，不修改实现、任务、作者脚本或作者验证记录。

## 范围与判定

已读[113任务](../tasks/evolve-113-interaction.md)、[自适应交互规格](../../ui/adaptive-presentation.md)、[设计规则](../../ui/design-rules.md)、[编辑器会话契约](../../architecture/editor-session.md)、[主题与呈现边界](../../architecture/theme-presentation.md)及[作者验证记录](../../verification/evolve113-interaction.md)，核对目标提交相对基线的全部13个变更文件。

按用户在独审过程明确的 delivery stages，113本阶段验收源码与真实组件行为；准确APK、实体IME/Back、FORMAT102及手势竞争全部由116承担强制原生门槛。本报告不把缺少这些原生证据作为113源码交付阻塞，也不将其标记为通过。

| 分类 | 结果 |
| --- | --- |
| P1 blocking | 0 |
| P2 blocking | 0 |
| P1/P2 nonblocking代码发现 | 0；本次未确认需要提出修正的新增代码问题 |
| 原生交付状态 | native-open，116必须补验；不是最终产品或原版交互验收通过 |

## 源码与实际行为核对

下表行号均对应被审提交。源码位置可供后续开发定位，不意味着用静态阅读替代实际组件检查。

| 契约 | 代码位置 | 核对与结果 |
| --- | --- | --- |
| 移动五档实际字号 | `src/font-size.ts:18`；`src/App.tsx:4052,4065,4069`；`src/style.css:2257,3463,3573,3582`；`src/Preferences.tsx:158,166,170` | 真实设置select写入后，首页标题与正文computed字号逐档变化，预览正文与实际正文相同；界面huge、正文tiny的反向组合仍各自生效。没有只更新预览或把两个设置合并。 |
| 双列更多、单列侧滑 | `src/App.tsx:509,4438,4527,4629`；`src/style.css:3653` | 默认320px双列不生成侧滑栏；更多按钮≥44px且位于视口内。极大界面字号≤430px降单列，三个侧滑动作可命中；独立实际点击置顶验证更多和侧滑均修改正确noteId，不打开正文。430/431px边界与回双列清理符合实现。 |
| 长按与取消 | `src/App.tsx:562,2546,4480,4516,4537` | touchcancel、移动、导航清理计时器。补充验证长按后的兼容click不会进入正文；边缘touchcancel不会触发旧Back。注入touch序列仅证明组件处理。 |
| 窄窗栏宽 | `src/font-size.ts:29`；`src/App.tsx:508,4303,4646` | 用户偏好保持像素值，有效投影按当前空间clamp。700/900/1000/1100/1280px实测适配，1100px可键盘及pointer实际调宽；缩窄不回写偏好，放大恢复原宽，字号不乘大栏宽。 |
| 画廊键盘与返回焦点 | `src/App.tsx:552,4493,4499`；`src/navigation/use-navigation.ts:229` | Enter/Space调用既有chooseNote，返回焦点到仍连接、可见的原卡片；未改附件画廊控制器。来源焦点保存是DOM引用，不另起笔记/保存owner。 |
| resize键盘、pointer归属与取消 | `src/App.tsx:5204` | Tab可达、8/24px步进、Home/End及aria有效范围均通过。pointercancel/lostcapture恢复确认值；外来pointerId不能取消本次拖动；拖动中卸载也丢弃临时值。窗口收窄后取消仍保留原470px偏好。失败的键盘调宽正确回滚。 |
| view持久化失败保全 | `src/App.tsx:1201`；`src/confirmed-settings.ts:27` | 先持久写入并权威读回，再退出galleryEditor。等待和失败期间正文、同一Editor DOM、JSON、选区、焦点均保留，错误可见；失败不撤销等待期间发生的新导航。补充实际Undo/Redo证明失败及成功切换均保留可用历史。 |
| Android音频交互身份 | `src/platform/interaction.ts:9`；`src/Editor.tsx:301`；`src/App.tsx:4038` | 音频消费共享移动context，独立表面回退也用createMobileLayout。Android身份fixture在320/740/1024/500px保留移动控件与同一音频节点。作者对旧mobile-editor脚本的调整保留独立桌面UA下的展开覆盖，没有删除原桌面语义。 |
| 旋转与IME推断 | `src/editor-session/controller.ts:206`；`src/editor-session/use-editor-session.ts:14` | 宽度变化重置历史高度和旧keyboardHeight；可用的未缩放visualViewport参与推断。800高竖屏→360高横屏不误判440px键盘，adjustResize和visualViewport出现/隐藏输入通过。没有原生insets时，同宽缩窗与IME仍不可完全区分，作者已明确限制，116需验证。 |

独立复跑的关键数值：移动卡片标题tiny→huge为15.4286 / 16.7143 / 18 / 20.5714 / 23.1429px，实际正文与正文预览为12 / 14 / 16 / 18 / 20px。默认侧栏/集合/正文宽度：1100px为272/390/438，900px为272/308/320，700px为220/280/200；与作者记录一致。

## 实际命令与结果

环境：Node `v22.16.0`，使用现有依赖。浏览器由既有`openRuntime`创建隔离headless实例，FakeBackend位于临时目录；未提供Rust transport或用户资料库路径。运行后执行cleanup，不启动已安装产品应用，不连接手机或真实IME。

| 命令 | 实际结果 |
| --- | --- |
| `git rev-parse HEAD` | 审查与最终写报告前均为目标提交`6309967fc66ae2c368a56ceaa2d46d2bffde6d3b` |
| `git diff --stat e609586e 6309967f` | 13文件，532行新增、140行删除；全部差异已检查 |
| `npm run typecheck` | exit 0，`tsc --noEmit`通过 |
| `npm run test:evolve113-interaction` | exit 0，90项通过；两套runtime均无未捕获浏览器错误 |
| `node --input-type=module`，独立拖动生命周期探针 | exit 0，4项通过，无浏览器错误 |
| `node --input-type=module`，独立失败/导航/动作与尺寸边界探针 | exit 0，10项通过，无浏览器错误 |
| `node --input-type=module`，真实Undo/Redo与长按兼容click探针 | exit 0，6项通过，无浏览器错误 |
| `git diff --check e609586e 6309967fc66ae2c368a56ceaa2d46d2bffde6d3b` | exit 0，无输出 |
| 一次性Python审查文档链接检查 | 6个相对链接均存在，无缺失 |
| `git diff --check`、`git diff --cached --check` | exit 0，无输出；暂存区仅本审查文件 |

独立探针均通过stdin执行，使用`./scripts/debug/runtime.mjs`的`openRuntime/api/idle/state`及真实DOM事件，未新增或修改测试脚本。20项补充检查的具体场景如下，区别于作者90项的常规路径：

1. 外来pointerId的pointercancel不能终止当前拖动。
2. 拖动中隐藏侧栏使handle卸载，重新显示时临时宽度被丢弃且未保存。
3. 拖动中窗口收窄，aria当前值仍在有效边界内。
4. 收窄后取消，保留被clamp隐藏的470px用户偏好。
5. 注入settings失败后，键盘调宽回滚已确认宽度。
6. 成功切换view保留确切Editor DOM、JSON和选区。
7. 延迟并拒绝view写入，等待期间切到note-b，失败后仍停留note-b正文。
8. 该桌面runtime无未捕获浏览器错误。
9. 点击Fixture B的更多→置顶，真实菜单修改B且页面仍为集合。
10. 430px、huge界面字号为单列。
11. 431px、huge界面字号恢复双列且不存在侧滑栏。
12. 单列侧滑后实际tap置顶，修改目标笔记且不进入正文。
13. 界面huge、正文tiny：日期15.4286px，真实正文12px，互不串用。
14. 该移动runtime无未捕获浏览器错误。
15. view写失败后，真实Undo恢复编辑前JSON。
16. 同一失败后Redo恢复刚才编辑的JSON。
17. view写成功后，真实Undo仍恢复编辑前JSON。
18. 同一成功后Redo仍恢复刚才编辑的JSON。
19. 长按打开菜单，页面仍为集合。
20. 长按后再向原卡片派发兼容click，页面仍为集合，不误打开正文。

探针准备过程中两次有意注入settings失败，初稿分别在`idle`或`api`返回预期的`Controlled settings failure`时因未捕获而提前退出；调整的仅是stdin探针以`assert.rejects`明确捕获预期错误，随后上述三组最终探针全部exit 0。这不是产品修复或忽略非预期错误，也没有改动作者脚本。

作者脚本生成的可再生证据仍位于被忽略的`artifacts/evolve113-interaction/`，本次未把生成物加入提交。最终文档链接与`git diff --check`另在提交前检查；提交仅包含本审查文件。

## native-open：116强制承接

浏览器使用真实React/App/ProseMirror与保存队列，但IPC、持久存储、Android身份、键盘输入和touch序列有fixture/注入边界；不能据此推认Rust事务、实际AppKit或Android WebView/输入法已经通过。

116必须以准确源码和同源APK/应用包标识分别补齐：实体IME出现/隐藏与横屏/分屏、系统Back、音频播放/录音owner及选区保持、FORMAT102“格式打开→长按正文”、边缘返回与正文选字/表格横滚/速绘缩放竞争。失败必须保留并处理，不能用本次SOURCE_PASS替代。

本次没有构建/安装APK，没有启动用户应用，没有操作手机或用户原库。未发现组件层blocking，故不触发“发现阻塞立即通知主agent”的反馈分支；最终结论为113 **SOURCE_PASS**，最终原生交付继续 **native-open**。
