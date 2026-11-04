# 后续纯本地智能规则：数据准备13

2026-11-05；只读源码基线 **`d576b50`**（使用该提交的文件内容，不以并行开发中的工作树代替）。本轮仅新增本文，未访问用户库、GUI/ADB/REA/网络、target、锁或缓存，未运行检查/测试/构建，未修改产品、任务、索引或既有证据，未暂存/提交。

**日期、快速归属与锁定标记已有基础元数据；清单有合法结构；附件只有部分真实分类。** 这些事实尚未接入持久智能规则，不能因数据存在便开放可保存入口。当前U仍只提交标签/置顶，创建日期／今天只是明确拒绝提交的草稿；runtime12新增的日期子控件证据不扩大U范围。

## 当前真实基线

`src-tauri/src/store/smart.rs:30–115` 的闭合 `Rule` 仅tags/pinned，`SmartQuery.version=1`，1..2条、同类型至多一条、定义≤64KiB；`src/types.ts:3–11` 和 `src/smart-folders.ts:24–78` 保持同一边界。新增规则不能只添表单选项，必须同时调整合法枚举、数量/字段验证、Rust求值和TS投影。

Rust `evaluate_smart_folder` 在同一SQLite读事务读取定义、笔记、附件，排除deleted与suspended；tags对 `note.locked` 取unavailable，未为匹配而解密。TS `SmartFacts` 当前只有`eligible/pinned/tags`，`projectFolders`消费相同三值逻辑和锁定边界。列表、数量、首篇来自同一投影，不能为新类型另写一套UI筛选。

主要源码依据均为上述提交：`store.rs:99–145/235–268/390–495/688–750`、`store/smart.rs`、`store/archive.rs:286–386/415–426/587–604`、`store/archive/document.rs:94–155/275–334`、`store/archive/document-schema.json`、`src/editor-schema.ts:39–105`、`src/smart-folders.ts:139–238`。旧提案中的folder规则或11条上限不代表当前已实现schema。

## 数据现成程度与缺口

| 规则 | 现成真实数据 | 仍缺事实或契约 | 后续接入影响 |
| --- | --- | --- | --- |
| 创建日期 | `Note.created_at: i64` / `createdAt:number`。`store.rs:71`的`now()`取UNIX epoch毫秒；新建与冲突副本有明确赋值。现有归档携带该值。 | 只是时间点，不携带时区或“今天”的含义；现`validate_graph`未建立日期规则专属的可接受数值范围。原版日期端点、日历/时长、时区、DST及跨日行为未证，不在此设计。 | 规则schema、共同时间输入/事实、求值、日期草稿/控件、无持久写入时的投影刷新；不必为读取现有字段先增加笔记列。 |
| 编辑日期 | `Note.updated_at` / `updatedAt`，真实`saveNote`成功时设`now()`；前端pending乐观值使用`Date.now()`，ACK仍权威。 | 当前`patchNote`（置顶/纸张/移动）、锁定/移除锁等不是统一重设`updated_at`；不能假设它等于任意元数据变更时间。哪类动作应计为原版“已编辑”仍需独立事实，不能顺带改既有写入含义。 | 与创建日期共用日期契约；另需明确ACK前乐观时间与保存后权威值切换，不借metadata sequence当编辑日期。 |
| 核对清单 | 编辑器用`TaskList`/嵌套`TaskItem`；合法文档有`taskList -> taskItem+`，`taskItem.attrs.checked`是布尔，schema缺省false。合法树可取得清单存在、已勾/未勾条目。 | 已有本地原版[核对清单菜单AX](../../references/desktop/smart-folder-conditions/checklist.ax.txt)第12–15行记录“任何/未勾选/已勾选/无核对清单”（窗口App为备忘录）；这只证明菜单文字，混合清单、空项、嵌套的匹配量词尚未实证。取事实时必须应用schema缺省，不能把缺省checked当未知或扫描JSON字符串。 | Rust合法文档facts与TS相同树遍历；不需要为了计数先持久明文清单索引。仅从已校验结构求事实，保持节点/深度限额。 |
| 附件：照片/视频、音频、普通文稿 | 受管`Attachment`已有`id/noteId/kind/mime/relativePath/displayName/size`；生产存储及归档按MIME前缀严格对应`image/audio/video/file`。文档`attachment`节点有`id/kind`，验证要求同note归属且kind与真实元数据一致。 | 受管行可以已存而尚未插入正文；不能只看`workspace.attachments`中存在noteId就算“可见附件”。“文稿”与通用file的原版边界也尚未逐类证实。 | 求值需对合法文档实际引用与受管身份做交集，复用现附件提交/引用语义；不读取媒体字节猜类型或为规则新增无授权文件接口。 |
| 附件：涂鸦 | 合法独立`drawing`节点与`strokes`已有，编辑器真实使用同一扩展；它不是受管attachment行。 | 空strokes、被清空画布是否计涂鸦、与附件“任何/无附件”的归类未证。不能因附件表无行便忽略合法绘画节点。 | 内容facts与附件类别汇总；只读现合法节点通常不用改文档格式，但需另定匹配语义。 |
| 附件：扫描件/地图/网站 | 当前附件四种kind没有扫描或地图身份；合法文档有普通`link` mark，但没有独立网站/地图附件节点。扫描插件的临时输出可带`sourceToken`，现受管Attachment没有该来源字段。 | 持久后无法仅靠文件名或PDF MIME可靠区分“扫描件”和外部PDF；普通文本超链接不自动等于原版网站附件；地图语义没有现成闭合结构。 | 扫描来源若要真实支持须贯穿生成→提交→持久元数据→读取/归档；地图/网站可能需新的合法节点/元数据和渲染支持。这些不属于只添evaluator即可完成的规则。 |
| 快速备忘录 | 持久物理目录固定`id=quick/kind=quick`，Note有真实`folderId`；`is_live_owner`允许quick。 | 现没有独立`isQuick`或创建来源字段。`folderId==quick`可表达当前归属，但是否等于原版快速规则、移出quick后是否仍匹配，尚未实证；`originalFolderId`是删除恢复用途，不能当创建来源。 | 若后续证实只按当前owner，既有元数据即可；若需持久来源，须补模型/写入口/导入兼容，不能从标题或目录历史猜。 |
| 锁定备忘录 | `Note.locked`持久布尔，设置锁/移除锁真实写入；临时解锁钥匙在`Store.keys`，不改变locked。 | 应区分“设置了锁”和“此窗口目前能读正文”；原版include/exclude子条件及匹配含义仍待补证。 | 若按已设置锁匹配，公开布尔足够，无需解密或新增字段；不能把`keys.contains_key`、AccessGate授权或当前焦点当持久规则。 |

当前App的快捷筛选仍有`JSON.stringify(document).includes("taskItem")`及按附件表kind匹配（`App.tsx:598–612`）；它们不是新的智能规则事实层，不能直接复制成权威实现。`attachment-submission.ts:13–27`及Rust`attachment_operations.rs:99–145`已有按实际文档节点核附件引用的接缝，但后者是操作安全判断，不应无审查地冒充完整附件分类器。

## 日期证据只到未保存草稿

[runtime12](smart-folder-date-draft-runtime12/README.md)已见创建日期菜单、特定范围两日期控件及“到”、稳定相对范围的“过去 / 空数量 / 小时”，单位菜单含小时/天/周/个月/年；没有提交或求值。特定范围截图的`2026/3/13`是该次可见值，不是当日或已确定默认值。03 AX是切换过渡，01/05图像菜单被捕获范围裁切，不能补作完整可见画面。

这批不证明编辑日期子条件、非法输入警告、端点包含/排除、月份/年份截断或任何时区政策。本报告不为它们选择实现答案。日期规则另批需先补共同语义与输入合法性，且“时间经过但没有Store提交”不产生现metadata事件，不能只靠笔记保存触发相对规则刷新；刷新应独立于持久提交序号，不能为刷新伪写笔记。

## 必须共同触及的模块

| 接缝 | 后续职责；当前不改 |
| --- | --- |
| `store/smart.rs`、`src/types.ts`、`src/smart-folders.ts` | 新的闭合规则及版本、重复类型/数量/字段/限额校验；Rust同快照求值与TS同事实/三值语义。日期应使用同次求值的明确上下文，不能每条规则自行读不同now；具体时间契约另定。 |
| `store/archive/document.rs`、`document-schema.json`、`src/editor-schema.ts` | 清单/已有绘画/附件引用可复用合法结构；若新增地图/网站节点或扫描来源属性，须同步编辑器schema、Rust属性政策、合法结构及归档验证，不能往attrs塞未声明字段。 |
| `store.rs`、`store/attachment_operations.rs`、实际媒体提交入口 | 仅在需要新增持久来源/类型时贯穿写入、读取、相同操作身份比较、文件发布与取消/恢复；不得在提交后按名字猜来源。现recordedAt是录音日期，不是扫描/创建日期的替代字段。 |
| `store/archive.rs`、`store/open.rs` | 新查询解码/兼容、必要元数据迁移及归档表达；保留原子导入、附件ID映射、文档引用重写及失败保全。新增quick来源若有，需明确复制/移动/恢复/冲突副本/导入保持语义。 |
| `session/metadata.rs`、`src/metadata-client.ts`、`src/App.tsx` | 实际内容、归属、锁定及附件提交继续沿O真实收据/顺序刷新投影；相对时间刷新另处理。收到新规则事实不得撤旧save ACK、替换原note owner或重挂Editor。 |
| `src/smart-draft.ts`、`src/SmartFolderForm.tsx`、专用样式 | 后端能力接通后才开放相应完整草稿/提交；Mac与手机分别用已证控件，不从Mac外推手机。当前日期today草稿的拒绝保留，不因本报告预先放开。 |

## 版本与安全边界

当前是 **DB user_version 2 / query.version 1 / 智能归档3**；无智能定义按是否有recordedAt导出1或2，导入接受1/2/3；ImportJournal.version仍1。它们是四种独立版本，不能因新增规则机械地一起加号。

新增规则必须另定query版本/能力，旧规则含义保持，未来/未知分支继续明确拒绝，不能当false、忽略或静默删行。使用现笔记字段求值本身不要求新笔记列；若新增扫描/quick来源或文档节点，则活库迁移、缺省“未知”的表达、归档新格式/旧格式拒绝与降级保全要一起定稿。是否升级归档3或采用新归档号由后续格式契约决定；不能把“仍可装进JSON”当成兼容。不得重解释旧归档1/2的录音日期规则，也不为查询改动附件/import日记版本。

所有规则先排deleted与suspended。公开日期/归属/locked可作为元数据候选；清单、绘画、正文链接、可见附件引用属于内容facts，沿现tags政策对**locked（包括临时解锁）取unavailable**，不为求值解密、不把加密空占位当“无”。all/any及否定保持unavailable语义；公开真分支使any入列也不授予正文或附件读取权限。当前含受管附件笔记不能锁定这一限制不因新规则放宽，非法归档图应拒绝，不能为了匹配悄悄修复。

通知继续只含metadata序号、变更种类/ID及必要revision，不广播正文facts、规则标签文本、钥匙或路径。不建立明文全局内容索引/缓存，也不因更改定义或日期tick修改Note.revision、access epoch、Undo或保存队列所有权。内容facts的TS乐观投影只能消费现可信pending文档，真实ACK失败仍保留原note的待保存内容。

后续最小证据需求是：各规则合法值和原版有限混合样本；一份共同facts/真值语料；实际Store重开/归档兼容及真实保存边界；准确两端包的有限UI对照。这是待后续任务实施的准入清单，本轮没有执行或宣称通过。[当前U源码任务](../plan/tasks/app-smart-u-platform-ui09.md)与[双端包/设备任务](../plan/tasks/app-smart-u-device09.md)的标签/置顶范围保持原样，日期及其余本地规则继续留作后续交付，不关闭F17或总体目标。
