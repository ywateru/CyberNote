# 插件格式与画廊静态补审独立证据

2026-11-03。冻结输入 `9f4d61ba5e733339e8ad5e977ba80d2089122208`。范围为 `plugins/tauri-plugin-notes-ui/` 格式 NSPopover、颜色菜单、galleryBrowse 与 build.rs 接入。未编辑产品、未运行 GUI/demo/主应用/设备。结论见 `docs/plan/reviews/app-001-native-toolbar-plugin-03.md`：有限静态通过，未确认接入前 P1/P2；一项 P3 生命周期写法建议；runtime/focus/IME/pixel unknown。

- `inputs.json`：独立计算 13 份输入长度/SHA，并与冻结 git blob 比较；13/13 一致。
- `checks.json`：实际定向命令与退出码。Rust 三个精确用例各通过 1 个，复用 `plugins/tauri-plugin-notes-scan/target`；未重跑全套或 Android。
- `gallery-test.txt`、`format-test.txt`、`identity-test.txt`：独立重跑相关契约用例原始输出，测试定义来自冻结源码，不声称是独立新测试设计。
- `archive-members.txt`、`archive-format-symbols.txt`：本轮 target 中原生静态库成员与格式符号，format.o 及函数定义实际存在。
- `arc-compile.txt`：clang 生成 ARC 中间表示时的输出（成功时为空）。`arc-methods.ll.txt`：只保留新颜色路径与既有路径入口/跟踪附近的 IR 片段，行号为对应方法体内 IR 行号，不能作为 AppKit 实际 target/action 分发生命周期证据。
- `sdk-inputs.json`、`sdk-api-excerpts.txt`：本机 SDK 主来源哈希与相关公开声明片段。未启动 AppKit；仅编译、读取头文件和检查静态库。

`format.m` 的 176×325pt 内容尺寸、36pt 可见面及 browse 无 back 的静态布局语义不等价于像素验收。所有真实焦点、输入法、跟踪循环重入/关闭、选区与视觉结果均 unknown/not-run。
