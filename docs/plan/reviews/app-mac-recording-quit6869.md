---
id: app-mac-recording-quit6869-independent
status: pass-source-ready-runtime-open
source: 1ddeca7cb51727cd40203101d5447800bd43da04
baseline: 0f2a1fc1e2c37e716ca122895fe800b6f8d4bda3
---

# Mac 菜单与原生退出68/69独立审查

2026-11-05。**结论：pass，SOURCE-READY / RUNTIME-OPEN。** 没有发现本次提交新增的阻塞项。允许 root 将这一准确组合源合入并进入新 Mac 包冻结、构建与独立核包；本结论不代替准确新包的 CmdQ、菜单或 Dock 实际运行验收，也不关闭整体录音或像素任务。

独审工作树 `/private/tmp/apple-notes-mac-recording-quit6869-independent-01`，起始 HEAD 为 `1ddeca7cb51727cd40203101d5447800bd43da04`。68 作者产品 `a24082099a8208bc8da7ffeb9640dd20663fce46` 合入为 `d276eab8`，作者证据 `a36726b6` 合入为 `7f63289f`；69 作者产品 `bfbddfe33cb954e2ac0a19d1b3c8c25079a00a8c` 合入为 `b94afdce`，作者证据 `abd53f06` 合入为本次准确 HEAD。完整提交标识、275 项生产/根构建输入的字节和 SHA256 见 `docs/verification/mac-recording-quit6869/independent/source-binding.json`。逐项与对应作者产品完全一致；独审未修改生产代码。相对准确基线仅 `src-tauri/src/lib.rs` 和 notes-ui 插件的 `build.rs`、`macos/termination.m`、`src/lib.rs`、`src/macos.rs` 五条生产路径变化。两个退出规格追加段均保留。

## Findings

1. **P2 / non-blocking（本次源码审查）；实际交付验收仍待完成。** 任务68 verification 与任务69合同3/verification要求准确新包真实 CmdQ/Dock 退出后重开检查。`src-tauri/src/lib.rs:423` 的菜单处理和 `plugins/tauri-plugin-notes-ui/macos/termination.m:61` 的 delegate 回调已接入，但本轮仅源码、无 GUI 的受控对象和离屏合成媒体验证。不能把人工调用 IMP、合成 host 的可选方法缓存或 Tauri transport facade 当成真实 Dock/AppKit 入口证据。后续 root 应在同一准确新 Mac 包分别检查 A 采集→切 B 编辑→菜单/CmdQ、普通 Dock 退出→新进程重开，核对原 A 音频卡和 B 最新正文。隐藏、多文档、AppleEvent 等未实际执行的入口单独保留 unknown。

2. **P3 / non-blocking，继承范围边界。** 任务69合同5及 UI 规格明确不新增纯正文退出协议。`src-tauri/src/recording_window.rs:901` 的 registry 全空快捷放行保持原样；本轮不能宣称无录音时所有未保存正文都受新增 seal/ACK 保护。该边界不是本次新增回归。

没有 blocking finding；以下为源码审查和独立验证依据。

## 68：真实菜单声明与既有保存守卫

`src-tauri/src/lib.rs:363` 将预定义 Quit 改为自有 `quit` 菜单项、`CmdOrCtrl+Q`；`:423` 在焦点窗口查找之前调用实际 `app.exit(0)`，因此无焦点窗口也不会丢弃退出意图。`:506` 的生产 RunEvent 回调仍将 ExitRequested 交给原 `recording_window::exit_requested`，App、Panel、Session、registry、附件与正文存储代码未改。

独立核对本地锁定依赖源码：Tauri2.12.5 的原 `.quit()` 产生 muda0.20.0 预定义项，muda 的 Quit selector 是 `terminate:`；Tao0.37.2 原 delegate 只有 `applicationWillTerminate:`，将结束转为 LoopDestroyed/Exit，而非应用 ExitRequested。新自定义项走 customAction/MenuEvent，应用的 `AppHandle.exit` 请求经 runtime-wry2.12.3 的 RequestExit 产生可 prevent 的 ExitRequested。`dependency-route.json` 与 `dependency-route-excerpts.txt` 保存依赖内容身份及带原行号的原始摘录。这解释源码入口缺口，不单凭源码把它断言为 Mac20 K 的唯一内部原因。

独立从准确 `0f2a1fc1` Git 对象取出旧 lib.rs/recording_window.rs 后重新编译旧边界；`baseline68-source/source-origin.json` 绑定原字节。runner 的 `--source working` 只因为这一最小旧源目录并非独立 Git checkout；其 bindings 中 head 是外层独审树身份，旧源实际来源以 source-origin 和逐文件哈希为准。前端 App/Panel 等与该旧基线完全相同。旧反例3项确认真实 App 先 register/started、A 停车/B 编辑后，旧菜单声明仍为预定义 terminate，零退出请求、零 final、登记仍在；未向真正 NSApplication 发送 terminate。

候选重新提取同一准确组合源的完整菜单声明、on_menu_event、RunEvent 回调、local/quit 命令 wrappers 和生产 registry 函数。前端实际 App/Host/Editor/Gate/SaveQueue/Panel/Session 经本机临时传输调用这些正文，不手填 registry，不手发假的 quit 事件代替菜单。28项通过，包括无焦点、重复退出、A final/B 最新正文 ACK、busy checkpoint/store、decode/store/final正文/query/cleanup失败与重试、登记回复丢失、准备期退出及迟到响应、真正撤权、取消后的 late final、参与者 seal 与 stale ACK 拒绝。该路径的菜单/Tauri 运输与最终退出效果是受控 facade，不能称 OS 端到端通过。

## 69：真实插件挂载、delegate 与所有权

`plugins/tauri-plugin-notes-ui/src/lib.rs:296` 在实际插件 setup 调用安装并传播失败；build.rs 编译/链接 termination.m 并声明重新构建输入。锁定 Tauri 先创建 runtime 再初始化插件；锁定 Tao 在主线程 EventLoop::new 创建并 setDelegate 同一 `TaoAppDelegateParent : NSResponder`。不存在仅写 helper 未挂载的缺口。

`termination.m:45` 和 `:87` 要求主线程、已有 NSApp/delegate、精确类与父类；已有方法只接受本桥精确 IMP、class 及 SDK 推导的枚举 ABI。未知实现（包括继承的方法）不覆盖，无 swizzle、代理 delegate 或额外 NSApplication。重复安装只认相同有效 context/request/release，冲突明确失败。

`termination.m:94` 的强引用在 nil→原 delegate 刷新期间保活，`:131` 之后再次核对对象、class、IMP、签名；异常路径尝试恢复同一对象。成功后 weak app/delegate 用于身份验证；Objective-C context 强持有 Rust 转入的 Arc，成功、失败和精确重复各释放所转入引用，回调局部强持有 context，回调中 teardown 不导致悬空访问。方法在 drop 后保留严格 Cancel，避免恢复成无保护 native terminate。

`:61` 的回调始终返回 NSTerminateCancel，不等待 JS 或保存，也不创建 TerminateLater/reply 状态机。有效调用转入 `src/macos.rs:55` 的 ABI trampoline，`:62` 调用实际 `AppHandle.exit(0)`，Rust panic 被截留。runtime-wry 的 request_exit 明确通过 proxy 排队，不同步借用 event-loop callback；正常成功排队进入同一个 ExitRequested。原有 registry 在所有参与者 seal、录音 final/native release、文档 flush 和精确 ACK 后再次 app.exit，Tao 最终 stop/eventloop 结束，不再 terminate，因此无第二套 native 放行状态。Tauri 自身 request_exit 发送失败时存在 cleanup/process::exit 的库级回退；本轮未执行该关闭运输边界，也不把它描述成保存成功。

`src/macos.rs:287` 在授权主线程入口验证 ready，`:367` 在结果交付前再次验证；setup 失败拒绝启动、身份改变拒绝新授权结果。结合实际 DesktopSession 的 authorize→getStream 顺序，未防护时不能静默开始新的采集。权限、签名、标识、capability、Android 路径和 lockfiles 均未改。

## 独立执行

证据位于 `docs/verification/mac-recording-quit6869/independent/`，manifest 按实际文件字节生成；缓存、测试二进制和 dist 排除。以下均为本独审树重新执行，非转述作者通过：

| 检查 | 结果 | 边界 |
|---|---|---|
| 68准确旧菜单入口反例 | 3项PASS | 旧生产正文/命令提取，受控运输，未执行 OS terminate |
| 68准确候选实际 App→菜单/RunEvent/registry→final/flush/ACK | 28项PASS，errors=[] | 实际生产前端；合成440Hz媒体、内存存储、Tauri运输 facade |
| 66侧栏回归 | 42项PASS，errors=[] | 两次累计、单卡、A/B停车编辑、同挂载×、main close、保存与权限边界 |
| 66独立原生会话核心 | 5项PASS | 准确函数正文及实际缓存uuid；不替代命令/OS事件 |
| 67持久媒体恢复 | 25项PASS，pageErrors=[] | 原生读取受控；真实 bridge/gates/hook/MediaView，合成WAV，含共享手机布局 |
| 69生产Objective-C桥 | 19组PASS | 仅NSApp查找替换成Foundation host；未创建真实NSApplication |
| 69额外独立边界 | 4组PASS | 无release不转移、自有IMP错误ABI、继承未知方法、nil首次setter异常恢复/重试 |
| 实际插件setup/Rust ABI | 3项PASS | 真Tauri MockRuntime；实际app.exit到request_exit的既有unimplemented panic被截留，并非成功Wry派发 |
| 完整应用 cargo check --locked --offline | exit0 | 准确组合源，复用69 target；13条既有dead_code warning |
| pnpm typecheck / pnpm build | exit0 / exit0 | 保留既有大chunk提示 |
| 插件cargo fmt / git diff --check | exit0 / exit0 | 无产品改动 |

原生复用 `/private/tmp/notes-native-quit69-target-01`；环境 `CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0`，jobs2。先插件测试，再完整App check；提取测试仅读取已绑定缓存依赖。没有新增全量 target、清理旧缓存或重签名。起始 df 可用3.7GiB，完整检查后约1.3GiB，已同步 root，后续打包需其安排空间。

首轮68浏览器检查受本机监听 EPERM 阻断，第二轮缺少 PLAYWRIGHT_CORE_PATH 在启动浏览器前失败，原日志/输入均保留；第三轮用已安装 Playwright/Chrome、授权本机临时服务完整通过。66/67仅对独审保存的 runner 副本增加有界浏览器/连接清理，业务断言和产品未改；准确副本及差异说明保存。独立汇总另核 result.json 为 PASS 且错误数组为空，不能仅凭清理进程 exit0判通过。

## 运行与保全边界

未启动真实 Notes/克隆 GUI、发 AppleEvent、调用真正 NSApplication terminate、访问麦克风、操作 Android/模拟器，或复制、导出、转写真实音频。原手机约13秒未保存现场继续完全不动。旧 Mac18 进程已不在的历史保持；本报告不声称其未保存音频仍在或已恢复，也未重开旧18。

Mac20 首次授权超时与 K 的 CmdQ 后原笔记未见录音卡仍是未被本轮源码/测试覆盖的真实历史；内部孤立字节或恢复未取证，不声称永久字节丢失。root 当前 Computer Use 的 Dock 工具超时也不是任何退出动作成功或失败的运行证据。整体像素、真实硬件采集/音质、准确 Mac21 的正常重开和普通入口覆盖仍需分别记账。
