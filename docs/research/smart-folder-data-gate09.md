# 智能文件夹 D 批数据门禁 09

2026-11-04；只读基线 `1b1d47aab702eccb29999e8ead404e856dc089c7`。复用 [readiness03](smart-folder-implementation-readiness03.md) 与 [delivery07](smart-folder-delivery07.md)，独立复读当前生产入口及现有测试源码。这里只新增本文；未运行测试、构建、GUI、ADB，未访问用户数据库、修改产品/缓存/index或提交。下列契约仍须 root 定稿，不能当成已授权实现或测试通过。

**仍阻塞 D 的具体事实**

| 接缝 | 当前事实及必须挡住的失败 |
|---|---|
| `store.rs:153–183` | 每次 open 都执行 `PRAGMA user_version=1`，且先初始化/恢复后才补系统行。`folder(fid).is_err()` 不区分不存在、JSON损坏和其他读取错误，随后 `INSERT OR REPLACE`。坏系统行会被覆盖；合法JSON但错误的系统kind则不会因此被修正。应先识别既有版本/实体，未来版本与损坏数据明确拒绝，只有真正缺失时按批准策略补建，迁移与版本提交原子完成。旧包仍会重置版本、忽略新字段，单加版本数字不能宣称降级安全。 |
| `store.rs:65–75/191/207` | Folder.kind 是任意字符串，无query或定义revision；serde未拒绝未知字段，加载无完整图校验。仅把query塞入JSON会在读取/改名/导出时丢失；仅在TS或动作中校验不能保护重开与归档。 |
| `store.rs:326/379/474/494/539/571` | createNote、patchNote改owner只拒trash；restore只验原目录存在；冲突副本沿用源owner；createFolder父只验存在，moveFolder再防环。smart一旦进入实体集合，这些路径会把它当物理owner/parent。必须统一能力判断，覆盖读取、直接Store调用与归档，而非只隐藏UI候选。 |
| `store.rs:270/587`、`session.rs:269/322` | deleteFolder仍递归物理后代并把其所属笔记移trash；Session按物理后代noteIds排空保存。智能定义删除不得复用“删除匹配笔记”的所有权解释。物理目录删除涉及的规则引用必须按root政策与最终删除同事务处理，不能只查当前匹配结果。 |
| `archive.rs:180/250/368/418/483/527/624` | 只接受1/2，2已用于recordedAt；自定义kind只认normal，只映射/合并normal。owner只验ID存在，originalFolderId缺引用目前允许；INSERT OR IGNORE不是智能ID碰撞策略。新增定义必须同时扩展版本、严格解码、规则引用映射、合并图复验及原子导入。 |
| `session.rs:269–310`、`lib.rs:117` | ordinary验证当前session token、拒pending，但除unlock外无事件/epoch推进；没有定义CAS。Mutex不阻止旧表单覆写，也不提供跨窗顺序。定义revision和元数据顺序不能借用note revision/access epoch；O未完成前D能力不向真实UI开放。 |

**root 在首 D 前需定的最小数据契约**

1. 严格区分物理与智能形状：query版本、规则字段/条数/长度上限、未知字段/未来枚举处理；旧合法普通目录怎样兼容。定义编辑、改名与删除共用的expected revision/CAS、删除后旧请求不得UPSERT复活。`all`仅导航ID；是否允许种类转换与智能parent必须明示。
2. 一张能力矩阵约束 default/quick/normal/trash/smart 的 note owner、original owner、parent、移动目标及规则候选。非法当前owner的冲突副本须拒绝且无新行；restore对“旧目录已删除”保留既有合法fallback，与“存在但不可作owner”分别处理。不要因新增严格校验拒掉原来合法的旧归档缺失originalFolderId引用。
3. 查询全集、deleted/locked元数据边界、AND/OR、folder token内集合关系、A/A1直接或递归、空集/重复/未知引用，以及物理删除时include/exclude全部引用的处理。名称通过稳定ID展示；未批准的空规则不能默认为全匹配。复用03/07原版有限事实，不把07的QA前缀候选弹层推广为所有候选能力。
4. 活库迁移目标与未来版本拒绝、新智能归档版本（建议独立新版本，编号由root定），保留1/2及recordedAt原义；导入映射smart自身和全部规则ID、parent、owner/original owner、selectedFolder，独立journal版本不随意重解释。无智能定义时导出版本政策也需明示。
5. D的成功提交、定义CAS返回与O后续通知所需身份固定下来；定义变更不撤匹配笔记key、不提升其note epoch、不清保存intent/Undo。真实lock/delete/purge/物理目录删除/import继续既有prepare→登记保存排空→ACK→commit/abort，不把查询成员当访问所有权。

**首 D 的有区分力验收；以下均是待执行点**

- 穿生产Store临时SQLite：旧合法库→升级→创建真实定义→关闭重开，名称/规则/revision/成员一致；未来user_version、坏系统JSON、合法JSON错误系统kind各自拒绝且不重置版本或覆盖实体。对迁移中断验证无半迁移，不能只断言最终版本数字。
- 同一语料放A直属置顶/非置顶、A1直属、B直属置顶/非置顶和trash；按批准规则区分AND/OR、多token集合及非递归。锁定笔记只按批准公开元数据计算；列表与计数消费同一投影，不以手填成员快照验收。
- 直达create/move/restore/conflict-copy/parent入口提交smart或其他非法能力目标，比较失败前后workspace、revision与附件文件不变；同时保留合法默认/quick/normal及旧restore fallback对照。正常定义删除只删定义，成员笔记不变；物理删除检查不匹配分支里的引用也按政策原子处理。
- 定义旧revision更新/改名/删除失败；两份调用共享真实Session/Store，先成功再提交旧稿，不能用两个独立Mutex模型代替。删除后旧稿不复活；pending保存屏障中普通元数据动作仍按现有门禁拒绝。
- 旧归档1、含recordedAt的2、新智能格式分别导入；1/2中藏query/智能kind不能被serde丢弃后接受。新档案F/S/N连续导入两次制造碰撞：S1只引用F1，S2只引用F2，笔记仍归各自物理F，本地旧实体和录音日期/内容不变。故障发布/事务中断沿既有journal恢复验证，不另造演示导入器。

直接复用实际测试接缝：`store.rs` 的 `persistence_conflicts_delete_restore`、三项 `conflict_copy_*`、`archive_attachments_and_cycle_guards`；`store/archive/tests.rs:97/178/299/318/332/418/652` 的碰撞、拒绝不变、旧originalFolderId fallback、发布/事务故障及重开；`store/recorded_at_tests.rs:113/206/243` 的坏值不改写、v2双导入和v1旧语义；`session/tests.rs:72/115/145/181/342` 的真实登记保存、失败ACK/超时/丢窗、真实revision冲突及conflict-copy授权。只在这些生产入口补本批区别场景；本轮未重跑旧套件，也不把既有测试源码存在当成新D实现通过。
