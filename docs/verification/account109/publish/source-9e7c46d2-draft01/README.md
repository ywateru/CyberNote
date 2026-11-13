# 精确 9e7c46d2 sanitized source：本地阶段 DRAFT

2026-11-13。**PASS 本地导出准备；不是最终发布源。** 用户新增的“应用内窗口承载 Logto 托管页 + 系统浏览器”登录方式尚无实现于此 source。本 DRAFT 固定保留已审 9e 产品/pins，不自动纳入后续源码、docs 或新需求，也不升级任何实际验收结论。receipt 的 publicationBoundary 在准备完成后按 parent 新 steering 追加，仅修改外部回执，未改 DRAFT。

| 项目 | 精确值 |
| --- | --- |
| 开发 source ref | `9e7c46d2fcc8ed31bf1210ce4272f73edffe9143` |
| 开发 source tree | `01a62268e019b982dc2bb67e08a48b32a54dfe3b` |
| 新 DRAFT 路径 | `/private/tmp/account109-source-9e7c46d2-DRAFT-20261113-01` |
| 独立 parentless root commit | `2e7e67aa17794e8d5597f73c11e75d27c274ecf7` |
| DRAFT tree | `9010c07367042e55a137f866b4f483fbf3be2dab` |
| 导出 payload | **1,772 文件；95,286,315 bytes** |
| DRAFT product fingerprint | `ecf5ec075809d17a5b3e5b26ee207aad03558d6fb7cd825ef0f4123001aefd8a`；1,621 product inputs；clean |

在现有 clean detached 9e GUI build checkout 执行 exact committed tools，无新依赖 clone。工具与导出输入均逐字核对该 source commit；运行 `manifest.mjs --ref 9e…` dry-run，返回 changes=[]；export dry-run、唯一一次 `--apply --init`、新根内 `verify.mjs --new-root`、version check、只读 source identity 均通过。命令/耗时/stdout hash 见 [commands.json](commands.json)，精确身份、seals、工具 hash 与范围见 [receipt.json](receipt.json)。

新根与计划逐文件比对路径、mode、size、SHA，完全相同。计划 inventory 仅在内存中保留和比对，没有另写巨大 filelist 或中间 export。新根在初始化后至最终核查的 full seal 相等，涵盖 `.git`、路径/类型/mode/mtime/ctime、文件内容 SHA；不含 atime。独立 `.git`、单 parentless main commit/单 ref、零 remote，无 alternates/shallow/历史 reflog 或 unreachable 旧对象，均由现有 history validator 核查。

现有 reviewed allowlist、SHA pins、credential/path/binary policy、第一方 rights、第三方 license、runtime provider provenance 及 Rust/JS/Cargo/script dependency closure 均通过。四个 archive backup 是既有合成 fixture；public README/ignore/LICENSE/notices transforms 字节精确。private docs、live evidence、verification runner、store、build/cache/dependency 输出均排除。此为既有政策扫描和明确 inventory 边界，不声称模式扫描能数学证明一切敏感文本不存在。

workflow 与 9e commit 完全相同：contents=read、两个 checkout 均不保留 credentials、依赖安装前 verify、真实 arm64 Mac gate、固定 Android toolchain、八个明确 release upload 路径、两 job 各 60 分钟；无 publish/push/deploy 或签名宣称。这里只读核对 workflow，**没有执行 Actions 或访问远端**。

旧 `/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01`（root `66ad8c524841acd574b705ead8d08c7bb9a50ad7`）在本轮前后 4,553 项 full seal 相等；未在其中执行 Git 命令或写入。新旧 payload 无新增/删除，仅五个路径不同：`src/App.tsx`、`src/startup.ts`、`src/debug/runtime.ts`、`src-tauri/src/sync_e2e.rs` 及对应 export manifest。没有扩大 inventory。

旧 [9010 Node/frontend preflight](../current-source-node-preflight01/README.md) 仍仅适用其精确旧 root；不将它记作本新 DRAFT 的 install/test/build 通过。9e GUI 构建及 parent 报告的 live02 验收有各自独立 source/二进制/运行范围，本 source DRAFT 不重新执行或扩大其结论。

磁盘仅新增一个 DRAFT（实际目录约 146.5MiB）及本小型回执；没有创建 node_modules/dist/Cargo target、额外 clone、临时 payload 副本或待清理中间 inventory。可废计划数据仅驻内存，进程已结束。free-space 前后快照在 receipt，非并发工作区的单任务增量归因。HOME/CODEX_HOME 未覆盖；无依赖安装、产品构建、App/浏览器/ADB、网络、凭据、grant 或原库访问。旧候选、draft、store、sealed roots、共享 target 和历史证据不变。本目录 SHA256SUMS 覆盖全部归档文件（自身除外）。
