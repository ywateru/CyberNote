# 普通原生退出桥接69

范围：macOS 普通 Dock/AppleEvent/NSApplication terminate 的退出意图；承接任务68菜单和⌘Q进入既有录音退出协议。不新增纯正文退出协议，不承诺强杀、断电或注销行为。源码与受控对象通过不能代写真实 Dock 通过。

## 生产路径与所有权

`notes-ui::init().setup` → `macos::install_termination` → `notes_ui_termination_install`。Tauri2.12.5在创建runtime后初始化插件；tao0.37.2已经创建并设置`TaoAppDelegateParent`，本插件不创建NSApplication，不更换delegate对象。setup同步失败会终止插件初始化；录音授权的主线程入口及授权结果交付前再次验证同一安装，未防护不开始新采集。

原生方法使用SDK的`NSApplicationTerminateReply` ABI，始终返回`NSTerminateCancel`。匹配的主线程调用转到Rust `termination_request` → **实际** `AppHandle.exit(0)` → runtime-wry2.12.3的`RequestExit` →既有`RunEvent::ExitRequested`。不阻塞、不等待JS、不调用`replyToApplicationShouldTerminate`，不创建第二套保存/确认。

既有66守卫仍负责local/legacy登记、全部文档seal、原A final、正文flush及准确ACK。重复排队请求由既有quit状态先prevent后合并。最终Tao按ControlFlow退出并`app.stop`，不再调用`terminate:`，因此native hook不需要放行标志。

## 安装约束

- 仅主线程；NSApp与delegate必须已存在。实际类必须精确为锁定Tao的`TaoAppDelegateParent`，且直接父类为NSResponder。未知类不改动。
- 仅向缺失的`applicationShouldTerminate:`添加方法。任何既有未知IMP/签名拒绝，不swizzle、不覆盖。重复安装只接受同应用、同delegate、同类、同IMP/签名、同context与回调。
- 通过strong局部变量保活原delegate，在主线程执行nil→同一对象刷新AppKit可选selector登记，再复核身份/方法。异常尽力恢复同一原对象并明确失败；不使用代理或改动Tao其他方法。
- 每次安装调用转移一个独立的context引用（Rust Arc::into_raw）；成功时native保留，失败或精确重复时释放本次引用。回调期间先保留native context，允许回调触发清理仍不悬空。Rust请求/释放均catch_unwind；Objective-C API/callback异常不越过ABI。
- RunEvent::Exit清理native context；插件drop也派发主线程清理。ObjC已加方法无法删除，清理后保留Cancel行为，不能退回不受保护的native终止。未安装或身份变化时新的录音授权明确失败。

## 原生状态

| 状态 | 含义 |
|---|---|
| 0 | 安装/身份就绪 |
| 1 | 非主线程 |
| 2 | 应用或delegate不存在 |
| 3 | 未知delegate类或继承关系 |
| 4 | 已有未知退出方法/签名 |
| 5 | 原生异常或delegate刷新异常 |
| 6 | 没有本插件持有的有效context |
| 7 | 应用、delegate、IMP、ABI或context身份不匹配 |
| 8 | 缺失callback/context参数 |

所有非0及未知状态均映射为`termination_guard`错误。安装API要求有效release函数；它缺失时不能接管未知指针的释放责任。

## 验证边界

受控native runner直接编译生产termination.m，只替换NSApp查找为无GUI Foundation host，并模拟delegate selector能力缓存。每组独立进程，覆盖安装/缓存刷新/strong保活/原方法、缺失/未知类与方法/错误签名、精确重复/冲突、非主线程、回调异常/重入/失败/释放及身份篡改。不会创建NSApplication、真正调用terminate、启动窗口或请求音频。

Rust测试使用真实Tauri MockRuntime、禁用默认Mac菜单且无窗口；真实插件setup在非主线程拒绝未防护运行。生产ABI请求函数调用真实AppHandle.exit：锁定MockRuntime::request_exit为unimplemented，测试断言其panic被转换为失败且Arc准确释放。该项证明真实API调用与异常边界，**不等价于成功派发Wry退出事件**。

准确新包必须由root Computer Use实际验证Dock退出时A录音/B编辑、失败保全与重开持久结果；菜单/⌘Q按68独立覆盖。隐藏、多窗、AppleEvent等实际覆盖不足须逐项保留，不用受控调用替代。
