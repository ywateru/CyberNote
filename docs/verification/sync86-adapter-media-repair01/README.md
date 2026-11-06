# Sync86 adapter：媒体锁外准备与真实进程修复作者证据

2026-11-06。生产源码最终冻结 `cd334bc88513a89c490788d2e2e27c7967575f4a`，在独立工作树 `/private/tmp/apple-notes-sync86-adapter` 实施。原独审 blocked `c11dcc56afd9d4c649cc90560568f914bb0bb124` 保持有效历史；本目录不修改旧证据，不追认旧 binary 通过。正式契约见主线 `docs/architecture/sync.md`（媒体及终态回包约束由 root 管理）。本作者没有修改主线源码，没有操作 Android 原未保存录音现场、用户库、公网、隧道或真实设备。

## 源码、构建与归属

| 冻结源 | 变化 | 本目录归属 |
|---|---|---|
| `f2491f61d0096e629d4982d5011b3c5958bc7c2d` | 短gate取元数据、锁外File/SHA/capture、最终凭据gate、immutable File cache、per-attachment hard_link；显式ring TLS provider、channel分类 | `rust/f2491-*`、build09、process09 |
| `17af6dfc148e5d84de924ac47b69611e627e5722` | 本地PlanStale不误发peer Invalid/Protocol，认证socket结束后按原bounded backoff重新准备 | `source17af.json`、`rust/17af-*`、build10、process10、negative真实反例 |
| `cd334bc88513a89c490788d2e2e27c7967575f4a` | resolve已commit后按终态Token及原Session/Store实例/current window纯读冲突；保留普通Conflicts旧expected gate | `source.json`、`rust/cd334-*`、build11、process11、transport11 |

最终 immutable binary：`/private/tmp/sync86-transport-build11/notes-current-attachment-transport`，SHA-256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`，25,614,448 bytes，mode 0555。builder只输出target binary；作者独立复制、chmod、核对复制前后SHA。`build11/build.json` 的 sourceHead 与逐文件SHA固定，sourcesUnchanged=true；`immutable-binary.json`记录复制归属；dependencies.json记录依赖。binary及私有SQLite/identity/PSK不进入Git。

build09的SHA为 `895902782389431c4a3462b2bb3e80cd24c26b87248247ee96a1a62b8943afb4`；build10为 `2f21f7ff9f6abad3b341585a16e973714c81af7c93eef0f4e2a435bd2eb53515`。两个失败候选与最终11不可互换。

## 最终真实进程

原始 `scripts/debug/rust/check-sync.mjs`，未加Token重试、未改49条业务断言、未改deadline，在fresh `/private/tmp/sync86-media-process-final11`运行：49 checks通过，167 events，52,955ms，failure=null。sourceBefore=sourceAfter=`51ce7d18f207c18fb870658737635c495c40c5f1d2ac729f7b3e522eadfa37f8`，sourceHead为cd334。记录见 `process11/status.json`、`events.json`、`command.log`。

通过范围包括真实独立持久Store/Session、认证socket、note/folder/media同步、并发heads、keep-all锁文副本解密、保护/quiet窗口ACK、转发、配对恢复、purge、同目录崩溃重启。A-restart是用例明确SIGKILL，不能称自然退出；其后重启进程及其余9个owned Rust进程均自然code0，pending=0、errors=[]。该脚本提供stdin窗口替身；不证明真实WebView DOM、OS窗口、AVD、mic或公网路线。

原始 `check-sync-transport.mjs` 对相同immutable11、fresh `/private/tmp/sync86-media-transport-final11`：14 checks通过，1,143ms，failure=null，owned Rust自然code0。见 `transport11/`。

重放命令（cwd为本独立工作树）：

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync85-target node scripts/debug/build-rust-attachments.mjs FRESH_BUILD_DIR
node scripts/debug/rust/check-sync.mjs IMMUTABLE_BINARY FRESH_PROCESS_OUTPUT
node scripts/debug/rust/check-sync-transport.mjs IMMUTABLE_BINARY FRESH_TRANSPORT_OUTPUT
```

每次须fresh目录并单独复制immutable binary、记录hash；不能把可被下次cargo覆写的target路径交给下游。

## Rust验证与未改变分支的复用

f2491媒体源码：独立84 runner完整152 passed / 3 ignored，131.42s，见 `rust/f2491-store-full.log`。3 ignored是被边界父测试调用的subprocess crash worker；不把它们算成独立通过。f2491完整85为22 passed，Tauri check自然0。

64MiB正式真实前台响应采样如下（同完整84日志；墙钟包含锁外媒体工作）：

| 入口 | wall ms | workspace读 | ordinary写 | max μs | p99 μs |
|---|---:|---:|---:|---:|---:|
| cold_required_blobs_stale | 7895 | 2698 | 1 | 5295 | 1227 |
| cold_flush_capture_stale | 10182 | 3681 | 1 | 4950 | 582 |
| cold_receive | 7257 | 2591 | 0 | 1359 | 495 |
| cold_quiet_prepare | 6660 | 2422 | 0 | 1513 | 549 |
| cached_quiet_plan | 3 | 1 | 0 | 1098 | 1098 |
| cached_quiet_apply | 8 | 2 | 0 | 2158 | 1049 |

两次真正并发ordinary写均使旧scope typed stale，真实重新准备成功。测试不要求旧blocked探针等于0，不删除Session短gate。小测试覆盖原地改文件/换inode/删文件/symlink、不同peer/generation stale、cache不复用授权/DB generation、独立hardlink路径/unlink、SQL失败保留inbox并重试、缺凭据无hash/copy fallback及预算。

17af narrow delta：完整85为23 passed（lib12、download1、independent3、network6、process1），见 `rust/17af-network-full.log`。真实Store/Session普通pinned修改制造generation stale后自动重连专项1 passed/2.06s，未sync_now/wake/connect/第二次pair，flush_attempts=2、真实quiet commit、双方dirty/inbox=0；见 `17af-automatic-stale.log`。Tauri check自然0/2.09s。stale-wire负向日志保留为自然101。

cd334 narrow delta：清理本package缓存后实际重新编译，5条resolve专项全部通过/2.09s，见 `rust/cd334-resolve-clean-pass.log`；随后同本树Session synchronization 8条通过/1.33s，见 `cd334-session-clean-pass.log`。Tauri check自然0/2.39s。keep-all与keep-one均确认真实epoch1→2、一次commit、成功回包conflicts=[]，密文副本实际按各自密码解密。提交后关闭真实调用window、替换Session、同Session reopen Store均typed access_changed，绝不返回新库冲突行；普通Conflicts仍拒绝旧Token。此次只改终态回包/身份gate，按root要求复用未改媒体分支64MiB证据，没有反复重跑无关全套。独审17af证据另见 `sync86-adapter-independent-02`，不归为作者运行。

## 保留的真实失败与被证据推翻的判断

1. exact09原真实进程首次同步失败（process09）。仅两条安全typed-code eprintln的诊断构建明确标为非exact产品binary：adapter本地sync_plan_stale被wire转换Invalid，远端Protocol，自动恢复中止。trace原源、driver及结果在diagnostic09；其中简单诊断一次未复现也保留。17af修正socket错误分类，不扩wire词汇、不放宽deadline。
2. exact10原脚本36 checks后locked resolve返回access_changed（process10-original-driver）。事件证明同operation已release commit并提升epoch，之后回查沿用提交前expected。曾推测driver Token刷新窗口；随后有界Token重试副本首次收到access_changed、重试第二次resolve自然abort/sync_deferred，推翻了driver归因。这是生产代码错误，不能用重试把已提交操作再次执行。原失败、有界driver、commandRetries和事件都保留在process10-token-retry及check-sync-token-retry.mjs；该副本只作诊断，最终11使用原脚本。
3. 同一新测试注入17af原源码，keep-all/keep-one均先证明commit一次及epoch提升，再因access_changed自然101（negative/17af-resolve-keep-all-one.log）。无生产补丁；provenance记录git archive来源与测试SHA。
4. 初期编译/测试失败保留exploratory：Debug trait补齐、媒体测试首稿、自动重试测试首稿的unsupported title误用等。自动重试诊断assert里重复持锁造成测试驱动死锁，owned PID16510由作者SIGINT终止；不称自然退出，不归咎产品。正式自动恢复测试改为支持的pinned并通过。
5. resolve专项首稿误读raw locked note的空plainText，改从授权workspace检查实际解密；同时暴露Session替换时等旧terminal最终deferred，生产等待环改为立即拒绝原身份漂移。原失败日志保留。
6. 给17af做回归负向时，直接复制transport harness缺少测试fixtures/hooks，首轮编译失败；一次Python tar驱动不兼容也保留。改用原repo布局后负向真实复现。随后相同package共用Cargo target误复用负向测试产物；仅touch根文件未使Cargo重编译，两次失败和一次不具最终归属的Session8条都保留并明确排除最终结论。最后 `cargo clean -p notes-sync84-store-tests`（只清build artifact，见日志）后完整重新编译当前cd334源码，才形成最终5+8条通过。后续独审已提醒使用独占target/不同package或强制重编译。

## 实现及边界

媒体凭据持有已验证File及完整身份，scope绑定DB generation与Session授权；有界跨scope File SHA缓存不缓存generation或授权。最终gate核generation/root、所有文件身份、明确缺失路径、受管目录不是symlink。materialize采用每attachment独立路径hard_link，只接受自身准确nlink/ctime变化；不支持则typed失败，无锁内copy退路。网络3/256MiB与本地串行1/256MiB合计仍4/512MiB，单blob256MiB/cache4GiB/reserve不变。

TLS明确ring provider、public roots，不依赖进程自动provider；Disconnected与真正Timeout分开分类。这些Rust测试和本机ws进程不代替真实wss路线，公网复验由root交路线作者处理。最终resolve终态记录commit Token与Store实例UUID，接受本次commit的合法epoch提升，后续额外授权变化仍拒绝。Store实例变化也使进行中的quiet abort。普通Conflicts仍完整expected前后gate。

本目录只归档文本日志、脱敏事件/status及逐文件SHA；没有数据库、凭据、用户内容或binary。`artifacts.sha256.json`覆盖除自身以外所有文件，后续补证据须另commit并重算。当前工作不代表86/87、DOM、native窗口、Android或公网整体验收完成，作者不自行merge/push。
