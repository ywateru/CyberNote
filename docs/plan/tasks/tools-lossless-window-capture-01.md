---
id: tools-lossless-window-capture-01
scope: read-only-native-window-pixel-evidence
status: source-ready-runtime-pending
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

2026-11-04作者冻结744a9247a571d7569351e428e50db579b9031187，独审SOURCE-READY，无阻断；独立编译与10+7受控检查通过。root核对4工具源及独审10证据/报告hash一致。未运行真实窗口枚举/取图，未获得像素对比结果。candidate04原构建阶段已结束：Mac成功、Android失败并释放target。本次只增加取证工具，应用产品字节仍与d8f832e相同。
## 开发合同补充

命令仅为 `list --bundle` 与 `capture --bundle --pid --window --executable --expected-identity --output-dir`。list返回白名单目标的实例/可执行文件hash、选窗ID与几何/原生比例及identity token；capture要求调用者原样传入对应token，并前后重新核实例、可执行文件及选窗几何。窗口标题不读取、不输出。精确PID不能单独防PID复用，故token包括launchDate与exe文件身份。公共API未公开窗口创建generation；不能排除同进程同几何的瞬时windowID复用，必须在manifest记录该公开API限制，不能声称已证明无复用。

原生比例用macOS14起filter.contentRect×pointPixelScale，非整数像素、混屏/跨屏、越界或尺寸不一致直接拒绝；使用单窗filter、无光标、请求去阴影、不包含子窗、SDR/BGRA、保留alpha、无音频。API没有无重采样证明，默认manifest固定UNKNOWN；`--require-unscaled`在访问屏幕前明确拒绝严格模式。输出必须是新目录、以独占方式写PNG和最后成功manifest，不覆盖旧证据。list/capture在任何ScreenCaptureKit访问之前检查已有屏幕捕获授权，工具没有权限请求调用。无控制目标、AX、启动应用、shell执行或全屏fallback。

编译由单独Python小脚本用已存在xcrun/swiftc、SDK元数据生成嵌入构建身份，并用新输出目录内的私有module cache编译后清理；与Rust/Gradle/产品源码无关。本轮只运行参数、输出拒绝、受控PNG编码/验证和编译检查，不运行list或capture后端。锁屏、系统隐私UI时序、实际窗口边框/背板与色彩仍需后续授权实测，源码检查不可代替。

## 源码候选01

4工具源聚合 `838726b3629f53135c4da187002f94ab704295cc82b5d4bd541bedcec7130ff3`。Swift6.3.3/SDK26.5/target14.2独立observer与离线测试编译均0错误/0警告；10组离线合成图/参数/PNG/目录/清理与7组CLI帮助/拒绝/仅help进程deadline通过。222产品文件与基线相同。完整编译失败/成功、检查及身份见 [候选01](../../verification/tools-lossless-window-capture-01/source-candidate-01/README.md)，用法见scripts/window-capture.md。进程调用器默认15秒、最大30秒，超时SIGKILL，不使用无法保证取消的TaskGroup；中断输出全部不接受。没有任何真实SCK、权限、GUI或设备运行；公开API限制和实际取图均留UNKNOWN，等待独立源审。

独审见 [报告](../reviews/tools-lossless-window-capture-static-01.md)。报告明确仅help进程deadline验证不是SCK挂起实测；真实窗口、权限主体、原生背板和像素一致均未通过。
