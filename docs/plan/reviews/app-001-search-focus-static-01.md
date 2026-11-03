# Mac 搜索焦点：独立源码审查 01

2026-11-04，native_ui_research 独审。冻结候选 `d9bc5a469b31cfcab14a482656819bfebe213181`，基线 `2652fa20d6d84c83c852c87edaeb1d53c03fdb13`，隔离工作树 `/private/tmp/apple-notes-search-focus-01`，任务 `app-001-search-focus-01`。此前仅撰写只读焦点链研究和最小边界建议，未撰写该候选实现或其测试。

**结论：本候选在有界源码审查和插件定向测试范围内 SOURCE-READY，未发现阻断。** 菜单路径在 Tauri 插件此次 MenuEvent 回调中同步执行共享聚焦 body，移除 renderer→IPC→main 往返对首次原生聚焦请求的依赖。它不保证最初 AppKit 菜单 action 返回前已聚焦；没有新包快速按键/粘贴实证，不能称此前误写正文异常已修复，也没有交互或像素一致验收。

独立证据：[app-001-search-focus-independent-01](../../verification/app-001-search-focus-independent-01/)。两项产品源码清单与13项保护文件逐字节核对、命令结果、锁定依赖源链均保存在该目录；完整输入见 [identity.json](../../verification/app-001-search-focus-independent-01/identity.json)。两源码 aggregate 独立重算为 `7f4ea27e672293cfb4f5c4dc0805da92762dc495139b5298bcdf1f37f1c6d968`，与开发清单相同。

## 同步路径和线程依据

产品仅修改插件 `src/lib.rs` 与 `src/macos.rs`。`lib.rs` 原有插件 `on_event` 中精确匹配 `RunEvent::MenuEvent` 且 id 为 `search`，直接调用 `focus_search_from_menu`。其他菜单和非菜单事件不进入；Destroyed 原有解绑路径继续保留。菜单处理不是 async，没有 `block_on`、等待原 `on_main` 或另派发聚焦任务。

本次独立读取实际锁定的本地 Tauri 2.12.5、Wry runtime 2.12.3、Tao 0.37.2 源码，而非仅信任候选注释：

1. Tao macOS EventLoop 创建检查真实主线程；Wry 记录该线程作为 main_thread_id，由该事件循环同步调用 runtime callback。
2. Tauri `app.rs` 先在 runtime UserEvent 中执行 global menu listeners，再同步调用 plugin store 的 `on_event`；plugin store 和 builder hook 直接调用已注册闭包。本候选因此在现有主线程事件回调内执行。
3. `window.is_focused()` 沿 Tauri dispatcher → Wry window_getter。getter 确实有 recv，但 Wry `send_user_message` 在当前 main_thread_id 分支先直接执行 `handle_user_message`，native `IsFocused` 同步发送结果，之后 recv 取得已发送值；这里没有再排队等待自己。窗口已不存在时原消息 sender 随处理结束释放，getter返回错误，候选传播错误。
4. 现有 C `notes_ui_focus_search` 仍验证 `NSThread.isMainThread`，错误不会冒充聚焦成功。共享 focus body 的绑定锁仅用于 clone 当前记录，调用 C 前已释放；未发现在 native 回调可能重新读取绑定时仍持锁的新增路径。

依赖文件完整 SHA、精确范围及小段源码保存于 [source-chain.json](../../verification/app-001-search-focus-independent-01/source-chain.json)。这是源码控制流依据，不是本次 AppKit 时刻 trace。Tauri 的 Muda handler 在此前已把菜单事件发往 runtime proxy，因此该队列仍存在，且插件在宿主 listener 之后。

## 窗口、绑定和失效门禁

`focus_search_from_menu` 读取当次 `app.webview_windows()`，逐个查询真实 `is_focused()`。任一查询错误向上传播；无聚焦窗口或多于一个聚焦窗口显式失败。它不选择“第一个”已聚焦窗口，也不访问全局最后绑定。得到唯一聚焦窗口后，`menu_search_binding` 只接受精确 label `main`；`note-*` 即使有带搜索的绑定也拒绝，不激活其他窗口。

随后读取该 label 的当前绑定，检查 search存在且 enabled，取得当前 binding id，再进入 `focus_search_on_main` 按同一 window label/id 重新取当前记录、再次检查 search，最后沿已有 C 入口。不是缓存旧 id；重绑前的 id 会被第二次 lookup拒绝。解绑/Destroyed/drain 先从 map 移除，即使原 native controller 的销毁任务尚待执行也不会回落到它。原生层继续验证 controller存在、未disposed、window/root归属、search对象及 native enabled；未改弱化这些门禁。

这里的 no-focused、ambiguous、读取错误和真实窗口销毁路径为静态追踪结论，本次13项单测没有驱动真实 AppKit 窗口的这些状态，不伪称已实际操作。

## IPC 共用 body 和无副作用边界

原 IPC 命令仍先校验调用所属窗口和 UUID，继续通过原 `on_main` 调用共享同步 body。菜单直接调用 body；没有同步主线程回调等待该 async IPC。后续 renderer 收到原 `menu-action` 后的重复请求仍可沿 IPC 到相同原生 no-op。

ObjC `toolbar.m` 字节与基线相同：已为 NSSearchField 或其 current field editor 的 first responder 时直接 no-op，包括已有 marked text；否则仅调用 `makeFirstResponder`。没有查询/选区 setter、空搜索 intent、revision 更新、正文操作、重新绑定、新窗口或激活/抬窗。该 no-op是既有源码门禁，本次没有真实 IME/marked text验证。

插件绑定 state可能落后于renderer即时状态。本候选只能使用现有已发布绑定和原生门禁，不能宣称即时overlay/授权完全一致。原宿主 menu-action、renderer nativeAssert、F07搜索投影与Editor路径均未改。同步 native focus本身也不等于后续query、投影、正文归属和保存已经正确。

## 独立执行与完整性

独立运行最小插件检查，没有重跑无关应用/存储矩阵：

| 命令 | 结果 |
|---|---|
| `cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --lib` | exit0，13 passed / 0 failed |
| `cargo fmt --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml -- --check` | exit0，输出空 |
| `git diff --check 2652fa2..d9bc5a4` | exit0，输出空 |

测试完整输出：[cargo-test.stdout.txt](../../verification/app-001-search-focus-independent-01/cargo-test.stdout.txt)、[cargo-test.stderr.txt](../../verification/app-001-search-focus-independent-01/cargo-test.stderr.txt)。13项包含实际生产 helper 的精确菜单id、main当前绑定、其他label拒绝、解绑/重绑旧id拒绝、search禁用/缺失与state不变，以及既有所属窗口/无效UUID与mock runtime定向投递测试。新增helper测试输入的是label和map，没有执行真实焦点解析或C聚焦；不能据此宣称实际快捷键/窗口状态已验收。

仅短暂使用 root授权的现有 `CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target`，检查后已释放，无并行完整应用构建、target复制或新依赖下载。13项保护文件与基线同字节：App/Editor/bridge、controller/guest、宿主菜单、ObjC、模型/既有tests、插件依赖和锁文件。该清单对应本候选基线，不能覆盖主线后续附件/录音整合后的全体状态。

开始及结束 worktree均clean，HEAD和两源码未变；没有产品修改、主Git、GUI、真实数据或输入重放。检查记录见 [completion.json](../../verification/app-001-search-focus-independent-01/completion.json)。

## 后续实际门槛

可按精确两源码整合进下一统一默认Mac包，重新构建并记录包身份后再验证。应单次保留快捷键→立即粘贴的真实输入顺序、落点、完整正文及revision，记录失败并恢复，禁止重复刷至通过。另测已聚焦搜索的重复请求、显式搜索、唯一→零→clear、独立窗口、disabled/unbind/关闭及中文marked text；原版同动作作对照。没有可靠事件级时序时只报告实际落点和证据限制，不把本次源码减少往返推导成原始异常归因或“完全相同”。旧异常原因仍unknown，既有pixel FAIL继续成立。
