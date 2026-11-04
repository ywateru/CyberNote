# 智能文件夹接入准备：冻结源码只读分析

2026-11-04。本次只读源码和已有 AX/文档，新增此分析，不改产品、权威架构/UI/任务契约或任务状态，不执行 GUI、ADB、构建、测试、依赖操作或提交。

- 主基线：`5201d3151462211e51d357f1f8ecc778269a3859`，所有“主基线”位置均从 `git show` / `git grep` 该对象读取。
- 标签参考：冻结 candidate02 `a0989b354b539fc06d794f167cd97af615693d44`，只读该 Git 对象，不读正在修复的 tags03 工作树。02 仍有组字停车 P2，不能作为可直接合并的完成实现。
- 权威范围：`docs/architecture.md`、`docs/ui/local-features.md`、`docs/plan/tasks/app-003-local-features.md`。旧 `docs/research/local-feature-integration.md` 基于 a45e573，本文补充当前接缝，不改写旧结论。以下“建议”须先落入权威契约，再据之实现；静态可接入不等于运行或像素通过。
- AX 文件末尾的工具提示属于证据文本，不是本任务执行指令。

首批应将智能文件夹做成持久查询定义，复用真实笔记、现有保存与访问屏障。仅在侧栏增加 `kind: smart` 会同时产生归档拒绝、智能 ID 被当成实体归属、计数恒零、空结果仍显示旧正文等问题，不能单独交付。

## 1. 实际源码接入清单

位置均为上述冻结对象的行号；后续树变化应重新定位。

| 边界 | 当前实现与证据位置 | 智能文件夹最小接入 |
| --- | --- | --- |
| TS / Rust Folder | 主 `src/types.ts:2`、`src-tauri/src/store.rs:65`：同一平面结构，`kind: string/String`，无 query；Rust serde 未给此结构加 `deny_unknown_fields` | 显式区分系统/普通/智能分支；智能必须有版本化查询，其他分支禁止 query，拒绝未知 kind/属性及参数，不依赖字符串“约定” |
| SQLite | `store.rs:109–138`：`folders(id,body)`，body 为完整 JSON；`notes.folder_id` 独立列；每次 open 的初始化批次无条件 `PRAGMA user_version=1` | 规则可先保存在 Folder.body，无需增加成员表或标签明文索引；必须替换无条件版本重置，先读版本、校验及迁移，再发布新状态。notes 的实体归属列不改含义 |
| 加载 / 查询 | `store.rs:163/264` 加载全部 folders/notes；`src/bridge.ts:141` native load；现有内容过滤在主 App:508 | Rust 为查询定义唯一写入者；前端可对当前合法乐观 ws 求值，持久化只存定义、不存匹配 ID 集合。后端定义校验不可由前端替代 |
| CRUD | `store.rs:495/515/527/543`：create 固定 normal；rename/move/delete 只允许 normal；createFolder 可选任意存在父目录；deleteFolder 递归删除实体目录并把所属笔记移到 trash | 独立 create/update/deleteSmartFolder 动作可避免误用实体删除；名称、规则在同一次已校验写入中发布；删除智能视图只删定义。系统目录保护保持。首批建议智能视图不作 parent、不允许作为层级父目录，原版此语义 unknown |
| 实体归属 | `store.rs:335` createNote 仅拒 trash；`:430` patchNote.folderId 仅拒 trash；`:450` restoreNote 只检查 originalFolderId 存在 | 增加同一 `isWritablePhysicalFolder` 边界：只允许 default/quick/normal。create、move、restore、冲突副本旧 folderId 校验、导入图都不能让 smart ID 成为 `Note.folderId/originalFolderId` |
| 删除屏障 | `session.rs:262/341` 把 deleteFolder 作为屏障，目标来自 `store.rs:226` 物理目录子树及实体 folder_id | 不以智能匹配结果调用 deleteFolder。新 deleteSmartFolder 只改视图元数据，是否需要全局普通变更 epoch 同现有 ordinary；不得暂停/删除所有匹配笔记。物理删除对子树的既有屏障保持 |
| 侧栏 / 层级 | 主 App:1838 folderRow 递归 parentId，图标仅 quick/trash/普通；:3390 按非 quick/trash 根节点显示 | smart 图标、选择及编辑菜单分支；不参与“移动备忘录”目标（主 App:3993 目前仅排除 trash）。从接口到 Rust 都要拒智能目标 |
| 导航 | 主 App:1171 chooseFolder 从 `n.folderId === id` 取首项；selectedFolder 持久为该 id；:556 projectSearchNote 只覆盖 desktopSearch | 选择 smart 必须从真实匹配结果确定列表和正文，不能用实体归属找成员。保存视图选择可允许 selectedFolder 指向 smart，但需单独保留合法物理新建目标；清晰区分导航上下文、当前匹配项与原 Editor 身份 |
| 计数 / 标题 | 主 App:1818 count 对 all 排除 deleted，其余只按实体 folderId；listTitle/subtitle :1822 | smart 计数与列表使用同一求值投影，不能 count(folderId===smart.id)。先定义计数是否随临时文本搜索变化；建议侧栏显示保存查询本身计数，列表显示叠加搜索后的计数，属于工程选择 |
| 搜索叠加 | 主 App:510 只要 query/filter 存在便跳过 folder 限制，转全体非删除笔记；tags02 App:519 相同 | 若“在智能文件夹内搜索”是最终契约，须显式 `savedQueryMatches ∩ textSearchMatches`，不能沿用早返回分支扩大范围；原版本轮未测此作用域。保留既有全局搜索入口，需要明确其与视图内搜索的切换 |
| 保存 / 乐观内容 | 主 App:601 hydrate 合并合法 pendingDocs；:729 保存时记录 pending；:690 flush 的失败检查；现有编辑器/每笔记队列、revision 与附件 ACK 均有身份约束 | 求值用当前有权 ws，包括保留的失败/未保存合法快照；不能只读挂载 Editor 或把 ACK 的旧文档回灌。失配只影响视图，不删 pending 或更换保存归属 |
| 访问屏障 | `session.rs:74/86` access 快照和 pending 目标正文脱敏；主 App:clearSensitive、prepare/commit/abort、editorGate/原目标保存 | query 结果、计数、建议及缓存必须随 prepare 即时失效，不能等待 compositionend；元数据规则与内容规则分开处理，不增明文派生索引，详见第4节 |
| 浏览器预览 | `src/bridge.ts:246/264` 有独立 create/deleteFolder 分支，预览删除行为也与 Rust 简化不同 | 同步类型和预览功能以避免开发假象；验收仍穿过 native Rust/SQLite，不能用预览替代正式持久化 |

## 2. 最小类型与迁移建议

保留现有序列化字段兼容旧普通 Folder，增加显式智能分支；不在第一批引入任意嵌套布尔表达式、自由 SQL、任意 JSON 或一次性结果成员表。类型命名仅作建议：

```text
Folder = PhysicalFolder | SmartFolder
PhysicalFolder.kind = default | quick | trash | normal
SmartFolder.kind = smart
SmartFolder.query = { version: 1, combine: all | any, rules: SmartRule[] }

SmartRule（仅已实现分支可保存）
  pinned { include: boolean }
  folder { mode: include | exclude, folderIds: PhysicalFolderId[] }
  tag { mode: allSelected | anySelected, names: TagName[] }
  tag { mode: anyTag | noTags }  // 此分支禁止 names
```

1. 第一批可独立交付 pinned + folder 两种公开元数据规则，以及 all/any 的真实组合。标签规则待标签候选独审完成与第4节明确后接入；不必等完整媒体/扫描才能交付查询能力。清单、附件、日期、快速/锁定可依赖后续独立规则模块。
2. rules 非空；selected 模式名字集合非空；folderIds 非空、去重、存在且属于物理目录；tag name 严格复用已提交标签有限身份契约，精确区分大小写、不自动归一化、不加 `#`。建议声明有界规则数/每规则成员数（如32/64，最终值由契约决定），未知版本/规则/属性/类型返回结构化错误，旧查询与列表不变。
3. 第一批 folder 匹配建议显式“仅所选目录，不递归”，或持久 `descendants` 开关；二者必须先选定，不能直接借用物理 deleteFolder 的递归辅助函数充当查询语义。拒 smart→smart 引用，避免查询循环和成员范围混淆。
4. Folder.body 已可存额外 JSON，不需要为 smart 改动所有 Note 行；需要真实内容版本迁移及加载校验。先验证全部旧 folders/notes/settings，再事务提升版本；失败不写半份定义。新程序保留读取旧格式及旧归档能力，旧普通数据不需改实体归属。
5. `Store::open` 当前每次把 user_version 重置为1，直接把它改成2仍不是迁移。新程序应读取并拒绝自己不支持的较新版本，不能重置后继续写。**旧二进制仍有重置逻辑**，单纯升 PRAGMA 不能保证旧程序拒绝降级；如果要求防止旧包覆盖新规则，需要另外决定数据文件版本隔离/升级门槛，并保留旧兼容备份。不得在本分析中声称降级安全已解决。
6. 普通分支上禁止 query，智能分支缺 query 拒绝；不要把“缺规则”默认为匹配所有。Folder 元数据不在 Note 密文内，其机密边界必须显式说明，不能误称 query 已随锁定笔记加密。

## 3. 归档是首批阻塞接缝

主 `src-tauri/src/store/archive.rs` 的准确边界：

| 位置 | 现状 | 必须一起改动 |
| --- | --- | --- |
| :180 validate_folders，尤其 :197 | 非系统 id 必须 kind==normal，否则 archive_invalid；检查父引用及循环 | 明确接受已知 smart，并验证查询形状及规则引用；保留系统身份/层级保护，不能将判断改为“非空 kind 都可” |
| :286 validate_graph | `Note.folderId` 只检查 id 存在；未区分实体/智能；删除状态与trash相等 | 要求笔记所属物理目录，originalFolderId 也有明确物理合法性；query.folderIds 必须指向受支持物理目录，不能只通过“该ID存在” |
| :368 prepare_archive，:369 | 仅接受 archive.version==1 | 建议带 smart 的新归档用版本2，新程序支持旧1和新2，旧程序明确拒绝2；不要用normal+附加字段伪装智能规则，否则旧serde可能忽略字段后重导出造成丢失 |
| :415–440 folder_ids/map_folder | 只为 normal 创建碰撞ID映射；改 f.id/parentId | 纳入全部自定义实体目录和智能视图 ID；系统 default/quick/trash 保持系统身份。智能视图自身 ID 与规则中物理ID分别映射 |
| :441–466 | 改笔记 folderId/originalFolderId、正文附件ID及 selectedFolder | 还需遍历每条 folder 规则中的所有 IDs，包括 exclude/多个ID；选择状态若指向 smart 也映射。tag 字符串是身份文字，不经 folder ID remap |
| :480–492 effective graph | 仅把 normal 导入目录加入合并图，然后完整再校验 | 同时合并 smart，映射后再次检查规则引用、实体归属与系统身份；有效图校验不能省略 |
| :616–640 | 真实事务 INSERT OR IGNORE 文件夹、INSERT笔记、更新设置；附件已沿暂存/日记发布 | 重用现有事务与恢复边界，不绕过 FIX-00；映射遗漏会使 smart 同ID被 OR IGNORE 静默跳过，故必须在提交前完成唯一映射和完整校验 |

**重复导入必须验证的最小例子：**备份含普通目录 F、智能视图 S，其规则 include/exclude F，笔记 N 实体属于 F。已有本地 F/S 同ID。第一次副本为 F1/S1/N1，第二次为 F2/S2/N2；S1引用F1，S2引用F2，N1/N2实体归属分别正确，本地S/F不被覆盖；系统目录不复制。多ID规则逐项映射，不能只替换第一项或依赖标题。取消/非法规则/缺引用应在发布前拒绝，不产生目录和笔记半份副本。

物理目录后续被删除也是规则引用生命周期问题。建议首批显式选择“存在引用则拒绝删除并提示编辑视图”或“原查询保留为失效定义并显示缺失目录错误”；不能静默删掉条件，也不能把丢失的 exclude 条件解释成全匹配。若采用可删除并失效，归档要能保全/表达此状态，不能运行时允许但导出必失败。此项须同 CRUD/图验证一起落定，不是后补 UI 文案。

smart 规则放在 Folder 元数据内，folder 引用重映射不需要解开笔记密文。APP-003 的 noteLink 密文碰撞映射仍是另一项设计门槛，不应借智能文件夹任务盲改现有密文。

## 4. 标签目录、显式规则文字与访问屏障

冻结 tags02 的 `src/note-tags.ts:64–97` 已有可参考边界：`projectTags` 排除 deleted、所有 locked（包括当前授权解锁者）、显式 suspended 和 workspace.access.suspended，只从合法 noteTag spans 派生 names/counts；`tagSelectionAfterAccess` 在目录无合法同名来源时，把单标签内存筛选降为不携带名字的所有标签。主基线尚无此模块，仍是 App:528 的普通井号检查，不能拿主基线 tags 搜索当真实标签规则。

需要区分以下三类：

| 内容 | 所有权 / 建议边界 |
| --- | --- |
| 从正文派生的 tag 目录、建议、计数、当前派生筛选名 | 严格沿用已提交架构保护：屏障立即移除受保护来源；无其他合法引用时清派生名称，不留 abort 恢复缓存；不写明文全局索引 |
| 用户明确输入或选择并保存的 query.tag.names | 属于显式规则文字，但当前架构未给“保存规则中的明文标签身份”例外；不能把它当匿名目录缓存，也不能未经契约决定就持久化为 Folder.body。需明确这是用户保存的公开元数据，或另定规则保护方案，说明归档/展示/编辑边界；不是本轮已经批准的新契约 |
| 规则编辑器尚未保存的输入 / tag 建议列表 | 输入与受保护派生建议分开。prepare 清建议与计数，不从被保护文档补全名字；用户主动输入文字是否保留按明确规则编辑契约，不伪装成仍有效的目录来源 |

若最终选择“已显式保存规则为公开查询元数据”，推荐保留持久规则文字，prepare只清派生目录/建议及受保护成员，不调用 `tagSelectionAfterAccess` 自动改写或删除保存规则；同名目录消失也不代表显式规则非法。这个选择需要在 architecture 中明确它与“不得新增持久明文标签列/设置/日志”的边界。反之若要求规则名也受保护，应先设计它的存储、解锁与归档，不能只在 UI 隐藏却仍明文导出。两种政策不能混用。

**不可把不可见当作不存在：**tags02 `tags.notes.get(id) || []` 适用于其正向筛选，但智能 noTags 不能据此把 locked/suspended 笔记算作“无标签”。内容规则建议求值为 match / noMatch / unavailable；noTags 只对真实可读取且合法、无标签文档为 match，不能对 unavailable 取反。屏障目标无条件从可操作结果和计数移除；locked 元数据规则可依据公开 locked 字段求值，但内容规则不读取其脱敏占位文档。混合 all/any 对 unavailable 的组合须有判定表，或首批明确排除含内容规则查询中的受保护笔记；不要让否定规则泄露或扩大结果。

标签候选02还不能解决智能内容筛选的全部编辑边界：其 App:516/558 将标签纳入搜索停车，候选02独审已发现活动组字失配而停车/blur。权威架构已补局部组合保留、屏障优先契约；接智能规则时应沿最终通过的 tags 接缝，不拷贝02缺陷，也不读/评价03未冻结实现。普通修改失去最后匹配时保留空列表及查询；活动组字按最终契约自然完成后停车；访问prepare则立即遮挡，不能等待输入结束。

## 5. 无匹配、新建与物理目录

建议显式状态流，而不是让“没有实体成员”回落到旧 noteId：

```text
选择保存视图 S
  → 校验规则版本与引用 → 当前合法 ws 求值 → 排序 → 结果 IDs
       ├ 有匹配：沿既有选中/Editor身份入口显示
       ├ 无匹配：保留 S / 0条 / 空态，停车不匹配原 Editor
       └ 无效规则或缺目录：显示真实错误，旧定义/未保存正文保留

在 S 中新建
  → 固定合法物理目标 P → 原保存/权限入口 → Rust createNote(P)
       ├ 成功：以返回的新笔记为可见可写目标；退出阻挡它的查询/搜索
       └ 失败：保留 S、原查询、原正文与失败内容
```

建议复用标签架构“新建成功后清内容筛选、显示真实新笔记”的工程策略；不可临时给空笔记伪造标签、置顶或日期以满足规则，也不能把新笔记放入 smart.id。若未来决定原版有不同智能新建行为，另补证和校准。

物理目标建议为窗口最近合法可写 physicalFolderId，无效/删除/all/trash/smart时回 default；也可首批统一 default，但必须写清且双端一致。不从 folder include 规则猜新建位置，因为 any、多目录、exclude、无folder规则都没有唯一目标。冷启时 selectedFolder 若是 smart，不足以恢复 P；应另设有类型选择状态或明确不持久P、冷启default，不能复用同一 selectedFolder 存两种含义。Rust必须独立校验P。

创建“普通文件夹”始终新增实体目录，与新建智能查询表单取消勾选的转换是独立流程。原版仅观察过checkbox，未测试保存或转换，首批建议不支持已有 normal↔smart 原地转换，避免把实体成员关系重新解释。新增物理目录可作为后续规则引用来源，不自动吸收智能视图匹配项。

## 6. 原版已观察与未知语义

本轮只读既有证据，无新增原版操作。依据主对象中的 `docs/ui/local-features.md` 及以下原始 AX：

| 证据文件（references/desktop/） | 已有观测 | 仍不能证明 |
| --- | --- | --- |
| macos26-smart-folder-filter-menu.ax.txt:3–25 | 名称默认新建智能文件夹；制作智能文件夹勾选；全部组合；默认标签行；移除禁用、添加/取消/好可用；规则种类含标签/创建/编辑日期/共享/@提及/核对清单/附件/文件夹/快速/置顶/锁定 | 没有保存过智能文件夹，没有创建后求值、编辑、删除、持久化、计数及导航实证 |
| macos26-smart-folder-tags.ax.txt | 所有已选、任何已选、任何标签、仅不含标签的备忘录 | 空选择、多标签身份比较、受保护笔记与noTags语义 |
| smart-folder-conditions/created-date.ax.txt:12–22 | 今天、昨天、最近7/30天、最近3/12个月、特定范围、相对范围、当日、早于/晚于日期 | 日期控件、边界开闭、时区、DST、3个月是否日历月；不能静默按90天实现 |
| smart-folder-conditions/checklist.ax.txt | 任何、未勾选、已勾选、无核对清单 | 混合/嵌套清单匹配语义 |
| smart-folder-conditions/attachments.ax.txt | 任何、照片与视频、扫描件、涂鸦、地图、网站、音频、文稿、无附件 | 类型来源、文档节点与附件表的并集、未知/缺资源；扫描不能由照片扩展名冒认 |
| smart-folder-conditions/folders.ax.txt:10–14 | 包含、不包含，另有文本输入控件 | 多选、递归、移除引用目录后的行为、能否引用智能视图 |
| smart-folder-conditions/pinned.ax.txt | 包含、不包含 | 实际匹配、取消置顶后的选择/编辑行为 |

全部/任意文字依据 UI 记录；快速/锁定的子控件、日期编辑控件未采样。共享/@提及无本地协作事实，不伪造状态。手机短录屏未覆盖这些弹层；Mac AX只约束已见文字/结构，不证明手机布局或任何像素数值。

## 7. 建议的独立交付批次

以下是任务建议，不创建或更改权威任务状态；遵守 APP-003 串行 App/Editor/Store 修改安排。

| 顺序 / 建议任务 | 最小可审阅产物 | 后续必须独立验证的真边界 |
| --- | --- | --- |
| SF-00 契约闭合 | 明确规则版本/范围、all/any、受保护内容否定、显式tag字符串政策、物理目标/空态、目录删除引用、降级/归档版本；更新权威契约后再编码 | 无隐式全匹配/静默删规则；明确区分原版证据与工程策略 |
| SF-01 存储与归档能力 | 联合类型、加载校验/迁移、smart定义CRUD、physical白名单、archive1兼容与2新格式、ID remap；不依赖标签UI | 旧数据可读、非法定义原样保全、取消/事务中断、重复导入两次；S1→F1/S2→F2，笔记实体归属不变 |
| SF-02 首批可用视图 | pinned+folder/all/any；创建/编辑/取消；侧栏、计数、选择、无匹配、搜索、新建/移动目标；复用现有保存/屏障 | 安装版从实际表单→Rust→SQLite→退出重启→改源笔记重新求值；无匹配不露可写旧正文，新建只进入物理目录；删除S不删成员 |
| SF-03 标签规则 | 依赖最终独审通过的标签候选；合法span投影、四种匹配方式、规则编辑及保护边界 | 普通#与noteTag区分，all/any集合、空集合拒绝；最后引用/Undo/失败保存/活动组字/prepare/abort；显式规则名与派生目录分别核查 |
| SF-04 清单与附件 | 共用结构化清单/媒体投影，先声明可真实分类分支，后接扫描等来源 | 混合清单判定、文档引用与受管附件一致；无附件否定不基于受保护占位，照片不冒认扫描；APP-004未交付时不宣称scan完成 |
| SF-05 日期与其余元数据 | 日历/相对日期版本化语义、快速/锁定子条件及原版补证 | 固定时钟与时区跨边界、重启后相对范围重新求值；再做同内容同尺寸原版界面对齐；不重跑本轮旧Android媒体验收 |

SF-01 与 SF-02可拆提交/审查，但仅存储模块通过不能标智能文件夹功能完成。SF-00显式tag字符串决定不妨碍先推进公开元数据规则设计。每批都应精确记录 source/build/runtime身份；本次没有运行任何上述未来验证，也不承接 tags03 复验。
