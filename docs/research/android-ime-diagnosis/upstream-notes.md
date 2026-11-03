# Android IME 闲置兜底：有限上游核查

读取日期：2026-11-03。范围限于锁定的 `prosemirror-view@1.42.9`、ProseMirror 官方作者论坛及一个官方仓库提交；不操作 GUI/设备、不修改产品/依赖、不制作补丁。本文补充 [analysis.md](./analysis.md)，不替代真实运行取证。

**结论：作者曾明确说明闲置后结束 composition 的动机是避免其他状态更新无限等待，但本次没有取到现行 5000ms 常量的原始引入提交。官方存在与“带格式内容、Android 预测输入、约 5 秒停留、重复”接近的用户报告；该帖没有作者确认或修复证据。唯一对照的历史修复已经包含于 1.42.9，不能作为升级解法。当前 Trime 真实 35 秒 P1 仍缺实际调用栈，根因 unknown。**

## 锁定输入与闲置语义

本地读取根为 `node_modules/.pnpm/prosemirror-view@1.42.9/node_modules/prosemirror-view/`。

| 文件 | SHA-256 |
| --- | --- |
| `src/input.ts` | `1b7a931828812b6fcd7904e340bb59ba144dadf5dcafc86f576dc79d16842b1e` |
| `src/domobserver.ts` | `614dcb685c2c70d4a40e8ae2993104f4ad0c1a14d13242347a123c7ec25d39a0` |

`src/input.ts:524–525` 注释为“Drop active composition after 5 seconds of inactivity on Android”，Android 延迟 5000ms，其他平台为 -1。`:527–562` 的 compositionstart/update 共用处理器每次重排 timer；`:585–587` 先清旧 timer 再调用 `endComposition(view)`。因此阈值是**最后一次相关事件后闲置 5 秒**，不是整次输入开始后的 5 秒。`:618–626` 仍有 Android `flushingSoon` 早退以及 forceFlush、clearComposition、必要时同步选择或更新 view 的分支，不能仅凭墙钟停留时间证明具体分支已执行。

## 已取到的作者说明及其边界

2017-06-26，作者在 [Composing: Collisions](https://discuss.prosemirror.net/t/composing-collisions/450/7) 中回应：composition 期间其他状态更新不能无限等待，并提出在 composition 没有更新一段时间后自动结束它的超时作为解法。该页是**设计讨论**，没有附当前实现的引入提交，未指定 Android 5000ms 数值。因此它证明历史动机，不能证明现行常量由该帖直接落地，也不能据此声称该 timer 专为某个“compositionend 丢失”的特定浏览器缺陷而引入。

2019-10-02，作者在 [Composition overhaul](https://discuss.prosemirror.net/t/composition-overhaul/1923) 说明旧处理会在 composition 时延迟状态更新，并在某些行为下强制中断；原因包括 DOM 被重绘后浏览器停止组字。新方案允许更新文档，同时尽量保留正在组字的 DOM 节点；选区更新等仍可中断组字。这是维护者对历史架构及风险边界的说明，**不是当前 Trime 事件链的运行证据**。

## compositionend 缺失与重复报告

| 官方来源 | 本次取得的内容 | 可确认与 unknown |
| --- | --- | --- |
| [Compositionend not fire when prosemirror-view upgrade to 1.33.3 and above](https://discuss.prosemirror.net/t/compositionend-not-fire-when-prosemirror-view-upgrade-to-1-33-3-and-above/6446)，2024-06-03 至 06-10 | 用户提供 Android/WebView 录屏与复现步骤，正文可含格式，升级后观察不到 compositionend；作者 06-10 指向下节提交，用户后续报告该个案已正常 | 证明存在版本/节点更新相关的特定缺失个案。没有覆盖所有 Android 输入法、WebView 版本或长停留情况的保证；也不是 5000ms 机制最初动机的证明。 |
| [Input error when IME prediction is turned on](https://discuss.prosemirror.net/t/input-error-when-ime-prediction-is-turned-on/6515)，2024-07-02 | 全页仅一条用户帖：Android 搜狗预测开启，先输入带 mark 的文本，再输入非 mark 文本，停 5 秒后继续出现重复；关闭预测后正常，帖中称 iOS 正常 | 与当前症状相近，但没有作者回复、修复链接或确认的调用路径。搜狗预测与本项目 Trime inline composing/WebView91 不同。是否同根因、是否有后续修复均 **unknown**，不得将这条相似报告提升为因果证据。 |

本次读取了这些官方页面完整返回的帖子正文；6515 返回正文只有首帖，不能补写不存在于返回内容中的作者解释。

## 唯一具体上游变更对照

官方提交 [e8bcd75d305b42052c4bd17653374d670b6f17d3](https://github.com/ProseMirror/prosemirror-view/commit/e8bcd75d305b42052c4bd17653374d670b6f17d3)，Marijn Haverbeke，2024-06-10，标题 `Try to pick the right text node as composition node`。提交说明：选区位置两侧有不同文本节点时，选择最近变化的那个；changelog 明确指 Android 在两个节点之间找错组字节点。官方页面此次返回 3 个文件、+11/-2 行，本次仅对照这一提交。

| 该提交的变化 | 当前锁定 1.42.9 |
| --- | --- |
| DOMObserver 增加 `lastChangedTextNode`，跟踪新增文本及 characterData mutation | `src/domobserver.ts:46,273,297` 已有相应字段和赋值 |
| `findCompositionNode` 在 textBefore/textAfter 不同时，优先返回最近变化的相邻文本节点 | `src/input.ts:603–605` 已包含 |
| 目的为减少更新时破坏实际组字节点 | 是历史节点选择修复；该提交没有删除/重定时 Android 闲置兜底 |

因此该已纳入修复不能作为“当前缺少上游修复、升级即可解决”的依据。锁定包的 repository 元数据已指向 `code.haverbeke.berlin`；本次没有核验那里的完整最新历史，亦未把 GitHub 页面显示的分支/标签当作当前最新版结论。

## 对 FIX04 的实际含义

有限检索未找到并确认一个专门覆盖本项目真实 Trime 长候选停留双写的上游修复；这表示**未核实**，不表示上游绝不存在修复。现有证据也未证明缺少真实 compositionend 本身就是完整根因。

继续开发前最有区分力的证据仍是同一真实周期中：最后 compositionupdate 的时间，最后事件 +5000ms 附近 `endComposition/clearComposition` 的实际入口和调用栈，组字文本节点身份、DOM/PM 选区，以及候选提交前后节点是否被替换。需区分 timer、storedMarks、其他结束路径和 App 重建；保留原生输入法操作，不合成提交事件。相似官方帖可帮助选择观察点，不能替代这条时间线，也不支持直接取消超时或盲升依赖。

本次未更改产品、依赖及其他研究文件，未运行测试或设备验收，未提交 commit。
