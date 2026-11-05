# Task55 独立工程审查：SOURCE-READY

准确固定源c518aa7d9748a2dda59c51e225d3b26ac04c1b20（8ccc934→50225bc检查适配→6c3a5d0检查适配→c518aa7 native toolbar留白）。隔离工作树 /private/tmp/apple-notes-recording-presentation55-independent-01；相对86de89d共11项允许变更输入，测试前后均与固定源逐字节相同。未读取可变作者源，未修改产品、下载依赖、运行GUI/真实麦克风/TCC或读取用户数据库。只用现有隔离浏览器和自己的既有Rust target。

## 源审结论

- 新RecordingView仅投影真实状态与发送typed action；RecordingDock订阅原RecordingOwner，不创建Session、流、MediaRecorder、Audio、blob URL或文件副本。原child始终挂载同一Panel/Session，预览Audio保持；原owner与附件operation/原A保存链不转移。手机继续同一View的sheet分支。
- Dock是实际布局中的.app兄弟，占280px，定位限于自身；没有覆盖主窗的backdrop/inert或阻止编辑的路径。native reservedTop传给Dock背景与错误位置，组件DOM断言44px。主界面的原Quit冻结仍只用于显式Quit，普通录音/呈现切换未新增正文锁。
- float→dock先确认原owner show、同会话最新sequence的真实Dock layout ACK，再hide child；dock→float先show child成功才撤Dock。串行代次淘汰旧等待/ACK，失败保留原可操作呈现并报告。主窗close调用真实ensureFloating后才hide，失败取消close；不是close/destroy采集。原Quit等待真实原A ACK、child销毁与参与者屏障继续存在。
- Rust visibility命令只接受实际原owner/同session+operation且存活child，目的只限固定owner显示或固定child显示/隐藏；不授任意窗口隐藏，不广播或移交operation。owner非正常销毁会恢复child可见并通知失败。只加desktop条件的unminimize；移动编译路径不调用桌面方法。
- 状态只接受递增合法sequence、有限时间/位置/范围、≤1800单调真实样本、有限峰值；seek同时检查真实可定位范围，child再次按真实controller检查。实际位置由媒体事件确认，状态按100ms节流；不传音频副本。

## 独立执行结果

1. 原固定scripts/check-recording-presentation55.mjs前7项通过，第8项capture startError阶段等待投影超时。errors/external均空，完整首失败保存components-first。原因是夹具拦截100ms setInterval，而phase等待不再推进受控时钟；只在独立副本phase polling补platform.advance(0)，全部原8项断言不变通过（components-clock-adapted）。准备权限中、录制与暂停试听反复切换，starts/requests=1，Audio保持1；真实seeked前position不前跳，完成只解码/提交一次且等正文ACK；失效身份/旧状态/非法消息、seek/sample、失败可见性/过期ACK等均覆盖。此为夹具时钟适配，不是产品修复。
2. 另挂载真实App浏览器预览、生产Dock/Window/Panel/Session/Owner，实际点击与输入验证：录制中编辑A，搜索B，切B编辑并使用格式菜单加粗，新建并编辑C，继续float/dock。最终真实预览存储分别保留A/B/C内容与B bold；starts=1/requests=1/pauses=0/stops=0/trackStops=0，App840px+Dock280px且不重叠，编辑器命中测试落在App。actual-app-final保留JSON和截图。App/Dock通过测试宿主portal放入真实.recording-layout；App的浏览器预览本身不持该native录音ticket，故此项证明真实主功能/布局和同child不中断，不冒充完整原生同owner保存集成。原A保存边界由下一项独立验证。
3. 固定实际App闭包/真实SaveQueue/PM/原owner保存回归38 PASS，包含原A新文字及Undo/Redo/B导航、原A映射一次插入且不抢B、close恢复float与失败保留、真正原正文ACK和Quit等待。固定实际组件/PM/Panel/Session与手机回归12 PASS（interactions-mobile-final），包含live card装饰不改JSON/history、试听/定位、关闭保存与迟到资源。
4. pnpm build PASS（保留现有chunk大小提示），locked/offline独立target Rust recording_window5 PASS，包括新visibility固定对身份限制。没有重复无关历史矩阵。

## 保留的自建夹具失败与修订

actual-app-first最初使用同样未推进投影时钟的等待；随后clock-adapted明确显示麦克风预检拒绝：App被设为browser但child夹具仍设置TAURI flag，平台身份不一致。保持实际生产模块不变，仅移除夹具TAURI flag以使用一致隔离browser模式。browser-boundary轮已完成录制/A编辑/搜索/格式，但测试错误地再次点击格式按钮，重开App原菜单，普通menu-scrim拦住新建；不是Dock阻挡。最后副本按真实用户流程关闭菜单、明确等选中B后编辑，并新增A/B各自id内容断言，全部通过。以上每轮脚本、原始stderr/failure与可用截图均保留，不覆盖初次证据，不计产品阻塞。

## 证据边界

所有浏览器串行执行，最终结果pageErrors/external均空；人工查看实际App录制Dock、确认预览位置与手机sheet截图，无本夹具重叠。没有作Notes像素一致结论。真实原生浮窗与隐藏child后台采集、跨WebKit用户手势播放、设备编码/有声、手机实包与原图像素仍由root准确包验收。root正在单独调查的Mac15长录音持久附件格式/时长问题未扩大到本轮55工程范围；本结论不能代替该实际媒体结果。

当前没有剩余Task55工程阻塞，允许主线整合准确源后继续双端实包验收。
