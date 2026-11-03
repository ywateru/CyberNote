# FIX05 独立有限静态审查 — da32415

日期：2026-11-03；隔离worktree `/private/tmp/apple-notes-window-close-05`，分支 `task/app-001-fix-05`。冻结implementation **`da324151fae02367114ef75f866fc92b57ad1d29`**。结论：**pass，仅限两行标准关闭角色与既有关闭守卫连接的静态门槛；无新增确定P1/P2/P3。** 第一阶段可交root合入正式宿主构建，任务仍in-progress；旧4118包实际Cmd+W失败尚未关闭。实际运行、保存/冲突关闭、像素均unknown。

本轮只读该隔离提交、官方锁定上游源码与已有准备记录；没有构建、产品测试、GUI/Android/设备操作，没有修改产品或准备证据。唯一新增交付为本报告。GUI/设备继续由develop/root拥有。

## Findings

| 严重程度 | 交付门槛 | 有限结果 |
| --- | --- | --- |
| P1 | blocking | 本次两行差分与关闭守卫连接内未发现新增确定问题；不复审整应用保存/授权并发。 |
| P2 | blocking | 未发现新增确定静态问题。缺少标准关闭入口的静态缺口得到最小补充，但旧Cmd+W运行失败仍待新正式产物复验，不能按本静态结果关闭F13 finding。 |
| P3 | non-blocking | 无新增确定问题；菜单中文/位置未与原版实采比较，不是File菜单像素通过。 |

设计契约：`docs/plan/tasks/app-001-fix-05.md` objective1–3，`docs/requirements.md` F13/F15，以及FIX02 review的Cmd+W blocking finding。没有新增JS快捷键、应用级关闭广播或直接destroy路径，符合本阶段最小公开关闭角色要求。

## 输入与准备证据身份

产品差分精确为 `src-tauri/src/lib.rs:282–283`：在既有File菜单导入/导出后新增`.separator()`和`.close_window_with_text("关闭窗口")`。最终lib.rs 12,347B，独立SHA256 **`50bb77a8216a102e2b01d8a0ad0b5d69e4ef919e4a82390f10e8d60bc7f87357`**，基线SHA `8c28bb5e4f4556d4dd6268ecc77c91a3a4f72ae7ec7a6d1cbd99ba46006599f1`。独立比较父提交：App.tsx、Cargo.toml、Cargo.lock字节完全不变；没有Editor/存储/授权协议变更。

重新散列开发 `docs/verification/app-001-fix-05/prepare-results.json` 中16项输入（4个冻结项目文件、8个上游源文件、4个缓存归档）全部匹配。按原清单顺序 `path + NUL + sha256 + LF` 独立重算聚合 **`3f2c36fe5e4431969cbd292790266883a2ed8a1ea2e51a224150db5153bae3e8`** 相同。四个crate归档SHA各自与冻结Cargo.lock checksum相符，直接读取tar中8份源文件并与实际解包源码逐字节比较相同；所有记录行号摘录也与实际上游文件相同。没有用缺失的`.cargo-checksum.json`推定可信。

准备记录的rustfmt parse/format及offline locked/no-deps metadata exit0范围准确：它们不编译、不证明Rust类型/链接或完整解析依赖，metadata resolve=null。记录HEAD为准备前基线d5d11ce，不伪称当时已在最终commit运行；最终输入字节匹配才是对应依据。本轮没有重跑上述检查或生成target，没有新应用产物/产物SHA。

## 关闭链静态复核

以下版本均由冻结Cargo.lock确定，源码已核缓存归档：Tauri2.12.5、muda0.20.0、tao0.37.2、tauri-runtime-wry2.12.3。这里的箭头是源码连接，**不是实采运行事件序列**。

| 边界及代码位置 | 实际源码依据 |
| --- | --- |
| 本应用 `lib.rs:282–283` →标准builder | 公开`.close_window_with_text("关闭窗口")`保持既有`.build()?`错误返回，菜单在desktop条件块内，无新app.on_menu_event分支。 |
| Tauri `src/menu/builders/menu.rs:571–576` → `src/menu/predefined.rs:243–255` | builder创建`PredefinedMenuItem::close_window`，在主线程调用muda的预定义角色；不是自定义menu-action命令。 |
| muda `src/items/predefined.rs:660–662`、`accelerator/mod.rs:69–70` | macOS CloseWindow绑定CMD_OR_CTRL+KeyW，macOS CMD_OR_CTRL为META，即标准Cmd+W。 |
| muda `platform_impl/macos/mod.rs:709–735,943` | CloseWindow selector为`performClose:`；预定义item除About外不设自定义target，沿系统响应链解析目标。新代码未枚举应用窗口或广播关闭。实际focused窗口及native search field editor的响应链行为仍需运行。 |
| tao `platform_impl/macos/window_delegate.rs:203–208` | `windowShouldClose:`向所属窗口发`CloseRequested`并返回false，后续由runtime处理；没有在此直接原生关闭绕过事件。 |
| runtime-wry `src/lib.rs:4253–4254,4351–4381` → Tauri `src/manager/window.rs:177–182` | 当前window_id/label进入可阻止CloseRequested路径。manager发现该窗口JS监听先prevent_close，并向对应窗口发事件，不是全应用广播关闭。 |
| 原有App `src/App.tsx:551–562` | 对当前窗口注册onCloseRequested。有pendingDocs时同步event.preventDefault，等待flush，排空后才destroy；异常由fail处理，不新加强制关闭。无pending时交既有默认处理。 |
| 原有App `src/App.tsx:388–394` | flush等待现有queues，pendingDocs或saveFailures仍存在则抛错；本次没改排空、重试、冲突或清理逻辑。 |

为核对JS监听到默认关闭的最后一段，额外只读了已安装第三方 `@tauri-apps/api` 2.12.4 `window.js:2028–2036`（pnpm真实依赖文件，不是主目录产品源码）。版本与冻结pnpm-lock一致；该文件SHA256 `95cca7295cf5720fa226fdf90d838fb8e07a585b926a8bb65abc51aa180abf64`，在`onCloseRequested`中await handler，只有未preventDefault才destroy。这是额外本地依赖源码证据，其npm归档integrity本轮未独立重算，不能与上述4个已核crate归档混称同一来源保证。实际JS listener是否已成功注册、关闭事件/flush时序仍unknown。

因此新增标准关闭入口在源码上连接既有可阻止close-request/保存边界，未绕过flush守卫。App中成功排空后既有destroy是守卫后的继续关闭，不是本次菜单直接destroy。后续不能为“使Cmd+W有效”改成强制destroy、关闭所有窗、吞掉保存失败或清除pending。

官方版本文档入口：[Tauri2.12.5 SubmenuBuilder](https://docs.rs/tauri/2.12.5/tauri/menu/struct.SubmenuBuilder.html#method.close_window_with_text)、[Tauri2.12.5 PredefinedMenuItem](https://docs.rs/tauri/2.12.5/tauri/menu/struct.PredefinedMenuItem.html#method.close_window)、[Apple NSWindow performClose](https://developer.apple.com/documentation/appkit/nswindow/performclose(_:))。本报告精确实现结论来自上述独立核字节的锁定源码，在线入口不作为运行证据。

## handoff 与 unknown

root可在FIX04冻结与设备/GUI协调后合入本候选，构建并记录新正式宿主身份，再执行实际验证。至少需要：独立窗正文获焦单次Cmd+W、原生搜索获焦时关闭菜单/快捷键、目标窗消失且另一窗保持、pending真实保存后重开完整正文、实际保存失败/冲突关闭保全与错误可见、事件/flush时序。菜单文字/位置/像素继续unknown。

以上运行与像素项目均not-run，旧FIX02单次Cmd+W失败继续有效；不能以本报告pass、源码链、格式检查或metadata关闭该实际缺口。本轮没有 GUI/Android handoff占用变化；develop/root仍拥有操作权，verify现在等待FIX04最终真实APK冻结。
