# 架构与数据契约

状态：首版实现契约，允许依据真实对比继续完善。

## 模块与所有权

```text
pnpm / TypeScript / React
    ├── MacShell (macOS 26 三栏、原生窗口、菜单)
    ├── MobileShell (iOS 录屏式布局、手势、键盘)
    └── Editor / 搜索 / 附件 / 录音 / 绘画
                    │ Tauri 2 invoke
                    ▼
             Rust commands
                    │
       SQLite Repository + attachments/
                    │
       平台 app_data_dir (不接入 iCloud)
```

Tauri 2 同时构建 macOS 和 Android；pnpm 管理前端与 Tauri CLI。React/TypeScript 前端分别实现平台壳，禁止把手机仅做成桌面缩小版。Tiptap/ProseMirror 提供结构化富文本、历史、表格、任务列表。Rust 是正式应用数据的唯一写入者。开发预览可有显式浏览器适配器，但不得把它用作打包版本后端。SQLite 采用 bundled 构建，事务写入，附件放在 app_data_dir/attachments/，路径不接受任意越界输入。

## 数据模型

- Folder：id、name、parentId?、kind(default/normal/quick/trash)、sortOrder、createdAt。
- Note：id、folderId、document（富文本 JSON）、title、plainText、createdAt、updatedAt、pinned、deletedAt?、originalFolderId?、locked、paperStyle、revision、sealed?（加密正文/盐/随机 nonce）。
- Attachment：id、noteId、kind、relativePath、mime、displayName、size。
- 录音日期源码候选已接入，Attachment 可选 `recordedAt`：设备墙钟 UTC 毫秒，缺失/null 表示未知；仅本次应用录音从首次 `recorder.start` 成功的应用观察点固定一次，暂停/继续/完成/重试不重算。旧附件、旧操作及外部导入音频不推断、不回填。详细边界见下述“保存后录音日期与紧凑卡片”。
- Settings：theme、list/gallery、sort、dateGrouping、sidebarWidth、listWidth、selection、locale。

ID 由 Rust 生成；时间为 UTC 毫秒，UI 按设备本地时区显示。title 从首段提取，空笔记显示“新备忘录”；摘要跳过标题。删除移到最近删除，保存 originalFolderId；恢复回原文件夹，文件夹不存在则回默认。永久删除为明确确认操作。持久文档包含表格/任务/绘画和附件引用，不能仅保存 innerText。

FIX-01 编辑契约：默认空笔记直接输入从一级标题开始，Enter 后为正文；仅首次、仍为空的一块标题/正文文档，在明确仅有 text/plain 的粘贴时按全部正文插入，已有内容或 HTML 粘贴不走该特判。短划线列表使用真实 bulletList 的 `listStyle: "dash"` 属性，与默认 `"bullet"` 区分，旧文档省略该属性仍有效。表格转换按各单元格内部 LF、列 Tab、行 LF（含末行 LF）生成正文，保留末空格，选中完整转换块，并以一个独立历史事务支持单次 Undo。格式面板保存当前 noteId 和映射后的 ProseMirror SelectionBookmark，面板命令不调用 focus；X 还原选区并恢复键盘，Android Back 关闭面板并保持键盘隐藏，切笔记清除旧 bookmark。Mac 画廊同主窗进入笔记，返回恢复相同文件夹/查询/排序/滚动；独立窗为显式菜单入口。

移动端格式面板与键盘附加栏互斥：`menu === "format"` 时不渲染 `editor-tools`，面板保留自身的圆形关闭按钮；X 恢复编辑焦点后，按编辑状态重新显示附加栏。面板仅依赖原有底部空间与原生 WebView 布局，无额外键盘高度抵扣。补修的真实原生触摸回归见 `docs/verification/app-001-fix-01-format/`。

paperStyle 合法值为 plain、lines-small、lines-medium、lines-large、grid-small、grid-medium、grid-large，依此按空白独占首行、其余两列三行显示。选择立即保存到当前笔记，取消只关闭选择页。纸纹用于绘画/手写区域和选择预览，不给普通键入文字整页铺纹；已有六种值无需迁移。绘画编辑与保存后的绘画节点使用相同样式，切换纸张不改笔画。

移动端纸张页单独保存 noteId、editor、SelectionBookmark 和原 editable 状态。打开前同步 blur 正文、冻结 editable 并调用原生隐藏键盘，避免 Android 系统 Back 只藏键盘但留下编辑焦点后再唤起 IME。纸张页期间书签随事务映射；取消、选择、Back、Escape 或 backdrop 关闭时恢复同笔记选区与 editable，保持键盘隐藏，切笔记作废旧目标。这是纸张页的项目交互契约，不扩展到其他弹窗或菜单。

## 命令契约

允许实现阶段调整命名，但必须在源码与本文同步：

| 实际 Tauri 命令 | 输入 | 输出/约束 |
|---|---|---|
| `load_workspace` | 无 | 文件夹、已授权文档、附件元数据、设置及 access 快照；屏障目标正文脱敏 |
| `register_save_intent` | noteId、intent、expected | Rust注入真实调用窗口；保存入队时预登记当前note epoch，prepare后不接受目标新登记 |
| `workspace_action` | `action: {type, ...}`、expected | 通用变更检查进程会话/全局epoch；saveNote须带登记的saveIntent，按真实窗口及note epoch检查；返回值带access |
| `workspace_action:recoverConflictCopy` | 源id、本窗旧revision、document、带源noteEpoch的expected | 显式冲突恢复；Session实时权限/屏障检查，Store仅允许未锁、未删、无附件源，完整验证后单INSERT创建新ID，原已确认笔记不改 |
| `acknowledge_access` | operationId、success | Rust注入真实窗口；未完成的目标保存不得成功ACK |
| `read_note_text` | id、expected | 执行时检查实时授权与屏障，返回title/text及access；拷贝/分享统一使用 |
| `store_attachment` | noteId、name、mime、Base64 data、expected | 受管本地附件元数据；100 MB 上限；实时授权/屏障检查 |
| `store_attachment_operation` | operationId、noteId、name、mime、Base64 data、expected | 新持久操作；真实window/Session生成owner；同身份同完整字节复用，返回operation状态/attachment?/access |
| `query_attachment_operation` | operationId、noteId、expected | 同真实owner、当前合法授权查实际持久状态；不以renderer generation当后端身份 |
| `cancel_attachment_operation` | operationId、noteId、expected | 只取消本操作安全未引用新文件；有权威引用则committed，有在途保存/身份不确定则deferred |
| `read_attachment` | id、expected | Base64 data、mime、name及access；按附件真实归属note检查 |
| `export_archive` | 本地 path、expected | 当前写版本1；录音日期子任务接入后，有recordedAt写版本2、无日期可写1，详见下文；屏障期间拒绝；标题仍可见 |
| `import_archive` | 本地 path、expected | 完整校验、冲突副本和设置恢复；先执行全部窗口保存屏障，成功清钥匙并更新epoch |

当前搜索在前端对 Rust 载入的本地笔记正文与元数据做中文子串过滤，没有独立 FTS/search 命令。附件随永久删除清理，没有单独 remove_attachment 命令。MacShell/MobileShell 是概念边界，首轮均由 `src/App.tsx` 分支渲染，富编辑器在 `src/Editor.tsx`，原生存储在 `src-tauri/src/store.rs`。

### 已提交标签契约（APP-003-TAGS-01，源码已合入、设备待验）

这是首批本地工程契约。原版只实证了 `#UI对照` 后输入空格及侧栏出现标签；以下语法、比较、修改与筛选细节尚未证明与原版一致，需后续补证校准。

正文文字是可编辑文本，已提交身份用 `noteTag` mark 表示，唯一必需属性 `name: string` 不含 `#`。一个完整标签跨度的实际文本必须恰为 `#` 加 name；同一 inline 父节点内相邻、同 name 的 text 子节点组成一个跨度，允许因粗体等格式分片，不跨非 text 子节点或段落合并。不允许 mark 在非 text 节点上，或同 link/code mark 并存。标签前后不自动继承 mark（inclusive=false）；修改造成跨度不再匹配时，编辑器仅移除该跨度的 noteTag mark，保留所有正文和其他合法格式，不猜测旧名字。后端对不一致文档明确拒绝，绝不静默修正文档。

首批 name 为 1..64 个字符，每个字符限 ASCII 字母/数字、下划线、短横线、U+3400..U+4DBF 或 U+4E00..U+9FFF 汉字，且至少含字母或汉字；不含空白/标点/控制字符。身份按精确字符序列比较，区分大小写，不做 Unicode 归一化，不依赖设备 locale 改变身份；这是有限实现范围，不冒充原版完整语法。属性未知、缺失、类型错误或超限须拒绝。

在普通可编辑文字中，文本块开头或空白之后的有效 `#name`，在用户输入 ASCII 空格时提交 mark，空格留在标签外。支持先 plain paste `#UI对照` 再输入空格；不扫描旧文档/导入内容来自动升级普通字符串，不在 link/code/codeBlock 中识别。组合输入进行中不抢按键、不重写其范围；实际提交结束后才能识别，不用定时器猜测候选结束。提交保留原光标并可撤销/重做，访问屏障/只读/Editor 销毁遵循原路径。

组合输入在已有标签内部改字时，活动 Editor 可以暂时保留旧 mark，避免干预输入法 DOM；这个临时跨度不能直接成为保存正文。Editor 产生的保存快照须保留当前全部文字、节点属性、其他格式和仍合法的标签，仅在快照副本中移除不合法完整跨度的 noteTag，不改活动 Editor、composition、选区、历史或实例身份。普通编辑和组合输入继续沿用原保存队列，不跳过组合期间的保存，不等候定时器；乐观正文、标签目录与持久保存使用同一合法快照，ACK 不向活动 Editor 回灌该副本。真实 compositionend 后既有事务清理活动文档，最终内容与快照一致，随后 Undo/Redo 仍须可解释。此投影只适用于生产 Editor 的出站快照，不用于修复导入、解密、IPC 或归档中的外部非法文档，Rust 严格拒绝不变。若附件/OCR等操作把 Editor 快照用作正文 ACK 身份，必须核对其与保存表示的关系；不得为修此问题改全局队列、放宽正文相等或授权检查。

正文仍包含 `#name`，所以既有 TS/Rust 文本、标题和归档可读文字保持逐字相同；新增 mark 必须进入共享 schema 清单及 Rust 属性/跨度校验，不放松其他结构。未带 mark 的历史 `#name` 保持普通文字。标签目录由当前已授权可见文档的合法 spans 派生、按 name 去重，排序用稳定字符序而非 locale 身份。目录和计数排除最近删除、锁定笔记及访问屏障目标，不保留其派生内容。不得新增持久明文标签列/设置/日志；既有标题公开元数据边界不变。

根据 [Apple 官方补证](research/tag-lock-official-20261104.md)，有已提交标签的笔记不能加锁；已经加锁的笔记即使当前有解锁权限也不能新增已提交标签（输入保留普通文字）。UI 禁用/拒绝入口，Rust 同样权威拒绝，不自动去标签或去锁。锁定 save/decrypt/unlock 的新文档校验拒绝 noteTag，不把新身份留在密文中；未知密码归档照旧只检查外层并保全，正确密码解密发现不合法身份时拒绝且不发布 key/改旧密文。此限制不影响普通无标签锁定文档或包含普通 `#` 字符的旧密文。本机菜单/提示文案仍待取证，不把官方默认新版页面当成本机 GUI 验收。

侧栏“标签 / 所有标签 / #name”使用同一投影：所有标签命中至少一个已提交身份的笔记，单标签精确命中 name，均排除最近删除并可叠加既有文本搜索。删除/撤销/恢复/导入/访问变化必须更新目录和结果；若最后引用消失，保留当前筛选的空结果而不跳到无关笔记。普通文件夹导航清除标签筛选；标签不是 Folder，不改变 Note.folderId，不持久化为 selectedFolder。当前首批标签选中状态仅在窗口内存，冷启重建目录并沿用原物理目录设置；新建沿用合法可写物理目录。单标签与搜索筛选均走已有选中和保存入口，不另造 Editor 或绕过失败恢复。

上述“最后引用消失保留空筛选”仅适用于普通编辑/删除。访问 prepare 时，目录、当前筛选名称、空结果标题等都不得继续显示或缓存仅来自受保护目标的标签；若同 name 仍有其他合法非目标文档引用可保留，否则立即将单标签筛选转成不携带 name 的“所有标签”，不另存名称待 abort 恢复。commit/closeLocks 后按合法文档重算，abort 同样只重算当前合法文档，不复活旧派生缓存；既有 pending 文档保全规则不变。用户自己输入的搜索文字继续遵循既有搜索契约，不能为此擅删正文或用户输入。

标签属于内容筛选但不是文本搜索文案：无文本 query 时也必须按筛选结果选择/隐藏正文，不能显示可写的不匹配旧笔记；复用已有搜索 Editor 停车和原目标保存/身份隔离，不把标签名或计数放入 Editor key。移除最后标签导致空结果时停车旧 Editor，清除筛选/普通目录导航后可恢复同实例与既有撤销历史；不得为保持显示而临时把不匹配笔记加入结果。目录为空但当前有标签筛选时仍保留“标签/所有标签”入口，允许清单标签条件，不展示样例 name。目录来源包括当前有权未保存/失败的乐观 ws 文档，保存失败不抹标签或冒报持久成功，ACK不反向覆盖新文档。对已标标签施加 link/code/codeBlock 时，新用户格式动作优先：移除受影响完整旧跨度的 noteTag mark，保留文字和其他合法格式，避免混合 mark 导致后端拒绝。

上述普通停车有一项局部输入法边界：当前已经匹配、可写且正在组合输入的同一 Editor，因为这次标签合法快照移除失效跨度而失去标签筛选匹配时，保留它当前的可见性、editable、DOM、选区和自然焦点，直至输入法实际结束并完成最终事务，再按最新结果停车。列表、计数与目录仍立即使用合法投影，可以显示空结果；不得把此笔记加入结果、保留失效标签名目录、回滚已保存文字或切换到另一匹配笔记。仅此原目标的活动组合可以延续，组合结束后的不匹配笔记不可继续编辑；不能以定时器、伪造 compositionend 或重新 focus 延长该状态。显式导航、切笔记或目标销毁结束此局部保留，沿既有入口完成保存和归属隔离。访问 prepare/撤权/删除/锁定等屏障立即优先，照旧冻结、遮挡并清受保护派生内容，不能等 compositionend 或用这个保留绕过授权；abort 不自动恢复旧焦点或失效筛选缓存。这是依据 candidate02 实际 App 复现补齐的工程防丢字契约，原版在同一输入法与筛选组合下的行为仍待证。

从单标签、所有标签或搜索建议“含标签的备忘录”执行新建成功后，清除此标签内容筛选和已有搜索条件，当前可见可写目标必须是这次实际创建返回的新笔记。新建失败保留原筛选/正文。不得因新笔记尚无标签而继续显示旧匹配笔记，或把新笔记临时伪装成标签匹配；实体所属物理目录仍按既有规则选择。

Rust 错误应结构化：code/message，UI 显示错误并保留未保存内容。自动保存做按笔记串行队列/版本校验，避免切笔记或慢写导致旧内容覆盖新内容。输入法 composition 过程中不改写光标/文档。退出/失焦前清空队列并验证重启内容。附件内容 URL 只从受管路径生成。

### 保存后录音日期与紧凑卡片（APP-002-AUDIO-CARD-01，源码候选待独审）

原录屏已证正文紧凑卡包含标题、卡内日期时间、“音频 · 2秒”和右侧播放按钮；保存后展开/回放/菜单手势仍未取证，不能用录制面板的控件补造目标。规格见 `ui/audio-card-mobile.md`。日期行采用下面明确的工程时间含义，不冒充原版尚未证实的取时规则。

`recordedAt` 由本次录音第一次实际 `recorder.start` 成功后的应用观察路径读取 `Date.now()` 并固定到专用录音完成结果/原票据；它表示设备墙钟下应用观察到开始的时刻，不是硬件首采样鉴真。不能取面板打开、文件创建/mtime、笔记日期、完成/落盘/ACK或当前渲染时刻。暂停/继续、文件收尾和保存失败重试沿同一 File/operation/目标及这个值，不新增时刻或改变既有文件身份。客户端与本地归档提供的日期不是恶意renderer防伪承诺；本任务不另造后端开始印记或改变授权协议。

日期只作为受管 Attachment 元数据持久化，UTC整数范围为0..253402300799999，缺失或null为未知；字符串、小数、负数、越界或非audio附件携带非空日期均拒绝，不能静默变成未知。加载/读取遇到非法已持久值同样明确报错、原样保全，不能在展示时偷偷清空或更正。不以导入时now拒绝可表示的未来值，避免设备时钟/归档跨环境误判。它进入原preparing日记和公开附件的同一份快照，重复operation须连同可选日期、名字/MIME/完整字节一致；known变unknown或换值都是冲突，不后补UPDATE或放宽完整Eq。旧无来源store入口保持未知；浏览器预览可从明确录音结果传值，不能按MIME自动读取外部File.lastModified。音频字节与正文attachment attrs/schema不变。

读取仍经原实际note归属/Session权限，从同一次read_attachment返回可选日期给MediaView/AudioPlayer；切ID、晚响应、错误、卸载和访问失效不串用旧日期，不增加无权限日期接口、明文全局索引或日志。当前含附件笔记不能锁定的限制保持。UTC原值只在显示时按设备本地时区生成中文年月日与24小时HH:mm；未知日期省略卡内日期行，不显示伪造值。

旧SQLite JSON缺字段按未知加载，不全库重写、不改变媒体字节、旧revision或文件mtime。新程序读取旧version1归档；若任一附件有recordedAt，则导出version2，旧程序明确拒绝该新归档；无日期仍可导出version1。version1输入出现非空新日期须拒绝，version2完整校验并保全；碰撞导入仅映射原附件/笔记ID和受管路径，不改变日期，两次副本仍保持原值。新程序支持version1/2不代表旧二进制可以安全操作新版活数据库；不承诺旧包重新导出的新元数据保全，也不通过本字段自动迁移数据根或改SQLite结构版本。

手机紧凑卡总时长使用单独显示函数：有限0..59.999秒按向下取整显示“音频 · N秒”，与原片2.60→2秒相容；60秒及以上暂保留既有mm:ss总时长，未知时长只显示“音频”，这些边界是工程选择、长时长原版仍待证。播放器当前进度与±15使用既有formatAudioTime/controller不变。仅校准紧凑卡层级/文案和相对布局，不修改未经原版补证的展开手势、波形或菜单，也不据低清视频授予像素通过。

### 录音会话与附件提交边界（APP-002源码已接线，安装版待实证）

先沿用现有WebView的真实采集链。每次录音固定session身份、目标noteId、Editor、实时授权身份及插入书签；所有入口使用同一归属检查，不能只保护Mac原生工具栏入口。权限请求和异步结束返回时再次检查会话仍有效；目标切换、销毁、删除或授权失效后的结果不插入另一篇笔记。

会话区分请求权限、录制、暂停、收尾、可保存、保存中、失败和销毁。录制开始触发仍按原版证据继续补证，本契约不推断自动或手动开始。暂停态完成须调用真实采集结束，等待最后数据和结束回调，再校验实际有效媒体；不得直接把未收尾chunks视为完成。录制有效时间以单调时间或实际媒体时间核算，暂停不累计。波形来源于真实采集；空数据、采集或解码失败明确报错，不插入假卡片。

准备失败、采集错误、取消、Back或卸载都进入同一幂等资源清理：停止recorder与全部tracks、清除计时/波形任务、关闭AudioContext、释放预览URL并拒绝晚到回调。停止采集不等于丢弃已完成且未保存的录音；可重试的保存失败保留blob和目标上下文，并将错误传回录音面板。play拒绝和媒体解码错误也必须显示实际失败。

附件落盘、插入正文、正文持久成功分别记账；仅在正文确认引用后将该次录音标为保存成功。失败重试复用本次已创建的附件身份或完成安全补偿，不能每次重试生成永久重复附件。补偿只可清理本会话新建且权威持久文档尚未引用的附件，检查归属与并发状态后由Rust执行，不接受前端任意删除路径。正文已持久成功而随后列表刷新失败时保留该附件及成功身份，不能误删已引用文件或再次插入。保存中取消、窗口消失及访问屏障的边界须有确定结果；取消后不得晚到插入，已有提交则按真实结果恢复并核对，不将未完成请求静默当作取消成功。

上述契约的局部状态、附件前端与录音父接线已分别独审并主合入，局部状态784a1e8、附件c793166/01aada6、录音父6ebacbe。统一candidate03已按c6594db冻结并成功构建两端，Mac新包已独立核身份并运行；不据构建和入场推认真实录制/正文ACK已通过。历史缺口见`research/media-roundtrip-readiness/analysis.md`；新统一包的设备授权、有效音轨、正文持久、冷启可听播放和像素仍须独立验证。

APP-002-ATTACHMENT-SUBMIT-01已在主源码将同一契约接入系统文件选择链。操作在打开面板前固定原目标与operationId，未发起和已失效分别表达；晚面板结果不得回落到当前笔记。focus触发的可信同步必须给出成功/序号/当前snapshot，只有后端session/global epoch/noteEpoch、原scope/note/Editor/文档版本/书签均未变，才可将本次操作重绑定纯renderer generation变化。全局AccessGate语义不变，真实目标变化仍拒绝。

为覆盖“文件已写入但响应或正文失败”，后端以真实窗口、授权session、原note和operationId建立持久操作记录，附件元数据与记录同事务提交，相同操作重复请求复用结果；新授权下可核查真实结果。操作记录独立于公开Attachment与归档字段。前端处理插入false/throw，将stored、inserted、正文ACK与列表刷新分别记账。安全补偿仅作用本操作新建文件，Rust核owner、权威正文引用、保存intent和屏障；已引用保留，无法安全判定则deferred。冷启仅恢复有该操作记录的未引用新文件，不清扫旧孤儿。主bridge与AttachmentSubmission已使用同一operation命令；源码接入与安装版真实边界分别记账。

节点已插入但正文ACK失败时，renderer若仍保留引用该附件的pending文档，应保留operation/附件以便重试；不得仅因数据库暂未引用便补偿删除。只有确认本地回退和对应保存队列结果后才发取消。Session对SaveIntents/屏障的核查不能冒称知道尚未登记的renderer pendingDocs；这是前端接线责任，不新增客户端自报的授权放宽开关。

2026-11-04模块状态：三个operation命令以42b2631整合，源4d5898f独立SOURCE-READY，六Rust文件hash一致。系统文件与录音父现已在主源码接同一AttachmentSubmission/map/SaveQueue；旧store_attachment仍保留原语义。准确参数、五种状态、window incarnation、preparing保守拒绝重写、10,000条历史限额、冷恢复及purge中断限制见`verification/app-002-attachment-store/source-candidate-01.md`与独审报告。统一candidate03已按c6594db/232列明输入499805fa…完成Mac与Android构建；新包功能、冷启与像素分别由独立运行验证，不追认旧fabafcf包。

录音票据在打开前固定目标和operation；仅当前同一ticket可窄豁免自己的record遮挡，普通picker/global nativeAssert保持原门禁。Panel onDone的resolve约定为真实saveDoc返回正文已acknowledge，失败reject保留同File；已ACK刷新失败仅重刷。取消先封submit，但保留同ticket窄cancel归属，Panel立即卸载以释放采集，operation等待真实run/FileReader/IPC结束后才核安全取消。Editor/pending引用与已ACK附件保留；deferred/身份失效保留可恢复身份和可见错误。唯一close监听通过同一lifecycle ref等安全取消或真实pending正文确认，不新增竞争监听。源码证据见`plan/reviews/app-002-recording-submit-static-01.md`；暂停快照与±15另由app-002-recording-preview-01负责，不改变最终File/父ACK协议。

### OCR宿主接入（APP-004-OCR-HOST-01源码候选，待独审和安装版实测）

notes-scan现已通过主Cargo path依赖、Builder及notes-scan:default capability接入候选源码。OcrHost归属单次原目标、原生会话、正文事务及真实saveDoc ACK；ocr-native直接使用已有typed guest。首批只把实际文字接到既有普通段落与保存队列，不新增扫描节点、永久图片或文档schema。Mac typed命令recognizeImageText标为“从图片识别文本…”，notes-ui Rust/guest union与native-toolbar-state使用同一命令；takePhoto/scanDocument/addSketch仍禁用。Android使用插件本地选图/文字相机，camera返回ready，不重复finish。Mac仅对用户已选非空图片作受限20MiB读取/ingest，不接受路径输入。

主宿主与scan独立build依赖的精确版本冲突获准窄修：scan的tauri-plugin build-dependency由=2.6.3对齐主线已有=2.7.2；独立lock只改对应version/checksum。主lock只增加path包与依赖条目，现有registry版本不变。runtime tauri=2.12.5、scan版本0.1.0、Android模型和原生引擎字节保持；未下载依赖。

打开前固定原note/Editor/完整文档与版本/bookmark/access/operation；普通与原生入口同一控制器。预览属于未取证的工程界面，明确区分取消、识别中、recognized、empty、failed、确认中、正文已ACK及清理待重试。确认非空实际文字以一次事务插入原选区，重复确认复用同保存Promise；保存失败保留结果/同操作，不能再次插入。目标改变、锁定/删除、关闭/取消封入场，晚到结果不得插当前另一篇。focus可信同步沿用现有严格身份规则，不扩大门禁。

仅真实正文ACK后才acknowledge插件会话；其后暂存清理失败只重试清理，不重插正文或倒退已保存状态。取消等待原生工作终态后按同session取消，ACK过的正文保留；空结果不插假节点。唯一窗口close监听在首次await前同步封住OCR与录音。访问prepare、目标变化、卸载封住入场，晚结果不改目标。插入但ACK失败时保留同文档及结果；仅实际pending正文、Editor正文完全等于本操作插入文档且既有可信身份仍有效时重试，不放宽全局授权或普通picker。正文回调确认原note与完整文档相等后才记ACK。

OCR预览缓存与正文/操作归属分开：访问prepare、clearSensitive/commit和卸载时同步清空React预览文字/错误并隐藏面板，先封住当前操作回调，晚返回不能回填。prepare可abort，仍须保留真实未ACK正文及原operation/session用于既有保存重试；不因清预览丢弃pending文档。成功保存并清理或取消终止时，同时清空Host文字/错误及React预览，避免operation已释放后留无主明文。ACK后cleanup失败保留原资源身份，仅重试清理；不重复插入。

候选01原27项未覆盖React预览清除，独审P2保留；候选02开发37项含新增10组失效/完成/保存恢复和新旧owner隔离边界，原两份独立repro原样通过。挂载预览7项与父20/附件23+8回归通过，受控结果不证明原生OCR、相机、冷启或像素；320截图异常观察仍unknown。预览见ui/ocr-text.md，原证据及修复分账见verification/app-004-ocr-host/source-candidate-01/和source-candidate-02/。长期扫描集合/多页PDF/复裁另批接入，主App原生构建及实测仍由root串行安排；任务见plan/tasks/app-004-ocr-host-01.md。

### 进程授权与多窗口保存边界（APP-001-FIX-03）

Rust Session拥有随机进程sessionId、全局epoch与逐笔记epoch，Store.keys是唯一解锁授权。renderer不保留独立unlocked集合。notes-access只广播prepare/commit/abort、操作ID、目标ID、真实参与窗口及access元数据，不带正文/密码/钥匙。设置锁、移除锁、关闭全部锁、删除笔记/文件夹、永久删除和归档导入均先冻结目标，真实窗口集合来自AppHandle.webview_windows，调用窗口身份由Tauri注入，不能通过action自报。

新建笔记响应在bridge通过现有AccessGate验收后，renderer须在同次workspace状态更新中采纳笔记及该响应的access快照，不能仅添加正文而遗失其逐笔记epoch。否则后续相同权威快照会被误判为授权变化而销毁当前Editor。只采纳已验收的真实响应，不合成epoch或默认授权；过期响应仍拒绝，实际session/epoch/授权变化和缺失授权仍沿既有失效处理，不放宽hydrate守卫。

prepare后新读取脱敏、目标新保存登记拒绝；prepare前登记的保存可以继续执行，窗口严格等待队列且确认pendingDocs与保存失败集合均空后才ACK。Rust也拒绝带未完成intent的成功ACK，保存失败直接使当前屏障失败。异步workspace_action/import_archive将10秒有界Condvar等待放在spawn_blocking中，等待时释放Store mutex且离开GUI线程。任何失败ACK、保存冲突、超时或参与窗口消失均abort，不撤销旧授权、不丢弃pending编辑；已成功排空的保存仍持久保留。abort恢复prepare前editor的editable，包含纸张页冻结状态。

未保存编辑链的revision基线只由自身成功保存确认推进；focus/其他hydrate即使观察到更新revision，只要有pending文档就不能替旧正文重基线。冲突后后续排队保存与普通“重试”仍携带旧基线，由真实Store继续拒绝，保留最新pending内容。显式“将本窗口内容另存为新备忘录”只为普通无附件笔记提供恢复：先冻结本窗Editor并等待自身队列，Rust检查真实源权限/epoch和旧revision，复用文档schema校验，单条INSERT创建新ID，保留源已确认版本。收到持久成功并完成可信列表同步后才清原pending/失败；任一失败保留原编辑器和未保存内容。锁定或含附件源在UI与Rust均拒绝副本恢复，避免解密降级或附件归属变化。这是本项目的工程冲突恢复契约，尚未宣称与原版交互一致。

全部ACK后才执行变更、提升目标epoch、撤销目标钥匙，再从权威Store重新生成响应；commit立即destroy受影响Editor及历史，清正文/预览/搜索/find、纸张/格式书签、绘画/录音/媒体目标。原先进行中的保存响应只确认revision，不回填正文；读取与变更响应经进程、epoch、renderer generation检查，失效结果不进入缓存。启动先订阅事件再取快照，重新聚焦/回前台先遮挡旧内容再同步；同步失败继续遮挡并提供重试，事件丢失后仍以可信快照恢复。系统剪贴板或用户已经明确交给系统分享的副本不在撤销契约中，不读取/清理用户剪贴板，不等待系统分享无限结束。

解锁在正确密码解密后、插入key前复用真实Editor schema和应用属性校验；正常/加密save与首次lock同样校验。未知密码归档只校验外层密文格式，非法内部节点或drawing属性在正确密码解锁时拒绝，密文与旧会话不变。lockNote已持久提交但WAL整理错误用lock_committed报告真实状态，仍commit授权边界并提示维护错误，不能假abort恢复旧正文。

仅显式启用Rust feature access-boundary-proof且Vite VITE_ACCESS_BOUNDARY_PROOF=1的额外测试包包含固定暂停/记录适配器：只暂停真实save执行或真实读取结果交付，按prepare/commit释放；不改请求/结果，不写Editor/React状态。默认生产包不编入Rust记录命令，Vite消除整个测试模块。测试包与生产包指纹和运行证据分别记录。

### 本地归档可靠性契约（APP-001-FIX-00）

版本 1 归档为完整工作区：所有系统文件夹、笔记、附件元数据/字节与设置。导入先完整校验版本、唯一 ID、受管路径、类型、Base64/声明大小、引用和文件夹树；富文档同时按当前 Editor 共享扩展生成的 schema 契约校验父子/基数（block、inline、列表首段、表格行/单元格、叶节点）、marks 位置/重复/互斥及实际属性类型；默认属性可省略，坏输入明确拒绝，不自动修复或丢弃内容。共享 factory 与 Rust 内嵌 schema 清单通过真实 ProseMirror crosscheck 防止漂移。清单布尔、标题级别、表格跨度/列宽、链接/颜色以及绘画笔画按应用属性契约验证，表格逻辑网格不超过 100,000 格。校验结束前不写生产附件。单归档上限 256 MiB，单附件 100 MiB，解码附件总计 128 MiB，实体总计 10,000；在分配完整对象树前以流式预检限制 JSON 值总数 500,000、深度 120、字段名 4,096 bytes，超限明确报 archive_limit 并保持旧数据。

ID 冲突采用导入副本：既有普通文件夹、笔记、附件保留原 ID 和内容；导入项遇同 ID 时分配新 UUID，并重写父目录、笔记所属、附件所属、文档附件节点和选中项引用。default/quick/trash 系统文件夹复用且必须符合固定身份/根层级；归档内部重复 ID、缺失引用、自环或多节点环明确拒绝。originalFolderId 允许指向已删除目录（恢复时已有默认目录规则），有 note 归属但暂未在文档中引用的附件合法。

归档设置在同一 SQLite 事务完整恢复。有效选中项经 ID 映射恢复；过期 selectedFolder 明确改为 default，过期 selectedNote 明确清空，其他设置保留；缺省选中键仍保持缺省，不为兼容旧归档丢弃整份设置。

附件采用 copy-on-write：在同文件系统 .imports/<UUID>/ 暂存，持久化 journal 后以独占新路径发布到 attachments/，绝不覆盖旧文件；文件就绪后单事务写入全部元数据与设置。数据库失败 rollback，清理本次新增文件。进程中断后 Store.open 按 journal 列表逐项核对数据库当前 relativePath 引用，只清理未引用的新文件，已提交引用的文件保留。发布前文件/日志和发布后的目录执行 sync，避免把两次目录 rename 当作跨 SQLite/文件系统的原子提交。清理失败保留 journal 供下次恢复，已成功提交的导入不冒报整体失败。原归档仅被读取，失败不修改既有文档、附件或设置。

归档导出写同目录暂存文件并原子替换目标；写入失败保留已有目标。结构与事务回归使用真实临时 SQLite/附件目录和进程中断点，独立 QA 重跑原失败探针。

## 接入与验证

### 本地库打开与旧实体保护（APP-SMART-D1，2026-11-04）

当前生产库仍为 user_version=1；新智能格式另批迁移。Store.open 先识别版本和既有必需结构，再进行任何 schema 写入或 import/attachment 日记恢复。0 仅允许新空库或完整可识别的旧结构显式兼容；未知/未来版本以 schema_version 拒绝，部分/未知结构明确拒绝，不能运行 CREATE IF NOT EXISTS 把未知库补成当前库。初始化事务同时创建 schema、补真正缺失的系统文件夹/设置并提交版本；现行1不反复重设版本。恢复日记仅在受支持库、已有文件夹检查及初始化事务成功后按原协议执行。

Folder 旧物理六字段严格解码，未知字段和类型不能忽略，缺省 parentId 仍为 None。default/quick/trash 必须分别使用固定同名 ID、对应 kind 和根层级；自定义仅 normal，all 只作导航。行主键必须等于 JSON id。已有坏 JSON、错 ID/kind、系统非法 parent 或读取错误都报错保全；只有 SQL 真正无行才允许补建。此批不新增旧 normal parent/笔记 owner 能力限制，不重写合法实体、正文、版本、录音日期或设置，不提前开放 smart UI。事务中途失败全部 rollback；原 archive1/2 兼容及恢复语义保持，Folder 的未知字段也不能在归档解码时被丢弃。具体实现及实际测试结果见 plan/tasks/app-smart-d1-storage-open09.md；本节是契约，不能当成已通过证据。

### 智能定义数据接入（APP-SMART-D2，实施中）

下一批契约以 [D2任务](plan/tasks/app-smart-d2-durable-rules09.md) 为准：DB目标2、智能归档3，严格智能分支，标签四模式及置顶all/any真实求值，定义更新/删除CAS，统一物理owner/parent能力，沿现归档冲突映射与事务。旧1/2归档语义保留。公开Session在UI适配完成前明确拒绝含smart工作区及导入；内部真实Store完成持久化、重开和归档测试，不能把旧UI直接暴露给新数据。完整离线规则与两端入口仍为目标；用户选择暂不进行原版删除实验，文件夹引用规则及删除联动后续补齐。D2是实施契约，未完成前不作为已交付能力。

必须逐项验证真实链路：Shell 选择→Editor 初始化；Editor transaction→保存队列→Rust→SQLite→重启；文件选择→Rust 附件复制→编辑器节点→重启预览；搜索→本地数据→列表选择；删除→最近删除→恢复；移动→计数/列表；录音→实际媒体→附件保存→播放；绘画→JSON/图片→重启编辑。先做核心闭环，然后以同一契约补齐功能，不隐藏未实现入口。


## 兼容与当前限制

Android 11 自带 Chrome 91 缺少 Array.findLast；Tiptap 3 的事务分发使用此方法。入口在载入编辑器前引入 core-js 对应补全，CSS 根高度提供 100vh→100dvh fallback，Vite 目标 chrome90。原生 MainActivity 统一设置 WebView 容器的 systemBars / IME 避让：底部取两者 inset 的最大值，并扣除已处理的 inset 后传给子视图；保持 adjustResize 配置，避免旧 WebView 在 edge-to-edge 下仅被键盘覆盖而不缩小布局。前端只使用该实际布局高度的 resize，不再叠加键盘 offset。系统 Back 经 Tauri onBackButtonPress 进入同一 React 导航。Android11 / Chrome91 原生坐标触摸的键盘→格式→X / Back 回归见 `docs/verification/app-001-fix-01-ime/`，待独立复验。

Android WebView 91 即使处于安全上下文也缺少 `crypto.randomUUID`，但支持 `getRandomValues`。保存intent、客户端演示实体与可选proof请求ID统一由 `secureId` 生成：优先原生randomUUID，否则使用平台getRandomValues填充16字节并设置RFC4122 v4版本/variant位。两种安全随机源均不可用时明确拒绝，保存队列保留pending内容；禁止Math.random或可预测计数器降级。Rust仍生成正式实体ID，授权协议和revision基线不变。

锁定使用 Argon2 + AES-GCM，密钥仅保留进程内存；正文从数据库明文记录清除，secure_delete + wal_checkpoint(TRUNCATE) 减少旧正文遗留，标题仍作为元数据可见。当前含附件笔记不支持锁定。归档不依赖跨文件系统的假原子事务；附件引用以 SQLite 提交为准，暂存日志承担中断恢复。

## Mac 原生顶部宿主（APP-001-FIX-02）

Mac 条件编译注册本地 `tauri-plugin-notes-ui`，仅 `main` / `note-*` 窗口拥有对应 capability。成功 bind 后由原生 `reservedTop` 单独提供顶部预留，网页侧栏、列表、编辑器顶部不再渲染；浏览器和移动端沿用各自布局。三栏、画廊浏览、画廊展开及独立窗使用不同状态投影，分栏宽度来自同一实时设置。画廊展开省略浏览选项动作，避免不相关动作被放进溢出菜单。

生产控制器先安装当前窗口的原始事件监听，再 bind 并有界缓存早到事件；取得 bindingId 后仅重放匹配窗口、绑定、已知 revision 与单调 sequence 的事件。状态更新严格串行并合并最新需求，语义相同只刷新当前编辑上下文，不触发原生更新或打断正在追踪的菜单。原生 search 的 value/sequence 在发布 React 状态前同步合并，更新携带最新 ACK；缺失事件等待对应实际事件，composition 期间保留待提交状态，不猜测输入文本。销毁在 unbind 失败时仍 finally 解除监听；切笔记/访问失效销毁旧目标。AppKit 布局只在最终阶段隐藏未使用的组，不能暂时隐藏仍在使用的搜索祖先以致丢失 field editor。

原生意图关联对应 revision 的 noteId、窗口范围、授权 stamp、Editor 实例、实例所属笔记、文档版本与 SelectionBookmark。执行前检查实时授权/屏障/覆盖层和实例有效性，编辑动作恢复对应选区；异步 flush、附件保存、正文读取后再次检查目标。输入更新文档版本，单独移动选区不触发无意义原生状态更新。上下文失效时清理书签和 Editor 引用，控制器不持有正文。

Cmd+N、Cmd+F、Option+Cmd+F 由 AppKit 菜单处理，以实际聚焦的允许窗口发送 `menu-action`，不广播。全局搜索使用 Option+Cmd+F 并调用当前绑定的 `focusSearch`；独立窗没有全局搜索，Cmd+F 只改变所属笔记窗口的查找状态。原版 Cmd+Shift+F 打开笔记内替换栏，不能作为全局搜索快捷键；444f03b已最小更正项目菜单映射，实际新包仍待验证；历史续输测试不能证明快捷键一致。未实现菜单动作保持禁用，不用成功提示替代功能。原生系统 API 的使用不代表像素匹配；本轮冻结源码/产物与失败的有限 RGB 比较见 `verification/app-001-fix-02/selfcheck.md`。
# Android 长候选保护（FIX04 部分修复）

项目固定 `prosemirror-view@1.42.9`，在pnpm补丁内添加默认关闭的 `androidPreserveComposition` 选项，仅 `native && Android userAgent` 的正式编辑器启用。真实可信compositionstart/update在原有初始化后设置当前view的nativeCompositionActive；compositionend、clear、destroy释放。原5000ms闲置回调仅当该信号、view.composing、view.hasFocus、连接且属于该view的compositionNode与DOM focusNode均匹配时保留，不替换为更长固定延时，不推测候选文本。

无有效节点/焦点或缺少原生活跃信号时仍执行上游回退。可信非组词beforeinput/keydown（排除229、Process、modifier及isComposing）、blur、window失焦、document隐藏使信号失效并沿用20ms收束；程序化end/clear不受阻，destroy移除新增监听。保存、授权、版本冲突和跨笔记协议未改。15项确定性检查只证明这些恢复分支，不证明真实输入法或平台通用性。

真实运行证据仅覆盖Android11模拟器/WebView91/Trime3.3.13的有限主路径。FIX06独立平台对照显示，未绑定PM/Tiptap/React的普通contenteditable真实失焦后也保留`ni hao‸`；原生EditText按Back隐藏键盘后同样保留且仍有焦点。不能把隐藏键盘等同于明确取消/候选提交，或仅据残留文本、compositionend.isTrusted=false归因应用丢失组字保护。平台同现不证明苹果Notes的精确行为，也不证明宿主存储保全；完整限制见`plan/reviews/app-001-fix-06-platform-01.md`。

应用保全输入法实际交付内容与相邻已确认正文，真实候选应替换对应组字段，明确删除/取消不得复活旧组字。真实失焦、单纯隐藏键盘、后台恢复、切笔记与授权销毁分别核定；没有原版/平台commit-cancel及可靠范围证据时，不猜候选、不按字符删标记、不盲目回滚。后台恢复仍须遵循授权屏障，旧Editor不可写入新笔记。格式/后台的原版一致性与隔离仍未通过；历史可见/保存结果及P1报告保留，当前应用独有归因已不成立。FIX07已在5dd6包独立有限复验选择大网格及取消均保留原选区/同Editor，完整矩阵仍partial；证据在`docs/verification/qa-fix-07/run-5dd6dfc8/`。原包与修复包、通过与失败记录均保留在`docs/verification/app-001-fix-04/`，平台新增证据在`docs/verification/app-001-fix-06/platform-baseline/`。

2026-11-04搜索焦点源码更新：源d9bc5a4独立SOURCE-READY、主175cd1f在插件精确search MenuEvent回调同步解析真实唯一focused main和当前enabled绑定，直接调用与IPC共用的原生同步focus body；原宿主emit和后续IPC重复focus保持。拒绝无归属/无绑定/disabled，不回落其他窗口。Tauri最初菜单队列及global listener先行仍存在；未在新包实际验证前不声称快捷键立即粘贴异常已修复。

### 暂停回放源码接入状态

2026-11-04：preview源e01c90a独立SOURCE-READY，主e9e426f，复用未改createAudioPlayback；Session等待pause后串行快照且保留累计主chunks，Panel继续/完成/取消先失效代次，dispose播放器/probe后才回收URL。adapter真实loadeddata/canplay取得就绪，媒体错误重载清旧ready/定位等待；±15按实际seekable与seeked/currentTime确认，不采用共享控制器的乐观time。主build/preview16/父20通过。非终态prefix仍是可失败候选，不保证容器完整或WK/Android可播；当前candidate03包仍不含此模块，见preview独审02及后续安装包验证。
