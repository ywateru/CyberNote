---
id: app-account110-device-actions
scope: account directory, native replication, account settings
status: in-progress
depends-on: []
---

# 按设备执行账户同步

## objective

按用户 2026-11-14 新要求重设计账户与同步：列出账户下设备名称、在线状态；在线设备显示正常笔记数及笔记最后更新时间；点击远端设备选择推送、拉取、双向同步；本机两个独立数据目录客户端实际验证。

本任务取代 account109 的“开启后自动与全部在线设备双向交换”行为。已有登录双入口、本地资料库独立、资料库切换保存确认、冲突保全和附件持久收据规则继续有效。

## context

- [设备操作契约](../../architecture/account-device-actions.md)
- [界面](../../ui/account-sync.md)
- [既有账户架构](../../architecture/account-sync.md)
- [资料库独立](app-account109-account-independent-library.md)
- [媒体准备期限](app-account109-adoption-large-library.md)

## path / 分工

| 模块 | 作者 | 路径 | 独立审阅 |
| --- | --- | --- | --- |
| 原生账户调度与摘要 | Huygens | `src-tauri/src/account/**`、`src-tauri/src/sync/adapter.rs`及所需 Store 摘要接口 | Erdos |
| 单次方向传输 | Feynman | `src-tauri/src/sync/network.rs`、`src-tauri/src/sync/network/**`、独立测试 | Erdos |
| 持久账户设备目录 | Erdos | `services/coordinator/**`，不修改通用 SDK 目录契约 | Cicero |
| 设备界面与前端 DTO | Socrates | `src/AccountSettings*`、`src/account-client.ts`、有关前端检查 | Cicero |
| 整合、文档和提交 | 父级 | 本任务、架构/UI/验证文档；逐项合并 | 作者以外复核 |
| 双客户端实际运行与包装 | Feynman | 合并后的精确源码、隔离测试数据和回执 | Erdos / Cicero 按范围 |

Cargo 共用 `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`，只能单一持有者使用。限制 jobs=2、debug=0、incremental=0、locked/offline；禁止各自创建大型 target。

## verification

1. 服务边界：真实存储验证账户/产品隔离、稳定设备身份、offline 保留、过期 presence、受限元数据及输入拒绝。
2. 网络边界：真实 listener/client/Store 验证 push 只 A→B，pull 只 B→A，both 双向；配对、空闲、重连和后续编辑不产生未请求交换，旧手工同步保留原行为。
3. 原生整合：真实账户目录请求→稳定设备→已验证 enrollment→选定传输→持久 inbox→Session 应用；关闭/退出/切换和迟到操作不绕过账户 fence。
4. UI：类型与严格解析、设备离线/空/摘要未知、模态方向选择、取消与焦点、忙碌/失败/完成。不能把 durable receipt 宣称为已应用，也不能把心跳当笔记时间。
5. 两个真正独立的桌面进程、两个新 data-dir，分别正常登录同一测试账户。合成不同笔记、格式与附件；逐方向核对完整内容、附件 SHA、相反方向未传输；核对名字、摘要、离线状态和重启。不得复制账户 grant 或 Noise 私钥伪造第二端。
6. 保全默认原库，记录精确源码/包身份及执行范围。清理自己创建且已独立核验的临时数据，保留失败证据和小型回执；本机无 remote 时只称本地提交。

## 进度

- 已读既有实现：目前列表过滤 offline；`start_network` 在 paused 直接返回，开启后自动 `pair/connect/sync_now`。需要拆开目录与内容服务。
- 设计与接口已提交；独立设计审阅补充 `registryKey` 与持久 `revision`，防止同账户其他设备接管登记及迟到发布覆盖暂停。
- UI `58b54da1` 已独审 PASS 并合入 main（`ac0b03a2`），67项定向检查及类型检查通过；debug命令注册增量 `29600b05`（69项）待增量独审。
- 设备服务作者提交 `74d1a891`，作者验证190项通过、含实际Redis/AOF；独立审阅中，尚未部署。
- 网络作者提交 `29b2a86d`，作者29项网络检查和4组真实Store场景通过；独立审阅中。账户作者正在以该接口整合。
- target由网络作者释放后交原生账户作者；已清理22个未打开的旧应用可执行产物，依赖/原包/失败证据保留，回执 `/private/tmp/account110-network-target-executable-cleanup01.json`。
- 本任务尚未构建最终精确包、尚未执行两个真实账户客户端验收；不能把上述模块通过当作整体通过。
