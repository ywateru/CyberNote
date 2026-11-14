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
| 最小SDK登记凭据借用接口 | Huygens | `vendor/cybergrid-sdk/src/types.rs`与现有`SOURCE.json`修改说明；字段仍私有，序列化/Debug脱敏保持 | Erdos |
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
- UI `58b54da1` 与命令注册增量 `29600b05` 已独审 PASS 并合入 main，最终69项定向检查及类型检查通过。
- 设备服务 `74d1a891` 已独审 PASS，独立完整190项通过、含实际Redis/AOF；服务源码e2201113已部署到原生产项目，最终READY。见[部署回执](../../verification/account110/server/registry-deployment01/README.md)，真实账户GET/PUT仍待客户端验收。
- 网络 `29b2a86d` 的初审P1/P2经`51040df6`与`7177ca9c`修复，最终独审APPROVE并合入main；36项网络检查及4组实际Store场景通过，计数不与前轮相加。见[review02](../reviews/app-account110-network-02.md)。账户作者正在整合原生层。
- target由网络作者释放后交原生账户作者；已清理22个未打开的旧应用可执行产物，依赖/原包/失败证据保留，回执 `/private/tmp/account110-network-target-executable-cleanup01.json`。
- 原生账户、请求取消与退役修复已独审通过并合入，最终账户72项、adoption6项及独立定向13项通过。执行器已独审通过；模块检查组存在重叠，不相加作为唯一用例总数。
- 精确源码 `cb91f4b8` 的 Mac debug 包已构建并通过[静态独核](../../verification/account110/mac-package-review01.md)。两个新资料库真实启动、重启、正文和附件保存检查，以及两次正常托管登录通过。
- [首轮真实运行](../../verification/account110/native/device-actions-live01.md)在目录阶段失败：A 等待 B 登录期间发生原生栈溢出，故障涉及 `worker::run` 组合子任务的 poll；尚未进入方向同步，不能宣称整体通过。首失败资料库及小型诊断保留。
- 后续修复限于组合边界 heap-pin 子 future，保留取消、双方 join 和任务退役规则；补 future 大小/小栈 poll 回归并独审后，重新生成精确包、重跑两个独立客户端。执行器同时补充安全异常及退出生命周期证据。
- 栈修复 `8c3fc430` 与真实重启 fixture 修正 `08e4b6c7` 已[最终独审批准](../reviews/app-account110-worker-stack-02.md)并合入；作者与独立验证完整 account75/75、adoption6/6通过。旧73/1失败确定为复用未退役Session的伪重启：有限状态捕获 `pending=false, quiet=true, phase=probe`，真实release/reopen反例保持严格preflight。历史失败不改写。
- 执行器诊断增量 `bbd2b897` 已[独审批准](../reviews/app-account110-live-runner-03.md)并合入，24项fixture通过；原生退出码/信号和pipe close分别记录，主错误与清理错误同时保留。等待更新来源清单后构建新精确包并执行第二轮。
- 新精确包 `0a4a4cda` 已[静态独核](../../verification/account110/mac-package-review02.md)通过。[live02](../../verification/account110/native/live02/README.md)实际通过双端登录、暂停目录、稳定登记ID、改名、准确笔记摘要与开启不广播；push阶段失败，四次进程均正常退出。单独诊断观察到约51秒后push终态failed、`account_sync_failed`，不能定位具体网络阶段。原始结果与诊断分别保留，尚未完成方向同步验收。
- 最小诊断增量由Huygens实现原生类型/转换，Socrates实现严格前端解析和固定文案，Feynman实现执行器有限错误收据；Erdos审原生，Cicero审前端，执行器另独审。按架构中的成对`syncStage/syncReason`契约，不改成功条件、超时或传输行为；通过后重包继续定位并完成实际验收。
- 有限诊断源码、前端及执行器均已独审批准并合入。作者account78/78、前端74/74、runner29/29通过，独立原生定向3项和前端/runner对应组通过。此增量仅补充后续故障证据，不代表live02的push原因已修复；正在更新pins并准备精确新包。
- `d0ad2267` 新包[独核通过](../../verification/account110/mac-package-review03.md)，[单次App诊断](../../verification/account110/native/live02-push-diagnostic02/README.md)仍失败，实际为SDK映射阶段的`account_network/coordinator`，未进入本次应用层pair/transfer。该次错误不同于旧`account_sync_failed`，不能互相回填原因。
- [精确锁CLI探针](../../verification/account110/native/sdk-mapping-probe01/README.md)在正常恢复的owned测试环境中，两次map经匿名隧道成功，用时33.026+28.400秒；仅映射已超出产品整段prepare的60秒期限。Huygens与Feynman独立核对SDK每次map均重新走连接链，确定为独立预算缺陷。最小修复仅删除重复60秒prepare分支，以原185秒绝对请求期限覆盖准备和传输，保留所有取消、门禁、退役及收尾规则。
- Huygens负责该期限增量和可控时钟/真实退役回归，Erdos独审；通过后更新单文件pin并重包。暂不引入映射复用、并行或更长总体期限，不把CLI映射成功当App验收。
