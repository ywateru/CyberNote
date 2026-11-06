# 数据管理79 静态独审

2026-11-06。状态 **PASS / SOURCE-READY**。后端 `2420faa8`、前端 `b980b248`及陌生authority安全遮罩修复`1e16c9fe`已独立复核。最终runner`ad982ee8`、candidate`f038e998d044f41042336f9eb526c7cb30c251ec`的新33项自然exit0/19.71s，95输入SHA256 `84791745404687c6de66f83383f9519ebbb4028280df326a659c6557730726d1`前后不变、clean、pageErrors空。真实Rust43项、实际Rust→App成功/负ACK28项、JVM策略36项、强quiet并发3项及修后真实正常quiet最小12项分别通过。零未关闭源码blocking；原生provider/OS多窗口/像素/最终包身份保持各自边界，未以browser结果替代。原始数据在[独审证据](../../verification/data-management79-independent/)。

## 已发现并静态修补的阻塞

**P1：Android URI 导出可绕过目标保护写回应用自身缓存。** 初版 `src-tauri/src/lib.rs:354/382` 的 content URI 分支直接调用 native copy，不经过 Mac 的 `validate_export_target`。初版 `NotesScanPlugin.kt:84-85` 仅检查 content scheme/authority 非空，随后 `:110` 执行 `openOutputStream(uri,"wt")`。现有 manifest 声明 `${applicationId}.fileprovider`，`res/xml/file_paths.xml` 的 `cache-path name="my_cache_images" path="."` 可寻址应用 cache：合法 owner/token 调用仍可把 `content://com.local.notesclone.fileprovider/my_cache_images/<existing-managed-cache>` 当输出，从而截断受管缓存文件。违反不得覆盖其他应用管理目录合同。此发现为源码调用链，无原设备或 provider 运行。

`2420faa8` 在打开输出流前加入 `DocumentUris.isManagedAuthority`：以 decoded authority 去除合法数字 user-id 前缀、大小写归一，拒绝 package 本身/前缀及 PackageManager 返回的全部本应用已声明 provider（含分号列表）。当前自身 FileProvider 绕行在静态路径上已关闭。待资源交还，独立验证标准/大小写/user 前缀/编码及已声明别名负例，provider 运行能力仍单列。

## 其他静态结论及待验

真实 inventory 从 Store.root 递归 symlink_metadata/read_dir，保留 DB/WAL/SHM 缺失条目、目录、未知文件与 metadata missing 行，分别计算 physical 与 declared；不执行清理或 checkpoint。普通文件为了判可读执行 open，没有读取 payload。需实际验证各 totals、mtime、不可读/采样变化和 symlink 不外扫，不能以 DTO 返回值自身当 oracle。

单件导出由 Session 按 ID 查 owner/sensitive，受管附件限制普通文件/长度/大小，原字节有界读取；桌面拒整个 live_root，并同目录 temp+sync+rename。Android native 入口仅由 host Rust 方法调用，不新增 Request/execute/JS permission。import staging RAII 所有权移动入 barrier worker以覆盖最终读取。需负例和新 PID roundtrip实证。

`490b2e92` 作者逐帧仍有34/176帧遮罩失败，不能授予通过；旧失败由作者保留。`4d744ca5` 为 metadataRefresh 因在途 trusted validation 使旧 read AccessChanged 的情形复用 `synchronizationWork`，没有移除原 TrustedSynchronization failed 回调或强同步 begin 的 cover。仍须检验 prepare/撤权/陌生session/quiet失败及 quiet→strong 并发，确保复用不吞失败、不降级遮罩。

UI 已有真实菜单入口、统计加载/刷新/分页/文件行导出及图片卡/预览共用导出方法。picker 后 bridge重新取原 owner token，按附件 ID共用pending Promise去重。尚未授予全过程无闪烁、选区/历史保持、窄屏可达、迟到请求或实际落盘通过。

## 真实 Rust→App 集成方案

当前冻结 transport 的 `import_archive` 自行 begin→ack(true)→finish，可证明单合成参与者 Session roundtrip，不能证明 App排空保存队列后真实ACK。独审将在自己临时 harness 的冻结 transport 副本增加 `finish-event-arm.rs.txt` 所示只读事件返回分支，不改变生产源/公共runner；对真实 `Session.finish` 的内层result与原event一并返回。

`barrier-adapter.mjs` 仅拦实际 import/ack IPC：真实 Rust begin→将真实prepare通过既有event bus送生产App→等待App调用acknowledge_access→交真实Session.acknowledge→finish→原commit/abort事件和结果回App。不插入成功ACK，不合成commit事件。成功路径及真实保存失败/负ACK/超时保全均验证；范围仍为单浏览器合成平台+真实Rust，不代表OS多窗口或Android provider。

第三候选工作树由根创建并独占其dist。后端cargo未交还前不编译；最终冻结后记录所有输入、自然exit和完整wall，不修改产品修复，也不触原Android约13秒现场。

## 运行独审及新增阻塞 / 2026-11-06

独立重建临时transport，完整编译自然exit0/1.96s，准确Store/Session/transport24输入与最终candidate逐一哈希相同。独立binary SHA256 `e4a30bcd9aaefccaae2212e84df39aa37bb61fdcbaef1f4cb3585175b306d621`。真实磁盘oracle43项自然exit0/0.86s、4PID自然0；覆盖物理分类/mtime/目录/未归属/不可读/缺失/size mismatch/symlink、目标保护、原字节导出、独立SQLite无payload、新PID导入/冲突副本与恢复。

真实App链`ui06`28项自然exit0/14.98s、4PID自然0，pageErrors空：正常DOM FilePicker添加PNG与非零WAV，原Host/Tiptap/已有媒体全程不遮挡，图卡/预览/管理行实际Rust原字节导出，真实stat渲染及DOM备份，fresh App生产prepare处理自行ACK(true)→实际Session commit并原字节落盘→新PID恢复。注入IO保存失败后App自行ACK(false)→实际Session abort、原文档与附件完全不变。没有手写true/false ACK或commit事件；单合成浏览器参加者，非OS多窗口证明。

独立JVM36项自然exit0/4.80s：直接编译冻结DocumentUris/DocumentStreams源码，包/前缀/全部声明别名/大小写/数字user-id/已解码authority负例，外部provider正例，原始流多block/零read/超限/长度不符/read/write/flush/close失败。Android真实Uri/ContentResolver/文件选择器运行仍OPEN。作者Kotlin/Rust构建日志另列，纯JVM不替代平台验收。

独立strong/quiet并发3项自然exit0/3.94s：第一次quiet响应放行后，第二次强同步load继续挂起，连续6帧实际cover+hidden；仅释放强请求后复原。说明失效quiet响应不能降级尚未完成的强遮罩。

**P1：陌生authority异步quiet响应没有先提交安全遮罩。** 最终runner`1833bb53`在修前产品上的独立`frozen-final33`失败，自然exit1/15.67s，95输入`bf932d65…`前后一致、pageErrors空。实际21帧/7次MutationObserver均无cover/hidden、8帧Host/editor身份已变化。此证明违反“先commit安全遮罩，再publish陌生authority”合同；未据此声称已泄漏某条受保护正文。作者确认React可把setSyncCover与后续clear批处理，单await rAF不是React commit屏障。`1e16c9fe`仅在async quiet检测陌生session/operation/suspended分支用flushSync先commit cover，再保留原rAF和可信hydrate；正常quiet不变。修后candidate`3763872e…`的定向33均通过、未知session25帧里1cover+1hidden、pageErrors空，95输入`97b04c8c…`不变；实际正常quiet/原字节/统计最小Rust→App12项`ui07`自然exit0/8.60s，1PID自然0。

**RUNNER-CLEANUP-BLOCKED（已按完整自然退出关闭，不授根因定论）：** 修后新33打印summary后Chrome退出，但Node/Vite/esbuild及HTTP listener继续存在，作者两端同型复现。独审PID22887原样保留诊断后仅终止自身进程，工具结果exit143/202.31s，不能称完整命令通过。随后作者默认两CLI最终自行自然0/401.934s与444.559s，否定“永久死锁”假设。独审旧默认runtime重新串行`final-natural33`同样自然exit0/60.37s，33通过、95输入`97b04c8c…`前后一致；原143不追认。

作者`ad982ee8`仅在测试runtime显式预构建react-dom和react-dom/client双入口，不改生产逻辑/fixture/断言/cleanup算法，不使用process.exit或强杀。最终candidate`f038e998…`静态复核此微差后，独审`final-optimizer33`准确默认CLI完整自然exit0/19.71s，33通过、pageErrors空、95输入`84791745…`前后不变。正常quiet89帧/13mutations零cover/hidden/Host-editor-media变更；unknown22帧/8mutations中1cover+1hidden；strong并发98帧中29cover+29hidden。该数据支持本轮完整退出及行为通过；不足以声称optimizer就是唯一根因或今后所有suite普遍性能已根治。实际backend24个编译输入在最终candidate仍逐一相等，见final-source.json与rust-input-recheck.json。

源码gate已关闭，Cargo target、Gradle缓存、candidate dist全部交还根。独审不stage主线git index；根可统一合入源码和证据，做最终完整回归与打包。当前通过不替代后续准确包内资源/签名/ZIP/APK身份核验。

独审自身首轮失败均保留：ui01误用不存在的.image-error选择器（实际role=alert已显示真实filesystem错误）；ui03未捕获预期debug reject；ui04等待的toast文案不匹配实际“其他窗口”错误；ui05把debug封装APP_ERROR误认必须access_changed。仅调整自身探针，不改产品/公共runner。ui06为完整修正后PASS且保存了SHA严格匹配的runner源码。
