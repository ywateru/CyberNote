# CyberBus121 account independent review 01

日期：2026-11-18。最新结论：**PASS，可合并本轮核心与 CLI 范围；真实原生账户链 / UI tests incomplete**。

最新独立复核为下文 [0f3cd922 有界修复复审](#0f3cd922-有界修复复审)：准确基线 **`0f3cd92236cbd60ea7d84b3c133aabe44e8239b7`**，A2/A3/A4/A6 关闭；A1 已在前轮关闭，A5 按主设计明确的新迁移契约接受为限制。独立 CLI 检查全部通过，未发现本轮合并阻断。真实原生登录、云端撤销及 UI 未验证，按用户确定的收敛边界交组合 Mac 包和手动测试补齐，不新增在线或设备门槛。以下历史 checkpoint 的失败证据保留，不作为最新提交仍失败的结论。

最初审阅基线为 **`0805281ed14775c713de48da02fdd35cabcce141`**（`0805281e`，作者提交标题本身标明 tests incomplete）。下方原始 findings 仅对应该历史基线，后续提交分别在文末记录独立结果，不追认未冻结的工作区修改。审阅者未参与账户源码开发。本轮仅写本报告与独立 fixtures；未修改产品、运行用户笔记应用、读取原 notes 库、使用真实账户或修改线上配置。

## 阻塞摘要

| ID | 优先级 | 确定发现 | 证据范围 |
| --- | --- | --- | --- |
| A1 | P1 | 默认与 sync-e2e 均因 E0499 无法编译 | 两次独立 cargo check 均 exit 101 |
| A2 | P1 | 本地 grant 已清除但云端撤销失败后，退出/重新登录可能永久卡住 | 真实离线 SDK + 原样提取 logout 方法验证无 grant 重试分支；失败撤销后的完整 native 场景尚未运行 |
| A3 | P2 | 已运行 worker 把 SDK ReauthRequired/Degraded 等都投影为 connecting/paused 并清错 | 固定基线源码链路审计 |
| A4 | P2 | 新 Rust SDK 错误与严格前端 DTO 不兼容，deadline/unknown outcome 类别也丢失 | 实际前端模块独立探针 2 pass / 4 fail |
| A5 | P2 | 成功 signOut 没有退役旧 `.account/grant.json`，还存在保留它的测试 | 固定基线源码；不读取用户真实 grant |
| A6 | P2 | 已声明 Notes 类型但不兼容/损坏的已认证 profile 被静默跳过 | 固定基线源码；首次发现可成为空 devices，已有历史则成为离线/无摘要 |

core F1/F2 的 `b1dcdb0a` 及 core F3/F4 修复是组合验证依赖，**不重复列为账户自身 finding**。见下文依赖范围。

## A1 — P1：checkpoint 两种 feature 配置均无法编译

`src-tauri/src/account/transport.rs:336` 创建的 `prepare` future 可变借用 `mappings`，`tokio::pin!` 后其析构作用域仍覆盖 `:370` 的第二次 `mappings.push(sync)`，编译器报 E0499。普通与 `--features sync-e2e` 均复现，分别 45.811s / 13.049s，exit 101。与作者证据最后一次失败一致；作者早于该修改的成功检查不能覆盖此提交。

须收窄 preparation future 的真实存活作用域，同时保持取消后 await、mapping close/join 和 pairing 后新建单次 Sync mapping 的边界，再对新的准确 SHA 重跑两项检查及定向 Rust 测试。此基线没有可供真实 native 账户测试的已验证可执行包。

## A2 — P1：把云端撤销成功作为本地清绑定前提，无法收敛无 grant 的退出

位置：`src-tauri/src/account/mod.rs:606`（logout）、`:492`（signOut）、`:434`（错误会话重登前退出）。

`logout` 即使收到 `local_closed=true` 且 `local_error=None`，仍在任何 `cloud_error` 或非 Succeeded 云端状态下返回错误。signOut 随即通过 `?` 跳过 `set_enabled(false)`、`clear_session` 和状态重置。SDK 的真实行为是：`submit_logout` **先**取走内存及持久 vault grant、保存本地关闭，再执行有预算的云端撤销；云端失败不恢复 grant。之后 RevokeGrant 再执行时已无 grant，返回 Unsupported。账户层仍拒绝完成清理。已有 profile 的错误会话重新登录也必须先过同一 logout，因此无法用正常重登退出这个状态。

独立 fixture 使用真实 `notes-cyberbus::Bus`/固定 SDK、仅内存安装存储及 `.invalid` 配置，没有 NetworkStart、真实授权或 Keychain。runner 从准确 commit **原样提取** `Runtime::logout`，嵌入只提供 `bus()` 的最小宿主；不是完整 Tauri Runtime 测试。无 grant 路径实测：

```json
{"local_closed":true,"local_error_present":false,"cloud_status":4,"cloud_error_code":10,"account_logout_ok":false,"retry_ok":false}
```

4=Unsupported cloud status；10=SDK Unsupported error。fixture 正常退出，仅确认此基线方法拒绝已完成本地关闭的重复退出。它未模拟真实 Logto 撤销失败或测得任何真实 grant 撤销结果。该后果由 SDK 先删除 grant 的源码与上述调用链确定。

修复应区分本地关闭收据和云端撤销收据：本地确认关闭后可完成本地禁用/清绑定，独立保留云端失败/未知事实，不能声称远端已经撤销；真实本地清理失败仍须阻塞。不得重新建立旧 AuthClient owner 或用删除资料库解决。至少覆盖无 grant 的幂等退出、云端失败后再次退出/重登、AuthCallback 提交后取消，以及本地持久化失败。

另一个精确限制：`stop_network:376` 在旧 worker 以非 Cancelled 错误终止时提前返回，本次 signOut 尚未发送 AuthLogout。它当前会返回错误，**不是成功退出**；新版本应有明确重试/收敛测试。不要将此路径或进程退出视为云端撤销证据。

## A3 — P2：长期 worker 丢失真实授权失效与恢复错误

位置：`src-tauri/src/account/worker.rs:343`、`:548`、`:626`；`src-tauri/src/account/mod.rs:206`、`:542`。

worker 的 `authenticated/available` 正确拒绝 ReauthRequired、Degraded、过期 lease、persistence pending 等状态，内容授权会 fail closed。但 worker **不检查这些状态的原因/错误**：没有 child 且 enabled 时调用 `set_phase(Connecting)`；未 enabled 则 `set_phase(Paused)`。`set_phase` 无条件清空 status.error。因而登录后发生明确 `reauth_required`、认证撤销或网络退化时，界面只能看到持续“连接中”或正常“暂停”，不能区分需要重新登录与可恢复网络失败。`SyncNow` 中恢复失败直接返回 IPC error，不会把该失败写为长期 worker 状态；普通 polling 不能补回这项事实。

这与 core F1 的 watch 不能恢复是两件事：即使 core 正确重建 watch，账户层仍会吞掉终端 auth 状态。须用有限、前端兼容的错误投影 SDK auth/network 状态：保持 grant/binding 的真实语义，网络失败提供显式恢复；明确 reauth 显示重新登录入口；暂停只表示内容意图，不覆盖认证错误。测试在**已登录且 worker 已启动后**注入真实类型事件/可控 SDK 失败，不能仅测启动 wait_account 或 `authenticated=false`。

## A4 — P2：原生安全错误跨前端边界失败

位置：`src-tauri/src/account/types.rs:191`、`:370`、`:404`、`:513`；`src/account-client.ts:22`、`:135`、`:277`。

Rust 的 `Error::BusCode` 序列化为 `account_sdk_failed` + `cyberbusCode`，例如固定 SDK Internal=26。前端 `record` 不允许 `cyberbusCode`，errorCodes 也不含该新类别：合法 status.error 被拒为无效数据，IPC 错误被 `accountIPCError` 丢为 undefined。`account_unknown_outcome` 和 `account_deadline_exceeded` 无额外字段时会走未知类别降级，丢失原有限错误类别；IPC 也不接受它们。

独立 `dto-probe.mjs` 在内存构建**准确 commit 的真实 account-client.ts** 并调用导出的校验器；没有复制校验实现、启动应用或调用 IPC。2 项控制通过（既有 network error、未知摘要与真实空库摘要区别）；4 项期望契约失败（SDK status、SDK IPC、unknown outcome、deadline）。结果见 fixture JSON。Rust 序列化字段由源码和作者已有 `sdk_errors_are_finite_without_upstream_payload` 测试声明交叉核对；本轮该 Rust 测试因 A1 未运行。

须在维持严格白名单与无原始上游文本的前提下，统一 native/TS 类型、允许组合、有限错误展示与恢复动作；不能简单放开任意字段。新增跨真实 Rust 序列化和实际 TS 校验的契约 fixture 后复审。

## A5 — P2：旧持久 grant 未退役，退出仅覆盖新 owner

位置：`src-tauri/src/account/private.rs:250`、`:377`；`src-tauri/src/account/provider.rs:13`；`src-tauri/src/account/mod.rs:492`。

旧实现 `0805281e^:src-tauri/src/account/mod.rs:147` 使用 `.account/grant.json` 构建 AuthClient。新 provider 只管理 CyberBus 受保护安装/vault，没有导入或退役该文件；clear_session 只记住 paused session、删除 binding、完成 adoption marker。测试 `signout_remembers_paused_device_without_retaining_current_binding_or_touching_grant` 还写入合成旧 grant 并断言清理后字节不变。

迁移要求重新登录是可接受边界；**不自动导入旧 grant 本身不是缺陷**。本 finding 在于：旧刷新/待撤销材料可能保持磁盘原状，新登录及其成功 signOut 没有明确发现、禁用、清除/撤销或报告未退役状态。迁移设计仅写“旧授权材料不自动导入”，没有覆盖其退出后的生命周期。不能把成功新 SDK logout 宣称为旧授权也撤销完成。本轮没有读真实 grant，更没有推断真实旧 token 当前仍有效。

须定义只执行一次、可恢复的旧材料退役策略，明确本地清理与云端撤销失败/未知的收据。不能恢复旧长期 owner、调用旧 coordinator、导入旧 grant 为新 SDK 会话、删除 `.account` 整目录或 notes/附件；旧 noise/session/history 仍有本地恢复用途。若暂不实施，至少精确限制退出声明并把旧授权退役列为未完成，而不是默默留下还能被旧版本恢复的材料。

运行链审计：新 account 目录生产路径未发现 `AuthClient::new`、旧 coordinator 请求或 CyberGrid Session 创建。Cargo 仍保留 `account-auth` 供有限错误枚举/转换使用；存在依赖不等于第二个运行 owner。上述是当前源证据，**不是删除 legacy 授权材料的证明**。

## A6 — P2：损坏 Notes profile 被当作设备不存在

位置：`src-tauri/src/account/worker.rs:374`、`:423`。

`profile(d)` 会把 Notes semantic version、名称、canonical protobuf、JSON schema、summary 或 roster 校验失败归为 DeviceIncompatible；`update_catalog` 对**所有**此类错误统一 `continue`，随后成功 `catalog.replace(rows, roster)`。因此一个 SDK 已认证、声明 Notes PROFILE_TYPE 但内容损坏或版本不兼容的在线 peer，首次发现时不会出现在设备表且无错误；若所有可见 peer 都这样，会给出正常空 devices。已有历史记录时则投影为离线、隐藏摘要，仍没有说明真实的不兼容原因。

Gate 不会因此授权该 peer，这不是跨账户接收或伪造空库数量的问题；问题是目录错误被吞成空/离线成功。未知应用类型或尚未发布 profile 的瞬态可另行规定，但已声明 Notes profile 的无效内容至少要保留有限错误/不兼容状态或明确使目录失败，不能默默忽略所有解析失败。需要 first-discovery、历史设备升级不兼容、损坏 summary 三种用例。

## 已核对的源码链与尚未验证边界

以下为固定基线的源码观察，**不代替运行验收通过**：

- AuthStart/AuthCallback/AuthRestore/AuthLogout 全部走单一 Bus；status 只读，不发起授权或网络。macOS provider 为 KeyringStore，Android 为 JNI CyberBusSecureStore；没有启用生产明文 fallback。本轮未操作真实 Keychain/Android。
- workspace 为 issuer/subject/product 分域 SHA-256 派生 UUID；client ID/host/时间不进入派生。设备历史路径为 `.account/devices/<workspace>.json`，registry UUID 与 SDK peer32、协议 UUID/Noise key 分开。
- `worker::authenticated:343` 检查真实 SDK phase、owner、persistence 状态与墙钟 validation lease；`available` 另查 directory_valid、network running/reachable/error。`peer_bound:389` 绑定当前 generation、online、last_authenticated_at 及经过校验的 Notes profile。`enrollment::Gate::authorize:127` 每请求调用该 closure。**没有发现完全缺失 SDK 真实 lease 校验**。
- Bootstrap `transport.rs:156` 先 read，再 `claim_bootstrap_context`，之后验证 nonce/peer/protocol UUID/Noise pin 并 admit。当前 core claim 的 F3 安全问题尚待其独审修复；本报告不重复算 account finding。
- `Store::sync_adoption_preflight` / `adoption_projection_check` 明确拒绝旧 inbox、多 head 冲突、未投影版本和内容/附件元数据或字节不一致；最终 transaction 前后重复检查，保留业务 rows 与 managed attachments，再新建 causal tables。未发现 `skipInbox` 清空绕过。遇冲突/inbox 时**显式阻塞迁移**，不是证明可以自动迁移所有冲突；仍需真实恢复旧账户处理后再迁移用例。
- adapter 使用已有 probe/prepare/adoptionMedia/release，commit 后 Store instance 与 backend epoch 改变，保留 Session/editor token，保留 partial release 重播；没有用 destructive notes-access 替代迁移。实际多窗口 quiet/flush ACK、中文原文、附件 SHA 与冲突保全还未运行。
- 主动 `Client::cycle(direction)` 与被动 `wire::Handler` 均执行 push/pull/both 权限，账户 mode 不启动长期自动 sync worker；目录/重连不直接重放内容动作。仍需真实方向隔离验证。
- RequestCancellation 的 23 分钟绝对 deadline 从操作准备前开始；timeout/cancel 请求停止后等待工作拥有的 terminal receipt，mapping close 也 await。blocking_request 保留 Busy 并重试 disconnect 直到确认退役。Rust 借用错误修复后还需故障注入测试；没有验证长期卡住的 shutdown/retirement、blocking 排队后撤销、Store 最终提交时的 lease/fence 竞态，不能仅凭调用前后 Gate 校验宣称所有迟到写任务都拒绝。
- 摘要发布直接传播 `account_summary()?` 错误，没有将 Store 错误填成零数量；离线或内容未 ready 的 summary=None 表示未知。A6 是 profile 错误被跳过的另一条路径。

## 命令、结果与隔离范围

作者工作区起始 HEAD=0805281e，但 `src-tauri/src/account/transport.rs` 当时已有未提交修改。因此创建 detached 冻结 checkout `/private/tmp/cyberbus121-review-0805281e-zfwu_kzv`，编译与源码判断全部使用该 checkout/`git show 0805281e:path`。本报告写入作者 worktree；后续 HEAD 改变不影响本报告基线，未审查其 dirty 或新增提交。

环境与完整结果见 [compile-results.json](fixtures/cyberbus121-account-0805281e/compile-results.json)。两项精确命令（cwd=冻结 checkout）：

```sh
cargo check --offline --locked --manifest-path src-tauri/Cargo.toml
cargo check --offline --locked --manifest-path src-tauri/Cargo.toml --features sync-e2e
```

```text
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
CARGO_PROFILE_DEV_DEBUG=0
CARGO_PROFILE_TEST_DEBUG=0
PROTOC=/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/protoc-bin-vendored-macos-aarch_64-3.3.0/bin/protoc
TAURI_CONFIG={"bundle":{"resources":[],"externalBin":[]}}
```

每项独立 240s subprocess timeout，正常在上述时间返回失败。复用既有缓存；TAURI_CONFIG 仅为冻结 checkout 缺打包 sidecar 的编译检查覆盖，**不验证 sidecar、bundle、发布或新平台构建**。输出 [default-check.log](fixtures/cyberbus121-account-0805281e/default-check.log)、[sync-e2e-check.log](fixtures/cyberbus121-account-0805281e/sync-e2e-check.log)。因共同编译阻塞，没有继续重复运行必然同处失败的全 app 单测。

独立 DTO 命令（fixture 在作者 worktree，输入仍冻结）：

```sh
node docs/plan/reviews/fixtures/cyberbus121-account-0805281e/dto-probe.mjs \
  /private/tmp/cyberbus121-review-0805281e-zfwu_kzv \
  /Users/water/work/2026/Apple-Notes-Clone
```

exit 1，2 pass / 4 fail，见 [dto-results.json](fixtures/cyberbus121-account-0805281e/dto-results.json)。dependency root 只提供已有 Vite/Tauri API 构建工具；被测源码来自冻结输入，build.write=false。

独立 logout 命令：

```sh
python3 docs/plan/reviews/fixtures/cyberbus121-account-0805281e/logout-probe.py \
  --candidate /private/tmp/cyberbus121-review-0805281e-zfwu_kzv \
  --target-dir /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  --protoc /Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/protoc-bin-vendored-macos-aarch_64-3.3.0/bin/protoc
```

runner 在新临时目录生成独立 Cargo manifest 与提取方法的 host；执行 `cargo run --offline --manifest-path <temporary>/Cargo.toml`，总 subprocess timeout 180s。本轮 exit 0（断言确认基线拒绝重复退出），结果 [logout-results.json](fixtures/cyberbus121-account-0805281e/logout-results.json)。不因该探针正常退出而声称 A2 已修复。编译日志 [logout-stderr.log](fixtures/cyberbus121-account-0805281e/logout-stderr.log)。

## core 集成依赖

当前账户基线包含原 core 与 23 分钟 deadline patch，但未包含任务协调者指定的 F1/F2 修复 `b1dcdb0a`。依赖独审报告位于 core worktree 的 `docs/plan/reviews/cyberbus120-core-01.md`：F1=revocation 后 watch 基线不能主动恢复；F2=SDK EOF 未排空 owner/tasks；F3=Bootstrap claim 缺 receiver-only capability 且 slot 重建后可重放；F4=可选 file-vault lock path 替换后双 owner。F3/F4 正由 core 独审推进。本账户报告没有对后续补丁重新运行或宣称关闭它们；生产 KeyringStore 也不被等同为可选 file backend。

账户后续准确 SHA 须合入经独审的 core 补丁再组合验证。A3 的 auth 状态投影和 A2 的退出收敛属于账户独立责任，不能只靠 core patch 关闭。

## 新 SHA 与真实账户验证准备

收到任务协调者指定的新 SHA 后重新冻结输入，先重跑两种 check 与账户/方向/Session 保全定向测试，再决定可执行包是否满足真实 native 测试前提；目前不接受交付。后续至少覆盖：primary A/B 同账户发现、显式启用、完整中文富文本与 PNG/文件 SHA；push/pull 隔离；离线/重启恢复与暂停不重放；异账户拒绝；并发 head/待应用 inbox 阻止迁移；多窗口保存与 partial release；取消、deadline、退出后无迟到写任务；旧 grant 退役。单独 headless apply 不证明真实 renderer ACK。

复用 Harvey 的真实网络 harness/fixture，不再新增重复独立网络 harness。账户验证只从 app 的 AuthStart→授权 URL 私有文件→浏览器 callback→同次 AuthCallback 交换进入，禁止 token 注入。已有公开输入：

```json
{"issuer":"https://auth.x.aixgg.com/oidc","client_id":"il4abzwbu1ohjwv5mb667","resource":"https://cyberbus.x.aixgg.com/api","product_id":"cybernote","redirect_uri":"http://127.0.0.1:17897/callback","bootstrap_peers":["tcp://43.155.169.102:11010","udp://43.155.169.102:11010"]}
```

Android 回跳为 `com.local.notesclone.auth://callback`。正式 cybernote 产品隔离，不复用 sample cyberbus。私密输入只记录路径，不含账户值：

- `cath-w:/home/water/work/codex-work/logto/.cybernote-product-20261118T113336Z/qa-primary/{public-config.json,test-account.json}`
- 同父目录 `qa-secondary/{public-config.json,test-account.json}`。
- callback driver：`cath-w:/home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/drive-hosted-login.py`。使用 `--private-dir`、`--authorization-file`、`--callback-file`；不要使用 hardcoded 18765 的 `--deliver-loopback` 或全局改 sample。用本轮 0700 私密副本适配 driver/dispatcher，把 callback 交给本候选 17897 的同次 SDK 交换。
- native headless 仅 debug+sync-e2e+`NOTES_SYNC_E2E=1`+`NOTES_SYNC_E2E_HEADLESS=1`，授权 URL 仅落 `NOTES_SYNC_E2E_AUTHORIZATION_FILE` 指向的本轮私密文件。stdout/回执不得出现 URL query、凭据、token、grant 或 `.env` 真实内容。

以上 QA 路径来自既有已授权服务调查；本轮未 SSH 重读凭据、创建新账号、发起线上登录、重启或更新服务。

## 487c8fde + e26ac0d1 收尾复核

2026-11-18，用户要求收敛到核心与 CLI，UI 交用户手动验证。准确账户基线 **`487c8fdec94ba1d95bf607cb8389d12057b9b959`**，已包含 core **`e26ac0d11c764b4e0f06cc644cbf72177b56e78d`**。本次结论：**BLOCKED，A1 已关闭；A2/A3/A4/A6 待已提交修复；A5 接受为迁移限制**。tests incomplete 指完整真实账户链未验，不表示本轮 CLI 没有执行。

### 结果与 finding 处置

| 项目 | 此提交结论 | 独立证据 |
| --- | --- | --- |
| A1 E0499 | **关闭** | lexical scope 结束 preparation future；普通与 sync-e2e check 均通过 |
| workspace cache | **此修复通过** | workspace-v8 与 registry-v4 分别校验；派生 workspace cache/restart/path rejection 用例通过 |
| bounded profile | **此修复通过** | 64 台长名称 roster 截到 7KiB 内；实际离线 SDK 验证及 canonical protobuf 拒绝用例通过；未扩大输入验证 |
| A2 本地退出收敛 | **仍阻塞** | mod.rs 与旧基线 blob 相同；无 grant 重试仍走 RevokeGrant→Unsupported；不覆盖作者 dirty 修复 |
| A3 授权错误投影 | **仍阻塞** | worker 生产部分字节相同，仍清错为 connecting/paused |
| A4 DTO 错误 | **仍阻塞** | types.rs 与 account-client.ts 均与旧基线 blob 相同，四项独立失败的被测接口未改 |
| A5 旧 grant | **接受为明确限制，不阻塞本轮** | 主设计已明确新的最小退出/迁移契约，见下文 |
| A6 profile skip | **仍阻塞** | worker 生产部分字节相同，仍统一跳过 profile 校验失败 |
| core F1–F4 | **采用 core review02 的已通过结论，不重复阻塞** | core/vendor Git tree 与其独审准确对象一致；调用侧使用共享 read+claim parser |

源码一致性与 commit/tree 标识保存在 [scope.json](fixtures/cyberbus121-account-487c8fde/scope.json)，不是凭后续未提交工作判断。core e26ac0d1 的 `crates/notes-cyberbus` tree 为 `3997526752321402e0096e90555b54c85ec9c003`，vendor tree 为 `0055afb270d2aa0d17b80cc5fb53637e03b24c85`，分别与独审 `2b24104a` 相同。core review02 在其独立范围完成 27 个原测试、8 个 adversarial 测试和 check，已关闭四项 finding；本账户复核没有再启动重复 core 故障增强。

账户 bootstrap 仍先 `read_bootstrap_context` 再 `claim_bootstrap_context`，没有硬编码旧 80-byte prelude，已适配 core 的 NCBBOOT2/112-byte receiver-only nonce。该结论是源码及类型检查，不把它扩称为真实多账户 bootstrap 已通过。

### 实际 CLI 检查

为排除作者当时已 dirty 的 mod.rs/private.rs 等文件，新建准确 detached checkout：

`/var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/cyberbus121-review-487c8fde-ed2lk3cm`

使用与前述相同的 target cache、vendored PROTOC、debug=0 和仅用于类型检查的 bundle override。精确命令、exit、耗时见 [results.json](fixtures/cyberbus121-account-487c8fde/results.json)。全部带 `--offline --locked --manifest-path src-tauri/Cargo.toml`：

| 命令/selector | 独立结果 | 耗时（含编译） |
| --- | --- | --- |
| `cargo check` | PASS，exit 0 | 37.280s |
| `cargo check --features sync-e2e` | PASS，exit 0 | 9.213s |
| `cargo test --features sync-e2e --lib account::` | **29 passed / 0 failed** | 75.121s |
| `cargo test --features sync-e2e --lib account_policy_real_store` | **3 passed / 0 failed** | 1.424s |
| `cargo test --features sync-e2e --lib sync_headless::` | **7 passed / 0 failed** | 1.359s |
| `cargo test --features sync-e2e --lib sync_e2e::` | **4 passed / 0 failed** | 0.498s |

前 3 项 subprocess 上限各 240s，后 3 项各 180s，均未触发 timeout。普通/check 仍有 35 warnings，test 22 warnings，未因 warning 放开验证或改产品。日志在本轮 fixture 目录。`sync_e2e::` 这 4 项是纯 Rust 参数/ready 门控和有限回执函数单测，**没有启动 WebView 或执行 UI 操作**。3 项方向用例使用真实 Store/Session/Noise/SyncService，检查 durable inbox 和附件原字节；使用 fixture Gate，不能替代真实 Logto/SDK profile/Bootstrap 链。

### 退出契约与 A5 限制收敛

按照用户收敛范围，任务协调者在主设计 `docs/architecture/cyberbus-migration-20261118.md:33` 已补最小退出契约：SDK 确认本地 grant 关闭且旧网/写任务退役即可完成幂等本地退出；云端撤销失败或未知单独保留，不能冒称成功，也不阻塞已完成本地清理后的重复退出；真实本地持久化/关闭失败继续明确失败。

旧 `.account/grant.json` **不读、不导入、不恢复，不创建旧长期认证 owner**。新退出仅对 CyberBus 授权给收据，不宣称历史授权已全部云撤销；旧授权服务端状态未知，作为本轮明确记录的迁移限制。因此原 A5 不再是本轮阻塞，也不要求扩张在线旧 token 撤销。原 checkpoint 的“文件保留”观察保持准确，改变的是已明确的迁移契约和处置，不是补做了旧云撤销。

### CLI 烟测协作与 UI 手动边界

任务协调者安排与 Goodall 协作：其正在修 A2/A3/A4/A6，将另给准确提交。对方报告 dirty 修复/局部测试时，本独审没有读取那些产品修改，也没有把它计为通过；新 SHA 到达后继续快速复核四项。

此时没有冻结的 native headless 可执行包，也没有已执行的真实 app 授权 smoke。本轮没有占用 17897、启动用户应用、创建 Keychain grant 或运行 notes UI 自动化。现 Rust headless 固定 Action 已有 signIn/setEnabled/syncDevice；既有 `scripts/verification/account109-headless-driver.mjs` 的 OPS 尚不接受这些新操作，不能直接拿旧 driver 宣称可运行真登录。若后续执行，须在本轮独立 fixture/私密副本加入相同的固定白名单，并与作者明确唯一端口/进程归属；授权 URL/callback 仍只走本轮 0700 私密目录与 0600 文件，禁止 token 注入。没有为此新增第二套网络 harness。

UI 留给用户的手动记录只需沿用 `docs/verification/cyberbus120/TEST-CASES.md`，在新准确包上记录：两个授权入口/回跳与取消；设备名称、在线/离线与未知/空库摘要；暂停后仍发现设备；显式开启前后的本地资料保全；三方向动作/进度/终态；退出、网络失败恢复与冷启；多窗口保存/附件/冲突/inbox。每例记录包 SHA、起止状态及是否满足预期；未操作不填 PASS。当前没有生成或声明用户可手测的新包。

## 0f3cd922 有界修复复审

2026-11-18，独立复审准确提交 **`0f3cd92236cbd60ea7d84b3c133aabe44e8239b7`**，仅收敛 A2/A3/A4/A6。结论：**PASS，可合并本轮核心与 CLI 范围，没有新增阻断**。A5 保持已接受的明确迁移限制，不追加历史 grant 在线撤销、设备测试或真实原生账户烟测门槛。

### 四项 finding 的关闭依据

| ID | 结论 | 源码及独立执行证据 |
| --- | --- | --- |
| A2 | **关闭** | `mod.rs:897–943` 的 `LogoutReceipt` 先要求 SDK `local_closed=true` 且无本地错误，单独保留云失败/未知。`logout_bus` 通过真实 `GetAuthState.refresh_supported` 选择 RevokeGrant/LocalOnly；固定 SDK 中该字段来自内存或 protected vault 是否存在 grant，不是静态能力。`finish_local_logout:613` 在报告云错误前已禁用内容、重播 release、清本地 binding 并保留有限错误。真实离线 SDK 无 grant 的连续两次退出、云失败/未知收据及本地失败拒绝用例全部通过。 |
| A3 | **关闭** | `worker.rs:374–440` 的生产 `lifecycle_error/worker_phase` 优先投影 reauth、Degraded、persistence pending、关闭和网络失败，paused 不再覆盖错误；worker 每轮调用此函数，再交 `fail`。`mod.rs:414–424` 将显式 SyncNow 的失败写入当前 generation 状态。相同生产投影函数的连续健康→失效→恢复 typed snapshots 测试在 enabled true/false 均通过；内容 admission 的真实 lease / owner 检查保持不变。 |
| A4 | **关闭** | 实际 Rust `SafeError` 序列化 → 实际 `account-client.ts` 校验/IPC/恢复动作检查通过。SDK code 只接受整数 1–26 且只适用于 `account_sdk_failed`；unknown outcome/deadline 保留类别，额外字段与错误组合仍拒绝；显示使用固定本地文案。5 个真实序列化样本通过，11 个非法组合全部被拒绝，`pnpm typecheck` 通过。 |
| A6 | **关闭** | `worker.rs:476–530` 对未发布/其他应用类型 profile 保持明确跳过，对本地或 SDK 已认证且声明 Notes 类型的 profile 执行 `profile(d)?`。错误清 catalog 并向 worker/账户传播，不再返回成功空目录。首次损坏、已有历史后版本不兼容、canonical wrapper 内语义损坏 summary 三类测试通过。 |

退出后的后续动作也核对了源码：云撤销失败时，第一次 signOut 仍返回该有限错误，但 binding/profile 已本地清理；再次 signOut 使用无 grant 的 LocalOnly，不再永久卡在 Unsupported。错误会话发起 signIn 若先遇云撤销失败，会先完成本地退出并返回错误；用户再次明确 signIn 可进入 AuthStart，不保留旧 binding 阻断重登。AuthCallback 已提交后的取消也复用同一清理路径。这些完整 Tauri Runtime 动作序列的结论来自源码链路和收据/真实离线 SDK 子路径组合，**没有运行真实云端失败后的原生端到端序列**。

既有精确限制仍保留：旧 worker 已异常结束时，首次 `stop_network` 会在取走并 await 旧任务后返回其错误，本次动作不会宣称退出成功；再次明确操作才能继续 stop/logout。修复没有将该失败伪装为成功。A3 的 typed snapshots 测试直接调用生产投影函数，**不是**向已运行 Tauri Runtime 注入完整 SDK 事件；本轮通过不夸大其覆盖。

### 冻结输入与独立 CLI 结果

被测 detached checkout：

`/var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/cyberbus121-review-0f3cd922-kuiqunh8`

本次检查由独立审阅者直接运行。node_modules 链接仅提供现有依赖，Rust/TS/DTO 脚本均读取冻结提交；未使用作者 dirty 源码。每个 subprocess 上限 240s，无 timeout。精确 argv、环境、exit、耗时见 [results.json](fixtures/cyberbus121-account-0f3cd922/results.json)，输入与变更范围见 [scope.json](fixtures/cyberbus121-account-0f3cd922/scope.json)。所有 cargo 命令附带 `--offline --locked --manifest-path src-tauri/Cargo.toml`：

| 检查 | 独立结果 | 耗时（含编译） |
| --- | --- | --- |
| `cargo check` | PASS，exit 0 | 12.530s |
| `cargo check --features sync-e2e` | PASS，exit 0 | 8.784s |
| `cargo test --features sync-e2e --lib account::` | **35 passed / 0 failed**，exit 0 | 24.261s |
| `node scripts/verification/cyberbus121-account-dto.mjs` | **5 native fixtures；11 invalid combinations rejected**，exit 0 | 0.982s |
| `pnpm typecheck` | PASS，exit 0 | 5.125s |

原始日志同目录：`check.log`、`sync-e2e-check.log`、`account-tests.log`、`dto.log`、`typecheck.log`。bundle resources/externalBin 为空的 `TAURI_CONFIG` 仅用于本次构建检查；未验证最终包资源/sidecar。账户测试包含本机 TCP callback 与临时 Store fixtures，没有启动用户应用、访问原 notes、创建真实账户/设备或 Keychain grant、修改线上服务。DTO 脚本再次执行一个选定 Rust fixture 测试，再内存构建真实 TS 校验器，没有 WebView/UI。

该修复只改 7 个作者文件，core tree 仍为 `3997526752321402e0096e90555b54c85ec9c003`，`vendor/cyberbus` tree 仍为 `0055afb270d2aa0d17b80cc5fb53637e03b24c85`，沿用前轮与 core review02 的已核对依赖。未改的方向 3 项、headless 7 项、e2e contract 4 项沿用准确 `487c8fde` 的独立结果，**未在此 SHA 重跑，也不算作新增通过数**。

### 合并结论与未验边界

本轮 A1/A2/A3/A4/A6 无剩余合并阻断，A5 已按主设计明确的迁移契约记录为限制。**可以合并 `0f3cd922`，不代表真实原生账户链已经交付验收通过。** harness/Store/Noise 或上述 CLI 均不能证明原生 AuthStart→callback→AuthRestore、真实云端撤销及完整多端账户链；这些仍为 **tests incomplete**。按用户本轮边界，不为补齐它们延迟合入，不运行新增在线/设备/UI 自动化；由 Tesla 的组合 Mac 包及用户手动 UI 记录补齐。审阅者仅提交本报告与本轮证据 fixtures，没有合入其他 README 或产品文件。
