# APP-SMART-D2 名称边界阻塞修复独立复验

**结论：pass。** 固定源码 `9bdc441f7791a53de99baba58e6d0244d5849f6c`。本次只复核前次 D2 独审的名称 P2 blocking；该项已关闭。前次对 D2 其他数据契约和公开 gate 的审查继续见 `app-smart-d2-durable-rules09.md`，其原始 blocked 报告与失败证据作为历史保留。

**Findings：** 无新的 P1/P2/P3 blocking 或 non-blocking finding。

任务依据是 `docs/plan/tasks/app-smart-d2-durable-rules09.md` 的 Independent review correction。与 `98fc5b8` 比较，产品/测试仅改 `src-tauri/src/store.rs` 和新增 `store/folder_name_tests.rs`；store.rs 除测试注册外，仅在普通 createFolder、renameFolder 的 trim 与空值检查后加入 `name.len() > 4096` 的写前 `invalid`。`store.rs:542–564/567–580` 的这两处判断均在修改 Folder 与 `put_folder` 之前，Rust 字符串 len 使用 UTF-8 字节，与既有 `archive.rs:227` 和智能名称校验一致。没有放宽 open/graph 检查，也没有改名或重写旧用户数据。

作者固定身份的18个 Store/Session/lib 输入与实际文件、固定 commit 全部匹配；前次 D2 十项身份中除预期改变的 store.rs 外，其余九项逐个相同。无需重复原 D2 已通过的完整规则/归档/门禁验证，也未重跑宿主 check。

独立新建符号链接 harness 直连生产 Store/Session，沿用作者 Cargo.toml/Cargo.lock；只运行 `folder_name` 过滤器，实际 **2通过、0失败、71过滤**，exit0，6.291秒：

| 实测 | 结果与区分力 |
|---|---|
| 将原独立 oversized 反例改为明确修复预期，写到新目录的 `fixed_original.rs` | 原样4097个 ASCII 字符，普通 create/rename 都明确 `invalid`；工作区及整个临时目录文件字节不变，关闭后正常重开且工作区相同。原 run04 未覆盖 |
| 生产 `ordinary_folder_name_utf8_boundaries_reject_before_write_and_cold_reopen` | 两种操作分别接受 ASCII4096、`中`×1365+`a`（4096字节），验证 trim 后保存及冷重开；拒绝 ASCII4097、`中`×1365+`ab`（4097字节）及纯空白。每次拒绝核对 SQL total_changes 不增加、工作区和全库文件字节不变，再冷重开。真实样本同时保留笔记、附件及设置 |

执行 `--locked --offline`、jobs2，独占共享 host target，600秒上限；最低记录可用空间约70.4GB，超过2GiB。18个生产输入运行前后完全一致；原独立 `oversized.rs`、`run04.txt`、`run04-result.json` 前后 hash 相同。命令、源码身份、文件身份和日志保存在 `docs/verification/app-smart-d2-name-boundary-fix09-independent/{inputs.json,result.json,run01.txt}`。

本次没有修改产品或作者封存目录，没有重复作者69项完整回归或宿主编译，没有 GUI/ADB/用户数据库、平台包、依赖下载或缓存清理，未 stage/commit。这个 pass 关闭 D2 的唯一已登记阻塞，不代表 O/U、智能功能、双端新包或像素一致验收完成。

**STOP；共享 host target 已释放。**
