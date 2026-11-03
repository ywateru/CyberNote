# focusSearch 最小入口候选

2026-11-03。根据任务 `app-001-native-toolbar-plugin.md` 第6项（64f62a8）与独立补审 `app-001-native-toolbar-plugin-01.md`（f35e27b）补齐搜索聚焦入口。只改独立插件和本开发者记录，未接入主应用；未操作 GUI 或设备。本记录属于开发者有限验证，独立复核与正式 FIX02 接入仍待完成。

## API 与边界

- Guest：`NotesToolbar.focusSearch(): Promise<BindingInfo>`；固定 IPC：`plugin:notes-ui|focus_search`；Rust：`app.notes_ui().focus_search(window, binding_id)`。
- `notes-ui:default` 新增 `allow-focus-search`，并生成独立 allow/deny 权限。命令沿用 Tauri 注入的调用方 Window、精确 windowLabel、UUID 及当前绑定校验，不接受 selector，不按全局最后窗口分发。
- 主线程重新查询绑定，先检查搜索存在且可用；原生层再次核对控制器、窗口归属、搜索和 enabled。错误为 `window_mismatch`、`invalid_binding`、`stale_binding`、`search_missing`、`search_disabled`、`window_closed`、`focus_failed` 或已有 thread/native 等错误。未绑定 guest 实例在 invoke 前返回 `not_bound`。有效非Mac调用明确 `unsupported`。
- 搜索或其当前 field editor 已为 first responder 时 no-op；其余只请求 `makeFirstResponder`。不重写 query、递增 revision、重绑、主动发送搜索意图、激活应用或调整窗口层次；没有文字/选区 setter、选区缓存或首次 caret 末尾策略。
- AppKit 自身因取得 first responder 而如何处理实际光标/选区尚未实测。未推定 selectAll、首次光标末尾或选区恒定；正式原版对照后才能确定是否需另立契约。
- 返回同一绑定与 stateRevision 的 BindingInfo，含当前原生诊断。宿主须在 FIX02 把所属窗口的全局搜索菜单与 Cmd+Shift+F 接入；Cmd+F 笔记内查找继续独立。插件 API 本身不完成宿主路由。

## 有限检查

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| 最终窄实现 Rust / ObjC 编译及边界测试 | 8/8 通过，3.83s | `rust-tests.txt`；5项原检查，新增搜索存在/启用及不改状态、跨窗/非法UUID在dispatch前拒绝、unbind/rebind旧ID查询拒绝3项；MockRuntime不代表原生焦点实测 |
| 最终 Wry 示例构建 | 通过 | `wry-build.txt`；链接真实桌面运行时及最终 ObjC；仅构建，未启动 |
| Guest strict TypeScript | 通过 | `typescript.txt`为空成功日志；该检查后 guest 源码未变 |
| Android aarch64 lib 条件编译 | 通过，3.04s，5项 dead-code warning | `android-check.txt`；检查后仅缩减Mac原生实现及改说明/权限描述，非Mac Rust行为未改；没有执行Android invoke |
| 源码/权限与构建产物身份 | 已记录 | `manifest.json`含SHA-256、字节数与命令；Cargo和root锁未改 |

所有构建均复用 `plugins/tauri-plugin-notes-scan/target` 缓存；未修改扫描插件源码。根目录历史 `manifest.json` 和 `demo-runtime.txt` 属于 adc544a/7760bb7 阶段，不作为新增聚焦入口的执行证据。新 Wry 示例二进制也没有被启动。

## 正式接入后仍需实测

1. 主窗搜索快捷键/菜单后实际键入进入原生搜索；Cmd+F仍进入笔记查找。
2. W1/W2焦点归属与窗口层次；对W2调用不意外激活/抬起W1；已在搜索时重复请求、选区和真实中文marked text行为。
3. 未绑定、跨窗、搜索缺失/禁用、窗口关闭、unbind/rebind旧ID错误及异步竞态；已关闭窗口可能因清理时机先返回stale_binding。
4. 原版首次/再次聚焦的caret及selection策略；按原版实际行为决定后续契约，不从AppKit默认值推定。
5. 与真实编辑器、保存及权限队列整合后的选区回归、生命周期与像素/RGB差分。

上述全部 not-run；编译、契约测试和源码检查不构成输入法、选区、双窗行为或像素通过。
