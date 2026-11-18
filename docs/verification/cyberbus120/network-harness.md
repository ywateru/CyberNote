# CyberBus 双进程网络 harness 执行记录

日期：2026-11-18。分支 `codex/cyberbus124-network`，专属 worktree
`/Users/water/work/2026/Apple-Notes-Clone-cyberbus124`。仅提交本报告与
`scripts/cyberbus120-network/**`，没有修改 core、生产 Store/Sync 或其他 agent 文件。

**最终 real-report-05：`passed=true`、`stage=complete`。两个独立 SDK 安装各自真实
Logto 登录，经 SDK Data、生产 Noise/SyncService 和真实 SQLite Store 完成 push、pull、
both、方向隔离、离线重启、durable inbox 重启、并发双分支及生产 keep-all 恢复、暂停拒绝。
所有 worker 自然退出。停止新增场景，不再重跑在线授权。**

## 结果与根因

| 证据 | 实际结果 | 根因／判定 |
| --- | --- | --- |
| [01](../../../scripts/cyberbus120-network/real-report-01.json) | 两端 authenticated，discovery 超时 | 保留失败；当时没有完整构建绑定，不能反向补作精确源码证据 |
| [02](../../../scripts/cyberbus120-network/real-report-02.json) | SDK raw NetworkState true/true，但 core false/false；两端各 3 次 DirectoryReset；Data 0 | 对应 core revoke 后目录未重建问题；当时不能宣称网络端到端成功 |
| [03](../../../scripts/cyberbus120-network/real-report-03.json) | 新 core 后发现、SDK Data→Noise pair 成功，push 阶段 `store` | **harness 检查 API 使用错误**：dirty fixture 后 inspect 调用了必须先 flush 的生产 `sync_inventory()`，触发静态 `sync_pending_flush`。不是 fixture 内容非法，也不是传输或 Store 合并缺陷 |
| [04](../../../scripts/cyberbus120-network/real-report-04.json) | push/pull/both、离线身份/dirty/字节恢复和 inbox 重启通过；冲突断言失败 | **harness 冲突投影假设错误**：双端已有相同的两个完整 wire heads，双方 blob 均在；未投影分支的原附件 ID 无须立即注册到当前附件表。不是生产数据丢失 |
| [05](../../../scripts/cyberbus120-network/real-report-05.json) | 完整双端 CLI suite 通过，binary 未变，全部自然退出 | 保持生产验证与媒体 snapshot 规则，补实际分支与原字节恢复证明 |

03 修复只让 inspect 用只读查询取得现有非 redacted head digest，再调用生产
`sync_version`。不预先 flush、不改变 dirty、不绕过 Store 验证。最终本地
[fixture probe](../../../scripts/cyberbus120-network/fixture-report-final.json) 复现
`sync_pending_flush` 并证明只读检查保留 dirty；随后由生产 transfer 的 flush 捕获。

04 修复先比较双端两个完整 wire 分支，再通过生产 blob 检查 SHA/size。随后两端均使用
`sync_media_snapshot(...).reserve_keep_all(...).verify()` 和
`sync_with_media(..., sync_resolve(..., keep_all=true))` 恢复两分支。恢复后通过生产
`read_attachment` 比较两份完整富文本、plainText、PNG 与 524425 字节文件的原字节、
MIME、名称；只归一化生产恢复时新生成的附件 ID。两端剩余 conflict 均为 0。
没有为了 green 放宽 Store、丢弃附件或替换合并算法。01–04 原报告保持不变。

## 05 已执行的分层验证

| 层／检查 | 结果与边界 |
| --- | --- |
| 独立安装 | 不同进程、SDK installation、SQLite、协议 UUID、Noise key；同一真实账户，未复制 identity |
| Logto→SDK | A/B 顺序各自 AuthStart/Callback，SDK phase 4；不注入 token；issuer/resource/product 使用正式公共 pins |
| NetworkStart | 两端 submitted、SDK terminal result_ok、raw NetworkState running/reachable 及最终 core flags 均 true |
| profile／发现 | 两端通过已认证 SDK 目录与 profile 互相发现；directory_valid=true，directory faults 0 |
| Data／Noise | 每次 map Sync；真实 Data 隧道承载生产 WebSocket/Noise pair 与 replication 字节 |
| push／pull | 完整中文富文本和 marks/list、有效 PNG、524425 字节多 chunk 文件的 metadata/原字节一致；禁止方向的 note、heads、seen、inbox、附件和独有 blob 不出现 |
| both | 生产 transfer/apply 后收敛；不将 transport ACK 当成业务通过 |
| 离线／重启 | 停止两端网络后编辑 B；关闭并重开 B，SDK/grant/Store/Noise identity 与 dirty 保持，恢复网络后真实 pull；测试 key 见下文 |
| durable inbox | A 接收但尚未 apply 时重启；pending 仍在，生产 apply 后内容和原字节一致 |
| 并发／恢复 | 两份独立离线修改，both 后两个完整分支及 blob 一致；两端生产 keep-all 后两份完整文档及附件字节可读 |
| 暂停 | 显式传输返回预期 `sync_Revoked` |
| 收尾 | mapping drain、SyncService shutdown、Bus.close；所有 worker 自然退出，无强制结束冒充成功 |

本地执行：共享 target 编译成功，9 项 controller 私密 IPC／有限错误码／trajectory／
NetworkStart Error／方向排除契约测试通过，最终 fixture probe 通过。早期
[lifecycle](../../../scripts/cyberbus120-network/lifecycle-report.json) 仅证明 SDK 安装和关闭，
不用于代替 real suite。

05 诊断观察者因只在 state 调用时 drain，A/B 分别记录 subscriber lag 1/2；事件数量不构成
完整轨迹证明。raw Data 首个有限错误码为 A=8（Cancelled）、B=11（ProtocolError），
B adapter fault 计数 2；取消 pair stream 等阶段存在这些观察值，不能将其隐藏，也不能凭
首个码证明每次错误的原因。业务结论依赖实际成功的生产操作、durable/projection/字节
断言和自然退出，不宣称“零底层错误”。最终 core auth/network/directory 正常。

trajectory 为二次白名单过滤后的有界观测：auth.phase、network flags/error.code、目录
valid/revision、设备/在线数量、elapsed、NetworkStart submitted/result。最多 256 条，
保留首 128 和最近 tail；elapsed 是本工具观察时间，非 SDK 原始事件时间。不保存
message、ID、URL、claims 或业务正文。

## 源码与二进制 provenance

实现冻结提交：`fe0da47ef7f9b8e8db6ecaf2f5c0f058e7f6c54d`。后续交付提交只增加
README、执行报告与本验证文档，编译源集合保持相同。可复算
[manifest](../../../scripts/cyberbus120-network/evidence-05.json) 列出 95 个公开本地源文件的
相对路径、大小和 SHA256，`source_files_committed_unchanged=true`。

| 绑定项 | 值 |
| --- | --- |
| core 最后源码变更 Git 基线 | `06fcc177f63a17c615becaf6b55eb91c1f3ba4fb`，含用户同步的 watch/EOF 和 F3/F4 修复 |
| 生产 account/sync/Store 最后源码变更 Git 基线 | `ccfd6ca78de7ed6a64627f8ec1302ba132be2faf`；记录源码来源，不表示运行 Tauri 账户链 |
| SDK Git revision | `359465e83bd74b571a963f3d1fdc238f50169919`，通过 core 的本地 patched runtime 依赖 |
| harness crate aggregate（node.rs/backend.rs/Cargo.toml/Cargo.lock） | `ef37d149dcaf6b57bb8b5300f04f0725d95bb0b9f2943ea1a00f80681ee177ee` |
| 本地 source closure aggregate，已嵌入 binary | `6630b9299ba6b17f2a5bf2c686849cd1cf2613aba175ba79a8bf1429847789f9` |
| 准确 binary SHA256 | `4cda3d9d8f16a8acc5c61d0a18e911d862086eb5e7496aa01ed47f2bba1631b2` |
| real-report-05 SHA256 | `06ee6f06f226f187f14495999ac54be0869f2a59fec6c609d5d380d7c6ea1d7f` |

aggregate 算法：相对路径排序，每项 UTF-8 path + NUL + ASCII 文件 SHA256 + LF，再
SHA256。集合包含 harness node/backend/Cargo/Python/公开 config、实际 include 的生产
Store/Sync/Identity 与编译所需 application/session 模块、document-schema.json、core 和
本地 patched runtime 的源码及 Cargo 文件；为保守超集，也含相邻测试源码。外部 registry／
Git 依赖由 Cargo.lock checksum/revision 固定，不声称已逐文件 vendor 所有外部依赖，也不
声称可重现同一编译字节。旧 `compiled_source_sha256` 明确只代表 node.rs；05 的
`compiled_local_closure_sha256` 与 manifest 才提供该本地完整源码集合绑定。

准确执行命令（仓库根目录；binary 位于复用的 core target，2 jobs，Cargo 共享锁）：

```sh
python3 scripts/cyberbus120-network/build.py \
  --target-dir /Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target
python3 -m unittest discover -s scripts/cyberbus120-network -p 'test_*.py' -v
/Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target/debug/cyberbus120-node \
  --fixture-probe > scripts/cyberbus120-network/fixture-report-final.json
python3 scripts/cyberbus120-network/controller.py \
  --binary /Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target/debug/cyberbus120-node \
  --mode real \
  --driver-sha256 0eec7c477991cd3e81518d937429af24ff80ca3c45878276c27362ef227a23e3 \
  --report scripts/cyberbus120-network/real-report-05.json
```

轻量独审只需读源码、报告与 manifest，可运行 9 项本地契约检查和以下离线 hash 校验，
不必重建、在线授权或访问 private 文件：

```sh
python3 scripts/cyberbus120-network/evidence.py \
  --binary /Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target/debug/cyberbus120-node \
  --report scripts/cyberbus120-network/real-report-05.json \
  --manifest scripts/cyberbus120-network/evidence-05.json --verify
```

生成 manifest 用相同命令去掉 `--verify`。生成时检查 binary/report digest 一致、本地
源码 aggregate 与编译嵌入值一致；校验结果为 source_closure/source_aggregate/binary/report
四项均 true。manifest 不包含私密 config、fixture、key、vault、身份或授权材料。

## 实现与私密路径边界

入口：[README](../../../scripts/cyberbus120-network/README.md)、
[controller](../../../scripts/cyberbus120-network/controller.py)、
[node](../../../scripts/cyberbus120-network/node.rs)、
[Backend](../../../scripts/cyberbus120-network/backend.rs)。worker 通过 `#[path]` 包含生产
代码，Backend 调生产 media snapshot/验证、capability-bound NetworkStaging、blob 发布、
inventory、durable inbox 与 apply。无替代合并。一个未使用的 legacy diagnostic 签名仅有
编译占位类型；未链接运行旧 SDK/provider。

profile 是 harness 公开 protobuf，workspace 从 SDK 已验证 AccountSummary 派生；每次
生产 authorize 重查 SDK 认证、有效 lease、在线 peer/profile、网络和 pause。邀请仅在
controller 私密 IPC 交接；实际 pair 与同步字节只走 `Bus.map(Sync)`，不测 Bootstrap。

已只读审核远端 callback-only driver 及其导入 Flow；driver SHA 见上。A/B SDK 各自产生
授权 URI，经 SSH stdin 写新 0700 私密目录中的 0600 文件。helper 从获授权的 qa-primary
复制 fixture；callback-file 回传只进入 captured 子进程私密管道，再交 SDK AuthCallback
换票。未用硬编码旧端口的 deliver-loopback；未调用 Logto 管理 API 或更改服务/账户。
不输出授权 URI/callback/token/账户 fixture 值或原始错误；远端私密临时目录 finally 删除。

core EncryptedFileStore 使用显式 `test-key`：每安装独立随机测试 AES key 文件 0600、
vault 0700；Existing 读取原 key/vault，无 CreateNew 回退，`persist_grant=true` 仅为恢复
测试设置。私密安装目录保留用于调查，不打印路径、不提交。这里不证明平台 Keychain／
Keystore 或生产密钥生命周期。

## 手动 UI 验收准备，未执行

本轮没有 UI 改动或 UI 验收。后续由产品入口手动验证：两份隔离安装顺序完成真实登录并
各自进入原生账户/Session；由界面发起定向同步，对照富文本和 PNG/file 下载原字节；再
离线修改、重启、处理冲突并观察暂停时的显式提示。执行前后记录阶段和结果，不记录账户
或授权值。这些步骤当前均为未执行，不能从 CLI 通过推导原生账户链已通过。

范围外：Tauri Account/Session 创建、native callback dispatcher、UI quiet barrier、正式
平台密钥、Bootstrap、第三设备、移动/Android、跨账户/产品负例、锁定笔记/墓碑和退出换
账户。未扩展这些场景；本轮必要双端同步 CLI 验证无剩余阻断。
