# APP-SYNC89 原生安全应用只读诊断

状态：源码已独审合入，Android19已构建，准确核包与实际分支读取进行中。关联[同步交付状态](../sync-delivery-state.md)、[协调协议](../../architecture/sync-coordinator.md)。用户要求用调试指令/开发工具提高验收效率；本任务提供真实运行分支证据，不改变同步算法或绕过安全应用。

## 已证事实

Android18实际目标已到inbox但未应用（1/0/0/0）；实际probe/prepare/release反复出现且release全部abort。原始回复入口blocked=false、ready=true；原调用的回执入口观察进行中。证据见[原始准备回复](../../verification/sync87-native/native-ready-true15/README.md)。不得仅据此断定具体中止原因。原Android未保存录音不触碰；只用隔离5584、同userdata、同已配对DesktopPeer Store。

## 最小契约

独立本地Tauri `sync_diagnostics(expected)`，复用既有真实窗口/令牌授权。只读Session内存、不得触发activate/flush/prepare/sync_now/重试/apply，不重置计数。普通Status/数据库/UI/网络协议保持原契约。

固定v1返回：version、commits、aborts、latestAbortReason、固定枚举abortReasons计数及可选activePhase(probe/prepare/null)。均为饱和有界计数/有限枚举；无笔记、operation/session/device身份、epoch、令牌、路径、错误原文或时间。进程重启归零，不回溯旧失败。

在原有判断和中止位置附记原因，保持原始分支优先级、错误传播、事件、事务与时序。首次原因不得被后续通用abort覆盖。覆盖授权/参与者/本地屏障/超时、probeBlocked/prepareNotReady、无可应用计划或受保护目标、本地intent、计划变化/过期、元数据准备/应用/媒体准备与授权/事件发出错误，以及externalAbort。精确枚举以同步模块文档/实现保持单一来源，不记录错误message。

## 开发、复核与实际验证

开发与独审分开。仅现有Session同步、adapter、lib注册三个产品文件及必要现有测试；不添加依赖、UI、日志框架或业务fallback。用原有真实同步用例断言行为不变且诊断对应分支；授权失败/read不变、首次原因、饱和与无敏感字段需验证。运行受影响Rust组/Tauri检查，不重复未受影响完整前端矩阵。

Rust变化需准确新Android19诊断包、输入manifest与独立核包后才能读取实际分支。Android18原失败不得追认；原immutable11与绑定桌面Store保留。诊断包通过同隔离设备原userdata升级，不删除/重新配对。实际原因确定后另作最小业务修复与原反例复验；诊断本身不代表同步修复完成。最终需完整双向正文、媒体和重启门槛，见SYNC87。

## 当前实施证据

作者冻结469f0bba经不同代理10f9b50c独审，主线6487689b合入三个Rust文件。Session受影响10项、adapter17项、普通和proof Tauri编译均通过；独审另运行Session10和授权读取1项，原始缺失fixture的编译失败保留。[作者](../../verification/sync89/native-diagnostics-author/README.md)、[独审](../../verification/sync89/native-diagnostics-independent/RESULT.md)。

Android19准确构建源码75deb707（产品字节同6487689b），321输入前后相同，相对18仅上述三个Rust文件，前端与18一致。构建自然0/22.425秒、签名自然0/0.758秒；[准确构建](../../verification/sync89/android-build/README.md)。核包通过前不使用于设备；实际原因和业务修复尚未完成。
