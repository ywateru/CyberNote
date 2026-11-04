---
task: app-mac-sidebar-preference22
reviewer: verify_app (different from develop_app)
result: pass
scope: production App/bridge and isolated actual Rust Session/Store; native runtime pending
---

本轮独审 **PASS / STOP**，没有发现限定范围内的P1/P2阻断，可进入root准确Mac11包流程。已确认偏好跨进程恢复、窗口close等待与立即CmdQ是分别判断的边界；本结论不保证未确认意图在CmdQ前已落盘，不授真实应用退出或像素通过。

候选提交由root固定为 `6b02fd9d30139ffee63226bb057e9a54bc913e4f`；独审没有读取Git对象。实际产品身份：

| 路径 | SHA256 |
| --- | --- |
| src/App.tsx | 1f33d51d58f52bb01d283d80ceb856d6e6ba6a8c1b99214d1938c922f751fd37 |
| src/types.ts | 0bba2d1b9c0f46388d4a8a7b643e826517faf0e1b4018d947526b737c427a159 |
| src/sidebar-preference.ts | 02efda1c3dd671475fd4c0c229b6aa242c0ec1485253ad2a0371721cb2c4a13d |

作者索引SHA256 `85b943ff1fcb2faad557f1674b3c3a31fb633365b77759507abccee82a506ed1`，73项按索引父目录解析后全核；114项受保护输入在独审前后保持身份。包括20CSS、16/17组件及adapter、未改bridge、生产Rust存储/会话/宿主、工具栏、锁定依赖、测试工具、基线与任务/架构/UI输入。20CSS仍为 `f18dfeb0b6c9d52d66b4d4ad78016bd234c2763b38ae9ba0f09a4b7410881186`。

## Findings

- P1 blocking：无。
- P2 blocking：无。
- P3 nonblocking：没有本轮新增产品问题。立即CmdQ未纳入renderer窗口close guard是任务明确批准的源码限制，须保留准确Mac11后续实际观察；不能据本报告宣称所有退出途径受保护。

## 源码与所有权

独立读取完整helper、实际App修改和types差异，并从现有bridge.action/loadWorkspace追到Session.ordinary及Store.action(settings)。新增请求仅patch `macSidebarVisible`，原Rust按单键合并写Settings JSON，旧设置和未知字段不被替换。未添加localStorage或其他偏好副本。

消费和写入所有权是 `native && macNative && !separate`，不使用响应式mobile推断平台。首次sidebar恢复在可信同步publish已通过hydrate后，仅一次执行；strict boolean，缺失/非法回退内存true，初始加载和失败重试均无默认写。后续hydrate/metadata不恢复sidebar，归档规则未改；本轮不把替换后端设置与重新同步的有限检查扩大为完整导入验收。

四个显式入口统一到changeSidebar，同步requested ref与UI，React updater没有I/O。队列串行并合并等待期间的意图，不在完成回调发布旧UI。直接确认要求accessAccepted、无maintenanceError且返回精确boolean；否则必须通过未改bridge的访问/metadata验收读回精确boolean。抛错、无value、错误类型、访问拒绝、维护错误及相反读回均不能只因Promise resolve而确认，最后意图失败时保留dirty与现有错误。

## 独立受控运行

已读作者实际fixture和Rust transport源码，并核工具字节身份后只读复用 `/private/tmp/notes-sidebar22-target-upq2n6rn/debug/notes-sidebar-preference22`，SHA256 `19624791900fc9ae10bb5d174749949809856e9fec45d27399d655e3b62a21d0`。没有再编译、下载或写其target。该工具引用当前生产Session/Store模块；它代替低层Tauri invoke传输，未替换App/bridge业务函数，不证明正式Tauri IPC/AppKit。

独审派生fixture保留实际App、Editor、完整CSS及工具栏controller/guest，只加入读取状态的observer。一次独立重放 **32个App集成场景通过**，其中27个复现作者场景、5个独立追加边界：

1. accepted返回值与请求相反时仍执行可信读回，不能直接确认。
2. 无value后读回含错误session，真实bridge拒绝；布局保留、dirty存在，关闭重试确认后才destroy。
3. 请求被拒绝且可信读回为相反值，保留dirty；关闭期间再拒绝仍不destroy，下一次成功后确认最终hidden。
4. 旧响应延迟期间三次显隐意图合并，写入串行，最终false落盘且界面不回滚。
5. Mac主窗缩到390宽时仍属Mac偏好owner；resize本身零写，显式菜单动作保存false，恢复桌面宽后仍hidden。

原27场景覆盖首次missing/false/true及多种非法类型、加载前零写、首次enabled原生toolbar状态与DOM一致、初读失败重试、四入口、快速旧/新完成与拒绝、无value/未接受/maintenanceError、失败close和关闭期间新意图、真实Editor正文保存拒绝、再次同步、Android/iOS/独立窗隔离，以及false/true各自以新Rust PID/new Session/new Store和新App恢复。新进程两例均无启动偏好写，并保留theme、宽度、selection及未知嵌套键。

另复跑 **4个生产helper端口场景通过**，只改输出目录：value与maintenanceError同时存在、value未接受、非法读回类型及准确accepted快速确认。这是32个真实App场景的补充。一次 `pnpm typecheck` exit0。独立日志有162条真实Rust请求/回包，全部合成库位于本独审目录；34个worker正常exit0且stderr空，浏览器无页面错误/外部请求。

`independent-audit.json`另外核47项：场景/错误/worker、37处实际App单boolean键patch观察、两个new PID恢复、关闭保护顺序及原生命周期代码保持。正文flush、recordingLifecycle和ocrLifecycle代码块与封存App基线相同；close仍同步调用OCR/录音close后首次等待，再处理偏好/正文，最后检查pendingDocs及两媒体active后destroy。真实Editor拒绝保存时仍保留合成正文且禁止destroy。没有创建、识别或导出真实媒体，静态保留不能替代新增媒体运行验收。

## 退出边界与未覆盖项

已核锁定muda0.20.0源码：CloseWindow为performClose:，Quit为terminate:；Tao applicationWillTerminate调用AppState::exit，当前宿主使用预定义quit和Builder.run，无本轮新增退出握手。源码只支持“窗口close等待”，不能据此推导立即CmdQ也进入相同链路。此为任务明确批准的范围决定，非本轮拒绝条件。

root准确Mac11后续必须分列：确认false/true后的正常新进程恢复、最后点击后立即CmdQ的实际结果。若立即退出丢失，保持该场景partial并提出最小后续修复，不能用长等待混成全部正常退出通过。动态原生菜单文字、真实工具栏恢复按钮及实际exe/PID亦待准确包验证。异常退出、多主窗同步、完整归档/媒体矩阵及全部侧栏像素一致均未授通过。

## 证据、失败保留与停止

作者browser-attempt01原fixture失败及其原脚本、歧义名称说明均原样保留并纳入受保护输入；本轮有效重放和端口重跑均一次通过，没有产品修复循环。没有改作者证据、产品、Git、可见应用或用户数据库，没有正式平台构建、ADB、下载或音频导出。独审自有Vite缓存保留并排除索引，没有清理共享缓存。浏览器、HTTP/Vite和全部Rust进程已完成关闭。

独立目录 `docs/verification/mac-sidebar-preference22-independent/` 中的README、result、protected-inputs、input-identity-final、replay-attempt01原始数据/请求/结果、independent-audit、端口结果与typecheck构成本报告依据。证据索引路径从仓库根解析，不含自身和自有vite-cache。

独审 **STOP**；root可继续准确Mac11冻结、构建及后续独立核包/真实运行，保持上述边界。
