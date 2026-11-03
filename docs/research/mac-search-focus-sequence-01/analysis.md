# Mac 搜索快捷键焦点时序：有限只读审计

2026-11-04。范围：已保存 candidate02 证据与精确构建源 `fabafcf9723e400c67fd842f870dad9d4ae79d19` 的搜索路径。未启动/重放 App，未操作 GUI、设备或 target，未改产品、App/bridge/F07 投影状态或主 Git。本次仅新增本文件。

结论：源码确有“菜单处理发出异步 renderer 事件，renderer 再以 IPC 请求原生 first responder”的往返；快捷键的菜单回调没有等待原生搜索取得焦点。这个结构允许旧正文 first responder 继续存在到原生 focus 命令真正执行。已观察的那次立即粘贴误入正文与该窗口相容，但缺少事件级时刻证据，**该次异常的具体原因仍 unknown**。不能把静态可达时序当成该次运行的归因。

## 已保全运行事实

来源：[独立实际核验](../../plan/reviews/unified-fabafcf-mac-independent-02.md)，包 exe SHA `5e948ad9647a0ff878471dc213b327ca88628608b877b1f38c1ce6d154171e79`，运行 PID23532。以下引用的是已有文件，没有进行新增探针。

| 证据 | 可证明的事实 | 不能证明的事项 |
| --- | --- | --- |
| [02-native-initial.json](../../verification/unified-fabafcf-independent-02/mac/02-native-initial.json) | 首次 native 只读观察时 main 窗口 firstResponder 为 WryWebView；DOM activeElement BODY，A Editor focusedfalse | 这不是异常发生前一瞬的 responder，也没有快捷键/粘贴时刻 |
| [06-unique.ax.txt](../../verification/unified-fabafcf-independent-02/mac/06-unique.ax.txt) | 首轮正常唯一查询 QA Quote 时原生搜索 value 为 QA Quote、焦点在搜索，正文为 B | 没有“键处理返回前已 focus”的时间断言，不能覆盖快速输入异常 |
| [12-identity-unique.ax.txt](../../verification/unified-fabafcf-independent-02/mac/12-identity-unique.ax.txt) | A 列表摘要和 A 正文末尾都出现 `VERIFY02-HISTORYQA Quote`；搜索框为空。**该份快照结束时 focused UI 已是原生搜索框47** | 不能据最终 focused search 反推粘贴发生时也是 search；不能从快照测延迟；没有记录是否工具输入队列跨过焦点切换 |
| [15-sequence-correction.ax.txt](../../verification/unified-fabafcf-independent-02/mac/15-sequence-correction.ax.txt) | 纠正后 A 正文恢复为 VERIFY02-HISTORY 结尾，搜索为空，快照焦点为正文33 | Undo 恢复不消除异常，也不证明原焦点路径正确 |
| [17-explicit-search-focus.ax.txt](../../verification/unified-fabafcf-independent-02/mac/17-explicit-search-focus.ax.txt)、[18-explicit-unique.ax.txt](../../verification/unified-fabafcf-independent-02/mac/18-explicit-unique.ax.txt) | 显式确认搜索已聚焦后输入，唯一 B 查询正常 | 不属于一次快捷键后立即粘贴的验证 |
| [23-fixtures-comparison.json](../../verification/unified-fabafcf-independent-02/mac/23-fixtures-comparison.json) | B 全对象未变；A 最终 document 相同，但 revision57→61，updatedAt改变 | 不能写 A revision 没变，也不能把正文最终恢复写成从未误写 |

报告记载一次 `OptionCmdF` 后立即粘贴发生异常；这里接受该已保存输入说明，不推导未记录的键下/键上、paste dispatch、AppKit makeFirstResponder 具体时刻。未重复快速路径直到出现通过。

## fabafcf 的真实源码顺序

下列行号属于 `git show fabafcf:<path>`。本次核对 native plugin、src-tauri/src/lib.rs、native-toolbar controller/transport 与当前主 HEAD72c93b1 无 diff；App 已在后续仅抽取录音，故 App 行号按冻结源报告。下面是源码控制流，不是新增运行 trace。

```text
AppKit 菜单 accelerator Option+Command+F
  → Tauri/Muda MenuEvent → runtime event queue
  → 宿主 app.on_menu_event
       找 focused main/note-* window
       emit_to(window, "menu-action", "search")
       返回；没有 await renderer 或 focus ACK
  → renderer window.listen("menu-action")
  → nativeMenuHandler.current("search")
       nativeAssert(context)
       focusGlobalSearch(): setSearching(true)
         void nativeToolbar.focusSearch()    [调用方不等待]
           await this.ready                  [即使已 resolve 也为 async continuation]
           await transport.focusSearch()
             guest invoke(plugin:notes-ui|focus_search)
  → Rust async focus_search
       own_window / UUID / binding校验
       on_main: run_on_main_thread + channel/spawn_blocking等待
  → 主线程再次查当前绑定及搜索 enabled
  → C notes_ui_focus_search(binding)
  → NotesUIController.focusSearch
       window/归属/存在/enabled校验
       已为 search/current field editor → no-op
       否则 window.makeFirstResponder(search)
  → BindingInfo 返回 IPC / renderer，仅更新 nativeInfo
```

| 顺序边界 | 精确位置 / 内容 |
| --- | --- |
| Accelerator | [src-tauri/src/lib.rs](../../../src-tauri/src/lib.rs) 冻结行388–390：`search` 为 `CmdOrCtrl+Alt+F`；笔记内查找另为行379–381 `CmdOrCtrl+F` |
| 宿主菜单路由 | 同文件行402–419：按真实 focused window 筛 main/note-*，只 emit `menu-action`，忽略 emit 返回结果，没有 focus 操作 |
| JS 不在 keydown 先抢焦点 | [src/App.tsx](../../../src/App.tsx) 冻结行1264–1273：Mac native 下 meta/ctrl 的 n/f 提前 return，依赖 AppKit accelerator；不是 JS keydown 即刻 focus |
| renderer 菜单入口 | App 冻结行1317–1325：异步安装 window listener；进入 nativeMenuHandler；行2343–2359 取得当前 context 并 nativeAssert；行2384–2386 调 focusGlobalSearch |
| 本地 searching 不等于原生焦点 | App 冻结行1256–1263：先 setSearching(true)，然后 `void toolbar.focusSearch().catch(fail)`，没有把原生 responder 建立为此菜单 handler 的同步前置条件 |
| controller/guest | [native-toolbar-controller.ts](../../../src/native-toolbar-controller.ts) 行217–222；[native-toolbar.ts](../../../src/native-toolbar.ts) 行31；[guest-js/index.ts](../../../plugins/tauri-plugin-notes-ui/guest-js/index.ts) 行71–74。ready + invoke 都为 Promise |
| Rust 命令与主线程调度 | [plugin src/lib.rs](../../../plugins/tauri-plugin-notes-ui/src/lib.rs) 行203–210、123–127；[src/macos.rs](../../../plugins/tauri-plugin-notes-ui/src/macos.rs) 行94–110、256–270。async on_main 不把之前宿主菜单回调阻塞到 focus |
| 最终聚焦 | [macos/toolbar.m](../../../plugins/tauri-plugin-notes-ui/macos/toolbar.m) 行587–595 调 focusSearch；行424–440 最终 makeFirstResponder。不存在 focus 前等 renderer ACK 的原生逻辑；它是原生收到 renderer IPC 之后才执行 |

锁定的本地 Tauri2.12.5 源码另有一层：`src/app.rs` 行2520–2522 把 Muda 菜单事件发给 runtime proxy；行2755起先同步调用 global menu listeners，行2811起才调用 plugin.on_event。因此“在 Tauri 菜单事件回调内同步 focus”和“在最初 AppKit 菜单 action 返回前同步 focus”不是同一个保证。没有本次事件记录，不能给前一层队列延迟归因或承诺它为零。检查的是现有锁定依赖本地源，没有上网或下载。

## 原生搜索事件与 F07 投影接在焦点之后

focusSearch 明确只请求 responder，不改 stringValue、不 setSelection、不增加 revision、不开/重绑，不主动发 search intent；重复请求且已在 search/currentEditor 时直接 no-op（toolbar.m424–440）。因此先 `setSearching(true)` 和 focus 返回本身都不代表已经产生 query。

输入实际进入 NSSearchField 后，toolbar.m520–525 的 controlTextDidChange 忽略 marked text，发送实际 stringValue 的 `search/change`；Return 在527–533按真实 key event 发 commit，Escape在535–539发 cancel。send在442–448递增 sequence，搜索时设置 searchSequence，附上 windowLabel/bindingId/stateRevision。Rust callback（macos.rs33–67）验证绑定与窗口再 emit `notes-ui://intent`。

renderer controller 的 receive（native-toolbar-controller.ts127–143）要求当前 binding、已知revision和单调sequence，先记录真实搜索 value/sequence，再调用 App nativeHandler 并 pump ACK。App 冻结行2156–2162只按实际 search intent设置 nativeSearchAck/query/searching/filter；之后 React render与toolbar projection继续既有F07路径。焦点修复不需要把 query、搜索选中笔记、Editor gate 或正文归属提前写入插件。错误的正文粘贴也不会被这个搜索事件链自动搬回查询框；不得偷偷搬移已提交文字作为焦点修复。

## 可否只改 native plugin：最小建议与保证边界

**可做一个只改 `plugins/tauri-plugin-notes-ui` 的最小原生候选，以移除 renderer 往返对“开始聚焦”的依赖；但现有源码和证据不能保证这个候选已解决该次异常，也不能保证最初 AppKit action 返回前聚焦。** 不建议仅缩短 Promise、加延时重试、在renderer等 React render，或在完成后重定向正文文字。

建议候选仅在插件现有 `on_event` 增加精确 `RunEvent::MenuEvent` / id=`search` 的原生路径：在该事件同步处理期间，按真实 focused main/note-* window 解析所属**当前绑定**，检查 search存在且enabled、窗口归属及未销毁，并在已有主线程上下文内直接执行共享的同步 focus body。已有 IPC focus_search 可继续通过 on_main 调同一 body。不要在这个同步主线程回调中 block_on 既有 async on_main 或等待自己的 channel，否则会引入主线程自等风险；也不要额外 dispatch_async 再制造第二个焦点窗口。

插件已有 `on_event` 位于 src/lib.rs228起，当前仅处理Destroyed；这提供一个不改App/bridge/F07的接入点。当前宿主 menu-action 仍然会发出，renderer随后到达的重复 focus 应沿既有 no-op 语义处理。该候选仅提前原生 responder；不主动发送空搜索意图、不更改 query/selection/revision，不激活或抬起别的窗口。窗口无绑定/搜索禁用/已关闭时应明确错误或拒绝焦点，不落到任意全局“最后一个窗口”。现有绑定state可能落后于renderer最新overlay状态，不能据此承诺实时授权/overlay等价；这是候选评审需保留的边界，不能绕开现有原生校验。

它的静态优势是少一次 native→renderer→IPC→main 的往返；局限是 Tauri MenuEvent本身已排队，并且 plugin.on_event在宿主global listener之后。严格要求“原始 AppKit 菜单 action 返回前就已取得 responder”时，以上路径不足以给出保证；需单独定义原生菜单 action接管方案并证明精确窗口/菜单归属和重复路由，而不是在本审计中假定现有插件已有此入口。没有直接证据支持现在加入全局键盘hook、替换Tauri菜单target或写外部窗口状态；这些不属于此最小建议。

后续最小实际验证应记录一次受控快捷键→立即粘贴的原生事件顺序及实际目标：shortcut/MenuEvent、focus进入/返回时 firstResponder与所属currentEditor、paste派发目标、实际search change（如有），同时核对完整A正文及revision，并保留失败。另测已有搜索重复焦点、中文marked text、main/独立窗口、disabled/unbind/关闭门禁；明确旧包/新包身份。源码候选编译通过不能代替这些结果；本审计未执行它们。

## 未决项

- 那一次 OptionCmdF 与 paste 的精确派发时序、paste 是否已进入 Wry 进程/队列、工具输入路由与 AppKit responder切换相对先后：unknown。
- 当时 menu-action renderer接收/IPC/main dispatch的耗时与是否发生其他焦点恢复：unknown。
- AppKit action→Tauri runtime队列在该次事件中是否已足以造成异常：unknown。
- 插件内同步MenuEvent focus候选对真机快速路径的效果：not-run；没有产品修改或新包。
- 原版同样快速输入的精确焦点时序：本组证据未记录。

## 精确源码核对

以下文件当前字节与 `git show fabafcf:<path>` 相同；SHA256来自本次只读计算，未变更产品。

| path | SHA256 |
| --- | --- |
| `src-tauri/src/lib.rs` | `9f7e4d1ffd9a7097cd4ba3558b6cbb84ac0707b5084d8174e1e0200adc5bb6d2` |
| `src/native-toolbar-controller.ts` | `9dfa31e0ca200db7dc54dc15c2aa62d51d7a8aff23a5873643399a9f9c9a6214` |
| `src/native-toolbar.ts` | `c70c97cdd7d84cad8a7bb3587687afb43a87d3cf371740830d4bd63f2dcf423e` |
| `plugins/tauri-plugin-notes-ui/src/lib.rs` | `a787e57b978b77ddeb9222c7232563585a8146eb3cc733bd448397acc9703579` |
| `plugins/tauri-plugin-notes-ui/src/macos.rs` | `f7cb2c543f727a62292921651a13f8c541d4c2b9427e448e25a76a42ed5d497a` |
| `plugins/tauri-plugin-notes-ui/macos/toolbar.m` | `2d23fed63051e1841ee8f954d02474b659216893f79a65ed64cef651c32d02c0` |
| `plugins/tauri-plugin-notes-ui/guest-js/index.ts` | `898c1503ba91a16f6e1dc0b3596afb387dc17717c5cfbe71ccc24d3ef8cf8ce8` |
