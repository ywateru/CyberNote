# 平台适配

`layout.ts` 集中决定稳定平台身份与窗口宽度对应的交互布局，App初始导航/恢复与resize共用同一个resolver；原生Android主窗口保留移动交互，Mac/Web断点及独立窗口排除沿用原规则。

App 创建一次 NativePlatform。它拥有唯一 NativeToolbar、bindingInfo/searchAck 投影状态、原生 Editor 身份编号，以及原 intent 使用的 owner/version WeakMap。根注册真实 Editor 与文档变化时写入相同映射，访问撤销仍失效同一 toolbar；没有第二份 Editor、授权或录音 owner。

创建链：hook mount → App configure target/projection/actions → layout reconcile 创建/更新 NativeToolbar → 既有 transport 收发原生 intent。模块只迁移所有权，NativeToolbar 原 revision/window/binding 检查不变；执行再核验原 NativeContext 的 scope、AccessStamp、确切 Editor、文档版本和书签，恢复该请求选区后调用共用编辑命令。同步取消后仍保留原 captured context，不能借当前 Editor 执行旧意图。不可用的原生搜索明确报错；Web 搜索通过本模块 DOM adapter 聚焦。

`useSystemEvents` 创建一套 visibility/online/键盘/edit-drawing 与原生窗口、系统菜单、Android Back 订阅。每次事件读取当前 typed ports；Web/非 Mac 旧系统菜单与 Mac captured menu 路由在此分流。dispose 先标记失效，再撤销 listener；延迟注册完成时立即释放，不执行晚事件。NativePlatform dispose 停止并释放唯一 toolbar。输入法实际焦点与延迟取消仍由已验收 EditorSession 平台适配器负责。

根保留保存/退出/跨窗口录音协议的业务控制器：平台只订阅 closeRequested，把事件交给原 handleCloseRequested；原 recording-protocol 的业务握手与访问/保存控制器仍同归根，不另起竞争状态机。recording/OCR owner 的 detach 仍调用原 lifecycle。

MODULES98 回归：native-toolbar、TABLE95 真实 App Web/原生意图、note-move-menu、SESSION96/browser/menu-back、recording 组、drawing、mobile-editor、attachment-files，以及 pnpm build；日志 `artifacts/modules98-platform-*` / `artifacts/modules98-build.log`。Chrome 原生 transport/IME 为受控 fixture，不能替代 Mac AppKit 第一响应者、Android 实体 IME 或触摸板实体 pinch；触屏/触摸板自动化通过，实体项目归 FINAL101。
