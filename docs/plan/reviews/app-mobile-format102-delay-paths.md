# FORMAT102：原 r2 等待间隔与菜单/Back 延迟路径独立审查

日期：2026-11-10。角色：独立审查，非实现作者。范围仅为只读因果排查；未运行构建、测试包或设备，未修改产品。原 r2 的 F1 仍成立，本文不接受任何修复。

## 结论与下一步

没有找到格式会话、访问授权或菜单按约 120/138 秒过期的产品路径。最有价值的新区分不是再做一次普通 focus→metadata，而是**在原等待间隔之后、长按之前补一张观察**：现有 07 与 08 之间没有状态记录，无法确认关闭恰好由长按触发，也无法排除等待中已经关闭。

下一次若父级批准有界真机路径，沿原有自有笔记/输入法前提打开格式，确认完整面板，等待至少 145 秒（保持前台，不新增点击/Back/格式操作），先截图/层级，再执行唯一同点 800ms 长按并立即截图。可分段等待并持续进度沟通。若等待后的面板已消失，不执行盲长按；读取 v2 关闭记录。若等待后仍存在而长按后消失，才将边界收紧到长按/ActionMode。观察系统灭屏/恢复也须单列，不能把它归为产品 TTL。无需因此增加诊断监听或构建。

已向作者和父级报告唯一明确的应用内延迟 Back 路径及其 generation 保护，详见下表。没有发现可据此宣称已复现 F1 的最小输入。

## 原始证据的时间边界

来源：`artifacts/final101-android-r2/format-operation-sequence.json` 与已更正的 `docs/verification/modernization101/android-r2.md`。

- 15:20:27.353Z 工具调用：打开格式并截图 06。
- 15:21:09.327Z 工具调用：截图 07，完整面板仍在。距打开格式约 42 秒。
- 15:23:25.479Z 工具调用：先 `swipe 600 670 600 670 800`，再截图 08；拟斜体/拟关闭点击在 08 之后。
- 07→下一调用为 136.152 秒；按实际截图完成时间可描述为约 138 秒。工具时间不是 DOM 关闭时间，不能从两张图推得一个精确超时阈值。
- 08 已出现普通底部工具栏。产品 JSX 在 `!formatOpen` 时才渲染该工具栏，这支持真实 state 关闭的解释，但截图不是完整 JS 状态证明。

## 路径逐项审查

| 路径 | 精确行为 | 能排除/不能排除 |
| --- | --- | --- |
| EditorSession/access | `controller.ts` 无 timer、时钟或 TTL。`reconcile()` 只检查 note/editor/mobile 身份、blocked/authorized/visible；`access-client.ts` stamp 比较 session/epoch/generation。Rust `Store::authorized` 只检查未删除、是否锁定/内存 key；无时间项。 | 排除“仅经过 138 秒自然过期”这一产品机制。不能排除期间实际发生的同步、访问/导航/销毁事件。 |
| 移动格式外部指针 | `AppMenus.tsx:621` 的格式为 dialog、autoFocus=false、dismissOnOutside=false。`MenuSurface` 的 document pointerdown/contextmenu/window blur outside handler 首句 return。 | 排除普通正文 longpress 所产生的这些事件直接触发 outside close；handler 无延时队列。 |
| MenuSurface 键盘 | document keydown 同步处理最深层 Escape；先 preventDefault/stopPropagation 再 close。dialog 不进入 Tab/箭头菜单分支；window 全局 Escape 也为同步分支。 | 无定时/idle close。真实迟到的 Escape 仍可能关闭，原证据没有键盘事件记录；不能凭截图断言发生。 |
| 菜单动作/重挂载 | format 的 key 不含 revision；ResizeObserver/resize/scroll 只调用定位。格式按钮选择同步走 run，移动端 `formatCommand` 保持面板；没有 138 秒调度。 | 排除 revision 更新自身造成格式实例更换及菜单定位 timer；不排除实际点击 X/打开速绘等合法关闭输入，但原 08 前没有这些已记录输入。 |
| Android Back：JS 内等待 | `Navigation.run():164–184` 仅在 `ports.sync.frozen()` 时等待 `sync.cancel().then(execute)`；执行前检查 active/request/generation。`androidBack` 执行时读取当前 backLayers，format 分支 `closeFormat("back")`。 | 确有可延迟路径，但 `openFormat→cancelFocus()` 递增 generation，通常会丢弃“JS 已接到 Back→之后才开格式”的旧请求。不能把任何 pending Back 泛化成必然关闭新面板。 |
| Android Back：原生传输 | 锁定 Tauri 2.12.5 `AppPlugin.kt` 仅 OnBackPressedCallback 调用 trigger("back-button")；无长按监听或延时。Plugin.trigger→Channel.send→JS Channel→useSystemEvents 当前 callback→Navigation。JS Channel 按 index 缓存乱序消息，无 timer 或事件发生时的 panel/generation token。 | 没有代码支持“长按主动生成 Back”。不能排除原生/IPC/JS 调度晚到的实际 Back：若直到开格式后才进入 Navigation.run，会捕获新 generation 并读新 layers。原证据不含 native Back 时间，无法证实/排除此竞态。 |
| PM composition watchdog | 实际 pnpm patched prosemirror-view 1.42.9 `src/input.ts:542,625` 为 Android 5000ms watchdog；符合可信 focused/connected 原生 preedit 时直接保留，否则 endComposition。blur/native end/非composition输入有 20ms/同步结束路径。 | 它影响 composing/selection/transaction，不调用 session.closeFormat。06→07 已约 42 秒仍显示面板，因此不是“打开时启动、等到 138 秒才触发”的计时器。不能排除长按时实际 composition/native事件产生其他上层状态变化。 |
| 其他短时任务 | MainActivity NotesKeyboard show 延时 80ms，hide取消它；drawing longpress 500ms 限 drawing SVG；侧栏 longpress 520ms 限其入口；notice 3500ms 只清提示。 | 不属于正文格式长按关闭；不能拿这些数值匹配约 138 秒。 |
| 同步 | JS quiet deadline=5500ms 请求 cancel；Rust quiet=5s/重试2s，网络轮询2s/退避至30s，均需实际同步前提。 | 无格式 TTL，但真实同步冻结会进入现有 session access/sync 屏障。没有原 r2 区间同步事件证据，不能静态排除实际外部同步。 |

## 来源与独立性

逐字核对 root 以下文件与产品基线 `e521306e` 完全相同：`src/editor-session/{controller,platform,use-editor-session}.ts`、`src/Menu.tsx`、`src/editor-menus/{AppMenus,FormatControls}.tsx`、`src/navigation/use-navigation.ts`、`src/platform/system-events.ts`、`src/access-client.ts`、`src-tauri/src/session.rs`、`src-tauri/src/store.rs`、`patches/prosemirror-view@1.42.9.patch`、`src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt`。

真实依赖只读范围：pnpm `@tauri-apps/api@2.12.4` 的 `app.js/core.js`、已打 patch 的 `prosemirror-view@1.42.9` 的 `src/input.ts`，以及 Cargo.lock 锁定的本地缓存 `tauri-2.12.5/mobile/android/.../{AppPlugin.kt,plugin/Plugin.kt,plugin/Channel.kt}`、`wry-0.57.1/.../WryActivity.kt`。没有扩大到 home 搜索，没有运行依赖安装。

未取得原时段系统 screen timeout、Activity 生命周期、native Back/ActionMode、JS state transition 的实时记录。因此未证明 OS 行为、没有证明延迟 Back 实际发生，也没有复现或修复 F1。v1/v2 既有 nonrepro 不能替代这段未观测等待边界。
