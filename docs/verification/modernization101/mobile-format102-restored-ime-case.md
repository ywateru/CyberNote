# FORMAT102：完整 WeType 前提复验中止（2026-11-10）

结论：本次是 **aborted**，不是未复现，更不是修复。准备选区操作后的实际画面已由竖屏切换到横屏桌面布局，文字移出旧坐标；立即停止了所有输入。尚未打开格式面板，因此未执行约145秒等待、面板打开后的长按或手动关闭。原r2格式面板消失失败仍未解释。

本次仅使用已安装v2诊断APK，SHA256 `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178`。没有安装105、构建、修改产品、输入文字、新建笔记、更改格式或系统设置。

实际路径与边界：

- 初始03:46:51Z只读预检为CyberNote列表/搜索上下文，不是用户正在编辑正文；app PID3298、WeType PID13994、当前PID固定tag事件0。
- 正常打开此前自有 `finalAndroidIME` 测试笔记，02截图与UIA确认。单击其标题实际文本范围请求编辑焦点。
- 03截图（04:00:16Z动作后）实际显示完整WeType键盘及候选栏。这一视觉证据成立；紧随输入采样的window可见flag有过渡时差，不能覆盖截图观察。
- 04:05:03Z执行唯一准备选区长按 `input swipe 600 670 600 670 800`，每次输入前仅核CyberNote前台。04即时截图已是2960×1440横屏，own title范围变为 `[1524,560][2820,724]`，旧坐标不再在文字上，因此未建立有效非空预选区证据。03→04间缺少连续orientation记录，无法确定旋转发生在输入前还是期间，也不能将本次变化倒推为原r2原因。
- 04截图仍显示自有笔记，app PID3298、WeType PID13994，固定tag0。无Back、格式按钮、后置hold等后续操作。
- 04:10:23Z最终只读核验前台仍是CyberNote MainActivity、PID3298，display rotation1（横屏）。此时 `pidof com.tencent.wetype` 返回空；没有尝试重启或解释其退出原因。

最终default/enabled IME、accelerometer_rotation=1、user_rotation=0、show_ime_with_hard_keyboard=1均与原记录一致。没有锁屏或改变自动旋转。设备操作已结束；无文字输入，但本次未读取数据库核对内容事务，不能扩大声称数据库逐字未变。

证据：`artifacts/mobile-format102-native-diagnostic-v2/device-restored-ime-case/`。PNG为本地原始现场，04含列表背景，报告不转录其他笔记内容。原始截图保留，不发布为脱敏产品演示。

## 最后一次只读 IME 生命周期采样

04:20:10Z，前台仍CyberNote/PID3298，WeType pidof仍空；系统default/curMethod仍原WeType、haveConnect/boundToMethod=true，showRequested/inputShown=false。仅对最近1500条ActivityManager/AndroidRuntime/lmkd/lowmemorykiller日志做精确WeType行的生命周期类别提取，未找到明确start/died/kill/ANR/fatal类别；不保存原始日志、正文或token。该有限窗口不能证明没有退出，也不能将pidof空推断为崩溃。之后未再操作手机。

## 只读源码边界：窗口宽度被当成平台身份

这是明确的现有**实现规则**，并非文档明确允许的“旋转即导航”产品契约：

1. `src/App.tsx:303` 以 `window.innerWidth < 700 && !separate` 决定initialMobile；`src/App.tsx:991` resize重复同条件并更新mobile。它未使用Android稳定平台身份。
2. `src/App.tsx:711` 将mobile传给session.configure；`src/editor-session/use-editor-session.ts:22` 每次layout effect调用reconcile。
3. `src/editor-session/controller.ts:147` 比较previous.mobile和当前mobile，即使noteId与Editor没变也调用invalidate("navigation")；`controller.ts:295` 随即取消待focus、清除书签、blur/hide并发布formatOpen=false/body=browse。
4. `src/App.tsx:4007` 同一mobile值决定mobile/desktop类及format-open类；手机跨宽度阈值同时改变布局和交互身份。三星横屏2960物理px、density640约740CSSpx（具体window.innerWidth此次未直接采样）；04实际桌面布局与上述阈值路径吻合。

因此，在同一可写笔记上打开format后将视口从699变为700CSSpx，源码必走mobile true→false→navigation invalidate→format关闭的路径。这里描述的是可构造的最小因果边界，**本轮没有运行该测试**。本轮实际只证明orientation/layout变化，因尚未打开format，不能记为102复现，更不能倒推原r2两截图之间确有旋转。

契约判断：`docs/architecture/editor-session.md:29`承诺移动端点击/选字不关闭格式；第35行列出真实导航、屏障、销毁的失效条件，未将同一笔记旋转列为导航。`docs/ui/design-rules.md:11`与第15行要求手机单栏/底栏及独立触控布局。将Android自然横屏自动归为桌面并关闭手机面板，与这些意图存在冲突；当前文档也没有明确手机横屏/平板断点策略，不能仅凭“实现写了invalidate”视为已确认产品需求。

可验证的窄修方向（仅建议，未改产品）：区分稳定平台/交互身份与响应式可用空间。原生Android保持移动交互/44px命中/手机键盘与面板所有权；windowWidth只参与可用空间和面板尺寸。Web响应式布局若仍需断点，不能把纯几何变化直接等同笔记导航；任何需换Editor实例的布局转移要明确保留/迁移同owner书签，而不是删除全部安全门禁。不要只删reconcile中所有失效，真实换笔记/撤权/销毁仍必须关闭且废弃旧焦点。

必要验收：同一Android owner在portrait↔landscape跨699/700且format打开时，面板/非空选区命令目标保留、字号/命中区维持移动规则、无键盘误弹/文档事务；旋回、IME高度变化、分屏宽度变化均不当导航。另保留实际导航/权限失效/Editor销毁关闭及延迟focus防串笔记回归；桌面宽窄窗与Web断点需独立验证。最后以非诊断同源包真实旋转验收；不能把本次中止或源码推演记为设备通过。
