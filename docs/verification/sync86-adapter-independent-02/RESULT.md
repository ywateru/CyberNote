# SYNC86 媒体修复独立窄复审：原两项通过，整体尚未放行

本轮准确冻结产品为 `17af6dfc148e5d84de924ac47b69611e627e5722`，包括 `f2491f61` 的媒体 scope/TLS 与 `17af6dfc` 的本机 stale socket 恢复。本轮没有修改产品；原 `c11dcc56` blocked 日志与 build09 失败原件均保持。主线媒体规范来自 `docs/architecture/sync.md` 的 2df2ecda/b8b87db2 补充，不能以较旧的窗口协议缩小媒体约束。

**原 c11 两个媒体持 Session 锁的 P2 在本轮独立实验中已解除。整体 adapter 暂不放行**：根和作者随后在 exact build10 锁定文本 keep-all 分支确认了另一条真实错误——resolve 已 commit 并增加 epoch 后，又用提交前 Token 读取 conflicts，使真实成功返回 access_changed。这不在本轮已通过的 22 边界中，必须另冻结最小修复及窄复审。不得把本报告作为 build10 全功能通过。

## 64MiB 真实前台读写与旧 scope 拒绝

沿用 c11 的真实 Store/Session、临时 SQLite 与 64MiB 合成字节图片构造方式。独立追加模块使用真实 `Session::workspace()` 和 `Session::ordinary(patchNote pinned)`，不靠 try_lock 次数推测响应，也不要求短 gate 完全不竞争。读写与后台工作并发执行，前台修改改变 generation，旧 scope 必须实际返回 PlanStale，随后重新准备并成功执行原操作。

| 操作 | 后台阶段墙钟 | 完成的前台读 | ordinary 写 | 最长单次前台命令 |
| --- | ---: | ---: | ---: | ---: |
| 本地已存在媒体的 preflight | 9866ms | 2304 | 1 | 27.060ms |
| 移除合成 cache 后的 cold capture/flush | 14654ms | 3474 | 1 | 11.314ms |

两个测试自然通过。preflight 重试保留准确 64MiB 引用，前台置顶保留；capture 的 stale 不清 dirty，真正重试后 inventory 可读、串行 staging 为 0、完整 blob 为 1。测试执行 82.72 秒含两套大媒体构造和后续重试；命令墙钟 105498ms 含冷编译，自然退出 0。不可把表中的阶段墙钟当作整个测试耗时。见 `foreground.log`、`foreground-command.json` 和 `independent-mutex-recheck.rs`。

## 独立文件、回滚、重启及自动重连反例

`independent-proof-recheck.rs` 另外验证：修改文件内容后恢复原 mtime 仍被 ctime 检查拒绝；同字节换 inode、额外外部 hard-link 改变 nlink、目的改为 symlink 均使准备凭据 stale。另一 peer 的真实收件使旧 generation stale；实际 SQL trigger 在附件行 INSERT 时失败，inbox 保留、业务笔记未投影、原本机附件不受损。删除 trigger 后关闭并重新打开同一 owned Store，保留原完整文件，重新准备后成功 apply，inbox 为 0，两个附件使用不同 relativePath，串行 staging 为 0。这是正常关闭后同根重启，**不冒称 SIGKILL/crash fault**。

`independent-retry-recheck.rs` 在 **receive_head** 边界独立制造一次真实 generation 竞争，与作者的 flush 边界用例不同：生产 snapshot.verify 后通过真实 ordinary 置顶改变 Store，再让真实 sync_with_media 拒绝旧 proof。包装器仅安排这个确定性竞争并转发其他生产 backend 方法，不伪造 wire、receipt、数据库或 PlanStale 返回。实际 Noise/WebSocket 客户端没有 syncNow、wake、connect、第二次 pair 或 headless_apply；它自动重连，第二次 receive 成功，两边各经真实 quiet ACK/commit，最终两个 SQLite 的 dirty/inbox 均为 0。观测 receive 尝试 2 次，恢复阶段 1533ms。

该小型命令选择 `independent_` 且显式 skip 两个已完成的大媒体用例，实际 **5 passed**，其中 3 个是本轮新增反例、2 个是该 filter 同时选中的既有独立归档/blob 测试；148 filtered、0 ignored。日志不将 5 项全部冒称新增测试。命令自然退出 0，精确墙钟见 `proof-retry-command.json`。

TLS 显式 provider、ready channel 的 Disconnected/Timeout 分类、网络 3 文件/256MiB 与本地串行 1 文件预算的既有受影响专项，在复制生产 harness 独立执行共 4 项通过，均自然退出 0，见三个专项日志和 `affected-command-results.json`。TLS 检查只证明构造的真实 rustls connector/provider 配置和静态公共 roots 接入，**不证明实际公网 wss 握手或隧道路由**。预算原值未放宽，本轮没有制造 4GiB 实占用或低磁盘故障。

## exact build10 原 22 边界复验

不可变二进制 `/private/tmp/sync86-transport-build10/notes-current-attachment-transport`，SHA256 `2f21f7ff9f6abad3b341585a16e973714c81af7c93eef0f4e2a435bd2eb53515`。原 c11 的独立双进程 driver 只替换输出目录与 binary 路径，两份真实 SQLite/Noise/WebSocket 的 **22 个断言通过**。包括取消终态、participants、真实 5 秒超时、metadata 顺序、owner 保护及无窗口不降级。两个 owned Rust 进程均自然退出 0。

内层实验 20773ms；Node 总命令 56006ms，由原 driver 尚未取消的请求超时 Promise 延后退出，不能用内层时间冒称整条命令墙钟。前后 source fingerprint 一致 `8f3f05176e6890ca977b610ca51bc1cacb9807f6eef2c6864fd90afb4296fa00`，binary SHA 前后一致，实际 PID/退出见 `boundary-status.json`。它不包含 locked keep-all，不能外推该分支。

## 源码完整性、构建隔离与范围

独立 Rust harness 在 `/private/tmp/sync86-independent-review-02/lock-harness` 复制 **46 个生产源码文件**；`copied-source-audit.json` 按 `git show 17af6dfc:路径` 逐一比对字节。只有 session 测试模块显式路径及三个独立测试模块追加，未改变生产算法。Cargo/lock 来自冻结源的 lean runner，未占 main 或 85 target；明确独占 84 target 完成后已通知作者释放。`prepare-harness.py` 可从固定 git 对象重新构造，不读取正在变化的产品源码。原有三个 ignored crash-worker 入口没有修改，本轮有意筛选的命令未运行它们；作者完整 suite 原件另保留。

静态审查确认：凭据无 serde/peer 构造入口；snapshot 与 finish 两端校验 Session/Store/generation；完整 File 身份包括 inode/大小/mtime/ctime/nlink；scope 缺证明不锁内回退哈希或 copy；哈希缓存最多 256 条且不缓存旧授权/generation；owned hard-link 短发布仍使用独立 relativePath，精确刷新自有 nlink/ctime；本机 PlanStale 从已认证 serve 返回并终止该 socket，未增加 wire variant，客户端走已有 Transport 退避。以上结构与本轮实验共同支持原两项修复；不能替代未覆盖边界。

没有真实用户库、旧 Android/13 秒录音、真实麦克风、Apple Notes、VPN 或公网操作，没有构建/安装 APK。本轮不证明实际双 App DOM/PM/Undo/录音 ticket/picker、OS 生命周期、Android runtime、真实公网 TLS 或自然崩溃恢复。最终 adapter 结论等待 locked resolve 的新冻结修复和受影响窄复审，不重复已通过的昂贵大媒体套。
