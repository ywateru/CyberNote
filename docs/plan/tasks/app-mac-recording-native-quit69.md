---
id: app-mac-recording-native-quit69
scope: macos-normal-termination-admission
status: in-progress
depends-on: []
---

# objective

补齐普通Dock退出/原生NSApplication terminate入口，禁止绕过既有录音退出保存守卫。与68自定义菜单路径共同构成普通用户退出入口修复；强杀、断电、注销不承诺。本任务不改变录音侧栏布局、保存算法、权限或签名。

# context

- docs/INDEX.md、docs/architecture.md、docs/ui/recording-desktop.md
- docs/plan/tasks/app-mac-recording-sidebar66.md（合同6/7）
- docs/plan/tasks/app-mac-recording-quit68.md
- docs/verification/mac-recording-media67-runtime/README.md（真实K缺卡，不能覆盖）
- 锁定tao0.37.2 delegate只有applicationWillTerminate、runtime-wry2.12.3的ExitRequested/Exit路径

# path

plugins/tauri-plugin-notes-ui/macos下必要普通退出桥文件、src/macos.rs、src/lib.rs与build.rs；新增严格必要的测试/受控runner、docs/verification/mac-recording-native-quit69及设计说明。尽量不改src/App.tsx或src-tauri/src/lib.rs，以免和68菜单路径冲突。禁止新capability/权限/签名/应用标识及Android改动。

# contract

1. 普通原生terminate在异步保存前须取消；将同一意图送入现有AppHandle.exit(0)→ExitRequested→66本地登记/所有文档seal/final/flush/准确ACK，不以WillTerminate异步保存或另建假ACK。native方法不阻塞主线程，不等待JS，不跨ABI抛异常。
2. 仅主线程、实际NSApp.delegate已存在时安装；保留原对象和所有Tao方法。若用class_addMethod，只允许缺失的applicationShouldTerminate:，不得swizzle/替换未知已有实现或更换整个delegate为代理。重复安装精确认同自己方法，未知实现/类/签名/窗口时机不匹配须明确失败；必须保证采集前接点就绪，不能悄悄运行未防护的录音。
3. 若为刷新AppKit可选方法缓存需要delegate nil→原对象，明确保活原对象、验证身份/IMP/方法签名，保留正常生命周期。安装成功不等于真实Dock入口生效，另由root真实验收。
4. 推荐始终NSTerminateCancel，再转现有app.exit；最终tao exit用app.stop/eventloop退出不再terminate，无新增TerminateLater/reply状态机。不因重复请求创建第二套quit确认，不在超时/保存失败后硬退。
5. 保持现有录音开始前native登记、原A归属、失败会话保全/重试及准确取消/过期ACK语义。无录音纯正文退出仅保持既有行为，不将69声称为新增所有正文退出协议；该边界单独记账。
6. 不触原Android13秒现场，不重开旧18；不GUI/采真实音频/导出复制转写。子任务仅源码和受控native对象边界；实际Dock退出由root Computer Use执行。不得用osascript/AppleEvent shell作为GUI替代。

# verification

- 精确锁定native/runtime源码与安装顺序，真实生产插件挂载路径，不只是未接入helper。
- 受控delegate缺失/既有未知方法、重复自身安装、原delegate身份/selector签名/原方法保持、非主线程与回调释放、异常/重复quit边界；不调用真正NSApp terminate，不启动GUI/麦克风。
- 退出callback→实际app.exit请求连接与68现有guard复用证据；不直接手发notes-recording-quit替代入口。
- typecheck/build，原生必要compile/check与独立不同作者review committed精确源；与68冲突/编译slot需协调，禁止同时共用target。
- 根合入后同一准确新Mac21冻结/构建/独核，root真实Dock普通退出时A录制/B编辑→新进程原A录音与B正文恢复。安装hook或手调IMP通过不得代写Dock通过。隐藏/多文档及所有OS入口覆盖不足如实保留，不外推强杀/音质/像素。
