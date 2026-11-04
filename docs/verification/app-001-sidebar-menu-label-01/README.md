# 文件夹菜单状态文字：源码候选

基线 `a692fdb`，作者工作树 `/private/tmp/apple-notes-sidebar-menu-label-01`，分支 `task/sidebar-menu-label-01`。candidate06的实际侧栏直接隐藏/恢复已由root检查，本项只补实际发现的菜单固定文字。原版文字契约见 `docs/ui/macos.md` 与任务文件，本文不把受控检查替代真实菜单验收。

生产修改仅 `src-tauri/src/lib.rs`、`plugins/tauri-plugin-notes-ui/src/lib.rs` 与 `src/macos.rs`。应用初始sidebar标题为“隐藏文件夹”；Mac插件只读取现有当前main绑定的columns.sidebar_visible，原生bind/update成功后同步“隐藏文件夹”/“显示文件夹”。主窗Focused(true)重新投影当前绑定；独立窗与bind前/unbind后无main绑定的焦点事件不写标题。没有新IPC、缓存状态、存储字段或依赖变化。

既有应用菜单含“显示”子菜单，查找递归访问真实Tauri MenuItemKind的子菜单，找到sidebar普通项后仅调用text/set_text；没有重建菜单、改变enabled/快捷键/动作路由或布局。Tauri锁定2.12.5的API在本机编译通过。更新路径在原有UUID/revision校验及原生更新成功后才写当前绑定/投影文字。菜单错误单独以 `notes-ui: sidebar menu title failed` 记录，不把成功toolbar更新变为失败，不回滚已应用状态。

标题读取与应用均发生在主线程：bind/update从既有on_main任务内部调用，聚焦路径从插件主事件循环调用；没有在worker取标题快照后另排队。project_sidebar_menu先释放Bindings锁再访问Tauri菜单。锁定tauri-runtime-wry2.12.3的Context::send_user_message（本机registry lib.rs:263）在main_thread_id匹配时直接handle_user_message，故当前主线程内的Tauri菜单text/set_text不会另排队成后来的旧标题。其他线程的更新必须先进入既有on_main，revision门禁和读取当前绑定都在执行时发生。此为锁定源码时序核对，不替代实际系统焦点验证。

```text
React sidebar → 已有ToolbarState → 原生成功应用 → 当前main Binding → sidebar菜单文字
main重新聚焦 ───────────────────────────────→ 当前main Binding → sidebar菜单文字
note-*聚焦/更新 → 不写主窗菜单
```

## 检查结果

| 检查 | 结果和范围 |
| --- | --- |
| 插件离线Rust测试 | 16/16通过，含原13项与新增3项；真实生产project_sidebar_menu配受控菜单sink，三主布局各显示→隐藏→恢复、同一绑定焦点重投影，状态不变；独立窗/无main绑定不调用sink；生产revision校验拒绝旧值/同值，错误UUID拒绝；sink报错后当前绑定不变。 |
| 桌面宿主cargo check --lib | exit0，真实桌面宿主与Tauri递归菜单查找、text/set_text路径编译通过；不是平台bundle构建。 |
| 差异检查 | git diff --check通过；生产只3文件；React、ObjC布局、搜索处理、动作路由、存储和Android未改。 |

精确命令和原始输出保存在 `cargo-plugin-test.json/.txt`、`cargo-host-check.json/.txt`。两个命令串行使用root授权共享target，--locked --offline、CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2；复用既有监控器，每个命令600秒上限、运行期间2GiB空闲下限，只处理自有进程组。最低可用空间3,783,950,336字节；两组均已停止，无残余活动成员。没有下载、升级、缓存/target清理或平台包构建。

新增测试在真实生产状态投影函数边界记录菜单写入，未创建NSApplication、真实NSWindow或AppKit菜单，未调用真实set_text来验证最终屏幕文字。旧revision测试直接调用生产更新路径使用的同一个门禁函数，未模拟为完整native update成功。原生状态成功/失败后的调用位置由源码与编译核对，不宣称已验证系统事件时序。没有GUI、安装、重启或像素比较。root应在新Mac包检查工具栏与菜单两种切换入口、三种主布局、切窗、正常冷启；现有运行candidate06不会自动获得源码更新。
