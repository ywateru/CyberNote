# CUA 原生应用激活能力：文档层核对

2026-11-04，独立验证代理。本次唯一 CUA 调用是 `await cua.rewriteDocumentation()`，0.2835s 返回完整说明；没有读取应用现场、没有绑定 Dock、没有点击/键盘/paste、没有修改正文。旧基线 frozen 目录未改变。

结论：公开文档没有按路径/进程可靠激活应用的专门接口。现有通用点击与按键可用于一次有界能力验证，但不能仅从文档宣称“已获得一个保证成功的激活序列”。在确认正确进程实际接收键盘输入之前，候选新包不应进行文本或附件/录音流程输入。

## 明确提供的能力

- `cua.getApp(target)`：Mac target 为名称、路径或 bundle identifier。文档明确：`launches the app in the background if needed`。取得绑定与 AX 不等于 foreground/activate/unhide。
- `App.click(target: number | Vec2, options?)`。文档明确 AX actions 失败时，支持 native coordinate input 的应用可使用截图与坐标。`Vec2` 的 macOS 坐标原点/单位换算没有在本次公开说明中具体定义，因此不能把旧拖动的猜测坐标当作已校准转换。
- `App.pressKey(key, options?: {durationMs})` 支持按键、modifier/navigation 与 xdotool-style 组合；例子包含 `Tab`、`super+c`、`Up`。据该通用签名，`super+Tab` 是可表达的键盘组合，但 **Mac 应用切换器的精确目标选择、modifier 持续保持及跨调用释放语义没有专门保证**。
- `getAXState/getScreenshot/getAXStateAndScreenshot` 可观察目标应用，每个动作之后须取 fresh AX 才决定下一步。
- 仅当 fresh AX 真的列出 Secondary Action 时，才可 `performSecondaryAction`；`Raise` 本身不能当作激活保证。

## 没有公开提供的能力

没有 `app.activate()`、`unhide()`、`setFrontmost()`、按 PID 指定前台、单独 `keyDown/keyUp/holdKey/releaseKey`，也没有公开的 Mac 全桌面/应用切换器专门 snapshot 或选择 API。`cua.computer.launch_app?` 签名没有“激活”保证，且可选能力不应猜测平台可用性。不可通过读取私有对象、其他注入技术或猜方法弥补这些缺口。

因此 Dock 再绑定与同名图标盲点不在方案中；也不应循环 Cmd-Tab 直到“看起来成功”。

## 新包复验可用的有界方案（尚未执行）

1. 用明确新包路径建立 CUA 绑定，核 manifest、实际 PID 和主窗口；读取 fresh AX/截图。只读核主窗口 onscreen、key/main 与 NSWorkspace frontmost PID/bundle，并记录 firstResponder/搜索焦点。不要把“原生 app.active”单项与前台等价。
2. 若 frontmost 与新包 PID 已一致，无需额外切换。若不一致，可选择 **一次** 非内容的通用输入能力验证，执行前先确认它的坐标/目标可明确：
   - 候选 A：在截图明确识别、坐标体系已确定的窗口安全 chrome 上坐标点击一次。其目的仅为激活，不能点正文、会新建内容的按钮或未知区域。当前文档没有解决坐标体系校准，因此在未获得清晰坐标依据时不能盲点。
   - 候选 B：`await app.pressKey('super+Tab')` 一次，再 fresh AX 与只读 frontmost PID 核对。这是文档允许的通用按键尝试；它可能切到原版或其他应用，不能按名称相同即判为新包，也不承诺能选中目标。没有副作用内容输入，不循环尝试。
3. 只有 **frontmost PID=新包 PID，主窗口 onscreen/key 状态一致，fresh AX确认正确搜索字段可用** 时，才显式点击搜索；动作后再次 fresh AX 核字段焦点与字段当前值，再进行固定查询的一次输入及结果检查。若原生前台指标出现不一致，停止并保留 UNKNOWN。
4. 若第2步后仍为 Codex或另一PID，停止自动激活尝试，记录工具能力限制并交root决定下一步。不能用 DOM focus()/强制evaluate、AppleScript、CGEvent、其他native输入来令验收“通过”。后续若用户亲自激活目标，再独立核前台状态才继续。

这是有界、合规、可证伪的候选步骤，**不是已验证激活成功**。先前 baseline 只说明 AX click/Raise、app.active/key 与全局前台指标可能不一致，未证明失败原因，更不能单独证明所有输入都送往 Codex。
