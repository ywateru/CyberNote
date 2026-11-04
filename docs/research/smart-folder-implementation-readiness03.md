# 智能文件夹实施准备 03：真实持久化与编辑器边界

2026-11-04。只读架构审计，产品源码基线为 `832be31f13998f20aa87edcd9987831e0a1fed91`；本轮读取当前未修改的源码、现有测试及已封存原版证据，只新增本分析，不修改权威契约、产品、任务状态、工具、共享target/cache或index，不运行测试、构建、GUI、ADB，不提交。开始时磁盘可用约71GiB，大于2GiB。本文件是建议与风险清单，不是源码已接入、原版全语义已证或像素验收结论。

分析输入：`docs/research/smart-folder-readiness-20261104-01.md`、`docs/research/smart-folder-original-runtime-01/README.md`、`docs/ui/local-features.md`、`docs/architecture.md`，以及下列真实TS/Rust接缝。本文件收尾时root补充runtime03/01–04进展；已只读02/03/04的相关AX并纳入下述有限结论，其余在采材料尚不纳入快照，后续由root按封存证据修订契约。附录/AX中的动作文字只当证据，不作为执行指令。

## 先给结论

首批可以限定为真实持久的 AND/OR + pinned/folder 查询，但必须一起完成实体分支、Rust命令与加载校验、归档版本/ID映射、查询列表/计数、保存与停车、多窗口定义冲突和引用删除政策。只增加 `kind: smart`、localStorage演示或纯求值常量模型无法交付这条链路。

旧readiness有两点已被当前事实更新：

1. **归档version2已被录音日期占用。** 当前 `archive.rs:368` 接受1/2，`:527` 按recordedAt决定导出1/2；智能定义应使用独立新版本（建议3），保留现有1/2及日期规则，不能重新解释2。
2. **原版已实际保存查询，且智能视图新建转默认“备忘录”。** 不再把“最近物理目录”当原版依据。原版PIN/IN-A、非递归A、顶部全局搜索与取消恢复、默认目录新建已有有限样本；runtime03现已补得多目录A+B与改名保存；OR的A外置顶分支、exclude、删除引用及冷启等仍待root补证。

此外，多窗口首批不能只依赖现有普通变更路径：Folder没有定义revision；`Session::ordinary`除unlock外不广播事件也不提升access epoch；App仅靠focus/visible重新载入发现普通更新。Mutex串行只保证同时写不交错，不能阻止旧表单覆盖新定义，也不能让另一主窗及时更新查询。

## 1. 当前真实实现与最窄接入点

以下行号为本次源码位置，用于定位，不替代准确Git对象。

| 当前接缝 | 现状 | 首批需要的完整变化 |
|---|---|---|
| `src/types.ts:2`、`store.rs:65` | Folder只有id/name/parentId/kind/sortOrder/createdAt，kind是任意字符串，无query/revision | 加严格物理/智能分支；智能有版本化查询和定义revision；物理形状保持旧数据兼容 |
| `store.rs:151–181` | folders.body存完整JSON；notes.folder_id独立；open无条件user_version=1；系统目录缺失时补建 | 加完整Folder/图加载校验、真正数据库版本读取/事务迁移和较新版本拒绝；不能把改写PRAGMA常量叫迁移 |
| `store.rs:539–624` | create固定normal；rename/move/delete限制normal；parent只查存在；delete递归实体目录并删其笔记 | 独立smart CRUD；共享校验防smart充当实体父目录/目标；物理删除引用政策同事务实施 |
| `store.rs:379/474/495/327` | create、move仅拒trash；restore只查原目录存在；冲突副本继承源folderId | 统一physical目录能力检查覆盖所有入口，smart永不可成为Note.folderId/originalFolderId |
| `archive.rs:180/286/368/415/483/624` | 只认normal自定义目录；归档1/2；只映射normal ID；笔记归属只检查存在 | 新智能版本、严格规则验证、smart自身与规则内目录ID映射、合并后整图复验，复用原有原子导入/日记边界 |
| `App.tsx:542–607/1382/2058/4140` | 列表默认按实体folderId；chooseFolder用实体归属找首条；count同样按folderId；只有desktopSearch保留base Editor | 使用同一智能投影供列表/计数/选择；智能视图也是投影上下文，不是实体归属或单次重建Editor |
| `App.tsx:1417/4287` | createNote把all/trash回default，其他id直接传后端；移动列表只排trash | smart新建明确default，成功退出智能/搜索；移动目标和普通目录parent均排smart，后端同样拒绝 |
| `App.tsx:711/798/830` | hydrate合并合法pending；flush检查队列之外的pending/失败；save ACK只推revision | 所有smart导航/定义保存/成员变化复用原ACK链，不能清pending或用新快照给旧文档重基线 |
| `lib.rs:100`、`session.rs:269/285` | notes-access仅权限变更；普通query元数据无事件/CAS | 定义revision + CAS，独立元数据通知/顺序，不用note access epoch代替定义版本 |
| `bridge.ts:158/244` | native action与显式浏览器预览分离 | 同步API/预览行为，但正式成功证据必须穿过Tauri→Session→Rust→SQLite→重开/归档，不以预览代替 |

## 2. 建议先落入共享契约的实体/规则形状

以下是实施建议，尚未批准为权威schema：

```text
PhysicalFolder.kind = default | quick | trash | normal
  保留旧字段；禁止query与智能专用字段
SmartFolder.kind = smart
  id = Rust UUID；parentId = null（首批工程约束，原版层级未证）
  name / sortOrder / createdAt
  definitionRevision = 非负整数
  query = { version: 1, combine: all | any, rules: SmartRule[] }

SmartRule = pinned { include: boolean }
          | folder { mode: include | exclude, folderIds: PhysicalFolderId[] }
```

建议首批每种规则最多一行，因此仅1或2条规则，组合all/any真实生效；folderIds去重、非空、有界且全为受支持的真实物理目录ID。runtime03/03的AX有A、B两个附带文本token；root报告移除pinned行后改名保存，04的AX显示MULTI-AB三条=A直属两篇+B直属一篇，未出现A1。这支持本次include多目录为集合并集；exclude=不属于任一所选目录仍只是推荐，需root进一步补证。外层all/any是规则之间的组合，不能与token内部集合混为一谈。直接目录匹配，不递归后代，已有A/A1有限样本支持。

规则以ID引用、名称仅即时展示；重命名物理目录不能改变查询成员，不能以输入文字/标题重查生成另一个ID。默认/quick是否列入候选、trash能否列入、智能是否可作候选由原版补证决定；工程最低边界是禁止smart引用smart，trash不进入非删除结果全集，任何未支持目标都必须UI与Rust一起拒绝。不能让exclude未知ID变成全匹配。

严格校验规则版本、枚举、字段集合、类型、空集、重复与上限；unknown query、未知kind、物理query、缺失smart query均返回明确错误并保持已保存状态。Rust反序列化当前会忽略未知Folder字段，必须在类型/反序列化入口解决，不能只校验TS表单。新增动作也拒绝未支持query字段，不能给缺规则默认为match-all。自定义ID与系统default/quick/trash严格区分，`all`只是导航ID，不是Folder实体。

首批不做normal↔smart原地转换、不做smart父目录、不做任意嵌套表达式/自由SQL、不存成员ID快照。转换checkbox原版语义未证；错误转换会重解释实体笔记归属。当前标签已真实接入，不能把旧“标签未合并”的状态继续引用，但首批不保存tag/date/content规则也不需要为此新增明文索引。原版新建默认标签行与首批仅pinned/folder支持之间的UI初始态仍需root明确：不能把默认标签悄悄改成置顶而宣称像素一致，或保存一个未实现的标签规则。

## 3. 持久化、兼容和归档要一起完成

runtime03/02–04还支持既有定义编辑后实际保存名称为MULTI-AB；02/03表单原名仍IN-A，04窗口/侧栏新名与结果相符。目录候选仅显示未选普通目录的范围目前来自root动作回顾，未在本次所读AX片段中独立完整核实，不能推广为所有系统/智能目录不可选。

### 活数据库

可继续用 `folders(id,body)` 存定义，避免成员表与内容派生索引；SQL列 `notes.folder_id` 只表示真实物理归属。规则名称/目录选择是公开文件夹元数据，不是正文密文；首批仅pinned/folder不引入标签文字保护例外。

`createSmartFolder`由Rust生成ID并一次写入名称+完整规则+初始definitionRevision；`updateSmartFolder`用id+expectedDefinitionRevision同事务比较并递增，rename也是该定义更新；`deleteSmartFolder`同样比较revision后只删除定义。定义有冲突时返回新鲜权威定义或显式conflict，保留表单草稿供用户处理，不能普通“重试”静默覆写。删除后旧表单提交not_found/conflict，绝不UPSERT复活。名称是否允许重复不影响实体ID。

新程序先识别当前数据库版本、验证旧实体，再事务迁移到新版本；失败不发布半份数据或把合法旧文件覆盖。当前open每次重置user_version=1必须改。**旧二进制仍会重置版本且忽略新字段，数据库版本数字本身不能防旧包降级写入。** 与现有录音日期契约一致，至少明确新程序读旧、拒未来版本，旧包操作新活库不受支持；若要求防旧包破坏，须另决数据根隔离/拷贝升级策略，不能未经决定宣称降级安全。本批分析不决定或实施用户数据迁移。

### 归档建议智能使用version3

保留1/2导入：version1不能携带非空recordedAt，version2保留其日期语义；没有智能定义的导出仍按原规则选择1/2，有smart才导出3。旧程序当前仅接受1/2，会明确拒绝3。version1/2里出现智能kind/query应拒绝，不能先由宽松serde丢掉再当普通目录；version3需同时保全已有recordedAt。

`validate_folders/validate_graph`必须一起验证物理与智能、父树、规则引用及Note.folderId/originalFolderId的物理能力；不可把“存在该ID”当可写目录。旧归档原originalFolderId缺引用已有恢复fallback语义，应先定义旧兼容策略：不得为了新校验无条件拒掉过去合法的“已删原目录→default”数据，也不能允许smart作为originalFolderId。新版本输出应为该状态生成明确合法表示。

碰撞导入映射所有自定义normal和smart自身ID，再逐个映射parentId、每条folder规则的全部folderIds、Note.folderId/originalFolderId、settings.selectedFolder/selectedNote；系统目录不复制。合并后重新整图校验，再沿现有文件暂存/日记与SQLite事务提交。当前 `INSERT OR IGNORE` 不能代替smart碰撞映射；否则定义可能被静默跳过。

必须覆盖“本地已有F/S，归档F/S/N重复导入两次”：生成F1/S1/N1和F2/S2/N2，S1只引用F1，S2只引用F2，笔记仍归对应物理F，原本地定义和笔记不变；include/exclude、多ID、全/任意、设置、recordedAt和旧锁定密文均不丢。取消、缺引用、非法规则及中途失败不得留下半份实体。不可顺手改不相关密文映射或放松已审archive/schema保护。

## 4. 真查询、计数、锁保护与实体新建

建议唯一投影输入为当前合法Workspace（含有权pending合并）、所选已保存定义和本窗口导航状态；输出成员ID集合供列表、标题计数、sidebar计数和选择共同使用。Rust是定义验证/持久化权威；前端纯函数可复用求值，但不能以纯函数单测替代持久链路。TS/Rust若各自求值，需要共享边界样本防AND/OR和空值漂移。

候选全集先排deleted与当前suspended，再对公开pinned/folder元数据求值：all为每条为真，any为至少一条真；无规则非法。sidebar智能计数不随临时全局搜索文字变化；列表计数跟当前实际查询/搜索范围。普通目录、all、trash计数原逻辑单列，不能将smart当folderId统计出0，也不能把子目录笔记自动纳入直接目录规则。失败/未保存文档不能因投影失配被删或错报已保存。

锁定笔记已有公开title/pinned/folderId；首批元数据规则可以在不解密的前提下纳入锁定行，正文仍沿真实授权入口，不能读blank占位当正文。是否显示其计数须在契约写明并补原版样本，不以标签“排除全部locked”的目录规则自动替代元数据政策。访问prepare立即冻结/遮挡目标、失效派生结果与可操作目标，不等组字，不新增明文正文/标签索引；commit/abort仅从当前合法快照重算。未来noTags或其他否定内容规则须区分unavailable与false，不能借当前pinned/folder布尔简化泄露或放大结果。

源实体归属须由统一能力检查覆盖createNote、patchNote移动、restore、recoverConflictCopy、普通文件夹parent/move、加载/导入图；推荐只允许default/quick/normal为可写物理目标。UI移动列表目前只排trash，必须同时排smart；后端拒绝不依赖UI。智能定义删除不调用物理deleteFolder，不回收成员笔记或附件。

**原版已观察智能视图点新建转普通“备忘录”。** 首批推荐smart新建固定default，经原flush→真实createNote(default)→已验收响应的Note+access→真实新Editor，成功后清smart选择/搜索/标签并选default与新ID；失败保留原视图/正文/失败内容。不能把smart ID或include唯一目录当新笔记归属，不能自动置顶满足规则。普通“新建文件夹”仍创建normal实体；创建成功后它可出现在规则候选，不能自动转移智能成员。普通文件夹创建parent当前未限制smart，须同能力检查修正。

## 5. 顶部搜索、停车、真实ACK与Undo

原版runtime01的顶部搜索从IN-A转账户全部，取消恢复IN-A；因此当前 `query/filter` 早返回全体非删除笔记不一定是smart bug。需要显式区分保存视图与全局搜索层：保存 `{smartId, definitionRevision, selectedNoteId, list/gallery, sort, scroll}` 的返回上下文，搜索显示真实全局结果；取消按当前合法定义恢复，不恢复已删除旧定义或已被撤权正文。是否另有“在智能文件夹内搜索”入口未证，不把所有搜索强制做交集。

但 `desktopSearch` 目前只由文本/标签驱动；仅选smart而无query时不启用停车。`projectSearchNote` 在searching=false直接返回baseNoteId，`chooseFolder`又按n.folderId找首条，因此直接加smart会同时出现空结果、旧正文或错误选中。需要将“保存视图投影”与“全局搜索投影”纳入同一明确导航层，结果外的编辑器不可见不可写；保留真正base Editor以便返回。不能把smart名称、definitionRevision、计数、匹配集或search文字加入Editor key。

当前 `SearchEditorHost` + `SearchEditorGate` 已能停车：同一Editor隐藏、editable=false，晚到restore仍受gate约束；未涉及授权变化时返回保留JSON、selection和Undo历史。现有Editor key仅由noteId/sessionId/noteEpoch/externalVersion组成，metadata定义变化不能伪装成noteEpoch变化。真正外部正文变化可继续沿externalVersion重建；不能为保Undo吞掉外部保存或重基线冲突。

`saveDoc`在提交时注册真实save intent、记录pending和乐观Workspace；排队任务成功收到Rust saveNote响应后才推进revision，并仅在pending对象仍是该doc时移除pending。`enqueueSave`的finally不是ACK；`flush`等队列后还检查pending/失败。智能切换/表单保存/删除/新建不能只await一个已catch的Promise就宣布保存成功，也不能读取当前B的Editor保存到旧A。

推荐必须核实的实际路径：A编辑→保存被延迟或失败→进入smart/global search显示B/空→A仍为同实例停车→A的真实Rust ACK只确认A revision、不回填A旧正文、不改B当前文档→取消回A→同实例Undo/Redo仍正确。失败时保留最新pending和旧baseline，后续重试/冲突副本沿现有权限、附件、修订约束；不能为查询改变自动存副本或抹失败。

当前tag IME保留是特定旧匹配Editor在内容标签失配时延续自然组字的工程契约，不是通用“所有筛选都延迟”。首批pinned/folder不读取正文，正常正文输入不会改变匹配；不应仅为智能规则新增另一个composition观察器或给所有编辑失配扩大例外。若跨窗定义变化/移动或新规则确需延迟，应由契约显式规定，复用已审目标/cycle/owner/stamp边界。权限prepare永远即时优先。

runtime01唯一已测取消置顶导致失去最后匹配时，原版自动转源物理A；不能一律套“留在空smart”替代，也不能将该行为推广到peer定义变更/移动/内容失配。推荐将元数据动作成功后的导航决策与查询投影分开：只有已补证路径才自动导航，未证路径至少停车并保留真实空态，不显示可写的失配旧正文。root需决定首批一致的动作触发表。

## 6. 多窗口定义更新、删除与目录引用生命周期

### 定义并发与通知

建议SmartFolder.definitionRevision为持久CAS版本，create/update/delete都在Session/Store现有Mutex及SQLite事务内完成。两个窗口同revision编辑，先提交者成功，后提交者conflict；删除与旧编辑提交同样不能复活。普通Folder重命名若会影响smart候选显示，也要触发可信刷新，不靠客户端改名缓存。

新增只带session/单调metadataSequence/变更ID的元数据通知（具体名字由契约决定），监听先于首个快照，收到后读Rust权威Workspace，丢事件或重聚焦也重读。可用Session内独立序号与sessionId区分重启，不必为定义更新递增每个匹配noteEpoch；后者会撤权/destroy Editor/Undo，是错误耦合。通知不广播正文、key、密码或解密规则来源。普通笔记pinned/folder移动影响smart成员，也要纳入更新触发，不能只通知定义CRUD。

现有Session普通动作global epoch是权限token检查，未做定义CAS；不要误把它当乐观并发版本。metadataSequence是否进入快照与响应新字段、如何避免旧metadata快照覆盖新定义，要在bridge/AccessGate/同步队列共同定义。别为每次元数据事件调用clearSensitive或提升access generation后误拒绝合法read；也不能绕过现有generation检查让过期内容入缓存。必要时为元数据加独立顺序门槛。

App hydrate每次setSettings，但folderId只在首次初始化由settings采用。新定义通知应更新共享定义/计数，保留各窗口本地导航，不把另一窗口selectedFolder广播成强制切换。当前selectedFolder/selectedNote是共享设置，写入竞争属于既有语义；首批应明确冷启选中与运行时每窗选择的界线。独立笔记窗不因匹配集变化被导航到另一个笔记；只更新必要元数据并维持其真实note owner。

当前smart被别窗删除时，立即失效该视图与规则操作目标，关闭/标冲突旧表单；原笔记与pending不删。推荐先停车仍归原note的Editor，按真实flush/ACK安全地回default或原物理上下文；失败则继续保留停车目标/错误，不destroy未保存内容。删除定义不触发全匹配note的授权屏障，不清密钥/历史。返回搜索时若smart已不存在，走明确fallback，不恢复已删定义缓存。

### 物理目录引用删除

首批建议最窄政策：**有任一smart规则引用待删物理目录或其待删子树时，拒绝实体deleteFolder并提示先编辑/删除相关视图。** 这与原版是否一致仍待root实证；批准前不能作为原版行为交付。引用检查必须包含include、exclude、多ID、当前不匹配的any分支，以及整棵被删实体子树，不能只检查目前结果成员。

Session.begin在同Mutex内可先预检，避免已知会拒绝的物理删除先打断所有窗口；Store实际删除事务前再次验证，保持后端权威与直达Store/未来入口安全。屏障过程中普通变更已拒绝，不允许另外一窗插入新引用绕开检查。若root观察原版允许删并调整/失效，需明确可归档的tombstone或原子引用重写政策：不能静默删条件、把空exclude当真、把最后规则移除变all，或运行可载而导出必失败。

对无引用实体目录仍沿既有deleteFolder保存屏障、递归笔记移trash与事务；smart deletion单独删定义。物理目录rename/move保持稳定ID；直接匹配语义下移动目录本身不改变其中笔记的folderId，不应按新树重算成递归匹配。移动笔记改变folderId则必须实时重算受影响定义，且只用动作真实成功结果发布状态。

## 7. root最需要补的原版证据（按首批阻塞优先级）

| 待证 | 最小有区分力样本 | 影响的共享决定 |
|---|---|---|
| OR独立分支 | A中plain + B中pin，all(A,pin)为空、any含两者 | 防只有A内pin的现样本误判AND/OR |
| exclude与多目录边界 | include[A,B]三条且不含A1现已有限成立；继续exclude[A,B]、重开双token、空/重复token | exclude集合语义、选项能力及空集/规则类型限制；不重做已成立include样本 |
| 候选/移动能力 | 规则候选及移动列表中观察normal/default/quick/trash/smart；取消不改数据 | 严格physical能力边界与UI候选范围 |
| 定义保存/取消/冷启 | 改名MULTI-AB与include[A,B]保存已成立；继续重开字段、取消改动、正常退出/启动、同名不同ID | 完整定义跨进程保全、冷启选择/计数，不仅看侧栏出现 |
| 智能删除 | 删除S前后物理F/N数及正文，另窗口或已打开正文状态 | 删除视图仅元数据、导航fallback、定义表单失效 |
| 物理引用生命周期 | S含include/exclude F，F有子目录；删除F/移动F/改名F并重开S | 阻删、移除token、失效定义或其他原子政策；归档必须同政策 |
| 成员移出与最后匹配 | 从smart把唯一匹配移到别目录、改pinned，记录动作前后选中/正文/计数；至少一例仍有别匹配 | 自动源目录导航 vs 空态 vs其他选择，不能泛化取消置顶单例 |
| 搜索返回与新建 | 独立smart多/空结果→顶部搜索→取消；智能新建目标/失败；全局入口对照 | 保存视图上下文、默认物理目标与选择恢复 |
| 锁定元数据 | 合成locked笔记在pinned/folder定义中的行与计数，锁/解锁前后 | 仅元数据匹配的locked成员政策，正文权限不能由计数推断 |
| UI像素及移动端 | 原生无损同画布表单、token/菜单/错误/空态；手机专门证据 | 当前AX/JPEG不提供像素值，Mac表单不能冒充手机布局 |

原版多窗口定义编辑冲突可补证，但本项目真实CAS、保存失败、访问屏障与Undo保全仍需工程验收，不能等同Apple/iCloud策略。原版当前账户为iCloud，观察仅用于本地可成立行为，不新增同步能力。

## 8. 最小完整实施顺序与后续验证边界（本轮未执行）

1. root先批准共享schema/版本/locked元数据/引用删除/导航触发表；将已观察与工程选择分开。当前architecture还只有四种Folder，不应开发代理自己悄悄改公共约定。
2. Rust实体、严格读取/版本、smart CRUD+CAS、physical能力边界和归档3/重映射共同实现；同时给native bridge真实接口。没有此步不对外展示“已保存智能文件夹”。
3. App接真实定义表单、单投影列表/计数、物理新建与移动、global搜索返回/停车；接metadata通知/多窗冲突与删定义fallback，保留旧Editor/ACK/Undo所有权。
4. 后续必要验证应穿真实SQLite写入/关闭重开/旧1与2归档/新3重复碰撞/非法导入不变、真实Session两窗定义CAS/权限保存ACK、真实App停车与Undo。已有纯函数/生产schema检查只辅助。再出准确包做原版同文/GUI与实际输入/冷启，不能从源码准备度直接报像素通过。

现有可复用验证接缝只读确认：`store/archive/tests.rs`已有重复碰撞/重开、非法图、事务失败、进程中断恢复、旧schema与纸张；`session/tests.rs`已有真实两窗intent排空、失败/timeout/冲突阻止权限提交；`scripts/check-search-selection.mjs`已有真实Tiptap停车/Undo/Redo和晚restore门槛；`check-tags-composition-retention.mjs`覆盖既有标签组合输入目标。它们尚无smart实体/新归档/定义CAS测试，未在本轮重新运行，也不能被引用为smart已通过。

本轮仅新增本分析，产品与已有证据均未修改。上述约束已足以制定串行真实实现任务；root后续补证可能改变候选/引用删除/动作导航的UI政策，但不改变“实体ID、持久Rust定义、物理归属、真实ACK、授权屏障、归档完整和多窗CAS不能省略”的接入责任。
