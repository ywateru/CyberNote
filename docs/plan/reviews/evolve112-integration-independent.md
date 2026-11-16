# evolve112 integration 独立审查

2026-11-17。审查对象为 `4ceb15e90cf4581795ee2cfcf3ff3835c7e77422`，工作树
`/Users/water/work/2026/Apple-Notes-Clone-evolve112-integration`，分支
`codex/evolve-112-integration`。从与 main 的共同祖先 `79241c09` 审查装配增量，
包含 `5eccb9f6`、窗口合入 `332125c2` 及最终提交，不能只看最后一次 commit 的 diff。
审查开始时 HEAD 准确、树干净；未合并 main、未修改产品或作者 fixture。

## Findings 与结论

**PASS：本次 integration 源码及下述准确 macOS debug candidate 的运行范围。**
未发现 P1/P2 blocking finding，也没有需要通过修改设计契约才能接受的实现偏差。
默认 clippy 的既有 account 错误仍失败，详见下方；没有把该检查记为通过。

这不是最终 116 包或双端通过。当前树未包含 main `08332427` 的主题增量；合并后仍需按实际
冲突与组合风险复验。物理 IME、Mic/TCC、Android 设备、同步传播及最终交付位置/包身份
均不由本报告授予通过，任务状态未改写。

依据：`docs/plan/tasks/evolve-112-agent-mcp.md`、
`docs/architecture/agent-mcp.md`、`docs/architecture/agent-ipc.md`、
`docs/ui/adaptive-presentation.md` Agent 页、`docs/plan/project-evolution-20261116.md`、
`docs/verification/evolve112-integration.md`，并对照已审 111 原生/窗口及 112 模块边界。
审查人没有参与本次 integration 实现；临时独立驱动只调用真实实现，不提供成功的假 handler。

## 源码核对

- **同 Session、真实设置入口。** `src-tauri/src/lib.rs` 的 setup 将用于 AppState 的同一个
  `Arc<(Mutex<Session>, Condvar)>` 交给 `agent_desktop::Desktop`，后者只创建 Service。
  `agent_host/service.rs:23` 的 SharedSession 及 Service 不另开 Store。生产请求走
  `ApplicationHandler::request`，默认闭包 handler 仅是既有模块测试接口，不是应用装配路径。
  四个设置命令和窗口回复均进入真实命令注册；Desktop 在私有 IO 前后检查真实窗口、Token、
  workspace/incarnation；create 前后检查现存物理目录。Preferences 实际挂载 AgentSettings。
- **RequestLimits 覆盖交付。** Service 在 Session 锁前准入；`service.rs:216` 的 permit
  移入 `Delivery`，runtime 的 HandlerReply、客户端 semaphore 和 DeliveryGuard 保留到
  `deliver` 结束/drop。排队写每 20ms 检查取消、expiry/revocation，未在 Session gate 中等待
  admission。取消 future 后 blocking worker 仍拥有本 operation 的 abort/release 或提交后
  finish/补偿职责；Activity 用于停止/维护时有界等待，不把断连误认为回滚。
- **20k 优化没有缓存授权。** `service.rs:131` 每次 DeliveryGuard 检查首先执行 authorize，
  包括实时 incarnation、scope、expiry、revocation；只有 read/list/search 的 note 可见性
  可以在该次 Delivery 中复用成功的 generation。generation 变化就逐目标重查当前目录、
  locked、deletedAt。Store 严格 open 校验既有九个 notes/folders/attachments 触发器，
  每种 INSERT/UPDATE/DELETE 都递增 generation。write 和已提交 operation 的回执交付
  仍走完整 check_delivery。`runtime.rs:887` 每个非阻塞 socket 写入前另检查 host 当前
  grant/enabled 状态；grant mutex 与该次 try_write 共用，Session 锁不跨 socket IO。
  分片中途失去权限直接终止不完整帧，不补交旧正文。节点、深度、frame 和期限均未放宽。
- **metadata/release、失败事实。** Service 在提交 gate 内获取真实 metadata，解锁后先
  emit notes-metadata，再 emit notes-agent release。实际参与集合来自 AppHandle。
  finish_delivery 等实际回复，负 ACK、参与集合变化、超时和通知失败保留 committed:true、
  原 operation/version，并持久记 WINDOW_REFRESH_REQUIRED；warning 落盘失败另记兜底。
  runtime 在交付被撤销时使用 preserve_commit，不用普通未提交错误覆盖已提交事实。
  `sync_e2e` 新 diagnostic 只在 debug + feature + 指定自有驱动环境中记录真实回复是否被
  服务接受，有限 256 条/8192 bytes，不生成回复、不记录正文/凭据。
- **启用/停止/维护。** runtime 的 enabled preference 绑定 workspace/incarnation，
  开启先成功 bind、后持久化，失败停止端点；正常 quit 不写成用户 off，显式 off 持久化。
  Desktop 导入前暂停旧 host 并等待本 Service 收尾；incarnation 轮换时旧 context、grant
  和 credential 退役，新身份默认 off。端点/registry 为每 workspace 私有所有权，
  维护 owner Drop 恢复是有界生命周期路径，不创建第二个 Session。
- **WK 存储。** `webview_profile.rs` 对显式 data-dir 规范化后派生稳定命名 store，macOS
  <14 显式拒绝。考虑了当前 runtime 的 WindowConfig 转换遗漏：关闭自动创建，setup
  用官方 builder 显式设置首窗 identifier；动态文档窗统一走同一 Profile builder。
  renderer 通用 create-webview-window 权限已移除，App 改调原生 open_note_window。
  无自定义目录时保持既有行为。实际录音是文档内面板，不虚称测过独立录音 WebView。

## 独立执行：真实 IPC/Session 回归

仅使用已释放的唯一共享 Tauri target，没有创建重复 native 缓存：

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  cargo test --locked --manifest-path src-tauri/Cargo.toml --lib \
  agent_service::tests -- --nocapture
```

结果 **11 passed / 0 failed，396 filtered**；编译 49.73s，测试 5.23s。
日志 `/tmp/evolve112-independent-service.log`。包含真实 listener + production Session/SQLite
的 CAS、持久幂等、重启/撤销、取消、持久启用失败/恢复、导入轮换、permit 跨交付、负 ACK
落盘失败、提交后撤销仍保留 committed，以及 generation 的 locked/folder/deletedAt 变化
与 generation 不变的撤销复核。20k/779987-byte 同 hash 文档 read 约 833.68ms。
此组窗口为显式协议输入，不能标为真实 WebView；真实窗口证据见后两节。

没有因该定向组通过而重报作者的全 native 400 项已在最终增量全部复跑。

## 独立执行：实际设置表单 → Codex → 真实宿主

新建独立驱动 `/tmp/evolve112-integration-native-independent.mjs`，调用可复用的
`/tmp/evolve116-real-host-probe.py`；大文档补充为
`/tmp/evolve112-integration-independent-boundary.py`。脚本未修改作者测试或 fixture。

准确候选：

- native SHA256 `2588ac2c6e66b4fee838a1e803c1726abdd2e480d2ac34559883a05d4ab3921a`；
  路径为共享 target 内 `debug/bundle/macos/CyberNote E112 Candidate.app/Contents/MacOS/notes-clone`。
- bundle identifier `com.local.cybernote.evolve112.integration20261117`，带明确 debug driver，
  非 116 release 包。manifest `/private/tmp/evolve112-candidate-source3.json` 的 464 个文件
  逐项与已提交审查树比较，**零差异**；未用 dirty HEAD 字符串代替源码摘要核验。
- adapter 为 `/tmp/apple-notes-evolve112-adapter-20261117-target/release/cybernote-mcp`，
  SHA256 `0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17`。

独立运行根 `/private/tmp/e112-independent-wOy2US`；主记录 `result.json`、
操作 journal `journal.json`、逐请求/退出审计 `independent-audit.json`、
`rpc-evidence/` 每阶段双客户端 trace/stderr、`boundary/boundary.json` 均保留。
stdout 汇总 `/tmp/evolve112-integration-independent-native-run1.log`。
审计 SHA256 `75d0d2e116f7ce04ca8b60d93ef21352e48db6cbf3b3d2ac1042b9c4d197b44f`。

实际完成六组：

1. **真实表单授权。** 在真实 Preferences Agent 页点击开启；通过创建对话填写两个不同
   client、主动勾选权限和 default 物理目录并确认。A=read/create/update，B=read/update。
   填写实际 adapter 路径，从页面渲染的 stdio JSON 取得配置。创建动作没有直接调用
   agent_create_grant，也没有自造 credential/grant。settings 只用于只读核验结果。
2. **真实 Codex 业务与双 grant CAS。** CLI 0.167.0 的公开 app-server，两个独立进程、
   临时私有配置/empty cwd/ephemeral thread。basic、cas、idempotence 阶段全过，九工具
   实际调用；每个结果检查实际发现的 outputSchema、明确布尔 isError、structuredContent
   和同内容 JSON text。每次写前持久保存原参数/key，无自动写重试。两边同 version 发起
   竞争，B 成功、A 为 REVISION_CONFLICT；双方精确读回正文/版本/revision。原 create/
   append 回执在后续更新后重放不变，异参同 key 被拒绝，operation 与原提交一致。
3. **真实窗口。** 原生 main 与动态文档窗在相同 operation 下实际回复 release
   refreshed:true，metadata 先于 release；main 编辑器显示准确 CAS 胜者文本。
   证据 `actual-window-evidence.json`。子窗持另一篇测试笔记，不能把这份双参与者 ACK
   外推为两个目标编辑器都显示同一全文、跨窗 Undo 或物理输入全部通过。
4. **真实大文档。** 经实际 UI grant、Codex、adapter 和 host 完成 20,000 type 节点、
   779,987-byte document create/read/update/read，完整 JSON 精确一致；20,001 节点拒绝。
   复用原独立不可变 fixture SHA256
   `5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396`。
   两次 read 约 1161.59ms/1005.40ms，update 约 4598.83ms；这是本次计时，不是性能保证。
5. **真实原生重启/WK。** 同一 data/runtime 重启，无重新授权或重新开启；scope、grant
   引用、正文及原幂等/operation 回执保留。服务 hostSessionId 更新，两 grant 仍同一
   服务 session。读取实际 WK identifier：main/子窗相同，不同资料库不同；自有 sentinel
   在 A 重启保留而 B 始终不存在。没有读取/清空默认 WK store 或系统偏好。
6. **实际设置页撤销及 off。** 从真实 A 授权项点击撤销。原配置的 capabilities/read/
   operation/原写重放/新 append 均 UNAUTHORIZED/FORBIDDEN，B 精确读回原正文及相同
   version/revision。未将 HOST_UNAVAILABLE 接受为撤销成功。随后实际开关 off，新的
   原生进程保持 off。适配器可能在私有引用验证时就拒绝被删除的凭据；持旧请求记录的
   宿主逐次撤销验证另外由上述真实 IPC 回归覆盖，不混淆两层证据。

阶段全部 PASS。原生 PID 5343/5897/5913/6109 均自然退出 0、无强制信号；Codex trace
均无 auth.json、无模型 turn/登录方法，app-server exit 0。仅子进程显式传入
PATH/LANG/任务私有 CODEX_HOME，父环境未变。没有读取用户登录、keychain 或用户笔记。

## 独立执行：真实窗口刷新失败与恢复

补充驱动 `/tmp/evolve112-refresh-recovery-independent.mjs` 及
`/tmp/evolve112-refresh-recovery-rpc.py`。范围为自有真实 WebView + 实际 MCP 提交，
只对该 WebView 的 load_workspace fetch 返回明确错误，先检查故障确实生效；其他请求
继续原 transport。不伪造成功、metadata、窗口意图或 ACK。此项 grant 经真实设置原生命令
创建，不另称该项也走了表单；表单链已在前项单独证明。

成功证据 `/private/tmp/e112-refresh-independent-oqxZRR/result.json`，SHA256
`bb6615f65f7ef06ddeb7294cdb0cffba72ab65623b87c9f56427af8c2b4cd1e4`；
日志 `/tmp/evolve112-independent-refresh-run2.log`，操作/回执在同目录 `rpc-state.json`。

- 三次 load_workspace 错误发生；实际 append 仍 committed:true、revision=2，
  warnings 含 WINDOW_REFRESH_REQUIRED。MCP 精确读回已提交正文。
- 窗口保持 frozen，并由产品协调器自行回复 refreshed:false，native diagnostic 记录接受。
- 恢复正常 fetch 后，产品可信重读、正文刷新和解冻，自行回复同 operation 的
  refreshed:true，native diagnostic 同样接受。没有由探针调用 agent_window_reply。
- 原参数/key 重放和 get_operation 保留原始已提交回执/持久 warning；完整 read 与故障后
  read 一致，不增加 revision 或重复正文。PID10942 自然退出0，无强制信号。

第一轮探针失败保留：`/private/tmp/e112-refresh-independent-JjExUS/result.json`、
`/tmp/evolve112-independent-refresh-run1.log`，以及该目录的 `.run1-source`。原因是尝试
替换不可写的 Tauri invoke，故障没有生效，实际成功写入没有 warning，预期断言失败。
这不是产品刷新失败复现，也不是恢复成功；第二轮先验证 fetch 故障才得出上述结论。

## 作者证据、旧失败与未重复范围

独立核对了作者 run6 的 **27 项**、最终 run9 的 **6 项**、最终 profile 的 **3 项** receipt
及 native/adapter/manifest 摘要。27 项属于旧 native hash `38752bbf…`，最终 candidate
为 `2588ac2c…`；不能简单把旧全组改名为最终全组。作者已区分该范围，本审查亦保留。
PM CompositionEvent、无扬声器的合成音源/MediaRecorder、picker/OCR owner 测试不代表
真实 IME、麦克风/TCC、OS chooser 或摄像头/OCR 识别。本轮没有重复这批不变场景。

run7/run8 `/private/tmp/e112-native-tRF7cq/result.json`、
`/private/tmp/e112-native-5SpikE/result.json` 仍为原 TIMEOUT 失败，不修改证据。
本次源码与独立实际 Codex 大文档测试确认修复，未靠增加期限或削减文档上限通过。

64MiB 原失败 `/tmp/evolve112-integration-full-native.log` 保留；作者固定 baseline、
串行 integration 对照及失败的压力探针按其各自结果保留。审查 diff 确认这里只改测试：
使用已有 cfg(test) 协议时钟，并加每段120s wall上限，真实64MiB IO和前台延迟断言保留；
产品 quiet 5s 未变。未把测试时钟通过解释为产品任意负载下无超时，也未重跑该重型全组。

默认 clippy 仍受 `src/account/transport.rs:1127` 的 clippy::never_loop 阻塞；作者
integration 与固定 main baseline 日志同错误/52 warnings。本次未更改该无关源码，
没有运行相同的既有失败来制造新“通过”。Android cargo check 为作者增量前 cfg 编译证据，
不扩张为设备业务运行。本审查没有重新打包或安装应用。

## 交接

可复用 `/tmp/evolve116-real-host-probe.py` 和
`/tmp/evolve116-real-host-probe.README.md` 的 prepare/checkpoint/basic/cas/idempotence/
restart-arm/restart/revoke，带 journal 和显式 recover；脚本自己的12项离线校验及 self-check
先通过，再以本次准确候选实跑核心阶段。可选 busy 阶段只准备，不能根据本次结果记为已跑。
所有 `/tmp` 独立脚本/原始失败/fixture/evidence 均保留，未归入产品或发布物。

本轮只提交本报告。主线主题等合并后的组合复验和最终116准确包仍由主线程协调。
共享 Tauri target 已停止使用；全部自有 native/Codex 子进程已退出，历史应用 PID60854
仅只读核对仍在，没有向它发送命令、信号或访问其数据。
