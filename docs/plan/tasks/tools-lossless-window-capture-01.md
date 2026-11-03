---
id: tools-lossless-window-capture-01
scope: read-only-native-window-pixel-evidence
status: in-progress
depends-on: [app-001-search-zero-geometry-01]
---

## objective

为用户明确要求的原版/克隆逐像素对比提供真实PNG、原生背板比例的只读窗口取图工具。CUA仍负责全部点击、输入和窗口操作；本工具只观察用户已授权的原版com.apple.Notes与克隆com.local.notesclone，不启动、聚焦、激活、缩放、移动或写入任一目标。用户已授权运行原版并作UI对比，REA静态路线调查说明既有observe_native_ui的PNG编码可验证，但其width/height依据逻辑bounds且不乘backing scale，不能直接当2×原始截图。

## path and contract

独立工作树先实现一个小型、无依赖的macOS Swift/ScreenCaptureKit命令行证据工具及说明，源文件放scripts，输出独立临时目录；不得改App/插件/依赖/锁/产品配置。只用本机已存在的SDK/Swift，禁止安装或下载。先核官方API文档与本机声明，不能发明选项或用JPEG转PNG假称恢复无损。

工具只接受上述两个bundle ID；list只返回其PID、窗口ID、逻辑几何、屏幕/比例等必要元数据，不枚举无关应用窗口标题。capture必须同时指定精确PID、窗口ID、目标可执行路径和新输出目录，校验同一运行实例/可执行身份；拒绝目标变化、窗口消失、同ID复用或越界。只捕获选定窗口，不全屏回退，不读原版数据库/正文文件。无窗口、锁屏或权限不足明确失败，不弹新权限请求、不改系统设置、不绕过权限，不自动重试。

取图基于已授权的ScreenCaptureKit桌面独立窗口filter，按其真实contentRect与pointPixelScale（或有明确来源的等价原生信息）选择输出宽高；记录请求几何、原生比例、实际图像尺寸、色彩/alpha/阴影或窗口边框包含范围。若API返回或平台条件不足以证明无缩放原始背板图，必须标UNKNOWN或拒绝严格模式，不能据2×文件尺寸自行宣称无重采样。PNG编码后核文件签名/IHDR/字节数/hash；不得后处理缩放。仅写新目录，不覆盖旧证据。运行期间不采音/摄像、不联网。

输出manifest保存工具/源与SDK身份、精确参数、目标身份、时间、几何/比例/像素、原始PNG身份、显式限制。源路径和调用参数在不同电脑可变，不硬编码测试PID/窗口ID。纯取图功能不能接收AX动作或任意shell命令。

## verification and scheduling

本轮只允许源码实现、已有编译器的单独临时输出编译、参数/拒绝/PNG校验等有意义的受控检查。不访问任何真实窗口/运行取图或list，不触GUI、权限、共享Rust target/Gradle cache或设备。测试不镜像常量，至少验证非法bundle/参数/已有输出拒绝及错误不会留下成功manifest。源码冻结后由独立review确认只读边界与真实API/采样声明，再在解锁且原版与克隆几何匹配时安排实测。

candidate04构建尚在主树进行，本任务必须与主源码和冻结分离。不得将工具完成称为像素一致或已取得原始背板图。若所需API在本机SDK不存在或不能保证取图契约，提供最小可证实限制，不扩大为系统权限/屏幕设置改造。

## 当前交接

2026-11-04作者已报告既有SDK编译与受控离线PNG/拒绝检查通过，仍待冻结SHA和独立审查。未授权真实窗口枚举/取图，未获得像素对比结果。candidate04主树构建阶段已结束：Mac成功、Android失败并释放target。工具继续独立工作树，不改变该候选产品输入。
