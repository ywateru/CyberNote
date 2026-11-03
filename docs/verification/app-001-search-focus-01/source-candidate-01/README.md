# APP-001-SEARCH-FOCUS-01：开发源码候选 01

2026-11-04，隔离工作树 `/private/tmp/apple-notes-search-focus-01`，基线 `2652fa20d6d84c83c852c87edaeb1d53c03fdb13`。本候选等待独立源审；没有新统一包、GUI、设备或像素验收。

## 改动与同步边界

产品仅修改 `plugins/tauri-plugin-notes-ui/src/lib.rs` 和 `src/macos.rs`。插件 `on_event` 精确识别 `RunEvent::MenuEvent` 的 `search` id，然后在本次同步事件回调直接调用 `focus_search_from_menu`。该路径不调用 `on_main`、`block_on`、channel 等待或额外异步派发。

菜单路径使用当前 `app.webview_windows()`，逐个读取真实 `is_focused()`；读取失败、没有聚焦窗口或多于一个聚焦窗口均显式返回错误。只有实际聚焦 label 为 `main` 才继续；即使 `note-*` 错配了带搜索的测试状态也拒绝，不回退其他窗口或最后绑定。然后读取这个 label 的当前绑定，检查搜索存在且 enabled，再把当前 id 交给共享同步 `focus_search_on_main`。该 body 再次按同一 window label/id 取当前绑定并检查搜索，才调用现有 C 原生入口。

原 IPC `focus_search` 仍保留 window ownership、UUID 校验及已有 async `on_main`，仅将其原闭包正文提取为上述同步 body。菜单失败通过既有 `Error` 类型与 `eprintln!` 日志边界记录；同步菜单入口有与现有主线程任务相同的 panic→明确错误边界。

原生 `toolbar.m` 字节未改：C 入口要求主线程及非 disposed controller；`focusSearch` 检查窗口/根视图归属、搜索存在和 native enabled。已有搜索或 current field editor 是 first responder 时 no-op，包括 marked text；否则只 `makeFirstResponder`。没有激活/抬窗、query/selection setter、空搜索 intent、revision 更新、正文移动、重绑或新窗口。原生重复请求及关闭门禁本轮仅做源码核对，没有真实 AppKit 动作验证。

## 已运行检查

| 检查 | 结果 | 实际边界 |
| --- | --- | --- |
| `cargo fmt --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml` | exit 0 | 格式化仅两项产品源码 |
| `git diff --check` | exit 0 | 源码改动与保存证据格式 |
| `cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml --locked --offline --lib` | exit 0，13 passed / 0 failed | 本机 macOS 插件编译、现有测试10项和新增3项；非统一应用构建 |
| 13 项共享边界与基线 SHA256 核对 | 全部未变 | App/Editor/bridge、宿主菜单、controller/guest、ObjC、模型/旧测试、依赖/锁文件 |

唯一 Rust 进程使用经 root 串行授权的 `CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target`，运行后已释放。没有复制 target、完整 Mac 包或 Android 编译。控制台输出完整收集于 [cargo-test.txt](cargo-test.txt)，命令和边界于 [checks.json](checks.json)。

新增测试执行实际生产 helper，覆盖精确 `search`/相似 id/非菜单事件，当前 main 绑定、其他聚焦 label 不回退、解绑后无绑定、重绑取得新 id 且旧 id 失效、搜索 disabled/missing，及 query/revision 等整个 ToolbarState 不变。这里向 helper 提供 label，没有模拟或声称测试了 AppKit 的真实聚焦切换。已有10项包含绑定/窗口/revision/权限状态检查、IPC 所属窗口/无效 UUID 拒绝和真实 mock runtime 的目标窗口事件投递。

## 限制与待验

锁定 Tauri 2.12.5 本地源码显示 Muda 菜单先向 runtime 排队，global menu listeners 先执行，plugin `on_event` 后执行。因此本改动只移除 renderer→IPC→main 往返对这次原生 focus 请求的依赖，不能保证最初 AppKit action 返回前聚焦，也不能据测试通过断言那一次快捷键后立即粘贴误入正文的原因已确定或已修复。

插件绑定 state 可能落后于 renderer 即时状态；本候选没有新增 renderer 授权事实或绕过原生门禁。未改 App、AccessGate、bridge、F07 搜索投影或宿主 `menu-action` 路由。后续 renderer 的重复 focus 仍沿原 IPC 到既有原生 no-op。

独立源审后需进入下一统一默认 Mac 包，单次记录快捷键→立即粘贴的真实目标、完整正文和 revision，保留失败，不能刷新到通过。另验已经聚焦搜索、显式搜索、唯一→零→clear、独立窗口、禁用/解绑/关闭、中文 marked text。尚无这些新包结果，也没有原版同输入时序或像素通过结论。既有异常、恢复和 pixel FAIL 继续保留。

## 冻结清单

[source-manifest.json](source-manifest.json) 保存两项产品文件的路径、大小和 SHA256；aggregate 为 `7f4ea27e672293cfb4f5c4dc0805da92762dc495139b5298bcdf1f37f1c6d968`，算法在清单中明确。`lib.rs` 为 `8c4c8bc8f8ca416256c2add0807eb1b6c50ad774a149c3b6e862c01acbd1e323`，`macos.rs` 为 `67b64173c6dda4fb48e1a6fba955dd152df25dfa02c2a7ef4bb87a7fc7149299`。

[boundaries-manifest.json](boundaries-manifest.json) 保存13项未改文件与基线对应 hash；[product.diff.patch](product.diff.patch) 保存精确产品 diff。`evidence-manifest.json` 对本目录其余6项证据给出 SHA256，不包含自身。此报告是开发检查交接，不替代独立源审或运行结论。
