# 50 独立录音窗：有限原生边界只读补审

对象固定为其他作者源码 `9141dff1941c433f3c916d60d84110867afc9ee9`。审查者只通过 `git show <commit>:<path>` 读取 `src-tauri/src/lib.rs`、`src-tauri/src/recording_window.rs` 及该提交4个capability；另读取最终52 `f5bc101614dcc2c144f962b41620e70d4f8657b1` 的插件label校验及录音capability作兼容性比较。未读取作者工作树中的可变产品内容，未改产品，未运行构建、测试、GUI或真实权限。本记录是不同作者之间的静态补审，不能替代verify_app负责的总独审和受控检查。

## 阻塞：已失去子窗的会话没有后续安全ACK清除路径

严重性P1，静态状态推导，尚未自行运行复现。位置均指固定50提交的 `src-tauri/src/recording_window.rs`：

1. 合法登记owner/child/session/operation。child发送 `state.recordedAt` 后，179–180行设置 `started=true`。
2. 子窗在owner终态确认前发生 `Destroyed`。295–305行先移除entry，发送`child-closed`，因`terminal=false`又把entry插回，取消当前Quit。
3. 原owner后续完成保存或明确丢弃，用正确session/operation调用`recording_window_message`发送`owner-status saved/discarded`。169–172行只设置`terminal=true`，没有清除已经没有子窗的entry。
4. 子窗已经不存在，正常不会再发生第二次该子窗的`Destroyed`。此时`abandon`又因`started=true`在229–233行拒绝；`finish`只接受子窗调用，且203–215行本身不移除entry。
5. 原owner的新录音在109–115行因既有entry被拒绝；`may_exit`239–244行要求`entries.is_empty()`，因此即使文档退出ACK全成功也不能退出。

保留未确认entry是合理的安全行为，但“子窗已经消失且原owner随后明确安全ACK”的终态仍须有可完成的清理路径。已将以上推导交给root、verify_app和50作者；由他们确认前端恢复路径、补受控复现并修复。不能把保留记录当作保存成功，也不能在未确认时直接移除保护。

## 本范围内核对结果

| 边界 | 固定源码观察 |
|---|---|
| 实际caller | 六个录音command均使用Tauri注入的`WebviewWindow`；没有接受调用方传入owner/child标签代替实际caller。register从实际caller写owner，relay按实际label判角色。 |
| session/operation | register99–102行要求二者为小写标准连字符UUID，109行防session重用；其他会话命令经过entry77–89行核session存在与operation精确相同。原生层只检查格式，不生成这些值，故本只读范围不能证明前端随机来源/熵。 |
| child标签与52兼容 | child固定`recording-<session UUID>`；50的`canonical_uuid`与52的36字符、小写标准UUID输出比较接受同一类正常child标签。52独立capability只增加麦克风预检许可，未要求toolbar绑定。 |
| owner/child角色 | context仅child且owner_alive；relay owner只发owner-status/action、child只发hello/state/submit/cancel/reveal；其他caller即使持有会话值也被拒绝。 |
| 定向转发 | relay193–200行构造包含session/operation/owner/child/from的envelope，明确`EventTarget::Window`发给对端，未广播录音正文。submit超过编码上限拒绝。完整消息内容验证属于renderer范围，未在本次读取。 |
| 原owner死亡 | Destroyed309–318行永久置owner_alive=false并通知child；context和relay拒绝失效owner，使同名新窗口不能继续正常会话。此处未验证实际运行中事件送达/窗口销毁顺序。 |
| 终态与正常子窗关闭 | 只有原owner的saved/discarded置terminal；finish需要child且terminal；已terminal子窗Destroyed会移除entry。异常先关闭、后ACK的问题见阻塞。 |
| Quit ACK | ExitRequested在lib.rs491–494接线；有entry则prevent_exit、为现有main/note-*生成待确认集合和随机Quit ID；ACK核真实caller属于该集合且ID精确相等，失败取消退出，45秒无完整结算取消退出。`may_exit`同时要求文档ACK空和录音entry空。 |
| 销毁接线 | lib.rs329–337的Destroyed调用registry清理，再清既有附件窗口注册；没有用普通CloseRequested代替已销毁事实。 |
| 文档barrier | `document_participants`45–49行只排标准`recording-UUID`标签；main、note-*、unknown-window、recording-invalid保留。lib.rs126与154在begin及finish两处都使用相同过滤。它按标签分类，不核registry成员；本次只确认合同所需的精确标签过滤，没有运行实际文档barrier。 |
| capability | child recording-*仅listen/unlisten、destroy/close/drag，没有create、exit、hide/show、notes-ui默认工具栏；owner额外hide/show/focus。capability的通配符由上述原生录音命令精确角色/会话校验进一步收窄。未扩展到其他既有宿主command的权限审计。 |

`result.json`固定所读blob的SHA256、结论与不执行项目。所有运行结论仍待verify_app的独审；真实系统权限、音轨、跨窗消息运行、后台工作及像素对齐均不在本补审范围。

## 对固定修复8e06189的静态复核

复核固定源码 `8e061891cb56a404bb3ec68baafe0e587d0afa67`，只通过git读取`recording_window.rs`及其相对首版的变化，未运行其中测试、未改产品。本节追加结论，以上首报告和`result.json`保持原始发现身份。新blob身份及结论见`result-recheck.json`。

原NATIVE50-01在本次静态范围内已具备修复路径：Entry新增`child_destroyed`，登记时为false；真实Destroyed处理312–330行置为true，未终态仍保留。`route_message`161–174行先核session/operation、owner_alive及实际caller角色，再由原owner的saved/discarded置terminal。195–198行只有`terminal && child_destroyed`才移除entry。command wrapper212–218行传入的caller仍取Tauri注入Window.label，不接受前端冒填caller。

| 情况 | 固定修复的静态结果 |
|---|---|
| 子窗已销毁，原owner晚到saved/discarded | 终态与已销毁条件同时成立，移除entry；wrapper220–223行不再向不存在的接收方发送，解除旧的永久占位。 |
| failed、saving、unknown、缺失或未知status | 不设置terminal；未终态的已销毁entry继续保留，不能把失败当作保存/丢弃。 |
| 错session/operation、child冒发owner-status、其他窗口冒认、已丢失owner | 在终态设置和移除之前返回错误，entry保持。 |
| 正常child仍存活，原owner已saved/discarded | child_destroyed仍为false，不提前移除；继续定向发送ACK。后续真实Destroyed才按终态移除，正常存活child仍占退出guard。 |
| entry已移除但文档Quit ACK未齐 | `may_exit`269–280行仍要求waiting空与entries空，不会由这次清理直接跳过文档ACK。 |

还有一项顺序限制需要由总独审结合实际renderer流程确认：wrapper在已销毁entry结算后直接返回Ok，没有重新调用`may_exit`。若本轮Quit文档ACK已经先全到、当时尚因entry未清而没有退出，随后最后一个owner终态ACK才移除entry，本轮Quit可能等45秒取消并需要重试；通常的“终态先结算，再文档Quit ACK”顺序会由`recording_quit_ack`303–307行调用`may_exit`正常处理。此处没有提前退出风险，但本补审未验证实际顺序，已向root和verify_app报告，不能据静态修复关闭全部Quit运行验收。

verify_app随后反馈其另行读取的真实renderer顺序：Quit handler先await录音owner close、再flush、最后才success ACK；异常子窗提前关闭会使close失败并发success:false取消本次Quit，后续保存ACK结算后由下一次Quit退出。因此该逆序在它核对的正常授权流程不可达，作为原生防御性顺序限制记录，不新增阻塞。此为总独审反馈，不计作本补审自行读取renderer或执行验证。

本节只关闭原永久tombstone问题的静态推导；实际Rust复现、异常/正常关闭及完整退出结果仍由verify_app负责。
