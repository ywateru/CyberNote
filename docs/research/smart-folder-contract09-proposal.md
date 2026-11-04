# 智能文件夹共享契约提案 09

2026-11-04；只读基线 `1b1d47aab702eccb29999e8ead404e856dc089c7`。承接 [delivery07](smart-folder-delivery07.md) 的 D→O→U，不重做 03/07 审计。本文是待 root 定稿的工程提案，尚未改变产品契约；C4 删除生命周期、C6 动作导航、C8 原版界面由正在进行的原版/REA 补证定稿。最终范围仍包括全部离线可成立规则、Mac/Android 真实入口与交互，下面的 D 是可独立编码的前置边界，不是最终功能降级。

## 现源码接缝

| 接缝 | 本 HEAD 的准确位置与约束 |
|---|---|
| Folder/加载 | `src/types.ts:2`、`store.rs:68/153/184/191/207/308`；kind 为任意字符串，无定义 revision；open 的 156 行无条件设置 `user_version=1`，170 行用任意读取错误补建系统行。 |
| 物理写入 | `store.rs:326/379/474/494/539/571/587`；冲突副本继承 owner，新建/移动只排 trash，恢复只验存在，parent 只验引用/循环，实体删除递归笔记到 trash。 |
| 归档 | `archive.rs:115/180/250/368/418/440/483/501/623`；仅 1/2、仅 normal 自定义 ID 映射，整图校验不区分可写 owner；已有原子文件发布/事务，不能重写该可靠性边界。 |
| 标签 | `note-tags.ts:4/14/56/64`；合法完整 noteTag spans、name 精确比较，目录排 deleted/locked/suspended。Rust `archive/document.rs:66/190/193/277/301` 已验证同名跨度并禁止锁定文档含标签，可复用校验后提取，不另用文本正则猜标签。 |
| Session/通知 | `session.rs:39/86/226/269/283/322/397/434`、`lib.rs:100/107/117/125/160`；只有 notes-access，普通动作无元数据通知，save 目前直接返回；barrier finish 成功才 bump/revoke/tagged。 |
| 接收/保存 | `bridge.ts:24/36/142/158`、`access-client.ts:38`、`App.tsx:711/798/830`；save ACK 只确认版本，不发布正文；hydrate 与 pending 保存边界必须保留。`App.tsx:542/598/1382/1417/3651/4291` 仍按物理 folderId 计算导航，故不能先放出 smart 行。 |

## C1：严格实体、动作与 strictFolder

保留 Folder 的六个公共字段；物理分支 `kind=default|quick|trash|normal` 禁止出现 query/definitionRevision（包括显式 null）；智能分支固定 `kind=smart,parentId=null`，增加必需 `definitionRevision` 与 `query`。revision 为 1..2^53−1 的整数，创建 1，名称与规则共用一次 revision；溢出明确失败。系统 ID/kind/root 固定，自定义 ID 不得占用 default/quick/trash/all；all 只作导航。当前不做 normal↔smart 转换，也不把 smart 放进物理树；后续转换若获证须独立迁移操作，不能改 kind 就转移所有权。

新增共享概念 `strictFolder(value, format)`（当前源码没有此函数）：先看原始字段集合和 kind，再分别反序列化物理/智能严格 record；Rust `TryFrom`/自定义 Deserialize 与 TS 边界解析同契约，不用宽松 struct 或 `as Folder` 吞字段。`format=legacy1or2` 只接受旧合法物理形状；`format=live2|archive3` 接受两分支。旧合法缺省 parentId 仍归 null；未知 kind/字段/query version、物理携带智能字段、智能缺字段均报明确错误。表单草稿另型，未选标签的占位行不属于可持久实体。

动作建议：`createSmartFolder{name,query}`；`updateSmartFolder{id,expectedDefinitionRevision,name,query}`（完整替换）；`deleteSmartFolder{id,expectedDefinitionRevision}`。Rust 生成 ID/时间/初始版本，输入拒绝未知字段。旧 renameFolder 仅 normal；smart 改名必须经过 CAS 动作，禁止第二条无版本改名路径。智能删除只删定义，不调用 deleteFolder、不触及成员/附件/key/history；删除后旧编辑提交返回 not_found，不 upsert 复活。

## C2：真实默认标签与完整离线规则路径

保存形状先定 `query={version:1,combine:all|any,rules:[...]}`。D 首批真实实现三种：

```text
tags   {type:"tags",mode:"allSelected"|"anySelected",names:[name,...]}
       {type:"tags",mode:"anyTag"|"noTags"}    // 此两型禁止 names
folder {type:"folder",mode:"include"|"exclude",folderIds:[id,...]}
pinned {type:"pinned",value:boolean}
```

新建草稿忠实使用原版单条 tags/allSelected/空选择，最后一行移除禁用；不换成 pinned、不把空 allSelected 当全匹配。是否在该草稿下允许“好”及保存空选择的原版语义待 root 实测；工程持久校验先要求 selected 模式非空，未满足则不能提交。name 复用现 `validTagName`（不含 #、1..64、精确大小写、不 normalize），只识别合法 noteTag spans；保存用户选择的规则文字属于定义配置，不建立明文笔记标签索引。已选 name 可以当前无引用，不能因最后标签被删而删规则或报坏定义。

工程限额建议：规则 1..11、同 type 至多一行，每 selected names/folderIds 1..128、单定义 JSON ≤64KiB；重复 token/类型明确拒绝，不静默去重。folder token 内部 include 是直接 owner 的集合并集，exclude 是不属于集合任何项；不递归子目录。规则之间才执行 all/any。缺失/不合法 folder ID 在保存、载入和导入时拒绝；删除后的表示由 C4 补充，不能当成普通空集运行。

全集先排 deleted 与 Session suspended；公开 folder/pinned 元数据允许 locked 行参与，正文仍按现授权显示。标签及其他内容 facts 对 locked（含暂时解锁）取 unavailable，不把占位空文档推成“无标签”。使用三值 true/false/unavailable：all 遇 false 为 false、全 true 才 true；any 遇 true 为 true、全 false 才 false；其余 unavailable，最终仅 true 入结果。否定 unavailable 仍 unavailable。这保留现 projectTags 的保护边界，锁定+folder 的真分支可在 any 中入列；元数据计数不授予正文权限。

建议 D 提供内部 Rust `evaluateSmart`/`SmartProjection{definitionRevision,ids}`，在同一快照求值，列表和计数消费同一结果；成员不持久化。O 的响应另带 metadata stamp，排序沿现设置。TS 乐观投影只用原 note 的合法 pending 保存快照与同语义 facts，需 Rust/TS 共同 corpus 对照，不另造扫描 # 的 evaluator；最终确认仍以真实保存 ACK 为界。组字/停车复用现标签目标边界，不新增“所有失配都等待组字”的宽泛例外。

全部离线规则按同一闭合枚举扩展：

| 下一规则能力 | 数据/facts 与必须补齐的语义；不能用假布尔或不支持即 false |
|---|---|
| quick、locked | 公开 owner==quick、locked；原版 include/exclude 子条件补证后加入。 |
| created/updated date | 现 UTC 毫秒；持久绝对区间或明确相对日历表达式，不保存求值时 now。相对规则传同一 evaluationTime/timeZone，按原版本地日界、月界、DST 和端点定稿；跨日无写入也刷新投影。 |
| checklist | 合法 taskItem/checked 的有、无、存在已勾/未勾或全体语义由混合样本区分，不能 JSON 字符串 contains 代替。 |
| attachments | 真正已确认的文档节点及其受管 attachment 类型/facts，分别覆盖照片视频、扫描、涂鸦、地图、网站、音频、文稿及无附件；当前未保存扫描来源分类/地图等事实时，先补真实元数据/节点再支持，不能按扩展名冒充。孤立已存但未插入附件不能自动成为用户可见附件规则命中。 |

新增规则及结构性子条件采用新的 query version/显式 capability，旧读者拒未来版本；禁止 opaque Value 保存未知规则。各批只接受已实现的闭合 schema，U 只能提交后端已声明可用能力；全部本地规则完成前不宣布完整交付。共享/@提及没有本地协作来源，保留原范围说明，不伪造状态。附件本地类型和日期子控件的未证语义是后续真正实现任务，不是永久取消范围。

## C3/C4 接缝：所有权能力与原子引用处理

建议后端统一能力表，UI 规则候选可按原版补证进一步收窄；不能反向放宽 Rust owner。下列 parent 政策属工程提案，系统目录是否为原版规则候选仍待证。

| 实体 | live note owner/移动目标 | normal 的 parent | folder 规则引用 | 可删实体 |
|---|---|---|---|---|
| default/quick | 是 | 是（保留物理能力） | 是 | 否 |
| normal | 是 | 是（另验无环） | 是，直属匹配 | 是，真实屏障 |
| trash | 仅 deleted note 的存储 owner；非移动目标 | 否 | 否 | 否 |
| smart | 否 | 否 | 否 | 只删定义 |
| all | 非实体 | 否 | 否 | 否 |

createNote、patchNote(move)、restoreNote、recoverConflictCopy、create/moveFolder、live load 和 archive graph 共用能力判定。恢复 originalFolderId 缺失继续兼容“回 default”；若存在却是 smart/trash 则报坏所有权，不 silently fallback。旧归档合法的“原目录已删除”引用允许保持 dangling，并在映射时仅映射确有对应自定义实体的 ID；不要求所有 originalFolderId 现存。迁移碰到旧代码曾容许但本契约禁止的图，明确诊断并保全，不能自动移目录/笔记。

C4 未定前不采纳旧建议“有引用就阻删”。先实现纯 `planPhysicalFolderDeletion(subtreeIds,definitions)`：扫描每个 include/exclude token、所有 all/any 分支及不匹配的引用，返回 affectedSmartIds/定义 revision/引用位置；不改内容。root 确认原版后选定唯一政策并补闭合 schema：原子重写/删除定义，或显式可归档的 unresolved/tombstone；不得静默删除条件、把最后 token 变空 exclude 或最后规则变 match-all。Session.begin 先在同 Mutex 预检/形成计划，Store 最终事务重读并核计划版本，将笔记移 trash、删物理子树、处理全部定义引用放进同一 SQLite commit；屏障期禁止插入新引用绕过。智能定义删除不生成全体成员的保存屏障。D 可先交付扫描与事务接缝；公开删除政策须 C4 定稿后编码，不留永久阻删替代品。

## C7：活库 2 与归档 3

活库目标 `user_version=2`，仍用 folders JSON 存定义，不建成员快照/明文标签表。先读版本：0 只对空新库创建；既有旧结构的 0 仅在结构/旧数据完全符合旧 v1 时走显式兼容；1→2 在单事务中完成旧实体/图验证、必要的元数据版本标记、设置 user_version；2 严格读；>2 或未知结构在任何表/恢复/系统行写入前拒绝。系统行只在确实缺失且允许的初始化/迁移事务中建立，解析失败不得当缺失。不得全库重写文档/revision/recordedAt/mtime。迁移和原 import/attachment journal 恢复顺序须明确：先识别受支持库及 journal，再沿现协议恢复，再做图校验与事务升级；不能对未来库先跑恢复清理。旧二进制会重置版本并忽略字段，版本号不能保证降级安全；新程序读旧、旧包操作新活库不受支持。

归档接受 1/2/3：1 禁非空 recordedAt，2 保留现录音日期；1/2 严格拒 smart/query/revision，3 接受严格两分支并保全日期。无 smart 导出沿 1/2，有 smart 导出 3；本地 DB2 的物理实体输出仍保持旧物理字段集合。归档的格式版本、query.version、DB user_version 和 ImportJournal.version 各自独立，journal 保持 1。

prepare_archive 一次映射全部自定义 normal+smart ID，再映射 parent、全部 folderIds（含未来 unresolved 的已定义规则）、note owner/original owner、selectedFolder/selectedNote；不改本地现有定义。先验证归档独立图，再验证合并图。导入的 smart 自身 revision 随副本保留（新 ID 已隔离），不借导入覆盖原 ID；系统行才可复用，不能让 `INSERT OR IGNORE` 静默吞自定义冲突。沿现 `archive.rs:623` 事务及文件 journal 发布，不另造两阶段“成功”。

## C5：CAS 与 Session 通知顺序

定义的名字/规则更新与删除，在同 SQLite 事务读取并比较 expectedDefinitionRevision，成功加 1；旧 revision 返回 `smart_conflict`，缺实体 not_found，失败不改笔记/定义。renameFolder 不能旁路 CAS。定义 revision 与 Note.revision、access epoch、metadata sequence 四者独立；纯改定义不得 bump 匹配笔记 epoch 或重建 Editor。

O 增加 `{metadata:{sessionId,sequence}}` 至 workspace/成功动作/查询响应；Session 新进程随机现有 sessionId、sequence 初值 0，仅在真实持久变更成功后、同 Mutex 内递增并形成响应/事件。失败、冲突、取消不递增；`lock_committed` 等已提交维护错误按已提交处理。覆盖定义 CRUD、笔记 save/创建/置顶/移动/恢复/删除/冲突副本、普通目录改名/移动/删除、归档与未来附件/内容 facts 的实际变更，不能只通知 smart CRUD。

发送顺序：Store commit→更新 sequence→tagged 权威响应与无正文事件快照→释放 Mutex→发事件→命令返回；有权限转换时先现 notes-access prepare/排空/commit，再发同次 metadata 事件。事件只含 sessionId/sequence、变更 ID/种类，不广播规则标签文字、正文、key。跨任务实际送达可乱序，sequence 负责判旧；发事件失败不回滚已提交数据，focus/重连必须重读。

接收端先订阅，再读 workspace；用独立 metadata 门拒同 session 低序号快照/查询，定义 revision 再核当前查询；新 session 必须完成现 AccessGate 的可信重新同步，不能只因 metadata session 不同就切换。元数据事件不调用 accessGate.invalidate/clearSensitive，不把定义版本塞入 Editor key。旧 save 响应即使 metadata 落后，仍先通过现 `AccessGate.accept(...,"save")` 校验原 note 权限，再处理原 note 的合法 ACK/revision；仅禁止它发布旧 workspace/正文，不能吞保存 ACK。运行时每窗导航保留，peer settings 不能强制选中同一 smart；新会话冷启才使用有效 selectedFolder。

## 下一编码任务与 gate

**下一项先单独做 `APP-SMART-D1` 数据防损修复：** 只改 Store.open/旧实体严格读取/系统行初始化和相应真实 SQLite 验证；读取版本先于 schema 写入及恢复清理，未来版本拒绝，0→现行1初始化/旧结构兼容须显式验证并事务提交，现行1不反复重设或重写旧行；系统行仅在真正缺失时按允许的初始化规则补建，坏 JSON/错 ID-kind/非法层级明确报错且保全。该批仍只接受现有四种物理实体，未知 smart 不能被宽松吞成普通目录；不提前写 smart 格式或升级到为 smart 预留的 DB2。覆盖新空库、合法旧库重开、伪装0/未来版本、损坏系统行、未知字段和中途失败，分别核原数据库/附件/设置未被补写覆盖。D1 不依赖 C4、不增加智能 UI，也不把删除补证当独立防损修复的阻塞。

然后 `APP-SMART-D2` 按本提案定稿的实体/规则契约引入 DB2、TS 严格联合类型/strictFolder 智能分支、内部定义 CRUD+CAS、三种规则真实求值、物理能力整图校验、归档3及全 ID 重映射、无副作用删除引用计划。覆盖重开、tags 四模式/合法 spans、all/any 与 A/A1、多 token、锁定 unavailable、非法 owner、CAS、旧1/含日期2/新3两次碰撞与失败全量不变。C4 的原版删除实验须另取用户对具体动作的授权；未定前不实现最终删除政策，不阻塞 D1。D2 涉及 C3 对旧图新增限制的决定需 root 明示后实施，不能混进 D1 自动修正旧数据。

**D 不提前开 UI 的具体边界：** 不新增 create/edit smart 菜单/表单/侧栏入口，不把智能动作接入现通用 action 公开分发。D 内部真实 Store API 可被生产 O 复用及测试，但在 O/U 完成前，Session 公开导入对含 smart 的归档返回明确 capability unavailable（须在 prepare 屏障/写文件前检查），不得让现 App 把导入 smart 当物理目录渲染；已有支持 smart 数据的活库也不得交给旧壳渲染。D 只作为前置源码交付，不发布替换用户包；若需单独发包，则必须加后端 capability 检查并显式拒绝打开该数据，不能静默隐藏实体或丢选中项。O 完成真实通知/旧回包与 ACK/Editor owner 后，U 接通入口、去掉临时能力 gate，复用全部数据能力；不复制另一套 store 或保留测试专用实现。

高风险 gate 只有三类：C4 决定后可能新增 unresolved schema/归档表达；旧库曾容许的异常 parent/owner 需“拒绝且保全”而非自动纠正；完整离线附件分类/日期/清单语义尚待原版及真实事实支撑。C6/C8 同步进入 O/U 任务，不阻止无 UI 的 D 基础编码。D/O/U 都完成并经准确双端包与原版对照前，不称智能文件夹或像素交互目标完成。

本轮仅新增本文；没有改产品/既有报告，也未运行测试、构建、GUI、ADB、stage 或 commit。
