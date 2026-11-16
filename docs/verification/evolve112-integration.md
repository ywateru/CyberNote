# evolve112 真实宿主装配 — WIP checkpoint

2026-11-17，开发树 `Apple-Notes-Clone-evolve112-integration`，基线
`c648301e842f555778c5448fe946238a5ed561ca`。本文是装配中间记录，尚未完成交付，
不授予 SOURCE_PASS / 112 done / 116 passed。未修改任务或独审状态。

## 已装配的边界

- `src-tauri/src/lib.rs` 在现有 AppState 建立后，把同一个
  `Arc<(Mutex<Session>, Condvar)>` 注入桌面 Agent 服务；没有另开 Store。
  四个设置命令和原有 `agent_window_reply` 同时注册，命令从真实 WebviewWindow
  取得窗口身份，检查 expected Token。Android 不构建桌面 driver、不启动 listener；
  四个设置命令在非 macOS 明确返回 HOST_UNAVAILABLE。
- `agent_host/desktop.rs` 使用真实 AppHandle 取得参与窗口，通过现有
  `emit_document_event` 发出事件。创建 grant 在同一个短 Session gate 校验
  expected 与真实 default/quick/normal 物理目录，私有文件 IO 前后复核；权限、
  有效期与数量限制仍由 host/TrustedContext 校验。renderer 只接收配置引用。
- `agent_host/service.rs` 调用真实 NotesApplicationService；RequestLimits 在 Session
  锁前准入，permit 跨协调及最终 IPC 写入保留。取消 future 向独立 worker 传递取消标记，
  worker/Operation RAII 仅中止本次未提交 reservation；提交后继续真实 ACK/超时补偿。
  tick 的同一次短 gate 捕获 metadata，解锁后先 notes-metadata 再 notes-agent release。
  finish_delivery 使用真实窗口回复，返回原始提交版本和 warning。
- 交付前重新检查当前上下文、可见性和 grant；提交后撤销拒绝交付正文，但保留
  `operationId` 与 `committed:true`。host 与应用准入都保留到 socket 写完或连接丢弃。
- `agent_host/runtime.rs` 新增私有、按 workspace 摘要命名的启用偏好，严格绑定
  workspace/incarnation。首次 off；成功 enable 才保存 true；退出 stop 保留偏好；
  显式 off 保存 false。持久化失败停止端点。应用明确调用 open_for_application 才可
  退役旧 incarnation 的 registry/credential，并让新身份默认 off；原 open 仍拒绝身份错配。
- Archive 导入前停止 listener、撤销运行中 context、等待 worker 有界收尾；维护所有权
  在第一个 await 前建立，转移给 barrier worker，取消或失败时 Drop 恢复；quit 状态
  阻止维护恢复重新开启。身份轮换后旧授权退役，新身份 off。
- 启动解析支持独立且严格的 `--agent-runtime-dir`，不回退其他目录。
  listener/私有状态启动失败不阻止笔记 App 启动，Agent 页可重试。
- Preferences 增加 Agent 分类，活动时才挂载 AgentSettings；App 仅 import 并注入
  现有 `ws.folders` 与 mobile。未改变外观、theme 或窗口 coordinator 语义。

## 当前实际检查

唯一 Tauri target：`/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target`。
没有复制历史 target，没有读取用户库/账户/凭据，没有启动 App 或操作设备。

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  cargo check --locked --manifest-path src-tauri/Cargo.toml --lib

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  cargo test --locked --manifest-path src-tauri/Cargo.toml --lib

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  cargo clippy --locked --manifest-path src-tauri/Cargo.toml --lib

pnpm typecheck
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
EVOLVE112_UI_SETTINGS_FIXTURE=/tmp/evolve112-real-host-settings-fix.json \
  node scripts/check-agent-settings-browser.mjs
```

- 首次 cargo check 通过，日志 `/tmp/evolve112-integration-check.log`；checkpoint
  最新源码复查也通过（7.98秒、26个既有warnings），日志
  `/tmp/evolve112-integration-checkpoint-check.log`。
- typecheck 通过；浏览器现有12组检查通过，包含安全 host DTO 回放，日志
  `/tmp/evolve112-integration-ui-browser.log`。浏览器 transport 为合成输入，不是实时业务链路。
- 全量 lib test：**396 passed、1 failed、5 ignored**，170.56秒；日志
  `/tmp/evolve112-integration-full-native.log`。唯一失败为未修改的
  `sync::adapter::media_tests::real_64mib_preflight_capture_receive_and_quiet_keep_foreground_responsive`，
  `adapter_media_tests.rs:203` 实际 phase=release、期望 prepare；该轮 cached_quiet_plan
  用时5467ms。不把此轮全量测试记为通过，也未改动同步性能测试或超时契约。
- 本次 **9项** `agent_service::tests` 均通过；新增
  `startup::tests::agent_runtime_override_is_independent_absolute_and_strict` 也通过。
- 默认 Clippy 被既有 `src/account/transport.rs:1127` 的 `clippy::never_loop`
  阻断，另有既有 warnings；日志 `/tmp/evolve112-integration-clippy.log`。
  不将 Clippy 标为通过，未为本任务改动账户传输模块。
- 本次修改模块的 rustfmt check 与 git diff --check 通过；lib.rs 新增装配段已格式化，
  原有无关函数保留基线格式以减少111window合入冲突。

9项装配测试位于 `agent_host/integration_tests.rs`，使用真实 Unix listener、
production Service/Session/Store 与临时 SQLite；只读各自新生成的0600 credential
进行 IPC。窗口回复是测试显式提交的 WindowReply，**不是已打开的真实 WebView证据**。

覆盖：实际 create/read/list/search/folders/capabilities/operation；metadata先于release；
host重启恢复偏好和原幂等回执；撤销及显式off；两client CAS恰一成功及append；
提交前断连释放reservation；提交后断连保留提交并持久化ACK超时warning；
负ACK结合真实SQLite trigger故障的committed/warning/后续finish恢复；真实archive
轮换incarnation退役；提交后、ACK前撤销保留commit事实；偏好文件故障停止端点并可重试；
应用permit跨结果交付、排队撤销与取消收尾。

## checkpoint 后仍须完成

等待主线程将已审111window合入本树（本开发者不自行merge）。然后基于合入源码构建
新Mac隔离候选，复用 `scripts/verification/sync108-native-driver.mjs` 的 NativeApp，
同时指定规范化的私有 data-dir / agent-runtime-dir，实际验证
stdio → IPC → 同Session/SQLite → metadata/真实窗口ACK → 重启/CAS/幂等/撤销。
还须检查真实设置命令授权、失败重试、两库共享runtime与互不清理端点，编译Android安全cfg，
完成针对性回归及最终证据/提交。当前未运行真实窗口e2e，未完成112。

116只读环境预检与Anscombe的CodexCLI0.167公开mcpServer/tool/call合成探针只作为
后续运行准备；不构成此处真实业务调用或最终双端包验收。届时复用现有RPC序列并另记
准确source、候选、stdio/IPC/SQLite/window证据，不重复探索模型登录路径。
