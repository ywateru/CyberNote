---
id: app-001-native-toolbar-plugin-03
task: app-001-fix-02
baseline: 9f4d61ba5e733339e8ad5e977ba80d2089122208
result: limited-static-pass-runtime-unknown
date: 2026-11-03
---

# 格式弹层与画廊浏览插件独立静态补审 03

**本次有限静态补审通过，未确认接入前 P1/P2 阻塞。** 此结论只覆盖冻结插件 `9f4d61b` 的格式 NSPopover、颜色菜单、galleryBrowse 与构建接入，不构成主应用接入、交互或像素验收。没有操作 GUI、设备、demo 或主应用，也没有修改产品源码。独立证据位于 `docs/verification/qa-native-toolbar-plugin-03/`。

## 范围与证据

开发入口为 `plugins/tauri-plugin-notes-ui/verification/format-gallery/README.md`。独立读取其 13 份输入，重新计算长度与 SHA-256，再与冻结提交逐字节比较，13/13 一致。复用了已有 scan target，精确重跑三个相关 Rust 契约用例，各 1 通过、9 过滤；未重跑完整测试、Android 或主应用构建。另以本机 clang 生成两个菜单处理方法的 ARC 中间表示，未运行其 AppKit 代码。已有本次测试所用原生静态库包含 toolbar.o、format.o，以及 `notesUIFormatPopover/Entries/Color/Swatch` 的定义，证明新增翻译单元实际进入插件原生库。

| 静态边界 | 复核结果及位置（插件内路径） |
| --- | --- |
| 窗口、绑定与版本 | `src/lib.rs:55` 的 permits_event 精确匹配 label、UUID、revision 再核当前 state.permits；`src/macos.rs:30` C 回调还核 Callback 所属 label/UUID，按对应 Window 投递。`src/macos.rs:196` update 校验严格递增 revision，unbind 先移除绑定再销毁原生对象。新格式路径复用此链，没有任意 selector/执行 IPC。 |
| 格式白名单与禁用 | `src/model.rs:197` owner 必须对应唯一动作；格式 owner 递归限制为固定格式命令；permits 同时核 owner 与命令 enabled。`macos/toolbar.m:377` 当前弹层按钮还核 disposed、root 所属 NSWindow、shown、当前 contentView 后代、创建 revision 和 enabled。颜色项在 `:426` 核 activeMenu 身份、创建 revision、窗口及当前动作/条目 enabled。 |
| 更新、关闭与晚回调 | `macos/toolbar.m:207` apply 在 suppress 下关闭弹层、取消 activeMenu 与既有菜单后替换状态；旧按钮不能通过当前后代/revision 检查，旧颜色项不能通过版本检查。`:459` dispose 先置 disposed/suppress，关闭弹层、取消菜单、移除观察者/原生视图、清空主按钮 target/search delegate，并使回调 context 仅释放一次；send 首先拒绝 disposed/suppress。异步溢出格式入口捕获 revision、弱引用 controller，执行时再核版本，showFormatPopover 再核窗口归属和启用状态。实际关闭期间 AppKit 的回调顺序与对象存活尚未运行验证，见下方 P3。 |
| activeMenu | 色菜单同步 popUp 前保存当前 menu，返回后清空；菜单项要求 item.menu 与此属性相同。apply 会 cancelTracking，dispose 还清空属性。没有把先前颜色项仅凭 command 转成当前事件的可见路径；嵌套跟踪循环仍需真实关闭/更新场景验证。 |
| galleryBrowse | `src/model.rs:178` 只允许 newFolder/toggleSidebar/viewOptions/newNote，显式拒绝 backToGallery 与编辑动作。`macos/toolbar.m:267` 区分 browse/expanded；只有 expanded 且提供 back 才占返回位置，browse 不保留该位置；title/count 与 browse 按实际内容宽度参与布局。对应定向用例通过。 |
| 构建与公开 API | `build.rs:5` 同一 cc 构建包含 toolbar.m 与 format.m，头文件/两份实现均声明 rerun-if-changed，保持 ARC、blocks 与 AppKit/Foundation/QuartzCore。SDK 公开头文件确认 NSControl/NSMenuItem target 为 weak，NSPopover transient 对菜单交互的说明、contentSize 与定位 API，NSMenu popUp/cancelTracking API。未增加私有 API。 |

## 非阻塞建议

**P3（非阻塞）：统一颜色菜单的 controller 保活写法。** `macos/toolbar.m:397` 在同步 popUp 返回后直接访问 self；同文件 `:409`、`:415` 的既有菜单路径先建 `NotesUIController *strong=self`，再跨越跟踪调用使用 strong。独立 clang ARC 输出确认新方法没有对应 self 的局部 retain，SDK 又把按钮和菜单项 target 声明为 weak。建议在后续实现中统一现有保活模式，并按同一 menu 身份清理 activeMenu，以使局部生命周期意图明确。

这不是已复现的释放后访问：实际 AppKit target/action 分发可能已经在调用期间持有目标，本次没有运行或反汇编该实现，也没有证据证明公开分发必定会在嵌套循环期间释放最后一个目标引用。因此不能仅凭上述代码差异登记 P1/P2 或宣称发生崩溃。运行验证应覆盖颜色菜单打开时宿主 unbind、窗口关闭、状态 update，以及跟踪退出后的旧项回调；结果目前 unknown。

## 几何与运行结论边界

研究基线 `649c24e` 的原图是 2176×1320px、2×；36pt 是工具可见面高度，176×325pt 是格式弹层可见主体候选，不含箭头/阴影。`macos/format.m:60` 明确将它作为近似起点；`:111` 最终高度随实际提供的行变化，`:113` 设置的是公开 NSPopover contentSize。SDK 定义该属性为内容尺寸，不能据此推出原版外框、材质、圆角、箭头、阴影、文字光栅或点击区域已经一致。52pt 顶部预留也没有被本次证明为原版 NSToolbar frame。

新几何继续只是校准起点。主窗/独立窗、宽窄窗口与 resize、点击/禁用/selected 可见态、菜单键盘操作、颜色菜单、关闭/重开/销毁、首响应者/焦点、中文 IME、正文选区、Undo/Redo、同焦点 RGB 差分与 pixel pass 全部 **unknown / not-run**。本报告不把开发者日志当独立运行通过，不将“有限静态通过”升级为 FIX02 完成。
