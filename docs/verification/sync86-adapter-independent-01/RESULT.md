# SYNC86 adapter 独立审查：blocked

审查产品冻结 `fb6a265f4274334352c5a584a918da80f23f70ee`，作者证据 `1b4c5d879d4c7919fea2c03a376d3e9592d2ca1a`。本轮没有改产品源码，没有 merge/push，也没有操作任何 Android 设备、用户数据库、真实麦克风、Apple Notes 或公网。工作目录始终为 `/private/tmp/apple-notes-sync86-adapter`。预算按主线 `0f95545a` 的网络 3 文件/256MiB、本地 1 文件/256MiB、合计 4 文件/512MiB 审查。

## P2：已有媒体预检和本地 dirty capture 在 Session mutex 内做大文件 IO

**此项阻止合入。** `src-tauri/src/sync/adapter.rs:144` 在 `self.with` 的 Session 锁内调用 `sync_validate_receive`，后者在 `store/synchronization.rs:554` 为与本地同 ID 的附件执行完整 `hash_file`。因此完全合法的已有媒体版本预检会阻止前台保存、录音 checkpoint 和窗口 ACK 使用同一个 Session。后面的 `validate_allocation` 在锁外，并没有移除前一步的持锁哈希。

另一个实际入口是 `adapter.rs:113` 的 `flush`：`self.with -> Store::sync_flush -> flush_in -> capture_blob`。`store/synchronization.rs:304` 和 `store/synchronization/blob.rs:95` 在同一个 Session gate 内哈希附件并走 blob 发布/重复输入验证。只给含图笔记改置顶就会重新走这条路径。既有 Store 功能被生产 backend 注入后同样必须符合本任务“hashing、读 File、发布 File 不持 Session 锁”的正式契约；它会妨碍录音和编辑期间继续操作。

独立负向 harness 使用 64MiB 合成字节图片、临时 SQLite 和原样生产 Store/Session/adapter；不使用 FakeBackend。测量线程以 1ms sleep 周期对同一 Session 执行 `try_lock`，只存在该工作线程和测量线程：

| 实际入口 | 方法墙钟 | WouldBlock 次数 | 可取得锁次数 |
| --- | ---: | ---: | ---: |
| required_blobs，引用已在本地的媒体 | 4708ms | 1627 | 1519 |
| flush，媒体笔记 patchNote pinned 后 | 13637ms | 9106 | 1 |

两项都实际完成工作后才由反例断言失败；最终命令自然退出 101，没有 kill。`lock-review-final-command.json` 记录完整命令和独立墙钟，`lock-review-final.log` 保留完整失败与过滤数量（2 failed / 138 filtered / 0 ignored）。样本次数不等同精确毫秒，也不冒称实测连续最长锁时长；持锁 IO 的具体原因由上面的源码调用链确认。

`independent-mutex-review.rs` 是追加到复制 adapter 中的独立模块。`prepare-lock-harness.py REPO OUTPUT` 可重新构造同一只读生产副本。副本位于 `/private/tmp/sync86-independent-review-01/lock-harness`；`copied-source-audit.json` 逐文件核对生产字节，只有测试模块路径显式标注及独立测试模块追加两个 harness 调整，产品源码未改。初次编译相对 fixture/module 路径不适配的失败保存在 `lock-review-initial-harness-failure.log`。第二次 flush 探针误用了不存在的 `updateNote`，生产正确拒绝，日志 `lock-review-second.log` 原件保留；最终改用真实 `patchNote` 后才得到上述 flush 结果。第二次 preflight 同样已独立观察到 6140ms / 1951 blocked samples。

负向探针采用 `blocked == 0` 作为显眼的失败标记，**这不是要求修复后完全不取 Session mutex**，也不能据此修改/绕过授权检查或只迎合样本断言。正确修复须在短 gate 内取得有归属和版本凭据的快照，锁外做完整媒体 IO，再在最终 gate 重验；新增回归应核实 IO 期间 Session 可供真实前台命令使用，并覆盖并发变更后旧快照拒绝。现有 wire/摘要/归属/磁盘预算完整预检不得减少。

## 已通过的独立边界

原有 quiet 测试专项自然退出 0，8 passed / 139 filtered，见 `quiet-existing.log`。这是有意筛选的边界检查，不能说成完整 147 项回归。作者完整日志中的 3 个 ignored crash worker 入口仍原样保留于作者证据，本轮没有删除、修改或新增 ignore。

`boundary.mjs` 独立启动两份不可变 transport 二进制，各有独立临时 SQLite、真实 Noise/WebSocket。内层观测 22395ms，22 个断言通过，包括 no-arg/Token unknown 字段、真实窗口/旧 session 拒绝、有窗口 headless 拒绝、ready 后 cancel 线性化 abort、terminal 幂等、participants 增加使 prepare abort、真实约 5 秒 prepare 超时且 inbox 保留、后续正确 prepare 才 commit、实际 metadata 先于 release、迟到 cancel 不改 commit、owner 保护和无窗口时不降级直接 apply，以及恢复真实 participants 后正常 commit。A/B 两个 owned Rust 进程均自然退出 0。脚本有未取消的请求超时 Promise，Node 外壳会等待剩余计时器，所以 22395ms 只描述内层实验时间，不冒称 Node 总墙钟。

该脚本不是作者 `check-sync.mjs` 的结果复述，也没有运行 headless_apply 来写入业务；真实事件经过明确 poll/reply。`status.json` 保存脱敏事件和实际 PID/退出状态，不记录邀请串、PSK、identity 或临时 SQLite 本体。

## 源码审查与范围

审查了生产惰性 Runtime 注入、IPC tagged union/Token/window 校验、Prepared/adopt 恢复、持久 stop/resume、独立 quiet 状态与最终 intents/access/participants gate、终态回执、metadata/access/release 顺序、网络受控 stage/inode/长度/SHA/fsync/rename、已有 cache 与重复完成、网络 3 文件预算和本地 capture 共享发布锁，以及 Android backup 排除 XML。除上述持锁 IO blocker 外，本轮未发现新的确定 blocker；静态审查不代替 Android manifest 合并/编译/实际系统备份验证。

源码/二进制前后哈希均一致，`status.json` 存具体值。二进制 `/private/tmp/sync86-transport-build08/notes-current-attachment-transport` SHA256 为 `898331177b9f3f40fcc197c84acd1d93622bc3d453da078cf0c1429ebc81acc3`。相对文件名排序的独立源指纹为 `e1ee38964affa299310853b40458ce28c4a653db5f85f045bfb767bddb377729`；算法见 boundary.mjs，不能与作者使用绝对路径的指纹直接比较。Rust source copy 另有逐文件审计。

本轮不证明真实双 App DOM/PM/Undo/录音 ticket/picker 生命周期、OS 窗口退出、Android 新包、隧道或 VPN 路由；这些仍需后续独立整合。新邀请换 endpoint 还需真实 UI 可达性，由根另线安排。相同 workspace 的 backend pair 会复用本机 device identity；新邀请 ID 建新凭据，不能将简单修改旧串 URL 视为 endpoint 更新已实现。

结论 blocked，交原作者最小修复上述两个已复现入口及受影响的同类 IO gate，修复后保留本轮失败，再做受影响边界重审。本审查不修改产品。
