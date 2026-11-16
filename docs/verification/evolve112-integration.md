# evolve112 真实宿主装配验证

2026-11-17，开发树 `Apple-Notes-Clone-evolve112-integration`，分支
`codex/evolve-112-integration`。装配 checkpoint `5eccb9f6`；主线程注入已审窗口后
HEAD `332125c2e995a87d18cd558d785d515d4276ce27`。本报告记录 source candidate 的
实际验证，供独审；不授予 SOURCE_PASS、112 done 或116最终双端包验收。未修改任务/独审状态。

## 真实应用边界与 API

- `lib.rs` 只把现有 AppState 的同一个 `Arc<(Mutex<Session>, Condvar)>` 注入
  `agent_host/service.rs`；服务不另开 Store。RequestLimits 在 Session 锁前准入，
  permit 保留到协调、业务结果及 IPC 交付结束。取消 worker 仅收尾本 operation；
  提交后的断连/撤销保留提交事实，不假报回滚。
- `agent_host/desktop.rs` 以真实 AppHandle 获取参与窗口，mutex 外发送/等待事件；
  短 gate 获取 metadata 后先发 notes-metadata 再发 notes-agent release，
  finish_delivery 使用真实 ACK；保留原始 committed version、`committed:true` 和 warning。
- 注册 `agent_settings(expected)`、`agent_set_enabled(enabled, expected)`、
  `agent_create_grant(input, expected)`、`agent_revoke_grant(grantId, expected)` 及原有
  `agent_window_reply(reply, expected)`。同 accessGate/expected 校验；授权创建检查真实
  default/quick/normal 物理目录、支持 scope 和有效期，私有 IO 前后复核。renderer 只拿
  HostSettings/CreatedGrant 中的 credential-ref、runtimeDir 和复制配置，不拿 raw credential。
- Host runtime 按 workspace 短摘要持久化私有启用偏好/registry；首次 off，成功开启后正常
  重启恢复，quit 释放端点并保留偏好，用户 off 持久关闭。listener/持久化失败不会阻止笔记
  App 启动，Agent 页可修复后重试。archive 导入先停止/撤销/排空旧宿主，incarnation
  轮换后旧 grant/credential 退役，新身份 off。偏好与 grant 不进入笔记备份/同步。
- Preferences 注册 Agent 页，App 注入真实 folders；保留主线程合入的窗口 gate。
  没有改 theme/presentation/window coordinator 语义。
- Android cfg 不编译桌面 driver、不启动 listener；四个设置命令明确不可用。

## WebView 与系统偏好隔离

原实现未设置 WK datastore。此前两次旧候选进程82343/82523自然退出0发生于隔离缺口闭合前；
不能据此宣称原系统偏好未被共享。没有读取/清空用户默认 WK store、cookies 或 NSUserDefaults。
后续候选使用独立 bundle `com.local.cybernote.evolve112.integration20261117`（productName
`CyberNote E112 Candidate`），同时显式指定新建私有 `--data-dir` 与 `--agent-runtime-dir`。
历史 SDK04 App PID60854 不是测试目标，从未发送其任何命令/信号。

`webview_profile.rs` 对显式 macOS data-dir 规范化后派生稳定16字节 ID；不同 root 不同，
同 root 重启一致。macOS <14 fail closed，无参数日常实例沿用原行为。首窗与动态文档窗
必须在创建前统一应用官方 `.data_store_identifier(id)`。移除 renderer 任意创建 WebView
权限，唯一生产文档窗入口改为原生 `open_note_window(noteId,title)`，保留原尺寸/标题栏。
录音实际为当前文档内面板，没有生产 detached recording WebView 构造器；不把它称为已验证
独立录音窗。所有配置窗口和该原生 builder 使用同一 profile。

实际依赖为 Tauri2.12.5/runtime-wry2.12.3/runtime2.12.2/Wry0.57.1。发现 runtime2.12.2 的
`From<&WindowConfig>` 遗漏 data_store_identifier：仅设置 config 无效，实测 diagnostic
失败。因此隔离模式关闭自动创建，并在 setup 经官方 builder 显式设置 ID 后建首窗。
未修改依赖源码。macOS `.data_directory` 不能代替命名 WK store。

固定、仅 sync-e2e debug 的 `webviewStorageDiagnostic` 通过候选自己的
WKWebView.configuration.websiteDataStore.identifier 观察真实 ID，不调用 defaultDataStore。
`NativeApp` 校验 hello.pid == spawn PID、window == main；driver 再校验独立 bundle ID 和
实际 store，所有操作仅沿自己的 stdio channel，动态窗记 label。诊断不是只读 config 断言。

已实跑 profile3项 PASS：`/private/tmp/e112-profile-dKqmKL/result.json`，日志
`/tmp/evolve112-profile-native-run3.log`：A/B localStorage 相互隔离、main/动态文档窗实际 ID
一致、A重启 sentinel 仍在且 B未受影响；三个自有进程均自然退出0。保留前两轮失败：
`/private/tmp/e112-profile-4rcaJU/result.json`（config omission）、
`/private/tmp/e112-profile-BVAsd2/result.json`（driver表达式语法错误，已改 IIFE）。
最终候选相关复测见下方增量记录。

## 实际 stdio → IPC → Session/SQLite → WebView/Codex

`evolve112-native.mjs` 复用 sync108 NativeApp。默认全流程使用真实 stdio release adapter，
不传 mockHostHandler；固定 debug `agentDiagnostic` 仅记录通过真实服务校验的窗口 ACK，
最多256条/条8192字节，不记录正文或凭据。最终定向模式 `EVOLVE112_FOCUS=boundary`
只复跑大文档与真实 Codex direct，不重复已通过的27项全组。

run6 **27项 PASS**：`/private/tmp/e112-native-FBaQEB/result.json`，日志
`/tmp/evolve112-integration-native-run6.log`。该轮 native SHA256
`38752bbf787384f11ce6fb8e83433d2133c718a2002536eff794c29c9f2669a6`。
范围如下：

- 实际 Agent UI 开启 listener；DTO 无 rawcred；0700目录/0600文件；九工具真实 SQLite
  读写及已打开编辑器刷新；notes-metadata 先于 release，实际 refreshed:true ACK。
- 编辑后的旧幂等回执；四个命令 stale expected 拒绝；非法目录/scope/有效期拒绝；
  两 stdio clients CAS 恰一成功；锁定笔记排除、只读 grant、过期与游标变更失效。
- focused editor、PM composition、pending draft、recording、picker、OCR owner 均拒绝
  外部覆盖并保留本地状态。pending 使用自己隔离 SQLite 的 BEFORE INSERT trigger 制造
  真实保存失败，ACK携带 unsavedNoteIds；解除故障后真实保存恢复。
- 合成 AudioContext 24kHz/330Hz 纯音 → MediaStreamDestination（不连扬声器），临时
  getUserMedia 适配器提供该 stream；实际 MediaRecorder/DesktopRecordingSession、登记、
  保存和文档 ACK 完成，生成30644字节 WAV、recordedAt存在。跳过 native mic 权限调用，
  从未调用原 getUserMedia，不采集环境音、不请求新的 TCC。**不代表物理 Mic/TCC验收**。
- CompositionEvent 是注入的 PM composition 状态，不代表真实 IME；picker 捕获真实 owner
  后只替换 input.click 抑制 OS chooser，以 cancel 释放；OCR仅真实打开/取消 owner，
  没有识别/摄像头。文件和音频均为本轮合成 fixtures。
- 同一 operation 的 main 与动态文档窗均真实 ACK refreshed:true。
- 丢失 stdio 调用方响应：暂停 adapter stdout，观察真实提交/真实 ACK，结束自己的
  adapter 并丢弃未读响应，再用原 idem key 恢复唯一回执；不是伪造/hold窗口 ACK。
  精确 host 连接断开边界另有正式 service/SQLite 测试。
- 同 runtime 两个真实资料库共存各有端点，B退出不删A端点；quit仅移除自己端点；
  重启恢复启用偏好/授权引用/SQLite/原回执；实际命令撤销 live client。
- 真 archive 导出/导入轮换 incarnation，旧 grant/credential 退役、新身份 off；
  显式 off 跨进程保留；0755 owned runtime 导致 host失败但 App仍启动保存，改回0700后
  Agent页真实重试成功。全组五个自有App进程均自然退出0。

Codex0.167公开 app-server 流程：initialize experimentalApi → thread/start ephemeral:true →
mcpServerStatus/list → `mcpServer/tool/call {threadId,server:"cybernote",tool,arguments}`。
实际九工具通过真实宿主；子进程仅 PATH/LANG/本轮 CODEX_HOME，父环境/HOME不改，
file credential stores，无 auth.json、无 turn/start、模型调用/登录请求均0。
参考公开文档 https://learn.chatgpt.com/docs/app-server 。未修改独立 probe 或使用 fixture
capabilities 成功代替真实业务。Codex调用的 create/append/update/read 及 operation 回执在 receipt 中。

保留逐轮记录：run3（15 pass）、run5（25 pass）及 run6（27 pass）；run4 在
`/private/tmp/e112-native-gMxCFx/result.json`，测试 trigger错误选 BEFORE UPDATE，真实 Store
使用 INSERT OR REPLACE，未成功制造 pending；改 BEFORE INSERT 后通过。

## 大文档真实传输阻塞及修复

新增独立 fixture 回放后 run7/run8 均在 read(document) 失败，未把已通过九工具当完整通过：
`/private/tmp/e112-native-tRF7cq/result.json`、`/private/tmp/e112-native-5SpikE/result.json`；
`/tmp/evolve112-integration-native-run7.log`、`...run8.log`。run8 在 Android构建完成后串行
仍复现，故不能归因于并发负载。

独立不可变 fixture `/tmp/evolve112-actual-node-boundary.json` SHA256
`5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396`，document779987字节/
20000 type节点/39999objects，document SHA256
`cb8343980dda85ab89f1d76c1fb7d8953d78041ee1e6f0c63277d83cc9117475`。没有改独立探针。

正式真实 listener/Service/Session/SQLite 回归先失败，日志
`/tmp/evolve112-large-ipc-before.log`：read只有327680字节、不完整JSON。
计时 `/tmp/evolve112-large-ipc-timing.log`：业务 query 495.85ms；交付对每个 socket分片重复
application_note 反序列化整篇文档，每次45–70ms，最终耗尽5秒读期限。

修复只在单次 Delivery 内缓存成功的 SQLite generation；仍在每一片检查实时
context/identity/scope/expiry/revocation 和 host grant。经 schema验证的 SQLite triggers
在 notes/folders/attachments 每次修改递增 generation；Session gate 内 generation变化就
重新检查可见性。写入/operation 的 check_delivery 不使用此缓存。没有增加deadline、
节点cap、schema或帧限制，也不持 Session锁做 socket IO。

`/tmp/evolve112-large-ipc-after.log` 定向通过（read872.79ms）；
`/tmp/evolve112-service-regression-final.log` **11项 pass**，边界read704.35ms。
新增 `delivery_generation_rechecks_visibility_and_never_caches_authority` 对 read/list/search
逐一用真实 SQLite修改 locked/folder/deletedAt，旧交付随generation拒绝；恢复后重新检查；
generation不变时 revoke 也立即拒绝。窗口回复在这组测试是显式 WindowReply 输入，
与上文真正WebView证据区分。

## 64MiB调查、baseline及其他检查

原始默认全native日志 `/tmp/evolve112-integration-full-native.log`：**396 pass/1 fail/5 ignored**，
170.56秒。准确失败名
`sync::adapter::media_tests::real_64mib_preflight_capture_receive_and_quiet_keep_foreground_responsive`，
原 adapter_media_tests.rs:203，期望prepare、实际release；cached_quiet_plan5467ms超过产品5秒。

不是以“既有测试文件”归类。固定主线 `f58efe8c78f2a7ad6009a36dd5b98161c5697898` 同scope
串行 baseline通过（150.64秒，plan4015ms/apply3661ms），日志
`/tmp/evolve112-main-media-baseline.log`；integration串行也通过（176.09秒，plan4076ms/
apply4220ms），日志 `/tmp/evolve112-integration-media-serial.log`。比较的 sync/media/Session/
Store源码一致；该测试直接Runtime、不运行App host。没有正在以可变main源码运行的baselinejob。
固定baseline源码另有只读 git archive snapshot `/private/tmp/evolve112-baseline-f58efe8c-source`，
不是新worktree，不阻碍main继续演进。

另一个对自己baseline子进程SIGSTOP6秒的压力探针**未复现准确phase断言**，先失败于foreground
延迟，且探针汇总脚本NameError；日志 `/private/tmp/evolve112-main-media-clock-pressure.log`，
不能将其称为同一失败复现或成功证据。

仅修此测试：使用既有 cfg(test) Session协议时钟固定quiet phase，真实64MiB IO仍运行，
每段额外显式120秒wall上限，foreground最大500000us、并发/phase断言不变。
产品Quiet5秒未改，专门的timeout测试仍推进5秒或shift6秒验证abort；production不使用
测试clock。修后默认全组 `/tmp/evolve112-integration-full-native2.log`：
**400 pass/0 fail/5 ignored**、164.77秒。这是大文档增量修复前的全量事实，未重复全组冒充新计数。

其他实际结果：

- 用户窗口merge后 typecheck、54+38 pass；最近对应日志
  `/tmp/evolve112-final-typecheck.log`、`/tmp/evolve112-final-window54.log`、
  `/tmp/evolve112-final-window38.log`；driver15 pass `/tmp/evolve112-final-driver-tests.log`。
- sync-e2e diagnostic正式测试4 pass，`/tmp/evolve112-native-diagnostic-tests.log`；
  profile模块3 pass，`/tmp/evolve112-webview-profile-tests.log`。
- Android `cargo check --locked --lib --target aarch64-linux-android` PASS，日志
  `/tmp/evolve112-integration-android-check.log`（NDK27.2.12479018，android24 clang，
  唯一共享target）；没有设备/模拟器启动或操作。这是大文档增量前的cfg编译，不称Android业务验收。
- Clippy仍FAIL：`src/account/transport.rs:1127 clippy::never_loop`，52 warnings。
  integration日志 `/tmp/evolve112-integration-final-clippy.log`；固定main archive同命令
  同错误/52 warnings `/tmp/evolve112-baseline-clippy.log`。没有改无关account代码来刷绿。
- typecheck/browser12先前通过，browser transport合成DTO不称业务e2e；
  `/tmp/evolve112-integration-ui-browser.log`。
- 新模块rustfmt与git diff --check通过；lib/sync_e2e仅格式化本次新增部分，保留基线无关格式。

## 候选重建与最终增量 receipt

唯一共享Tauri target `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target`，串行独占，
不复制/清理历史targets。构建命令：

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 \
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
pnpm tauri build --debug --features sync-e2e --bundles app --ci --no-sign \
  --config /private/tmp/evolve112-candidate-config.json
```

overlay只更改identifier/productName；它与默认源码包身份不同。build3源码manifest
`/private/tmp/evolve112-candidate-source3.json` 记录HEAD、dirty路径和源码sha，不能与唯一已审源码
混同；driver/profile源码与集成增量将在此次交付commit供独审。candidate为带debug driver的
Mac候选，不是最终116发布包。适配器复用现有release，SHA256
`0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17`。

build3 PASS，72秒，bundle244.95MiB；日志 `/tmp/evolve112-profile-candidate-build3.log`。
最终native SHA256 `2588ac2c6e66b4fee838a1e803c1726abdd2e480d2ac34559883a05d4ab3921a`。
构建后逐文件核对manifest中所有源码未变，manifest SHA256
`73c5bbd4635f145f0699982f8e6261d15e1ba88794569a2e12d251e68c66a131`。
汇总 receipt `/private/tmp/evolve112-candidate-build3-receipt.json`：

- 最终 WK **3项 PASS**：`/private/tmp/e112-profile-yN89Ji/result.json`，
  `/tmp/evolve112-profile-native-run4.log`；自有PID97794/97838/97852均自然退出0。
- 最终native定向 **6项 PASS**：`/private/tmp/e112-native-qzUAVh/result.json`，
  `/tmp/evolve112-integration-native-run9.log`；全新App/off、真实Preferences启用、reference-only
  grant/private modes、大文档20000-node create/read/update及20001拒绝、真实Codex九工具。
  自有PID98035自然退出0、无强制信号。Codex child也exit0。未重跑/重命名旧27项全组。
- 最终native receipt SHA256 `b0d222503d065da81400bfcbd3277385c9f372be382f0c0af587c25344809dcf`，
  profile receipt SHA256 `ef35a9e573578cc1705ab92606c59d3460cadf32532b10f283d51a53c0117a8c`。
- 构建前余11GiB，构建后9.5GiB，末次观测约12GiB（其他线程磁盘活动可能影响总量）；
  本线程未清理任何target/历史evidence，只复用同一个candidate路径覆盖重建。
  最终没有本轮App/cargo job运行；历史PID60854仍运行且未操作。共享target在交付时释放。

复跑命令（每次脚本自建全新私有canonical dirs，不指向用户库）：

```sh
node scripts/verification/evolve112-profile.mjs \
  '/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/bundle/macos/CyberNote E112 Candidate.app/Contents/MacOS/notes-clone'
EVOLVE112_FOCUS=boundary node scripts/verification/evolve112-native.mjs \
  '/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/bundle/macos/CyberNote E112 Candidate.app/Contents/MacOS/notes-clone' \
  /tmp/apple-notes-evolve112-adapter-20261117-target/release/cybernote-mcp
```

不设FOCUS时运行完整真实业务全组；需上述保留的独立fixture，可通过
`EVOLVE112_BOUNDARY_FIXTURE`指定同hash副本。formal service回归在源码中自身生成同hash
20k文档，不依赖临时文件。

## 尚未覆盖的门槛

须独立审阅此次装配/隔离/增量修复，再由主线程协调主题等主线变更整合；本树没有自行merge。
116准确最终Mac/Android包、物理设备/媒体/TCC/真实IME验收属于后续范围。本轮使用实际
Mac/WebView/SQLite/Codex公开RPC，但不是最终release包，也没有开启116或声称通过。
