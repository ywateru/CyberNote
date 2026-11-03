# FIX05 标准关闭窗口入口：第一阶段源码准备

2026-11-03。工作目录 `/private/tmp/apple-notes-window-close-05`，分支 `task/app-001-fix-05`，基线 `d5d11ce5cf396f78d01c9783be36a8a582ef512c`。产品差分只有 `src-tauri/src/lib.rs` 文件菜单中的两行：分隔线与 `.close_window_with_text("关闭窗口")`。任务仍 `in-progress`，没有运行或像素通过结论。

独立报告 `docs/plan/reviews/app-001-fix-02-01.md` 的一次 Cmd+W 未关闭窗口，以及冻结菜单缺少关闭角色/快捷键，是本任务依据。**缺失入口与实际失败相符，尚不能证明是唯一运行根因。** 本次没有新增关闭事件观测，也没有重放独立GUI动作。

## 锁定公开 API 与实际实现

读取的是本机Cargo缓存中的锁定源码，不使用最新版API推断旧依赖。锁版本为 Tauri2.12.5、muda0.20.0、tao0.37.2、tauri-runtime-wry2.12.3。所有读取文件的SHA、行号摘录、四个缓存`.crate`包的SHA与Cargo.lock checksum比对见 [prepare-results.json](./prepare-results.json)。缓存归档四项均匹配lock，所用第三方源文件逐字节匹配相应归档；部分解包目录没有`.cargo-checksum.json`，该缺失在记录中明确为null，未用它代替实际归档校验。

| 调用边界 | 本次确认的锁定实现 |
| --- | --- |
| `SubmenuBuilder::close_window_with_text` | `tauri-2.12.5/src/menu/builders/menu.rs:571–576` 是公开builder方法，创建 `PredefinedMenuItem::close_window`；构建错误继续由既有 `.build()?` 返回 |
| 标准角色 | `tauri-2.12.5/src/menu/predefined.rs:243–255` 在主线程创建muda预定义关闭项，不调用本应用自定义menu-action处理器 |
| macOS快捷键/动作 | `muda-0.20.0/src/items/predefined.rs:660–662` 使用 `CMD_OR_CTRL+KeyW`，`accelerator/mod.rs:69–70` 在macOS映射为META；`platform_impl/macos/mod.rs:943` 选择 `performClose:` |
| 系统目标选择 | 同文件`:709–735` 构建预定义item，仅About分支设置自定义target，关闭角色沿原生菜单响应链；没有枚举本应用窗口并广播关闭 |
| 原生关闭请求 | `tao-0.37.2/.../window_delegate.rs:203–208` 的 `windowShouldClose:` 发出当前窗口 `CloseRequested` 并返回false，由runtime处理后续关闭 |
| 可阻止的runtime路径 | `tauri-runtime-wry-2.12.3/src/lib.rs:4253–4254,4351–4381` 把Tao请求交给关闭处理，携带window identity和阻止信号；`tauri-2.12.5/src/manager/window.rs:177–182` 发现对应JS监听时先prevent_close并向该窗口发事件 |
| 现有应用守卫（只读） | `src/App.tsx:551–569` 的 `onCloseRequested` 在有pending时阻止默认关闭，等待flush，排空后才destroy；失败显示实际错误。此文件字节未变 |

官方公开参考（读取日期同上）：[Tauri 2.12.5 SubmenuBuilder API](https://docs.rs/tauri/2.12.5/tauri/menu/struct.SubmenuBuilder.html#method.close_window_with_text)、[Tauri 2.12.5 预定义菜单 API](https://docs.rs/tauri/2.12.5/tauri/menu/struct.PredefinedMenuItem.html#method.close_window)、[Apple NSWindow performClose](https://developer.apple.com/documentation/appkit/nswindow/performclose(_:))。本机AppKit SDK `NSWindow.h:490,830` 也公开声明 `performClose:` 和 `windowShouldClose:`。精确运行实现证据以上述已核归档的锁定源码为准。

```text
文件 → 关闭窗口（原生 Cmd+W）
  → 系统 performClose: / 原生响应链选窗
  → Tao windowShouldClose → Tauri CloseRequested（所属窗口）
  → 原有 App onCloseRequested
      无pending：现有默认关闭
      有pending：preventDefault → flush → 排空才destroy
      失败/未排空：保留现有失败与pending处理
```

这是静态实现链，不是已捕获的实际事件序列。新增入口没有直接调用destroy，没有新JS快捷键、事件监听或app-wide广播。原生菜单处理本来就存在的聚焦窗口menu-action转发、保存/授权/跨窗屏障和所有App/Editor/store代码都未修改。是否确实选中正文或原生搜索所属窗口，必须由真实运行验证。

## 有限检查与输入身份

基线 `lib.rs` SHA256 为 `8c28bb5e4f4556d4dd6268ecc77c91a3a4f72ae7ec7a6d1cbd99ba46006599f1`；最终为 `50bb77a8216a102e2b01d8a0ad0b5d69e4ef919e4a82390f10e8d60bc7f87357`。`prepare-results.json` 的有序输入聚合为 `3f2c36fe5e4431969cbd292790266883a2ed8a1ea2e51a224150db5153bae3e8`，算法为按清单顺序拼接 `path + NUL + sha256 + LF` 再SHA256。清单包括最终lib.rs、只读App.tsx、manifest/lock、实际锁定上游源文件与缓存归档。

通过 [prepare-check.py](./prepare-check.py) 记录：

| 实际检查 | 结果与证明范围 |
| --- | --- |
| `rustfmt --check --edition 2021 --config skip_children=true src-tauri/src/lib.rs` | exit0、无输出；只证明该文件可由rustfmt解析且格式通过，不是Rust类型/链接检查 |
| `cargo metadata --offline --locked --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml` | exit0、无stderr；工作区package读取成功，resolve=null，不解析完整依赖图，也不编译或检查菜单API类型 |
| 四个缓存crate与lock、所用源文件与归档对照 | 全部匹配；没有下载依赖 |
| 检查前后输入SHA | 完全相同；`target`、`src-tauri/target`前后均不存在，没有创建构建目录 |
| `git diff --check` | 无输出 |

本阶段没有完整或局部Rust编译、前端构建、链接、应用启动、GUI、设备或产物操作；不触碰主工作目录和其target。没有新增用常量自证的测试。Visual候选保持独立，未合入此分支。

## 后续必验及 unknown

所有runtime结果仍 **unknown/not-run**：正文获焦一次Cmd+W、原生搜索获焦时关闭菜单/快捷键、目标窗口消失与另一窗保留、pending真实保存后重开完整正文、保存失败/冲突保持窗口和未保存内容，以及close事件/flush实际时序。原版“关闭”菜单文字与位置尚未实采，所选中文标题只是当前候选，菜单像素同样unknown。

root待FIX04冻结后合入并正式构建，开发与独立verify应先冻结实际产物身份，再执行上述动作。不能用源码链或metadata通过关闭旧的F13失败，也不能由代码中的既有pending守卫推定真实保存失败/冲突关闭矩阵已经通过。
