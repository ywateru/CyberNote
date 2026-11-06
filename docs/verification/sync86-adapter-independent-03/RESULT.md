# SYNC86 adapter 最后窄复审：PASS（Rust adapter 模块范围）

准确产品冻结 `cd334bc88513a89c490788d2e2e27c7967575f4a`，作者随后追加的纯证据为 `478a8aa87fd53926b8975f72deaf571c5e0dbb8f`。本轮只复审 locked resolve 成功回包与授权/身份边界，不重跑已通过的大媒体矩阵。原 `c11dcc56` blocked、build09/10 失败及 `2a6d4043` 的 17af 窄复审证据均保持，不能追认旧包通过。

## 最小产品差异

已按主线正式契约 `56fa8fda` 核查 `17af6dfc..cd334bc8`：Quiet/Terminal 保存原 Store 实例 UUID；终态保存该 operation 的 commit Token；prepare/final gate 拒绝同 Session 重开 Store。resolve 确认同一 operation 已 commit 后，在同一个短 Session gate 核原 Session/Store、terminal commit Token、原参与者与当前 live window，直接纯读 conflict rows。它不再拿提交前 epoch 做第二次 conflicts 调用，也不再次 flush。普通 Conflicts 原 expected 与最终授权检查仍保留。

静态审查未发现借此次修改放宽 peer/wire 或任意身份验证。Store UUID 为每个 `Store::open` 新建的本机进程实例标识，不是设备/workspace 持久身份；不会进入 wire 或改变同步 counter。媒体/网络算法相对 17af 没有新的修改，复用 independent-02 已明确冻结范围的验证。

## 独立对照和额外边界

复用作者真实 Runtime/Session/Store 的 deterministic window fixture，在复制的 cd334 源码中扩展两个独立测试，实际共 **7 passed / 148 filtered / 0 ignored**，自然退出 0。命令墙钟 **19313ms**，含 15.23 秒首次编译；Rust 测试时间 3.35 秒。使用独立 package 名 `notes-sync86-independent-resolve-review`，防止与作者或 17af 共享 target 错认已缓存的测试二进制。

五条原 fixture 独立重放：locked keep-one 与 keep-all 均发生一次真实 commit，epoch 1→2，命令成功返回空 conflicts，各副本使用原分支密码解密；旧 Token 调普通 Conflicts 仍拒绝。窗口关闭、替换 Session、同 Session 重开同目录 Store 均拒绝回包，已提交的数据保持。

两个新增反例：

- commit release 后通过真实 `Session::ordinary(unlockNote)` 再次授权，使 epoch **2→3**；原 resolve 回包明确拒绝，而不是用“当前 token”无条件放行。
- commit release 后通过真实 ordinary 创建另一条 dirty 笔记，epoch 保持 2；同时给 SQLite 安装禁止 `sync_identity UPDATE` 的 trigger。resolve 仍成功返回已提交 conflict rows，额外 dirty 保留。这会使任何二次 sync_flush 明确失败，验证该回包路径没有再 flush；额外笔记也没有被冲突处理吞掉。

复用同一扩展 fixture，再从固定 **17af git 对象**构造独立 package `notes-sync86-independent-resolve-baseline`，只运行两条 keep 分支作为负向对照。两项均在已有 commit 后真实返回 `access_changed` 而失败，自然退出 **101**；命令墙钟见 `baseline-command.json`，测试执行 1.46 秒。没有靠临时改断言把旧失败改成 pass。完整 `baseline.log` 与最终 `resolve.log` 原样保留。这也独立确认 build10 的错误属于产品回包逻辑，不能归因成单纯 driver token 刷新问题。

## 证据来源与综合结论

`source-audit.json` 逐项核对 **47 个源码文件**与 cd334 git 对象。只有 harness 的 session 测试路径，以及 `adapter_resolve_tests.rs` 中明确标出的 fixture 扩展不同；生产算法未修改。`prepare-harness.py` 从固定对象构造复制源，独立 package 命名；Cargo offline 只生成本地 harness 的 root package 名记录，不升级依赖。没有使用 main/85 target；84 target 已释放并通知作者。

immutable build11 `/private/tmp/sync86-transport-build11/notes-current-attachment-transport` 的 SHA256 独立核对为 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`，25,614,448 字节。上述七条验证执行的是准确复制生产模块及测试 fixture，不冒称运行该二进制上的 UI。作者 exact11 原未加 token retry 的真实进程套，另保留在 `sync86-adapter-media-repair01/process11`；其 49 项/故意 SIGKILL/自然退出范围以作者原日志为准，本报告没有把它冒称独立重跑。

综合 `independent-01` 原始发现、`independent-02` 的 64MiB 实际前台读写、真实 stale/自动重连、File/peer/SQL 回滚同根重试、22 项实际双进程及此次最后回包修复，**Rust adapter 生产接线模块的本轮独审 gate PASS，可供根合入后完成主线受影响整合**。未发现剩余确定 blocker。

这个结论不等于整个用户目标完成：实际双 App DOM/PM/Undo/录音 ticket/picker、OS 生命周期、Android 新包及真实 provider 保存、公网/VPN 路由仍由后续集成验证负责。本轮没有用户库、旧 Android/13 秒录音、真实麦克风、Apple Notes、安装、发布或公网操作。
