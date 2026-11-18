# CyberBus124 harness 有界独立审阅

日期：2026-11-18。结论：**PASS（限定本次 CLI／源码／公开报告证据范围），无 blocking finding**。

## 基线与范围

- 用户确认 Harvey 最终交付 `4b68a58f7f0a066cf51d18b0b3f3b4a00240fcb4`；实现冻结为 `fe0da47ef7f9b8e8db6ecaf2f5c0f058e7f6c54d`。审阅时 worktree 干净；两提交间只新增 README、执行报告、manifest 和验证文档，没有修改实现。
- 对照任务 `docs/plan/tasks/cyberbus124-network-harness.md`、架构 `docs/architecture/cyberbus-migration-20261118.md`，审阅 `scripts/cyberbus120-network/**` 和 `docs/verification/cyberbus120/network-harness.md`。
- 审阅者未参与本 harness/core 开发。本次仅运行本地 Python 契约测试、已有二进制的无网络 fixture probe、离线报告／源码 hash 校验；不重建、不重跑 Logto／SSH／网络、不读取私密安装或账号 fixture、不运行 UI／设备、不修改产品。
- 写集仅本审阅文件；失败报告 01–04 和原 fixture 均保留。

## 独立执行结果

执行目录：`/Users/water/work/2026/Apple-Notes-Clone-cyberbus124`。

```sh
python3 -m unittest discover -s scripts/cyberbus120-network -p 'test_*.py' -v
python3 scripts/cyberbus120-network/evidence.py \
  --binary /Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target/debug/cyberbus120-node \
  --report scripts/cyberbus120-network/real-report-05.json \
  --manifest scripts/cyberbus120-network/evidence-05.json --verify
```

| 检查 | 实际结果 |
| --- | --- |
| Python controller 契约 | **9/9 PASS**，2.212 秒，自然 exit 0；含错误过滤、私密 SSH stdin、缺 newline 截止、自然关闭、方向隔离、trajectory 和有限错误分类 |
| manifest 离线命令 | **4/4 true**：source_closure_matches、source_aggregate_matches、binary_matches、report_matches |
| 独立源码复算 | 不只依赖 manifest 的 verify：重新运行 sources()，确认为相同 **95** 路径集合，逐文件 SHA 相同；每个文件再用 `git show fe0da47e:<path>` 读取冻结内容计算 SHA，全部相同；aggregate 与报告内 compiled_local_closure_sha256 相同 |
| 本地 fixture CLI | 用 Python subprocess 执行上述 binary 的 `--fixture-probe`，timeout=45 秒，exit 0、stderr 0 字节；未创建 Bus 或网络；JSON 与已提交 fixture-report-final.json 完全相同 |
| fixture 内容 | fixture_valid=true、attachment_count=2、dirty_inventory_rejected=true、readonly_inspection_preserved_dirty=true；复现 store_sync_pending_flush 后通过生产 flush，检查真实 Store 文档／媒体 SHA 和大小 |
| real-report-05 断言一致性 | passed=true、real_network_suite=true、stage/api_phase=complete、binary_unchanged=true、all_workers_natural_close=true；push/pull/both、重启、durable inbox、并发恢复、pause 各项布尔均 true；Tauri account/session 和 production platform key store 仍 false |

关键绑定值：

- binary SHA256：`4cda3d9d8f16a8acc5c61d0a18e911d862086eb5e7496aa01ed47f2bba1631b2`
- real-report-05 SHA256：`06ee6f06f226f187f14495999ac54be0869f2a59fec6c609d5d380d7c6ea1d7f`
- 本地 source closure SHA256：`6630b9299ba6b17f2a5bf2c686849cd1cf2613aba175ba79a8bf1429847789f9`
- core 来源：`06fcc177f63a17c615becaf6b55eb91c1f3ba4fb`；生产 account/sync/Store 来源记录：`ccfd6ca78de7ed6a64627f8ec1302ba132be2faf`。
- 外部 SDK 固定 `359465e83bd74b571a963f3d1fdc238f50169919`；core 使用本地 patched runtime。95 文件覆盖本地编译源保守超集；外部依赖由 Cargo.lock 固定，不构成逐文件外部 vendor 或可重现编译声明。

## 生产模块、断言与 fixture 边界

1. `node.rs:3–16` 通过 `#[path]` 直接包含生产 Store/model/IdentityStore/network 模块；`node.rs:450–510` 创建生产 SQLite Store、独立 Noise identity、SyncService 并向真实 Bus 注册 Sync listener。`backend.rs` 实现适配接口，调用生产 media snapshot/verify、sync_with_media、flush、inventory、validated receive、capability-bound NetworkStaging 和 blob 发布；没有替换 Store、合并算法或 FakeBackend。
2. 测试笔记确实是 **harness 合成内容**：`node.rs:797` 经生产 createNote/store_attachment/saveNote 写入隔离 SQLite，不是用户原库或 Apple Notes 导入数据。真实链路主张指 SDK Data → 生产 WebSocket/Noise/SyncService → Store 的组合路径；README／报告明确 fixture probe 不测网络、不替代 real suite，未发现以 fixture-only 运行冒充真实网络的表述。
3. `controller.py:237` 每次 transfer 创建真实 Bus.map(Sync)；`node.rs:575–615` map／pair／transfer 调真实接口。配对邀请指定 A 的 mapped listener，而非直接把 B 的实际 loopback listener 交 controller；生产网络层使用该 endpoint。Bootstrap 未参与且明确未验。workspace/profile 与 ReplicationPolicy 是 harness 专用实现，不能代表生产 Account/Session 创建链验收。
4. `controller.py:269–287,358–440` 检查完整 document/plain/locked、read_attachment 返回字节与 MIME、wire metadata/version、blob SHA/size；方向排除还检查 heads/seen/inbox 和独有文件 blob。接收后先检查 durable inbox，生产 apply 后才比较投影；不把 Data ACK 当笔记成功。冲突恢复保留两个完整 wire 分支，两端调用生产 keep-all 并读取恢复后原字节；仅归一化新 attachment ID。源码中的成功标记位于相应断言之后。
5. 当前公开报告仍保留 subscriber lag A/B=1/2、首个 Data error 8/11、B adapter_faults=2。README／验证文档明确轨迹不完整、不是零底层错误，不用诊断计数推导业务成功。关闭必须有响应、自然 exit 0，forced termination 不满足 passed。

以上是源码路径与既有报告的一致性审查；审阅者没有独立重放 real-report-05 的在线运行，也没有独立认证历史远端登录过程。

## 敏感信息检查

- 已读 controller/worker/remote_login 的报告构造路径：授权 URI、callback、账号摘要、协议身份和附件正文仅在 captured 私密 pipe 传递；SSH argv 不携带授权材料，stderr 丢弃，公开失败码和 trajectory 经有限白名单过滤。远端目录 0700，授权和配置文件 0600，finally 删除；本地每安装独立 test-key 与 vault，私密路径默认不输出。
- 逐项检查已提交公开 JSON 01–05、lifecycle、两个 fixture report、evidence-05 的字符串类型／字段用途，并扫描 token/JWT、code/state query、data URL、私密临时目录等值形状，未发现公开授权凭证、账号标识、实际业务正文、附件 base64 或私密 vault/key 路径。manifest 中公开源码、构建 binary 路径及公共配置端点不属于私密安装材料。
- fixture probe 返回的文件 SHA 来自固定合成文件，不是用户文件指纹。README 明确 worker stdout 是私密通道，不能直接作为公开日志；test-key 是测试存储，不宣称正式 Keychain/Keystore 验收。
- 该结论限已提交证据和读到的代码，不是对未访问的历史终端、私密目录、远端 driver/import 闭包的完整泄漏认证。

## 手动文档只读校对收尾

对主 workspace `docs/verification/cyberbus120/MANUAL-UI-TESTS.md` 与新 account/platform 源码校对；未运行 UI、未改手动文档。只有以下两项真实差异，均为 **P3 nonblocking 文档修正建议**：

| 位置 | 最小修正与依据 |
| --- | --- |
| MANUAL-UI-TESTS.md:7–9 | 同机双 `--data-dir` 前提加“macOS 14+”；`src-tauri/src/webview_profile.rs:101` 的 require_named_store 在 Darwin major <23 明确报不支持，现文未注明系统限制 |
| MANUAL-UI-TESTS.md:27 | 把 A/B 命名放到 UI-03 登录之后，写为“登录后进入账户与同步，使用更改名称 → 保存名称”；`src/AccountSettings.tsx:353` 的改名位于已登录设备区域，确认按钮见 :403 |

`notes-clone` executable 名称、带引号绝对路径的 `--data-dir` 语法、账户与同步／推送到此设备／从此设备拉取／双向同步文案及 17897 回调一致。binary 示例仍须按最终组合构建记录选取，不代表示例路径现有产物已验收。

## 未验边界

本次没有重跑在线授权／网络、cargo build/test、原生 Account/Session、native callback、正式 Keychain/Keystore、UI quiet barrier、Bootstrap、Android/异网络/第三设备、跨账户产品负例、锁定笔记/墓碑或退出换账户。既有在线报告通过属于作者执行证据，经本次离线 provenance 和断言审查；不能提升为本审阅者独立在线或整包 UI 通过。没有新增场景或实现，结束本次有界审阅。
