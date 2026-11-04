# D2 普通文件夹名称边界阻塞修复09

状态：**SOURCE-READY / STOP，等待固定提交后独立复验。共享 host target 已释放。**

修复基线 `64773232a9f81d110a8695f4f1531a2c5977dca8`。依据 D2 任务的 Independent review correction 与独立审查 P2，普通 `createFolder` / `renameFolder` 在 `trim()` 后按 UTF-8 字节拒绝超过4096的名称，沿用空名称拒绝和 `invalid` 错误。校验在 `put_folder` 前完成。未放宽启动图校验，未修正或重写旧数据；未改 UI、依赖、lock、Session/lib 或 O 实现。

作者产品与测试改动仅：

- `src-tauri/src/store.rs`：两处写前长度判断；注册新测试模块。
- `src-tauri/src/store/folder_name_tests.rs`：真实临时 Store 的边界与冷重开回归。

## 实测

| 记录 | 结果 | 区分力 |
|---|---|---|
| `run01-before-fix/` | exit101，0通过、1失败、71过滤，5.172秒 | 新测试先直连原产品；ASCII4097名称被创建成功，`unwrap_err` 失败。原始完整失败日志保留 |
| `run02-fixed-regression/` | exit0，69通过、0失败、3既有忽略，7.334秒 | 完整生产 Store/Session 测试模块，包含新边界测试、smart、open、archive、日期、附件和访问屏障回归 |

新测试分别经过普通新建和重命名，对 ASCII4096及 `中`×1365加`a`（4096 UTF-8字节）成功写入并冷重开，验证两端空白被 trim。对 ASCII4097、`中`×1365加`ab`（4097字节）及纯空白逐一拒绝。每次拒绝核对 `invalid`、SQLite写入总计不增加、整个临时库目录全部文件字节不变（含数据库/WAL/SHM及保留附件）、工作区不变；随后关闭 Store 并重开再次核对工作区与有效名称。合计4次有效边界写入、12次无副作用拒绝、16次冷重开。

Harness 新建于本目录，模块通过符号链接直接引用生产 Store/Session，未复制求值器或实现替身。Cargo.toml/Cargo.lock从前次封存harness逐字复制，未改依赖。所有测试 `--locked --offline`、jobs2、独占 `src-tauri/target`，每次600秒上限、开始前至少2GiB；最低记录可用空间约70.47GB。精确命令、前后源码散列、旧证据普通文件散列、空间及退出结果在各次 `result.json`。两次运行期间源码不变；原作者及独审证据普通文件全部未变，旧harness生产源码符号链接不视为封存文件副本。

未重跑宿主库检查，未构建平台包、操作 GUI/ADB 或用户数据库，未 stage/commit。工作区 O 任务文档的其他改动属于 root，不在本作者修复范围。O 继续 pending。本次只关闭名称写入与启动校验的不一致，不表示智能功能、平台新包或像素一致已经完成。

固定产品/测试输入见 `source-identity.json`。独立复验应以 root 随后固定的提交为准。
