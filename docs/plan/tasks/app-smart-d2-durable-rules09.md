---
id: app-smart-d2-durable-rules09
scope: Durable smart definitions, real queries and archive compatibility
status: in-progress
depends-on: [app-smart-d1-storage-open09]
---

## Objective

在真实 Rust Store 中持久保存智能定义及真实求值，支持后续两端共用。首批规则为标签四模式和置顶，默认草稿仍为原版空“标签／所有已选”，保存时拒绝不完整选择。最终仍需全部离线规则；文件夹规则包含原版删除联动尚未明确，用户已选择“先不删除，继续其他开发”，因此该规则与其生命周期另批接入，不以猜测、永久阻删或空引用替代。D2不向尚未适配的旧UI开放智能数据。

## Context

`docs/architecture.md`、`docs/research/smart-folder-contract09-proposal.md`、`docs/research/smart-folder-data-gate09.md`、`docs/ui/smart-folders-macos.md`、`docs/research/smart-folder-empty-tags-runtime09/README.md`。本任务是root对提案的有限定稿，以这里明确的范围为准，其他提案不是隐含已批准项。

## Approved data contract

严格物理/智能 Folder 分支：物理六字段保留兼容，禁止 query/definitionRevision（含null）；smart保留六公共字段，parentId必须null，query和definitionRevision必需。自定义 ID 不占 default/quick/trash/all，系统身份固定；不允许normal↔smart转换。定义revision初值1、上限JS安全整数，更新名称与规则共用CAS，缺实体not_found、旧版本smart_conflict、溢出明确失败，不UPSERT复活。

更新与删除都必须携带 expectedDefinitionRevision 并在同SQLite事务中比较；删除也不能以旧版本执行。64KiB上限按query规范JSON序列化后的UTF-8字节计算，不按含空白的输入原文或JS字符数。

query version1闭合形状为 `{version:1,combine:"all"|"any",rules:[...]}`；rule为 `{type:"tags",mode:"allSelected"|"anySelected",names:[...]}`、`{type:"tags",mode:"anyTag"|"noTags"}` 或 `{type:"pinned",value:boolean}`。禁止未知字段、names出现在无需token模式、空selected names、重复name/type、未知mode/version和空rules；当前最多两条不同类型，names最多128，定义query JSON最多64KiB。name复用现合法标签跨度语义：不带#、1..64、精确大小写、不normalize；已选名称可以暂时没有笔记引用。未来规则以显式query版本/capability扩展，不能保存未知opaque值。

求值从真实已校验文档noteTag spans提取，不能按plainText正则。全集排deleted和显式suspended；pinned读取公开元数据。locked行（包括已临时解锁）对tags取unavailable，不假作无标签。all遇false为false、全true才true；any遇true为true、全false才false；其他unavailable，最终仅true入列。未锁普通空文档可命中noTags。成员不持久化；内部生产API返回同一快照的 `{definitionRevision,ids}`，后续列表与计数共用。顺序可沿Store稳定输入顺序，UI排序另层处理。

新增内部真实Store创建/完整替换更新/删除智能定义、求值API，动作输入严格解码。删除只删定义，不动其查询结果笔记、附件、key、note revision；这是当前工程所有权契约，原版删除交互仍待核实。既有普通rename/delete不得对smart旁路CAS或误按成员操作；folder_note_ids(smart)明确不可作为物理屏障目标。

统一物理能力：live owner/移动目标仅default/quick/normal；trash仅deleted存储owner；normal parent可default/quick/normal，不能trash/smart/all；smart根层、不能为parent或note owner。createNote、patchNote移动、restore、conflict-copy、create/moveFolder、live整图检查及archive整图检查共用判定，失败不写入。restore旧originalFolderId缺失保留回default；存在但不可作owner明确拒绝。原本合法归档的缺失originalFolderId引用仍允许；不自动修正旧异常图。智能删除没有匹配笔记保存屏障。

## Version, archive and exposure

DB目标2，D1的识别/事务/未来拒绝继续保留；1→2在同事务校验旧图并提交版本，合法JSON/笔记不重写；2严格两分支。未来版在恢复前拒绝。新归档3接受严格两分支及recordedAt；1/2仍严格旧物理格式，1禁止非空recordedAt，2含义不变。无smart导出仍沿既有1/2；含smart才3。journal版本保持1。导入先映射全部自定义normal+smart，再映射parent、note owner/original owner、selectedFolder/selectedNote、附件和正文既有引用；系统复用，碰撞创建副本，smart revision保留。两次导入的定义/实体互不覆盖。沿原文件journal和SQLite事务，不另写演示导入器。

版本0空库和完整可识别旧0库在同一初始化/整图检查事务中直接提交目标2；既有1走1→2；2重开只校验、不反复赋版本。不先提交1再另开事务升2。智能求值显式接收suspended ID集合，在同一SQLite读快照取得定义与笔记；不调用visible/decrypt提取锁定正文。导入只读preflight与实际finish共用生产Archive预算/版本/格式解析；begin先拒绝含smart再建立Pending/发prepare，finish再次按同策略检查，防止其间源文件被替换。

此批内部Store方法供O复用与真实测试，不接入generic workspace action公开分发，也不新增UI菜单。Session公开导入含smart归档时，在prepare屏障或文件写入前明确 capability_unavailable；公开workspace若库含smart同样明确拒绝，让旧UI不能把smart当物理目录。包含smart活库的其他公开读写不能绕过该检查；现有普通数据不受影响。必须列明lib/Session与Store所有公开接入链及其gate，不只在workspace加一次检查。内部Store真实测试可创建、重开、导出/导入smart；这不是第二套Store。O/U贯通时移除临时capability gate。

## Path and delivery

允许 Rust store.rs、store/open.rs、store/archive.rs、必要smart模块及实际测试、Session/lib的窄capability gate；src/types.ts/bridge仅若必要定义严格分支边界，不动App/Editor UI、依赖、lock或原生插件。证据只写 `docs/verification/app-smart-d2-durable-rules09/`。所有源改动串行，作者不GUI/ADB/用户DB/stage/commit，不发布平台包。root先固定D1并等独审通过，另行明确发出D2开始指令。

## Verification

真实临时Store：旧v1迁移2不改合法行；创建tags定义→关闭重开→规则/revision/成员保持；allSelected/anySelected/anyTag/noTags、多个合法标签、plainText伪标签、locked/unavailable、deleted/suspended、pinned true/false与all/any区别样本；CAS旧稿、删除后旧请求、整图和所有owner/parent失败前后不变。归档旧1/日期2/智能3真实导入两次，核冲突映射、设置、正文/日期/笔记物理owner，未知字段/未来query/伪旧格式拒绝；故障rollback和既有journal恢复。Session公开入口gate须在barrier/文件写入前，用真实Session/lib接缝验证，不用测试专用成功通道。

只运行必要离线Rust测试、现有Store/archive/Session/日期回归；jobs2、至少2GiB、独占hosttarget、禁止cache清理/升级下载/平台build。若动TS边界，另pnpm typecheck及真实跨语言固定corpus；不写镜像求值器自证。完成后STOP，root固定commit，不同作者独立审查与必要实测。D/O/U全通过和准确双端新包验收前，不称智能功能或像素完成。
