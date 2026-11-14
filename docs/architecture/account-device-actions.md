# 账户设备目录与单次同步

本契约对应 2026-11-14 用户要求，覆盖账户模式；原“设备同步”手工配对入口保持既有规则。账户登录用于同步，本地数据库不归属于用户名。

## 行为

- 登录后即可发现同账户、同产品的设备，目录发现和元数据发布不传笔记正文或附件，不要求启用内容同步。
- 设备使用资料库安装级持久 `registryDeviceId`（UUIDv4），退出、换账户和 workspace adoption 不旋转，和既有 enrollment 的协议 device UUID 分开。每个账户的记录仍按 owner/product 隔离。每台设备有可辨认的默认名称，并可修改本机名称。
- 账户设备记录持久保留；断线与会话过期使其离线，不删除已登记设备。列表不得仅显示本机曾见过的在线设备缓存。
- 在线来自服务端 presence lease 和当前 transport 可达性；连接状态、笔记最后更新时间、最近传输成功是不同事实。不能用心跳填充笔记时间。
- 笔记数量计当前未删除的普通笔记，包含上锁笔记，不包含文件夹、回收站、已永久删除记录与历史版本。更新时间取这些笔记的 `updatedAt` 最大值（Unix 毫秒）；空库没有更新时间。读取摘要不得解锁或读取正文。
- 远端摘要未获得或版本不兼容时显示“暂不可用”，不得填 0；离线设备不将历史摘要显示为当前数据。

## 数据传输

“同步此设备”开关含义为允许当前账户内容传输。开启时仍执行已有资料库采用/保存确认，并显示明确合并范围；开启本身不向所有设备交换内容。关闭不登出，目录仍可用，内容服务及在途任务受到 fence。

点击一台远端在线且允许同步的设备，选择一次操作：

| 方向 | 发送 | 接收 |
| --- | --- | --- |
| push | 本机 → 选定设备 | 不拉取远端独有版本/附件 |
| pull | 不向远端推送本机独有版本/附件 | 选定设备 → 本机 |
| both | 本机 → 选定设备 | 选定设备 → 本机 |

这三个动作执行既有版本合并与冲突保全规则，不是覆盖数据库/镜像删除。操作只针对选择的稳定设备 UUID；目录变化不能把任务改投另一设备。服务只在用户动作后建立客户端内容交换；自动配对、恢复、后台唤醒、目录轮询均不启动 cycle。接收端仅被动响应已验证同账户请求，不反向启动双向任务。旧手工同步的自动双向行为不变。

同一账户 runtime 同时仅一项设备操作，串行且有界。失联/暂停/退出/账户切换使操作失败或取消，不能无限排队自动重放，重试必须是同一明确目标和方向。完成表示该次版本交换获得持久收据；未应用/冲突仍单独显示。

## 模块连接与部署

```text
账户登录 → 受验证账户身份 → 持久设备目录（仅名称、摘要、presence、transport关联）
                              ↓ 选定稳定设备
显式方向请求 → enrollment验证/Noise key钉住 → 单次网络交换
                                              ↓
                                    持久inbox → Session应用/冲突
```

设备目录属于 CyberNote 的账户 API，和通用 SDK 的短期 transport 目录分离，避免改变其他 SDK 使用者的租约、注册和注销语义。服务端以 verifiedAccount 的 issuer/subject/product 分区，客户端不能传 owner 来改变分区。目录关联须验证 coordinator session 和稳定 device 身份，元数据采用有限 schema、大小和数量限制；不能发布凭据、内部路径、正文或附件 URL。

若线上服务尚未支持新设备 API，返回明确“不支持设备目录/需要更新服务”状态，不能静默退回旧自动广播。发布与实际双端测试必须记录所用服务版本和精确客户端源码，不把 fixture 测试当作线上同账户发现通过。

## 账户 IPC v110

保留原 `Status`、登录、退出、暂停/启用命令；`syncNow` 只允许显式恢复连接/刷新目录，不启动无目标内容同步。新增严格命令：

```text
renameDevice { name: string }                 // 只修改本机，trim后1..96字符，无控制字符
syncDevice { deviceId: UUIDv4, direction: "push" | "pull" | "both" }
```

`Device.id` 改为稳定 registry ID；既有名称/online/current/connected/transport保留，新增：

```text
syncAvailable: boolean                       // 在线、启用内容服务且兼容新协议
summary?: { noteCount: u64, lastNoteUpdatedAt: u64|null, capturedAt: u64 }
```

`summary` 缺失表示未知，空库 `{noteCount:0,lastNoteUpdatedAt:null}`；全部时间为 Unix 毫秒，不允许非法负值/非安全整数。`Status` 新增可选 `deviceOperation`：

```text
{ deviceId: UUIDv4, direction: push|pull|both,
  phase: running|succeeded|failed, startedAt: u64, finishedAt?: u64 }
```

只描述本 runtime 最新一次操作；失败使用已有有限 `SafeError` 并补充受限错误代码（设备离线/不兼容/未启用/目录不可用等），不能显示内部任意远端错误文本。`syncDevice` IPC 可以等待一次有限操作完成；运行状态应能被只读 status 观察。成功只表示持久传输收据，不代表已解决冲突或所有窗口已应用。

## 专用设备 API v1

`GET /api/v1/notes/devices` 与 `PUT /api/v1/notes/devices/self` 都使用当前已验证账户 Bearer；不得使用 grant/Noise 私钥做目录凭据。GET 返回 `{schemaVersion:1,devices:[...]}`；每行的 `id,name,online,syncAvailable,summary` 对应上述安全设备字段，另含原生专用 `transportDeviceId,protocolDeviceId,noisePublicKey` 可空关联，均不得直接泄露到前端。服务端不得接受客户端自选 owner。

PUT 固定字段：`deviceId`（registry UUID）、`registryKey`（32字节随机base64url本机私密登记凭据）、`revision`（持久递增安全整数）、`name`、`summary`（可null）、`syncAvailable`、`transportSessionKey`、`protocolDeviceId`（UUID或null）、`noisePublicKey`（32字节base64url或null）。`transportSessionKey` 仅用于服务端验证当前 SDK device session 的 subject/product 并解析实际 transport id/incarnation，不落日志或registry记录；输入最多8KiB。未启用同步时后两个为null，syncAvailable=false。GET只对owner返回，内容授权仍必须验证 enrollment + Noise。

`registryDeviceId` 不是认证凭据。首次登记原子绑定 registryKey 的不可逆hash，后续修改必须匹配；同账户另一台设备不能拿自己的SDK session和已知UUID替换他机名称/路由。registryKey只保存在本机私密配置，不能发给对端/前端或放入GET。丢失私密登记配置时创建新设备记录，不伪造接管旧记录。

每次发布前将递增revision持久保存；服务端原子校验仍有效的transport session、登记key hash、revision后更新presence。严格较新revision才可覆盖；同revision仅允许完全相同内容的幂等重试且不能额外续租，不同内容拒绝。用revision拒绝旧session、同session旧heartbeat、暂停前请求的迟到覆盖；不能用可能相等的session expiresAt推断注册先后。SDK session重建后使用同registryKey与更高revision重新PUT。验证与更新在同一个Redis原子操作完成，不能在session校验与写记录之间留下撤销竞态。

SDK 的 `Session` 可提供最小只读借用接口 `transport_session_key(&self) -> &str`，仅供原生设备登记把当前 transport 会话证明放入受信 API 的请求体。保持字段私有，不增加 Serialize/Debug 输出，不通过 grant/序列化绕过；调用方不得将返回值纳入前端状态、错误、日志或回执。此 vendored 小改动必须记录在既有 SDK modifications/发布 pin 中，独立审阅请求目的地与无泄露边界。

presence 最多65秒，定期续租；syncAvailable 还要求底层 transport session有效且在线。持久设备记录无TTL，与通用coordinator GC分离；每账户最多64台，超限明确报错，不淘汰旧记录。过期presence后的摘要可以保留在服务端，但原生投影必须隐藏离线摘要。历史旧版本从未登记的设备只有升级后才会进入此表，不能声称能恢复已删除的旧目录。

## 网络执行边界

账户专用 `SyncService` 不创建自动内容worker；纯配对和 reconnect不调用cycle。提供明确的 `TransferDirection` 及单次传输API。账户连接使用新有限能力握手并固定方向；被动handler仅允许该方向对应的读取或写入RPC（inventory可用于差集），没有握手的旧账户peer拒绝内容请求。方向限制在主动cycle与被动handler均执行。非账户手工服务维持既有wire/自动循环兼容。

网络API具体Rust函数签名由network与account作者同步后记录于实现报告，不以父级猜测替代类型检查；语义不得削弱本契约。

## 单次传输的有限错误诊断

真实 live02 的独立 push 诊断已观察到 `failed + account_sync_failed`，但既有转换丢弃了具体 SyncError，不能据此判断配对还是传输失败。为定位实际故障，`SafeError` 可在 `code=account_sync_failed` 时增加成对可选字段：

```text
syncStage: pair | recoverPairing | transfer | retirement
syncReason: io | invalid_input | corrupt_identity | authentication | expired
          | revoked | workspace_mismatch | protocol | limit | timeout
          | stopped | backend | plan_stale | busy | transport
```

两字段同时存在或同时缺失，仅由具体配对、恢复配对、单次传输或退役调用返回的类型化错误生成；不能从时间、错误文本或账户状态推测。未知旧错误维持通用文案。前端严格拒绝未知枚举、半对字段及其他错误代码携带这组字段，用本地固定中文表显示阶段和原因，不显示上游消息、endpoint、用户内容或内部身份。原错误 code、取消、门禁、期限、join/drain 和退役完成规则保持原语义；补充诊断不构成重试、降级或放宽成功条件。

测试执行器在遇到错误时保存经过固定字段和枚举校验的有限诊断，再终止本轮；有目录错误仍不能标为整体通过。目录状态和设备操作终态分别观察，诊断复跑单独记录，不能覆盖首轮结果或把复跑字段补造为首错证据。

## 请求准备与传输的统一期限

请求创建时确定的185秒绝对deadline贯穿映射、bootstrap、验证、配对和传输。阶段切换不重置或延长该期限；准备耗时占用同一预算，不能为传输另加185秒。达到deadline触发取消，不代表后台已经退役：阻塞任务、disconnect/join及mapping关闭仍按既有规则完成，期间保持Busy，迟到成功不得覆盖取消或失败。

SDK每次映射可能分别经历直连尝试和匿名隧道回退。真实独立探针观察两次映射成功但累计61.426秒，因此不能在上述统一预算内再用独立60秒prepare计时器提前截断合法准备。只移除这层重复期限，保留stop响应、目标及身份/Noise/workspace校验和完整收尾。此证据不解释此前24秒的SDK失败，不构成App方向同步已通过；必须由新包重新验收。

## 保全与验收

本轮使用新建的两个独立 data-dir 和合成数据，不在默认原库开启同步。登录凭据仅进入真实授权表单，不进源码、回执或截图。测试内容包含格式、附件与双向独有笔记；每次操作验证允许方向和禁止方向，另验证空闲后不自发传输。详细矩阵与实际执行回执链接由任务收尾补充。
