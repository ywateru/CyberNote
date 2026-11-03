# F12 本地锁定边界：独立静态审查

日期：2026-11-03。审查代理 verify_app。**本报告为只读代码审查，未执行锁定用例、未启动产品、未操作GUI/Android、未读取私人笔记或磁盘正文。所有未来运行验证均为 not-run。** 不以静态推导填测试pass。

源码基准固定为 `b5d4fb9e041ffdd51db49a8ca532cafc61bd2c9d`，用 `git show <commit>:<path>` 读取，避免混入并行FIX-01未提交变化。审查开始HEAD `80ff785`；当时package.json/pnpm-lock.yaml有实现者改动，未用于本审查，也未修改。范围为该提交的 `src-tauri/src/store.rs`、`store/archive.rs`、`src-tauri/src/lib.rs`、`src/App.tsx`、`src/bridge.ts`、`src/types.ts`，参照requirements F12/F07/F13/F15及architecture锁定/归档契约。未审计第三方密码库内部、平台内存/交换区、系统截图缓存或其他进程。

当前architecture明确：标题作为元数据可见；含附件笔记暂不支持锁定；Argon2+AES-GCM保护正文，钥匙仅在进程内，secure_delete/checkpoint用于减少旧正文残留。因此不把可见标题、盐/nonce或密文认定为正文泄露，也不推定删除机制保证所有平台物理擦除。

## 结论与唯一阻塞

**F12存在P1静态blocking：锁状态与明文缓存没有跨窗口失效协议。** 这是可直接追踪的代码路径缺口，尚无安装版运行复现，不改变已经独立通过的FIX-00归档任务。建议在FIX-01后优先以独立小任务修复，再验证；本报告不宣称F12整体通过。

### LOCK-STATIC-01 — P1 / blocking：其他窗口保留明文，锁定/“关闭所有”不能使其同步失效

后端为一个进程共享 `AppState(Mutex<Store>)`（`src-tauri/src/lib.rs:7`，setup中统一manage）。`Store.keys`按noteId保存授权钥匙，`visible`在钥匙存在时解密，`workspace`会对全部笔记调用visible（`store.rs:194`、`:208`）；`load_workspace`、`workspace_action`没有窗口身份/会话版本参数（`lib.rs:15`、`:23`）。这形成进程范围的授权状态，而前端每个Webview各有独立的 `ws` 和 `unlocked: Set`（`App.tsx:153`、`:174`）。

`lockNote`成功后删除该钥匙（`store.rs:476`—`:499`），`closeLocks`清除全部钥匙（`:512`），随后的新workspace读取会返回无正文的锁定记录。但发起窗口的 `doAction`只hydrate本窗口（`App.tsx:246`），解锁只更新本窗口set（`:882`），设置中的“关闭所有已锁定的备忘录”只刷新发起窗并清本窗口set（`:2193`）。未看到锁/工作区变更广播、其他窗的对应监听或焦点恢复时刷新/清理；`lib.rs`已有事件仅用于菜单动作，前端visibilitychange只flush保存（`App.tsx:309`）。

静态可达场景：

1. A/B两窗均已装载同一未锁定笔记，B持有明文文档；A设锁成功。B没有收到状态更新，仍可能保持旧 `locked:false` 的ws和已挂载编辑器。
2. A/B已解锁同一锁定笔记，B的 `unlocked` 已含该id；A执行“关闭所有”。后端钥匙清除，但B的ws/unlocked/编辑器没有失效入口。B的渲染条件仍可走正文分支（`App.tsx:1953`—`:1989`）。
3. 已有共享钥匙时，新窗口的load_workspace可收到被visible解密的正文，但本窗口unlocked初始为空，主编辑区仍显示锁定提示。是否授权应跨窗口共享可由产品策略选择，但当前后端与可见提示不一致。

缓存的可用出口有明确源码位置：搜索始终以 `title + plainText` 过滤，没有当前锁授权过滤（`App.tsx:642`—`:662`）；拷贝菜单直接 `clipboard.writeText(n.plainText)`（`:1275`—`:1285`）；分享直接读取 `current.plainText`，走系统share或clipboard（`:593`—`:601`）。这些出口不重新向后端验证会话，也没有以锁态禁用。因而清后端钥匙不会阻止已经持有明文的另一个窗口继续显示/查找/拷贝/分享旧缓存。

以上是代码证明的状态/数据流，不是“已经在安装版看到泄露”的实测结论。后端新读取会脱敏、保存会拒绝，不能据此认为另一窗口旧DOM/编辑器/历史/缓存也已清除。

最小修复建议：

- 明确使用进程范围还是每窗口的授权策略，后端作为唯一会话权威，返回一致的可见/授权状态或会话版本；前端不要各自推测是否已解锁。
- 锁定、关闭全部、移除锁、成功导入清钥匙等会话变化必须使全部窗口失效。接收方立即隐藏受保护内容、清对应ws明文/编辑器及历史/待用明文缓存和本地解锁set，再获取当前授权快照；失焦后台窗也必须接收或在重新展示前失效。
- 搜索、拷贝、分享和其他正文出口按当前授权快照处理，不能绕过失效后继续消费旧ws；后端受保护读取/保存/移除锁/附件读取持续拒绝无授权请求。只添加一个锁图标或只清Store.keys不解决该链路。

## 其他已读边界：静态事实与运行未知分开

| 领域 | 可由基准源码确认的行为 | 仍需运行验证；此轮状态 |
|---|---|---|
| 设置本地密码/加密 | lockNote要求至少6字符，随机16-byte salt，Argon2派生，AES256GCM随机12-byte nonce；加密整个document后存空文档、清plainText、置locked；`store.rs:476`、`:635`—`:665` | 错误/崩溃边界、实际数据库/WAL/导出扫描与恢复；not-run |
| 标题/元数据 | saveNote从首个文本行取最多150字符作为title（`:270`—`:278`）；lockNote不清title，契约明确可见；时间/文件夹/置顶等也未加密 | 使用“正文唯一标记、标题另一标记”区分测试，避免把允许标题曝光误判正文；not-run |
| 无钥匙读取 | visible无钥匙不解密，保存锁定笔记要求keys存在（`:281`—`:294`）；新Store.keys为空（`:110`—`:114`）；workspaces的默认锁定正文来自已清空记录 | IPC返回值、冷进程重启、暖恢复与跨窗撤销后的旧缓存；not-run |
| 错误密码 | unlockNote先derive并decrypt成功，再insert钥匙（`:501`—`:510`）；认证失败映射为password错误，不把输入密码写进错误消息 | 密码错误后数据/revision/钥匙状态不变、多笔记不同密码不串授权、实际提示；not-run。已有已授权会话不会因一次错误尝试自动撤销，不把这点擅自定义为缺陷 |
| 列表/画廊预览 | 普通摘要和画廊正文在n.locked时用锁提示替代（`App.tsx:1760`、`:1783`），title仍显示；画廊table/drawing装饰检查document未另guard locked（`:1761`） | 列表正文视觉脱敏、已授权/重新锁定后类型装饰是否仍可见；后者最多暴露结构类型，未证明正文文字泄露；not-run |
| 搜索/标签过滤 | 前端直接搜索ws的plainText与document；无独立Rust搜索API，依赖load的数据是否已脱敏 | 未解锁、已解锁、显式重新锁定、他窗重新锁定四状态的正文唯一词/标签命中；not-run，跨窗缺口见P1 |
| 附件 | lockNote发现任何归属附件即unsupported（`store.rs:486`）；store_attachment对locked笔记直接拒绝，即使钥匙仍在（`:548`）；read_attachment要求locked时有钥匙（`:603`）；archive graph也拒绝含附件锁定笔记（`archive.rs:255`附近） | 实际文件/图片/录音入口、取消错误无孤儿文件、锁定提示；不能把不支持附件锁定冒称已实现附件加密；not-run |
| 绘画 | 绘画笔迹作为document节点，在正常lockNote路径随document加密；不会通过doc_text取出坐标 | 实际绘画锁定、冷启动/解锁、归档的笔迹JSON与明文残留；not-run |
| 归档导出真实入口 | UI archive export调用原生 `export_archive`（`App.tsx:437`—`:459`）；Tauri命令直接Store.export_archive（`lib.rs:56`）；导出用raw `self.notes()`（`archive.rs:489`—`:496`），不调用visible、也不读取keys。即使进程钥匙存在，正常锁定记录仍导出sealed+空document/plainText，title保持明文 | 在“钥匙不存在/已解锁但仍locked/关闭全部后”三状态实际导出扫描正文标记，回导密码恢复；not-run。不能因workspace会解密而误判归档导出也解密 |
| 普通文本/副本出口 | 当前无独立Markdown/PDF明文导出命令；可见明文出口为clipboard、navigator.share，直接消费前端缓存；正常未解锁新快照plainText为空，但没有显式锁授权guard | 已关闭授权后的拷贝/发送不可携带旧正文；实际系统剪贴板/分享结果，not-run；跨窗P1覆盖 |
| 移除锁 | visible读出明文后检查key存在，再清locked/sealed并持久化（`store.rs:515`—`:525`）；这是用户明确移除保护的操作 | 无钥匙拒绝、有钥匙成功、二窗同步状态与重启持久化；not-run |
| 会话期限 | key仅存在Store内存，显式closeLocks清空；purge、重新lock及成功import也清相应/全部钥匙。前端离开笔记/隐藏/关闭单窗未自动closeLocks；未看到超时或OS锁屏钩子 | 当前是进程/显式关闭策略；需要产品明确自动锁定条件后再验，不凭原版未取证行为自定超时要求。Android暖后台/冷进程、Mac关末窗/真正Quit需区分；not-run |

归档输入对锁定记录的额外边界：`archive.rs:297`—`:326`验证salt/nonce/ciphertext长度、plainText/doc_text为空及公开document结构；不解密验证ciphertext内部结构，因为导入不要求密码。锁定后真正解锁的密文内部内容/绘画结构仍应单列恶意或损坏归档用例，不能把外层schema检查推导为未知密码密文已做完整语义校验。正常本应用lock/save生成的密文来自真实document，这不是此次已证明的自然明文泄露链。

两个非独立blocking的收尾注意点：lockNote先put_note再checkpoint（`store.rs:497`—`:499`），若后一步报错，数据库可能已锁定而前端未hydrate，应验证错误后真实锁态并按权威状态刷新；密码对话框成功清modalValue，取消只隐藏modal（`App.tsx:898`、`:2070`），可顺手清临时密码状态。两点均未运行注入故障，不宣称实测失败，也不把内存清理推导为硬件取证级擦除。

## 后续最小验证场景

下列全部 **not-run**，待修复提交与安装版交接后执行，不与当前FIX-01开发抢设备：

1. A/B两窗打开合成未锁定笔记，A设锁成功；B正文、编辑器、撤销历史与DOM立即失效，焦点返回不能闪出旧正文。正文唯一标记不能被B搜索/拷贝/分享，标题允许可见。
2. A/B都解锁后，A“关闭所有”，在B保持前台和B处于后台两种起点各测一次；重新选择笔记/进入画廊/回前台均不可绕过授权，剪贴板或分享不得输出旧正文。
3. A授权后新建B窗，依据明确的统一会话策略核对锁提示、授权状态、workspace明文；再撤销，所有窗同一会话版本失效。检查无授权后的load/workspace_action返回、saveNote/removeLock/read_attachment拒绝；不要仅看锁图标。
4. 未授权错误密码→仍锁定/数据库与密文不变→正确密码→读回正文→再次关闭/错误密码；不同笔记使用不同密码，确认不会串授权。
5. 锁定、进程内已解锁但仍locked、关闭全部后三状态分别导出真实归档，扫描只在第二段的唯一明文标记，检查ciphertext/nonce/salt和title政策；回导后需正确密码恢复。对拷贝/分享另测当前授权，不能以归档安全替代明文出口验收。
6. 有图片/录音/文件附件的笔记尝试锁定应清楚拒绝，保持原数据/文件；只有绘画节点的笔记按正常锁定加密，关闭/重启后笔画不从公开document泄露。
7. Mac关闭一个窗/最后一窗/真正Quit、Android隐藏/暖恢复/force-stop冷启动分别记录会话行为；按已明确的策略验收，不把同进程暖恢复当重启。
8. 注入锁定后checkpoint/刷新错误、他窗有待保存内容时撤销授权，确认错误反映真实状态、不重新暴露明文、受保护保存拒绝且用户未保存内容处理明确；不以静默清空普通笔记解决同步。

本静态报告没有运行结果pass。先前 `qa-fix-00-schema/rust-tests.txt` 的实际执行包含既有 `encrypted_data_and_unlock` 窄用例（错误密码/正确密码、指定正文marker的DB/WAL检查），只可按其原范围引用，不能替代本报告的多窗口、搜索、分享、归档/会话整链验证。
