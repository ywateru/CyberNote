# native toolbar 阶段证据

2026-11-03。候选插件尚未接入主应用，无像素通过声明。

- demo-build.txt：真实 Wry 例子构建；desktop-demo 启用 webview-data-url。
- rust-tests.txt：类型/菜单/窗口身份/固定动作权限和真实 Tauri MockRuntime Window 事件目标测试；MockRuntime 测试不证明 AppKit 视觉。
- demo-runtime.txt：真实 AppKit 两窗口绑定（65591、65592，2×）均 glassRegular，无符号回退。可观察 independent newNote/checklist/table、table revision 2；main viewGallery revision 2、back revision 3，以及各窗 active 事件。
- 受控进程 53703 已于本阶段结尾 Ctrl-C，exit130，Mac 释放给安全功能验证。

## 失败与限制

首轮示例缺少 webview-data-url，启动报错后补齐。第二轮实际 bind 因 boxed BOOL 序列化为 integer 1 被 Rust 拒绝并清理；修复为显式 JSON true/false 后以上双窗绑定成功。

cua.getApp 对临时 .app 的一次调用挂起 1762.4 秒后被中断，未取得截图/AX，因此日志里的输入不能证明完整受控菜单/按钮测试通过。搜索、输入法、选区、缩放溢出、关闭重开、旧系统材质、主应用接入与像素差分都 unknown。无截图冒充完成。

临时 .app 为 runtime/ 下的 Info.plist + 指向已构建例子的符号链接（已忽略），没有提交二进制。插件 README 提供启动命令、宿主 inset、typed API、权限、搜索 ack 与生命周期可观测边界。最终源码/二进制摘要在 manifest.json。

## 非 Mac 编译补证（同一代码候选）

已补 aarch64-linux-android `cargo check --locked --offline --lib`，通过；只复用现有 target，无安装SDK/新建target/GUI/设备操作。`android-compile-audit.json` 记录代码均与adc544a逐字节一致、参数校验后unsupported契约、5项无错误的dead-code warning。build-script和.d证实未编译ObjC桥接或发出Apple framework链接；normal dependency树保全供复核。严格guest TypeScript复查通过。Android运行时invoke仍unknown；原始受控GUI/像素/正式集成unknown边界保持。
