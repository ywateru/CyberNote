# FIX05 关闭崩溃修复：独立有限静态及开发证据复核

日期：2026-11-03。结论：**5874eab 的最小候选通过本轮有限静态复核，开发三个真实关闭自测有对应证据；独立实际关闭验收仍待交接。** 没有发现本轮八行差异中的新确定 P1/P2/P3。此前关闭失败门槛不凭本报告关闭；保存中、失败/冲突、真实 marked IME 和冷重开均未在本轮运行。本轮无构建、GUI 或 Android 操作，没有复查整个插件。

## Findings 与门槛

| 项目 | 严重程度 | 门槛 | 设计、实现与结论 |
| --- | --- | --- | --- |
| 继承：实际窗口关闭失败 | P2（既有 FIX02-01 关闭门槛） | 独立实际复验前保持 blocking | `docs/requirements.md` F13/F15、`app-001-fix-05.md` 要求实际关闭正确并保留保存守卫。后续开发基线 b6bb…真实 Cmd+W 导致全进程退出，直接 stderr 堆栈支持原生激活通知同步重入 Tauri 窗口表的机制。冻结 `5874eab:plugins/tauri-plugin-notes-ui/macos/toolbar.m:220–226` 延后该回调；开发候选 ec1cf…的三条实际关闭路径记录正常，但尚非本轮独立运行。不能以静态通过或空 stderr 代替独立验收，也不能将先前 34223af 中 Cmd+W 留窗失败的唯一原因倒推为本次 panic。 |

本轮允许该最小候选进入独立运行复验。顶部像素仍未通过，搜索框已知视觉缺陷由单独任务处理，不由窗口生命周期修复覆盖。

## 冻结身份及证据来源

生产差异只读 `git show 5874eab`，未读取正在修改的 toolbar 工作区字节。提交 `5874eab50c711762338e084095fca8f416774d18` 相对其父提交的生产变化仅 toolbar.m 一处八行差异（六增两删）；App/Editor/存储/授权/File 菜单无变化。旧包和候选的98条输入清单逐项相互比较，也仅 toolbar.m 哈希不同：旧 `cca1fee0c1ef2c412372e6fe8395098332d448bb49eeb761b581cc1d43b479b1` → 新 `a7e6a2bd7f0f7613b3a5be738691d90c4c01feac7eafa2e39dc8cc652008f506`。

独立逐项核对候选清单98条：87条从冻结 git5874eab 读取，11条为本地未跟踪 Android 生成文件，磁盘字节匹配；有序聚合 `c61cc385eadf031630d1538930d6b33b9a4c4d3d56bc687503fb45bab98bd770` 匹配。清单包含插件以往验证记录，不把98条都称为纯生产源码或全部 git 文件；清单 head 字段为构建时 edc6eed，文件级哈希包含当时未提交的本次 toolbar 变化，现已与冻结5874eab逐项对应。不声称完整 HEAD 可重现二进制。

| 保留完整包 | 独立读取可执行文件 |
| --- | --- |
| `/private/tmp/notes-visual-close-b6bb05d.app` | 15,533,984B；SHA256 `b6bb05d539096f5e2b874e975738cfd9cab9e3047be813bdb794352f48d27af2`，匹配开发失败包身份。 |
| `/private/tmp/notes-close-deferred-ec1cf0d.app` | 15,534,336B；SHA256 `ec1cf0d829b03f4b234d982c3d28af22ba401cf1549d47e6cba2baf7f4efb61e`，匹配候选 build-identity.json。 |

`5874eab` 保存源码、两份输入清单/身份、失败说明和候选 selfcheck；`ed25d61` 补入实际构建日志及候选 AX/PNG/空 stderr；`1ab4e50` 将大段系统日志收束为目标进程退出摘录和原日志身份，并保存直接 panic stderr.txt。证据审查按这些冻结 git 对象读取，不把之后工作区变化当作该包输入。未重新构建或启动两个保留应用。

## 真实 panic 证据与修复机制

失败说明 `runtime-8ecb50a/close-failure.md` 区分两个实际事件：首次单次 Cmd+W 后 PID89891 消失，系统目标进程摘录仅证明 launchd status25856（20:15:58.749 +0800），不能单独当作 panic 证明；随后相同 b6bb…可执行文件以 RUST_BACKTRACE=1 启动，实际 Cmd+W 复现返回 exit101，采到直接 stderr。`1ab4e50:runtime-8ecb50a/cmdw-reproduction.stderr.txt` 的第一条为 tauri-runtime-wry2.12.3 `lib.rs:3643:38` 的 `RefCell already mutably borrowed`，随后为 webview manager poisoned panic。

第一条堆栈包含 `on_window_close` → Tao close_async → AppKit/未知帧 → `NotesUIController build` block → `send:` → Rust macos::event → Tauri emit_js → Webview.eval → handle_user_message。独立读取本地锁定 runtime2.12.3 对应源码：`:4383` 在窗口表 `borrow_mut()` 中置 `inner=None`，`:3643` 的 WebviewMessage 路径再次 `windows.0.borrow()`。结合冻结旧工具栏同步调用 send 的位置，这直接支持**此复现周期中**移除窗口时同步通知重入同一运行时窗口表；未知 AppKit 帧的精确通知名称未由堆栈符号逐个给出，不扩展为所有关闭失败的唯一原因。第二次 poisoned panic 是后续现象，不取代第一条借用冲突。

候选在 `toolbar.m:220–226` 仅把 BecomeKey/ResignKey 的 send 移到 `dispatch_async(dispatch_get_main_queue(), …)`：通知发生时按名称捕获 active，排队 block 持有弱 controller，执行时升级 strong 并检查 `!disposed`。它不在异步执行时重新读已变化的 window.keyWindow，也不强持有旧 controller。发送因此离开当前同步通知调用栈；不将此静态安排提升为所有嵌套事件循环时序的形式化保证。

`:228–229` 的 WillClose 仍 dispose 并移除绑定；`:528–538` dispose 先置 disposed/suppress，再移除 observer、释放 callbackContext 并清空 callback。即使异步 block 已排队，disposed 或已释放的弱引用会抑制发送；`:428–434` 的 send 仍再次检查 disposed/suppress/callback。Rust `macos.rs:30–64` 仍解析事件、核 bindingId/windowLabel、核当前 binding.permits_event 后才 emit，未削弱目标绑定或授权协议。本轮只核与这次异步边界直接相关的既有 guards，不重做整插件审计。

保存关闭路径保持原样：冻结 `App.tsx:551–560` 在 pendingDocs 非空时 preventDefault，await flush，排空才 destroy，错误走 fail；flush`:388–394` 仍等待保存队列并在 pending/saveFailures 时失败。本候选未改此路径，未添加直接 destroy 或绕过 flush。该静态保留不证明此前所有无 pending/失败分支已正确覆盖，也没有新运行通过结论。

## 开发关闭自测证据审查

`runtime-close-deferred-01/build.log` 显示 pnpm mac:build、前端构建、Rust宿主/插件编译及 .app 打包完成；build-identity.json 记录 exit0/default features[]，候选 `process.stderr.log` 为0B。独立未复编译。开发 selfcheck 明确是实际 CUA 动作，无脚本直接 destroy，且本轮没有新文本编辑。

| 开发动作 | 审查到的证据及限制 |
| --- | --- |
| 独立正文获焦，一次 Cmd+W | before AX 聚焦“每日 TODO”正文，after AX/PNG 回到主窗口画廊；selfcheck 另记 PID91995 存活、主窗67001 on screen。原图与可见主界面一致。后者是开发只读过程检查记录，本轮未重新取进程/窗口清单，不冒充独立关闭确认。 |
| 重开独立笔记，实际 File“关闭窗口” | after AX/PNG 为保留的主窗口画廊，selfcheck 记录独立窗口关闭。只有 after 证据和开发动作说明，不将其扩大为保存中/全部菜单路径通过。 |
| 重开独立窗，主窗原生搜索获焦后 Cmd+W | before AX 的焦点确为原生“搜索备忘录”；after AX/PNG 为独立每日TODO，URL含该 noteId，支持主窗关闭后独立窗仍可见。没有真实中文 marked 输入或正文编辑。 |

AX 多为差分，应与动作序列及截图共同使用，单张 after 截图不能证明所有窗口已移除。0B stderr 仅说明开发所采这次进程日志没有输出，不是全路径无崩溃保证。审查接受开发的三条有限通过记录，独立运行状态仍 unknown。未采保存中关闭、保存失败/冲突、冷重开内容保全、marked IME、最后窗口退出或完整授权矩阵，均不能补写为通过。

## 后续交接

待 native 流程明确交出 Mac 后，才在冻结实际完整包上独立执行有限关闭复验，核所属窗口、存活窗口/进程与必要保存结果；当前不抢占 GUI。另行搜索 cell 修复、顶部像素和 Android 输入法任务不在本报告结论内。此次只提交独立报告，产品源码、构建产物及开发原始证据未改。
