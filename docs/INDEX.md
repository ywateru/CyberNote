# 文档导航

2026-11-16 项目演进设计，11-17进入实现：[代码梳理与优先级](plan/analysis/project-review-20261116.md) → [MCP 接口](architecture/agent-mcp.md) / [主题与呈现架构](architecture/theme-presentation.md) / [双端交互](ui/adaptive-presentation.md) → [实施路线图与六项任务](plan/project-evolution-20261116.md)。新 MCP 和主题契约以这些文档为准；已实现功能与历史验证仍按下方各自版本读取。

使用者入口：[Agent接入指南](agent-usage.md)说明设置页授权、Codex/DeepSeek harness配置边界及写入失败恢复；最终产物仍待116交付，不能把配置示例当成已安装接口。

后续开发已从111原生应用服务、113前端交互和112独立stdio传输模块展开；当前状态以[任务路线图](plan/project-evolution-20261116.md)为准。[本机IPC实现契约](architecture/agent-ipc.md)固定适配器/宿主帧和凭据引用；独立模块通过不代表已完成真实宿主或双端验收。

11-17：111共享服务/窗口协调、112真实宿主/MCP/设置入口、113交互、114三主题及115呈现resolver/专注布局/移动列表均已完成模块独审与合入组合复验，实际Codex九工具→SQLite/真实窗口链通过。116进入准确双端/MCP安装产物及设备/同步组合验收，执行器/核验器准备已合入，新隔离Android环境已验证Trime中文输入但尚未安装产品APK。最新证据分层见[演进验证状态](verification/project-evolution/README.md)，不能用历史包或传输fixture替代本轮最终联调。

服务器后续开发与部署从[服务总览与生产记录](server/README.md)、[配置／部署／回滚／排障手册](server/DEPLOYMENT.md)开始；[环境模板](../services/coordinator/.env.example)不含真实凭据。资料依据源码和已有回执整理，未重新查询或变更线上配置。

2026-11-16：账户页已将同步开关与后台进度合入本机设备卡片，更新 CyberGrid Rust SDK 0.4.0。最新调查与修复见[SDK 接入后的同步根因](architecture/cybergrid-sdk04-integration-20261116.md)，前期建连调查见[同步连通性报告](architecture/cybergrid-sync-connectivity-20261116.md)。Mac 客户端与 Android 测试 APK 已交付；定向回归通过，最终包的完整资料库同步尚待真机验收。安装与构建回执保存在本地 `artifacts/account-sync-sdk04-20261116/rootfix-handoff.json`。

2026-11-15 历史验收：账户页[持久设备列表与单次推送／拉取／双向同步](architecture/account-device-actions.md)已完成当轮本机双客户端验收。[当轮结果与保留失败](verification/account110/RESULT-LATEST.md)、[双客户端启动／手动指南](verification/account110/MANUAL-TESTING.md)、[测试用例](verification/account110/TEST-CASES.md)记录该版本结果。准确包为`29c87810`；原fresh-run驱动超时仍保留，独立续验及GUI核对通过。下述account109为各自时点记录。

2026-11-15：[账户同步归并与工作区清理](verification/account110/workspace-cleanup01/README.md)补齐历史审阅链，清理已完成工作树和闲置构建缓存，保留当前包、双客户端手测库及全部归档证据；提交位于本地 main。

2026-11-14最新同步修正：原库未查到 inbox／并发冲突，私有副本实际 Store 切换通过；已修正大资料库媒体准备占用 5 秒窗口期限的问题，并增加有限超时阶段。新 Mac `5590e25e` 已构建启动、保持已登录且同步暂停，实际开启仍由用户手动复验。见[原因与交付记录](verification/account109/adoption-large-library-delivery01.md)。

2026-11-14最新界面更新：“同步此设备”已改为滑动开关，开启合并及退出账户改为模态确认。新 Mac `6dadbb8a` 已构建运行，[取消与键盘焦点实机核对通过](verification/account109/switch-modal-live01.md)，最终仍已登录且同步暂停。最新应用入口见[手动指南](verification/account109/MANUAL-TESTING.md)。

2026-11-14最新：[本地资料库独立于账户](plan/tasks/app-account109-account-independent-library.md)已实现；新Mac `bb8014ce` 在原库[应用内登录、退出及重新登录通过](verification/account109/native/account-independent-login-live01/README.md)，正文与附件保持，最终已登录且同步暂停。当前[手动指南](verification/account109/MANUAL-TESTING.md)已更新候选入口；完整多端合并仍待手动验收。

2026-11-14：[Mac托管登录返回后错误分析](verification/account109/native/mac-post-login-diagnosis-20261114.md)与[错误细分/显式重试契约](plan/tasks/app-account109-post-login-errors.md)。本轮修改源码并做静态复审，旧候选身份不变，未重新构建或自动测试。

2026-11-13：按最新要求暂停自动测试，先合并整理代码与说明，由测试者手动验收。当前入口如下；历史阶段记录保留在折叠区中，不能作为当前执行指令。

| 阅读目的 | 入口 |
| --- | --- |
| 启动两个桌面、两种登录方式、Android 三端与 4G 中转 | [手动测试指南](verification/account109/MANUAL-TESTING.md) |
| 本次代码合并、未提交工作整理与验证边界 | [收尾记录](verification/account109/CONSOLIDATION.md) |
| 已有实际结果与未验收项 | [账户同步结果](verification/account109/RESULT-LATEST.md) |
| 完整测试场景 | [账户同步用例](verification/account109/ACCOUNT-TEST-CASES.md) |
| 同步原理与界面契约 | [账户架构](architecture/account-sync.md) · [账户界面](ui/account-sync.md) |
| 账户与历史手工同步的使用方式 | [设备同步说明](sync-usage.md) |
| 先前双桌面独立路径 / 手工同步结果 | [sync108](verification/sync108/RESULT.md) |

<details>
<summary>历史阶段更新（按各自时点阅读）</summary>

2026-11-13最新：Android[三条双入口取消与重开](verification/account109/android/current-login-smoke-live03/README.md)均实跑PASS：内置原生Back、内置转浏览器取消、直接浏览器取消；登录前/取消后/正常重开后完整四篇笔记及附件原字节各至少3次/3秒一致，owned forward/lease均释放。准确88b2dabe已安装包，执行器eddab872，完整组319/319零跳过；实际结果已独核通过。此前[正常重开](verification/account109/android/error-reopen-live01/README.md)已PASS并独核；旧smoke/续验FAIL保留。独审修正嵌套WebView归属与慢采样时序，不改产品身份门槛。成功登录、账户三端及发布仍待原QA有效授权。重复历史docs/生成缓存清理使du减少973.92MiB，df同期增加937.68MiB，保留候选/唯一target/原库/失败/私有快照。以下为历史阶段。

2026-11-13当前手机状态：[新域88b2dabe包已保数据升级并独核](verification/account109/android/preserving-upgrade-live01/README.md)，四篇完整笔记和唯一附件/原字节两次逐字段一致，当前clean signedOut。历史未知附件来源不变；即将以固定当前私有快照单独保护登录取消测试，不改旧基线。完整执行器整合305/305、零跳过。原桌面[relogin05](verification/account109/native/relogin-live05/README.md)在600秒人工认证等待超时，未编辑/enable，两进程正常退出；缺有效QA密码，实际认证与账户三端仍未完成。

2026-11-13最新实测：[macOS内置表单及原生关窗](verification/account109/native/login-window-live05/README.md)五项通过并独核，完整正文编辑/自然重启保持；两个进程自然退出0，成功临时库已清理。[手机CELLULAR新域匿名health](verification/account109/android/approved-domain-phone-health01/README.md)一次200、可信TLS，未安装新包或发起授权。新Android包已独核；重复构建产物[清理](verification/account109/native/88b2dabe-derived-cleanup01/README.md)约724MiB。两域配置/公钥父级对照通过，独立复核可读新域但旧域请求失败，保留各自范围；认证与账户三端仍未完成。

2026-11-13域名续验：[DNS已写入且Vercel verified=true](verification/account109/server/custom-domain-live02/README.md)。正确Chrome profile已有目标zone登录会话，无需新输入凭据；CNAME和附加TXT已完成，原三条TXT保留。新域匿名端点/TLS通过；首轮Python canonical TLS失败保留，父级Node单轮两域配置/公钥均200且相同，独核续验中。新Android精确 `88b2dabe` 候选已[离线构建](verification/account109/native/88b2dabe-android-build01/README.md)，未安装，身份独核进行中。

2026-11-13最新：[双入口真实桌面命令测试](verification/account109/native/login-surfaces-live03/README.md)三条流程各五项通过，涵盖浏览器取消、内置取消、内置转浏览器取消及完整正文编辑/自然重启；六进程自然退出0，[独核](verification/account109/native/login-surfaces-live03/review.md)通过。精确候选仍为 `72513d12` Mac；真实表单、物理关窗、成功认证及Android三端未由此验收。Dock访问超时后，Chrome原生窗口访问已成功；已用正确profile的现有会话配置DNS，服务验证续验中。下方按历史时点读取。

2026-11-13后续：[自定义域名使用已获用户许可](plan/tasks/app-account109-approved-domain.md)，`cybernote-sync.aixgg.com` 已绑定原Vercel项目production，仍待DNS验证。[执行回执](verification/account109/server/custom-domain-live01/README.md)提供准确CNAME/TXT；现有API凭据DNS查询403，浏览器现存账户没有目标zone，已准备管理员登录交接。Android固定transport新域/桌面旧域及固定旧enrollment issuer的源码和manifest已独审合并，完整Node检查274项通过；尚未构建或安装新域候选，不沿用下述旧包身份。

2026-11-13新增要求：[应用内托管页与系统浏览器登录](plan/tasks/app-account109-login-surfaces.md)源码已合并，两入口共享原生授权，可将当前内置事务交给浏览器。`72513d12` 的[macOS/Android构建](verification/account109/native/72513d12-platform-build01/README.md)和[独立包身份核验](verification/account109/native/72513d12-platform-build-review01/README.md)通过；补齐两端执行器后[最终集成检查](verification/account109/native/login-surfaces-integration02.md)274项通过。新入口实机验收仍未完成：本轮桌面交互观察为锁屏，安卓[升级前检查](verification/account109/android/login-surfaces-preflight01/README.md)因保留账户错误和一篇完整文档与旧基线不同而停止，未安装或发起登录。[清理重复构建产物](verification/account109/native/72513d12-derived-cleanup01/README.md)回收约724MiB，候选与原库保留。此前 `9e7c46d2` 的[真实取消与重启检查](verification/account109/native/cancel-local-live02/README.md)五项通过，两进程自然退出；它不包含新入口。临时库已在独立复核后清理。双桌面核心数据、Android 网络与发布整体边界仍见[当前结果](verification/account109/RESULT-LATEST.md)。

2026-11-13：账户同步的[双桌面核心实测](verification/account109/RESULT-LATEST.md)已覆盖双向完整正文/附件原字节、暂停恢复与离线重启；在原库中用真实 Rust 功能续验完成既有冲突两分支保全、退出后本地保存/重启和两向排除，三个进程自然退出。旧 WebView 超时失败保留，不代表 UI 全部通过。Android coordinator 连接阶段超时仍阻塞真实账户三端；[逐项用例](verification/account109/ACCOUNT-TEST-CASES.md)区分已测、部分与未执行。工作区代码/证据已分组收拢；净化候选已更新封存，GitHub/Actions 尚待测试完成。下方按历史时点阅读。

2026-11-13早期：本轮整理账户同步开发检查点，见[工作区提交记录](verification/account109/WORKSPACE-COMMITS.md)。已保留[架构](architecture/account-sync.md)、[界面设计](ui/account-sync.md)和[原生 SDK 调查](plan/analysis/account109-native-research.md)；当时账户界面仅在显式开发测试中启用，默认设置与手工同步仍可用。不能以局部检查替代端到端验收。

2026-11-12：已完成当前源码的[双桌面独立数据目录与Android三端同步验收](verification/sync108/RESULT.md)：新增桌面 `--data-dir`、进程lease与缓存隔离；最终两个原生桌面App35项、Android三端4场景通过，保留原失败和IME/save重叠未测边界。[实现链分析](plan/analysis/sync108-current.md)、[逐项用例](verification/sync108/TEST-CASES.md)与[工作区分组提交/检查记录](verification/sync108/WORKSPACE-COMMITS.md)齐备；仓库无remote，本轮为本地main提交。

2026-11-11 当前续验：测试机已解锁，不能再以历史锁屏概括当前阻碍。[Android live08/09独核](plan/reviews/app-final106-android-live0809-independent.md)接受新建空笔记时实际完整WeType按键与活动输入连接；设置原图已证明页面曾打开，原“设置无响应”结论及候选点击前“截图精确一致”声明均被RGB复算否定，作者已保留旧派生记录并更正，不能据此证明点击目标、场景切换原因或输入法修复；[Android live11独核](plan/reviews/app-final106-android-live11-independent.md)接受同PID31424/task1294新空笔记→Back隐藏键盘→正文单击→完整WeType键盘恢复；仅此空笔记链通过，非历史原因修复，格式保持尚未复验。旧102失败保留。[Mac live11独核](plan/reviews/app-final106-mac-videos-live11-independent.md)确认faststart定位83.333秒后持续Play/静止，本轮无锁屏错误，后段恢复播放尚未证明；不能沿用live10锁屏原因。[Mac tail live12独核](plan/reviews/app-final106-mac-tail-live12-independent.md)接受附件身份及96秒时长的有限记录，后段播放未通过；附件菜单操作后Pause/00:48与83.333秒帧不一致，原因未明。随后数字正文测试前，前台已变为Chrome/task1296；没有输入/切回，格式分支停止，不改变live11已完成结果。当前不构建、不重装、不改输入法设置；保留用户笔记和附件。下方按各报告历史时点读取。

Mac视频最新：[live10有限独核](plan/reviews/app-final106-mac-videos-live10-independent.md)接受faststart激活、96秒时长、初段推进及86.8%后段定位；后续播放点击再次被Mac系统锁定拒绝，后段推进/明确暂停与tail-metadata视频未验。全部UI停止；Android同一系统认证前提持续，剩余原生验收须本人正常解锁后继续。没有新构建，整体目标未完成。下方为此前时点。

Mac WAV最新：[live09有限独核](plan/reviews/app-final106-mac-wav-live09-independent.md)接受90分钟录音激活、时长、起始推进、作者记录的约91%后段定位及最终结束。AX设置进度无效，后段即时4912.1秒无单独持久AX；01至02相隔18分36秒，不作连续后段采样。以下live08锁定为此前时点；视频仍在分项验收，Android仍需本人正常解锁。

当前设备验收更新：[Mac live08有限独核](plan/reviews/app-final106-mac-runtime-live08-independent.md)接受准确106设置身份、中文SVG列表非空/画廊完整中文缩略图与返回所属笔记定位选中。WAV仅导入，首次播放被系统锁定拒绝，两MP4未验；Android106安装身份已核，设置UI/IME/格式/媒体仍待本人正常解锁。以下chooser阻碍、双进程观察和“中文缩略图未测”为较早时点。完整目标仍未完成。

2026-11-10 最新：106稳定Android移动布局已整合（446输入/74c0a8bb…），[同源双包已独核](plan/reviews/app-final106-packages-independent.md)，README唯一最新入口已更新106并通过[交付F1复审](plan/reviews/app-final106-readme-delivery-f1-independent.md)。原Samsung重连后曾见包记录保留但代码目录缺失；10:29 UTC一次保数据修复安装Success、设备实际APK SHA匹配106，[03/04证据已独核](plan/reviews/app-final106-android-install0304-independent.md)，原因未知、功能验收仍进行中。[Mac有限运行独核](plan/reviews/app-final106-mac-runtime-independent.md)仅确认设置AX身份及chooser阻碍，不冒充媒体通过，双进程限制见[父级观察](verification/modernization101/final106-mac-parent-observation.md)。追加精确清理18个第一方构建脚本缓存约263MiB，[独核接受](plan/reviews/app-cleanup-own-build-script-20261110-independent.md)，正式包SHA不变。[本次旧v2 IME现场](verification/modernization101/keyboard-recurrence-20261110.md)单tap正常、历史触发未知，不称永久修复；原102与双端完整原生验收仍开放。下方为历史阶段。

2026-11-10 六项整理：[恢复状态](plan/cybernote-modernization-state.md)、[最终验收](verification/modernization101/final-audit.md)、[平台功能表](platform-feature-matrix.md)。含103/104的final105同源双包已[独立核包](plan/reviews/app-final105-packages-independent.md)，尚未安装/更新README，现入口仍r2。MEDIA105 run3的双方冷暖各500图、新版50文字SVG及三长媒体证据[独审接受](plan/reviews/app-media105-formal-run3-independent.md)；旧版录音推进失败保留，仅接受完整图像阶段有限比较，暖访问rAF亦变差，不称整协议或全面性能胜出。Android格式保持原失败继续交[102](plan/tasks/app-mobile-format102.md)，另已识别的横屏移动身份边界由[106](plan/tasks/app-android-mobile106.md)在隔离工作树修正，不能倒推为102原因。最新IME复发时原测试机缺席，另一台ADB设备未授权，尚无本次现场。表格、模块及设计变量已整合；Mac录音授权/实体触摸板和最终准确实包验证仍开放，完整目标未完成。下方记录保留各自历史交付时点。

2026-11-08 速绘交互：[单击进入、长按菜单、双指缩放平移与面板背景](ui/drawing-editor.md)。移动顶部移除无效对勾，Mac 原生附件菜单启用添加速绘；源码与测试见该规格。

2026-11-08 附件画廊：[浏览与定位规格](ui/attachment-gallery.md)，图片/视频、录音、文稿统一画廊，支持从附件跳转并定位所属备忘录。[验证记录](verification/cybernote-desktop/ATTACHMENT-GALLERY.md)：33 项浏览器/原生投影检查和 22 项工具栏回归通过；源码与前端构建已更新，安装包未重打。

2026-11-07 启动加载：[SVG Logo 动画与首屏交接](ui/startup.md)，工作区、编辑器和工具栏就绪后淡出，提供加载失败恢复入口；前端构建与隔离浏览器验证通过。

2026-11-07 最新设置样式：[桌面按图 2 校准](verification/cybernote-desktop/SETTINGS-REFERENCE.md)，主题卡片、五档字号分段控件、侧栏标题及 920×660 面板已实现。

2026-11-07 设置页已按最新要求直接重构：[界面与行为规格](ui/preferences.md)，桌面五分类侧栏、移动分组首页和子页，顶部工具栏保留显示。[验证与本机产物](verification/cybernote-desktop/SETTINGS-REDESIGN.md)。旧图片设计稿保留为历史材料，本轮不再调用图片生成。

2026-11-07 最新桌面交付：[统一菜单、浮动预览与列表缩略图](verification/cybernote-desktop/UNIFIED-MENUS.md)。图片单击选中，Mac 右键/展开菜单与顶部菜单共用 AppKit 构建器；可拖动非模态预览，列表图片缩略图及置顶标题普通状态。下文保留此前版本记录。

2026-11-07 最新桌面交付：[附件文件与剪贴板](verification/cybernote-desktop/ATTACHMENT-FILES.md)，包含 SVG/图片类型识别、图片粘贴为附件、剪切/拷贝/粘贴、Finder 和系统打开、新预览窗口。原生剪贴板与真实桌面只读核对、217 项 Rust 回归、9 组浏览器附件流程及最终核包通过。[按钮反馈与切换重构](verification/cybernote-desktop/BUTTON-FEEDBACK.md)、[桌面重构索引](verification/cybernote-desktop/DELIVERY.md)。下文保留历史版本记录。

2026-11-07 当前：[标签回车与正文 Tab94](verification/editor94/DELIVERY.md)已完成本轮修复交付，Mac32 准确构建并独立核包通过。标签 Enter 提交后正常换段，普通正文 Tab 插入制表符，保留表格/列表优先、组字与非文本选区保护。作者15项/既有27项、独审17+5项、schema96及生产入口排除通过；341动态产品输入与完整嵌入资源/实际签名独核通过。原失败、受控IME/设备/原生运行限制见[交付记录](verification/editor94/DELIVERY.md)，Mac31/Android21保留。

2026-11-07：[导入记录内部化与附件右键菜单93](verification/attachments93/DELIVERY.md)完成本轮交付，Mac31 已构建并独立核包。正常图片/录音/PDF/文件继续导入，额外来源记录不再显示为正文卡片；普通同名 JSON 不误隐藏。统一菜单支持预览/播放、保存、信息和可撤销移除；作者43项实际 App/Store、独审4项Store/6项DOM及341动态产品输入/完整嵌入资源/最终签名均通过。[UI契约](ui/attachment-context-menu.md)、[恢复状态](plan/attachment-context93-state.md)及真实来源/设备/像素限制分别记账，Mac30/Android21保留。

2026-11-07：[Mac 系统备忘录复制导入92](verification/apple-notes-import92/DELIVERY.md)本轮交付完成，Mac30已准确构建并由不同代理独立核包。设置→数据可读取、选择并复制系统备忘录，保留源数据；已有内容跳过，变化另建副本，原HTML为独立受管附件。实际源到隔离Store、最终App DOM20项、Rust28项和保留私有快照83项已通过；ZIP/340动态产品输入/内嵌前端/JXA/实际签名声明独审通过。[使用说明](apple-notes-import-usage.md)与[恢复状态](plan/apple-notes-import92-state.md)已更新。真实附件导出失败及系统授权/复杂对象保真边界单列，Mac29/Android21与原设备现场保留。下方为历史阶段记录。

2026-11-07：[Mac29 / Android21 同步交付](verification/sync91/DELIVERY.md)完成本轮要求级验收和独立复核。相同322项产品输入；原Android反向失败在同数据/配对上修复，双向完整文档及原文件、冷启、前台恢复、系统图片导出通过。当前源码实际双App39项、LAN和匿名wss定向39项已验证；原公网超时、音频Blob调试读回限制及未测VPN/硬件范围逐项保留。所有owned测试运行已关闭，[使用说明](sync-usage.md)与[恢复状态](plan/sync-delivery-state.md)已更新。下方是历史阶段记录。

2026-11-06 最新同步进展：[SYNC91](plan/tasks/app-sync91-portable-media-publication.md)附件原子发布修复已源码独审并合入，Android21准确构建中。Android20实际诊断为 `syncMediaPublish`；真实系统连续添加TXT/PNG/WAV和三个原文件核对通过，反向同步须在同一配对Store上复验，目标仍active。恢复入口：[双端同步当前状态](plan/sync-delivery-state.md)。


</details>

# Apple Notes Clone

同步任务的中断恢复与准确阶段见[当前交付状态](plan/sync-delivery-state.md)。

2026-11-06最新：Android19诊断包已准确构建、独立核包并实际读取，桌面→Android目标在inbox而未应用，反复落在applyError；当前进行[SYNC90有限错误细分](plan/tasks/app-sync90-apply-error-classification.md)以定位底层原因。原配对Store、userdata及失败保留。Android→桌面完整中文笔记、单PNG及新TXT实际原字节保存分别有证据；反向完整同步、连续PNG/WAV、导出和重启门槛仍开放。[当前状态](plan/sync-delivery-state.md)，完整goal仍active。

2026-11-06 当前：同步主线完整整合、两实际App DOM、LAN/匿名wss及Mac27/Android17独立核包已通过；新隔离Android实际验收进行中，完整目标保持active。[使用说明](sync-usage.md)。下方阶段记录保留原时点，不表示当前仍等待构建。

2026-11-06：同步后续生产接线见[86 adapter](plan/tasks/app-sync86-adapter.md)，[最终双端与路由87](plan/tasks/app-sync87-e2e.md)；各层证明范围独立。

2026-11-06：[双向同步规格](architecture/sync.md)与[持久核心84](plan/tasks/app-sync84-core.md)、[认证网络85](plan/tasks/app-sync85-network.md)已开始设计实施；现有Mac26/Android16不含网络同步。

2026-11-06：82统一设置与83手机快速画廊已完成本轮限定交付。手机直接画廊、亮黄＋一键输入，设置/数据顶部双标签；主线桌面408/手机9+43+290、受影响组恢复与Mac26/Android构建16准确构建及独立核包通过。[交付和原始失败](verification/mobile-home8283/README.md)、手机IME/provider及原版整窗像素边界可查，原Android录音现场未动。

阶段记录（交付前，2026-11-06）：[统一设置82](plan/tasks/app-preferences82.md)已通过作者52/50和独审32项并合入源码，无blocking；[Android快速首页83](plan/tasks/app-android-quick-home83.md)现串行开发，最终[组合8283](plan/tasks/app-mobile-home8283.md)一次完整回归/准确Mac26与Android16出包。此时尚未完成83或生成新包。

阶段记录（交付前，2026-11-06）：新增[Android快速画廊首页83](plan/tasks/app-android-quick-home83.md)，按[手机规格](ui/android-quick-home.md)直接画廊、明显＋和一键输入；等待82独审合入后串行实施，最终82/83组合回归与Mac26/Android16交付。

阶段记录（交付前，2026-11-06）：[统一设置与数据82](plan/tasks/app-preferences82.md)进行中：footer改齿轮，公共界面顶部“设置”“数据”两图标标签，[规格](ui/preferences.md)。

2026-11-06：[图片预览与标题栏80](plan/tasks/app-image-preview80.md)、[空间总览81](plan/tasks/app-storage-overview81.md)及[组合8081](plan/tasks/app-ui-hierarchy8081.md)已完成本轮限定交付。总占用/类型条→分类明细、预览内信息/保存、原生工具退让与标题栏双击均接入；主线桌面356/手机9+43+197、build/production与准确Mac25/Android15核包通过。[交付和边界](verification/ui-hierarchy8081/README.md)、[独审](plan/reviews/app-ui-hierarchy8081.md)、[布局](ui/storage-overview.md)可查。Android原现场未操作，实包/原版整窗像素单列。

2026-11-06：[附件闪烁、图片导出与数据管理79](plan/tasks/app-data-management79.md)已完成限定范围，[交付与验证](verification/data-management79/README.md)可查。正常附件不再整窗遮挡，媒体独立文件、图片原字节导出、真实磁盘管理及备份导入导出已接入；主线桌面230/手机9+43+75与build/production全自然0，Mac24/Android构建14通过准确构建与独立核包。Android未安装，原录音现场保留，provider设备运行/整窗像素单列开放。

2026-11-06：[录音标识与对勾保存78](plan/tasks/app-recording-indicator78.md)已限定完成，[独审](plan/reviews/app-recording-indicator78.md)48项及静态布局对照通过，[主线整合](verification/recording-indicator78/integration/README.md)桌面197/手机9+43+43、build/production全通过。原owner列表和当前实时卡有动态标识，桌面✓采用控制器能力并走真实保存流程。Mac23本地包已构建、派生严格签名及内嵌资源/ZIP独立核对通过；原生运行及整窗像素继续开放。Android76保留、原手机录音现场不动。


2026-11-06：[Mac截图三处修正77](plan/tasks/app-mac-feedback77.md)已完成限定源码/浏览器范围，[独立复审](plan/reviews/app-mac-feedback77-recheck.md)PASS（51+6）；主线桌面148、手机笔记9/录音43/附件43、build/production均自然exit0。移除Mac底部新建按钮、右键按真实坐标限制边界、标题/摘要安全橙黄高亮（连续字距和220px首命中修复）。Mac22本地包已构建且派生严格签名通过；整窗原生像素继续开放。Android原生76继续ready，原录音现场不动。


更新：2026-11-06。目标平台：macOS、Android。技术约束：Rust + pnpm。本地保存，无 iCloud。

2026-11-06：[安卓版附件75](plan/tasks/app-android-attachments75.md)已[独审PASS](plan/reviews/app-android-attachments75.md)并完成[主线串行整合](verification/android-attachments75/integration/README.md)，9命令自然exit0：desktop100/mobile附件43/录音43/笔记9、protocol18、真实Rust21、build/production。修复空笔记多附件覆盖、预览读取永久错误、空MIME/读取中止及重试/取消错误残留；独审另29浏览器/14真实Rust故障恢复通过。原Android/系统chooser/整体像素仍开放，未生成APK、原13秒录音现场未动。下一优先[全新独立Android原生76](plan/tasks/app-android-attachments-native76.md)ready；真实Rust桌面录音74也ready但尚未执行。

2026-11-06最新优先项：[安卓版附件75](plan/tasks/app-android-attachments75.md)。用户报告附件无法保存及显示问题；先复现手机附件读取/受管存储/正文ACK/新进程恢复，必要时修复，独立复核后整合。真实Rust设施先用于附件，[桌面录音74](plan/tasks/app-debug-recording-rust74.md)暂后续执行。原Android未保存录音现场继续完全保留，不操作原设备；浏览器/Session通过不代表原生chooser或整体像素已通过。

2026-11-06：[录音中央控件73](plan/tasks/app-mobile-recording-primary73.md)已完成[独立复审](plan/reviews/app-mobile-recording-primary73-recheck.md)、[视觉效率复核](plan/reviews/app-mobile-recording-primary73-efficiency-recheck.md)及[主线整合](verification/mobile-recording-primary73/integration/README.md)。根桌面100/手机录音43/笔记9、build/production、24态视觉均自然exit0。修正手机外圈/间隔/暂停填色；修复延迟媒体重挂载的测试竞态；同24态视觉限定依赖扫描后独审约260→50秒，六桌面严格无差。完整原生/像素与CLI清理性能仍开放；下一项[真实Rust持久化74](plan/tasks/app-debug-recording-rust74.md)ready，尚未构建执行。

2026-11-06准备阶段（73现已完成，见上方整合）：按[手机录音中央控件73](plan/tasks/app-mobile-recording-primary73.md)，依据已保全的稳定录屏帧校准外圈、内侧间隔与暂停填色，以命令/HTML和同尺寸图像量化回归。[已存录音重命名研究72](research/saved-audio-rename72/README.md)及[独审](plan/reviews/ref-saved-audio-rename72.md)已合入：源码读写链和不可变附件边界已核对，原版AX访问拒绝，名称编辑/Undo/恢复未观察，任务继续开放，未实现猜测交互。原Android未保存录音现场保持不动。

2026-11-06：[手机录音命令验收71](plan/tasks/app-mobile-debug-recording71.md)已[独立复审通过](plan/reviews/app-mobile-debug-recording71-recheck.md)并完成[根整合](verification/mobile-debug-recording71/integration/README.md)。桌面九组100项29.046秒、手机录音42项17.092秒、手机笔记9项11.282秒，均exit0；构建及生产排除通过。修复真实重试与旧失败竞态、有界异步等待和raw idle字段传输，补合成媒体增量字节与后段播放检查。命令/HTML路径按[使用说明](debugging.md)执行，完整原生/像素目标仍开放。

任务70已完成独立复核和主线整合：[完整九组91项检查一次通过](verification/app-debug-automation70/integration/README.md)，CLI计时27.369秒（含启动、最终清理另计），前端构建与生产入口排除通过；手机浏览器笔记9项与录音组14项有独立分组记录。[使用说明](debugging.md)提供命令行、控制台、HTML/布局及截图比较入口。真实平台与原版像素范围保持各自记录。

最新测试方式以[统一调试命令使用说明与入口矩阵](debugging.md)、[程序化调试与验收](testing.md)和[任务70](plan/tasks/app-debug-automation70.md)为准：统一调试命令、读取HTML/DOM/布局、固定合成录音、隔离工作区，减少Computer Use。Mac21已构建并独立核包，实际两次暂停继续、跨笔记CmdQ后2:02录音与M正文、侧栏×后0:35首次回放有限通过，见[实际记录](verification/mac-recording-quit68-runtime/README.md)；本轮main-close/Dock未验，整体像素/音质仍开放。下方原先“21准备中”是旧时点，不能作为当前状态。

最新要求为主窗口右侧唯一非模态录音栏。66侧栏、67首次媒体读取已合入；68菜单/CmdQ与69普通原生退出桥现已独立复核并整合，见[组合审查](plan/reviews/app-mac-recording-quit6869.md)，结论 SOURCE-READY / RUNTIME-OPEN。准确新Mac21准备中；真实退出后原笔记完整录音及另一笔记最新正文仍须实包验收。[Mac20真实记录](verification/mac-recording-media67-runtime/README.md)的首次授权超时及CmdQ后K缺卡保持历史失败，不能由受控测试追认为通过。Android约13秒原现场完全不操作；旧Mac18约3秒内存现场进程已不在，原因/时点未知，不能称保全或恢复。整体像素与音质仍开放。

历史64状态：最新优先项：[Mac暂停/关闭自动保存64](plan/tasks/app-mac-recording-autosave64.md)首版已独审/整合并生成[Mac18](verification/unified-candidate06/mac-recording-autosave-build18/README.md)，但[真实暂停保存被目标校验拦截](verification/mac-recording-autosave64-runtime/README.md)，**MAC18-RUNTIME-BLOCKED**，不作为修复交付。新3秒录音现场保留，继续修复实际App/Host恢复等待与投影边界。手机原现场继续保持。[最新交互契约](ui/recording-desktop.md)不变。

[手机游标/时间轴60](plan/tasks/app-mobile-recording-wave60.md)已独审并[合入主线](verification/mobile-recording-wave60-root-integration/README.md)，新[Android构建13](verification/unified-candidate06/android-recording-wave-build13/README.md)已本地生成、未安装；[Mac授权有界诊断63](plan/tasks/app-mac-recording-diagnostics63.md)已[独审合入](verification/mac-recording-diagnostics63-root-integration/README.md)，首版同步输出阻塞已修，默认关闭，尚未进入安装包。[授权链研究61](research/mac-recording-access-next61/README.md)保留真实采集未通过；[原版已存音频菜单62](research/saved-audio-menu62/README.md)仅观察菜单，未执行追加/导出/删除，菜单功能差异继续开放。不操作原Android现场，不追认旧包包含新改动。

当前已发布接收包：Mac14（构建源d9ce9c4）/Android08（源182464b），不同来源分别记账。[Mac14普通名称/侧栏/局部选中文字有限接收](verification/mac-ordinary-keyboard47-root-acceptance.md)；上一批双端见[接收36](verification/typography-compose-keyboard36-root-acceptance.md)。整体像素与完整交互目标继续进行。

本轮最新录音开发包为[Mac17](verification/unified-candidate06/mac-recording-visual-build17/README.md)（源fa21657，333产品/352输入）与[Android构建13](verification/unified-candidate06/android-recording-wave-build13/README.md)（源a236b311，334产品/353输入，另含60）。均不含63源码诊断。[Mac17真实有限复验](verification/recording-visual5859-mac17-runtime/README.md)通过未采集双模式同会话、编辑/撤销重做、B搜索、侧栏恢复和已有44:58播放/暂停/±15秒；新采集中双模式、有效收音与整体像素仍开放。Mac此前Start授权无返回及旧AndroidDone拒绝保留在[55记录](verification/recording-presentation55-runtime/README.md)。Android13本地构建/核包通过、未安装；用户选择保留原13秒失败File现场、暂不继续手机设备验收，不备份/安装/停止/重启原应用，源码与受控UI开发继续。不将开发包记为录音完成交付，旧Android12原件继续保留。

用户新优先项：[录音交互任务50](plan/tasks/app-recording-interactions50.md)、[浮窗/主窗右栏双模式55](plan/tasks/app-recording-presentation55.md)、[桌面录音规格](ui/recording-desktop.md)、[截图/手机参考49](research/audio-interaction-readiness49/reference-layout.md)。重点为采集中仍可操作Notes其他功能，切换呈现不重启会话、保存归属原A。源码与主线整合通过，准确新包已出，真实采集中双模式仍待验；不做听写/转写，未进入Mac14/Android08。 [实际Mac准备阻塞50](verification/recording-interactions50-baseline/README.md)、[只读权限定位51](research/mac-recording-request-readiness51.md)、[明确授权预检任务52](plan/tasks/app-mac-recording-access52.md)。

已整合[录音可见几何校准58](plan/tasks/app-recording-visual58.md)及[手机播放行校准59](plan/tasks/app-mobile-recording-visual59.md)：桌面时间轴/标题/计时与手机播放图形/字重、窄屏错误提示已改，[58独审](verification/recording-visual58-independent/review-final.md)与[59独审](verification/mobile-recording-visual59-independent/review-final.md)均SOURCE-READY / PIXEL-OPEN。准确Mac17/Android12已构建收集；手机设备验收继续暂缓，不触原Android失败File。源码、受控视觉与实际包像素结论分开，历史Mac16/Android11不追认包含58/59。

- [Mac17/Android12准确包独立身份核对](verification/unified-candidate06/recording-visual5859-independent/README.md)
- [手机60的Android构建13独立核包](verification/unified-candidate06/android-recording-wave-independent13/README.md)：51项通过，包含60不含63，未安装，原Android现场保持
- [手机波形游标与轴标签剩余差异准备60](research/mobile-recording-wave60-readiness/README.md)：[内部几何任务60](plan/tasks/app-mobile-recording-wave60.md)已独审合入，游标/标签局部改善；完整像素和设备验收继续开放，不改变保留手机现场的决定

- [Mac13实际独审36](plan/reviews/mac-typography-keyboard-runtime36.md)与[Android08实际独审36](plan/reviews/android-compose-anchor-runtime36.md)
- [Mac12准确构建](verification/unified-candidate06/mac-name-focus-build12/README.md)与[独立核包](plan/reviews/mac-name-focus-independent12.md)
- [Android07准确构建](verification/unified-candidate06/android-folder-visual-build07/README.md)与[独立核包](plan/reviews/android-folder-visual-independent07.md)
- [Mac12名称/侧栏实际运行](verification/mac-name-focus-runtime29/README.md)、[独立复核](plan/reviews/mac-name-focus-runtime29.md)、[局部量图](research/mac-name-focus-runtime29-analysis/analysis.md)
- [Android07文件夹实际运行](verification/android-folder-visual-runtime29/README.md)、[独立复核](plan/reviews/android-folder-visual-runtime29.md)、[局部量图](research/android-folder-visual-runtime29-analysis/analysis.md)
- [普通Mac文字绘制校准31](plan/tasks/app-mac-ordinary-typography31.md)、[原版额外同态与Tab观察31](research/mac-ordinary-original31/README.md)
- [手机右下新建图标只读定位32](research/mobile-compose-readiness32/analysis.md)与[局部锚点修复34](plan/tasks/app-mobile-compose-anchor34.md)
- [Mac Tab策略与系统键盘导航只读准备33](research/mac-folder-keyboard-readiness33/README.md)
- [Mac原生键盘导航策略修复35源阶段通过](plan/tasks/app-mac-keyboard-policy35.md)、[独立审查](plan/reviews/app-mac-keyboard-policy35.md)
- [文字、手机锚点及Mac键盘下一准确包准备36](verification/unified-candidate06/typography-compose-keyboard36-preparation/README.md)
- [普通Mac文字31独立源阶段审查](plan/reviews/app-mac-ordinary-typography31.md)
- [原版Option-Tab未提交草稿观察35](research/mac-folder-keyboard-original35/README.md)

- [Mac13实际有限运行36](verification/mac-typography-keyboard-runtime36/README.md)、[实际文字量图36](research/mac-ordinary-typography36-runtime-analysis/README.md)
- [普通名称Tab原版补证37](research/mac-folder-tab-loop-original37/README.md)与[局部循环修复任务37](plan/tasks/app-mac-ordinary-tab-loop37.md)
- [手机空白新建返回只读定位38](research/mobile-empty-note-readiness38/README.md)：先创建真实本地实体，原版相同路径语义未证，未实施空笔记删除
- [原版Option-Tab插入40](research/mac-folder-option-insertion-original40/README.md)、[撤销重做41](research/mac-folder-option-history-original41/README.md)、[受控WK实现准备40](research/mac-folder-option-insertion-readiness40/README.md)与[待实施任务42](plan/tasks/app-mac-ordinary-option-insertion42.md)
- [原版连续Option-Tab同组撤销43](research/mac-folder-option-sequence-original43/README.md)：连续输入与两次插入可被一次撤销恢复到默认名，不假设逐次独立历史
- [名称视觉残差只读准备44](research/mac-ordinary-visual-readiness44/README.md)与[浅色选中文字候选45](plan/tasks/app-mac-ordinary-selection-ink45.md)：选中明暗可单试，字体与底色残差继续开放
- [原版名称全选/部分/末尾46](research/mac-folder-selection-original46/README.md)与[准确Mac13同态基线46](research/mac-selection-baseline13-46/README.md)：Computer Use实际原图，供Mac14后续三方比较

- [需求与验收](requirements.md)
- [架构与数据契约](architecture.md)
- [参考资料与调研](research/README.md)
- [本地标签、智能文件夹、数学、链接与格式接入分析](research/local-feature-integration.md)
- [智能文件夹存储、归档、查询与访问边界准备审计](research/smart-folder-readiness-20261104-01.md)
- [原版智能文件夹实际保存、求值与导航补证任务](plan/tasks/ref-smart-folders-runtime-01.md)
- [原版智能文件夹合成样本运行记录（进行中）](research/smart-folder-original-runtime-01/README.md)
- [原版智能文件夹多目录、排除与A外置顶补证03](research/smart-folder-original-runtime03/README.md)
- [智能文件夹实际存储与查询接入准备03](research/smart-folder-implementation-readiness03.md)
- [智能文件夹数据、所有权与UI交付拆分07](research/smart-folder-delivery07.md)
- [智能文件夹共享契约提案09](research/smart-folder-contract09-proposal.md)
- [智能文件夹数据门禁09](research/smart-folder-data-gate09.md)
- [原版空标签草稿验证09](research/smart-folder-empty-tags-runtime09/README.md)
- [原版标签候选、胶囊与模式往返草稿10](research/smart-folder-tag-picker-runtime10/README.md)
- [原版规则新增位置、日期默认及已用类型禁用11](research/smart-folder-rule-add-runtime11/README.md)
- [三行规则节奏、加减视觉中心与日期框测量12](research/smart-folder-rule-add-measurements12.md)
- [后续日期规则菜单、范围和相对单位未保存草稿12](research/smart-folder-date-draft-runtime12/README.md)
- [智能界面候选独审：第三规则与非法组合值P2](plan/reviews/app-smart-u-platform-ui09.md)
- [智能界面两项边界窄修13](plan/tasks/app-smart-u-boundary-fix13.md)
- [两项窄修准确源码独立通过](plan/reviews/app-smart-u-boundary-fix13.md)
- [后续纯本地智能规则的数据准备13](research/smart-local-rules-readiness13.md)
- [智能界面准确双端包与有限设备验收准备](plan/tasks/app-smart-u-device09.md)
- [智能双端包输入清单与串行安排](verification/unified-candidate06/smart-u-device09-preparation/README.md)
- [智能界面Mac准确完整包独立核查](plan/reviews/mac-smart-u-independent09.md)
- [Android构建离线初始化窄修14](plan/tasks/tools-android-offline-init14.md)
- [离线初始化工具14独立复核](plan/reviews/tools-android-offline-init14.md)
- [手机文件夹页原录屏与旧包几何基线14](research/mobile-folders-baseline14/README.md)
- [Android智能界面新05准确包独立核查](plan/reviews/android-smart-u-independent05.md)
- [Mac09智能文件夹Computer Use有限实际记录](verification/mac-smart-u-runtime09/README.md)
- [Android05保数据升级、有限运行与规则回填阻塞](verification/android-smart-u-runtime09/RUNTIME.md)
- [Mac普通/智能表单原像素几何研究14](research/mac-smart-u-native-geometry14/README.md)
- [新Android05文件夹页有限ROI延续核对](research/mobile-folders-baseline14-new05/README.md)
- [Mac普通新建表单尺寸与底部结构修正15](plan/tasks/app-mac-folder-form-geometry15.md)
- [置顶false重开草稿值保全修复16](plan/tasks/app-smart-draft-hydration16.md)
- [手机智能表单错误可见与文件夹长按选字修复17](plan/tasks/app-mobile-folder-interactions17.md)
- [文件夹修复下一轮准确双端包与验收准备18](verification/unified-candidate06/folder-fixes18-preparation/README.md)
- [文件夹修复Mac10准确包独核](plan/reviews/mac-folder-fixes-independent10.md)
- [文件夹修复Android06准确包独核](plan/reviews/android-folder-fixes-independent06.md)
- [Mac10普通表单、规则回填与侧栏实际验收18](verification/mac-folder-fixes-runtime18/README.md)
- [Mac10实际记录不同作者独立复核](plan/reviews/mac-folder-fixes-runtime18.md)
- [Android06规则回填、错误可见与长按实际验收18](verification/android-folder-fixes-runtime18/README.md)
- [Android06实际记录不同作者独立复核](plan/reviews/android-folder-fixes-runtime18.md)
- [双端文件夹修复有限运行根接收18](verification/folder-fixes-runtime18-root-acceptance.md)
- [Mac普通表单剩余像素差异研究19](verification/mac-ordinary-form-pixels19-research/README.md)
- [普通Mac表单表面、角部和未选中框校准20](plan/tasks/app-mac-ordinary-form-surface20.md)
- [普通Mac表单20源码与离屏独立审查](plan/reviews/app-mac-ordinary-form-surface20.md)
- [普通Mac名称框焦点、选区与字左缘后续准备24](research/mac-ordinary-focus24-readiness/analysis.md)
- [原版侧栏隐藏偏好正常重启补证21](research/mac-sidebar-restart21/README.md)
- [Mac主窗侧栏偏好最小接入准备22](research/mac-sidebar-preference22-readiness/analysis.md)
- [Mac侧栏显隐偏好本地恢复修复22](plan/tasks/app-mac-sidebar-preference22.md)
- [Mac侧栏偏好22独立源码与隔离链路审查](plan/reviews/app-mac-sidebar-preference22.md)
- [普通表单与侧栏偏好下一准确Mac包准备23](verification/unified-candidate06/mac-ordinary-sidebar23-preparation/README.md)
- [Mac11准确包独立核查](plan/reviews/mac-ordinary-sidebar-independent11.md)
- [Mac11侧栏与普通表单实际运行23](verification/mac-ordinary-sidebar-runtime23/README.md)
- [Mac11运行23不同作者有限复核](plan/reviews/mac-ordinary-sidebar-runtime23.md)
- [Mac11实际表单量图25与原旧新对照](research/mac-ordinary-surface25-runtime-analysis/analysis.md)
- [Mac11侧栏偏好与普通表面根接收23](verification/mac-ordinary-sidebar23-root-acceptance.md)
- [Mac普通新建名称焦点、选区与文字对齐26](plan/tasks/app-mac-ordinary-name-focus26.md)
- [Mac名称框26源码独立审查](plan/reviews/app-mac-ordinary-name-focus26.md)
- [Safari名称框实际局部量图26](research/mac-ordinary-name-focus26-safari-analysis/analysis.md)
- [名称框26源码阶段根接收](verification/mac-ordinary-name-focus26-root-acceptance.md)
- [名称与手机文件夹下一准确双端包准备29](verification/unified-candidate06/name-mobile29-preparation/README.md)
- [Android文件夹首页准确06差异准备27](research/android-folders-readiness27/analysis.md)
- [手机文件夹首页局部图标、文字与标题校准28](plan/tasks/app-mobile-folder-visual28.md)
- [手机可见加号命中修复28独立复核](plan/reviews/app-mobile-folder-visual28-fix01.md)
- [手机文件夹28源阶段根接收](verification/mobile-folder-visual28-root-acceptance.md)
- [Android05实际运行独立证据核对](verification/android-smart-u-runtime09-independent/README.md)
- [Mac09实际运行独立证据核对](verification/mac-smart-u-runtime09-independent/README.md)
- [Mac智能文件夹表单布局](ui/smart-folders-macos.md)
- [Mac智能表单原图像素测量与捕获范围](research/smart-folder-form-measurements09/README.md)
- [手机智能文件夹官方文字与原图依据09](research/mobile-smart-folder-official09.md)
- [手机智能筛选面板与长按菜单布局](ui/smart-folders-mobile.md)
- [手机官方智能筛选原图卡片与胶囊局部尺寸10](research/mobile-smart-folder-form-measurements10.md)
- [本地库版本与实体防损修复任务09](plan/tasks/app-smart-d1-storage-open09.md)
- [真实智能规则与归档接入任务09](plan/tasks/app-smart-d2-durable-rules09.md)
- [智能规则通知与保存所有权任务09](plan/tasks/app-smart-o-metadata09.md)
- [通知与保存所有权源码08d2206作者记录及覆盖限制](verification/app-smart-o-metadata09/README.md)
- [通知与保存所有权最终源码独立审查](plan/reviews/app-smart-o-metadata09.md)
- [最终源码10项Rust与8条不同挂载/桥接路径独立证据](verification/app-smart-o-metadata09-independent/README.md)
- [智能规则两端真实界面任务09](plan/tasks/app-smart-u-platform-ui09.md)
- [原版智能规则取消、候选与正常冷启补证07](research/smart-folder-original-runtime07/README.md)
- [原版智能规则补证07独立核查](research/smart-folder-original-runtime07-independent-01/README.md)
- [离线扫描与媒体接入研究](research/offline-media-scanning.md)
- [现有录音与本地播放链准备审计](research/media-roundtrip-readiness/analysis.md)
- [录音链当前源码差异与受控音轨基线](research/media-roundtrip-readiness/current-source-delta.md)
- [Android中文组合输入验证工具](research/android-ime-verification.md)
- [UI 规格](ui/README.md)
- [Mac正式顶部公共区域差异与校准起点](research/macos-toolbar-host-deltas/analysis.md)
- [candidate04同画布零结果几何补证](research/mac-zero-candidate04-geometry-01/README.md)
- [Mac宽窗工具栏弹性布局分析](research/mac-wide-toolbar-layout-01/README.md)
- [Mac宽三栏工具栏几何校准任务](plan/tasks/app-001-wide-toolbar-geometry-01.md)
- [宽三栏工具栏独审与生产布局矩阵](plan/reviews/app-001-wide-toolbar-geometry-static-01.md)
- [Mac候选05构建与真实宽窗复验任务](plan/tasks/app-001-wide-toolbar-runtime-01.md)
- [Mac候选05已构建、完整签名与保全](verification/mac-candidate05-wide-toolbar-build-01/README.md)
- [Mac候选05实际搜索、布局切换与视觉冷启有限观察](verification/mac-candidate05-wide-toolbar-runtime-02/README.md)
- [Mac候选05与原版宽窗局部几何及JPEG派生叠图](research/mac-candidate05-wide-runtime-geometry-01/README.md)
- [桌面文件夹隐藏后直接恢复修复](plan/tasks/app-001-sidebar-restore-01.md)
- [侧栏恢复独立源码审查](plan/reviews/app-001-sidebar-restore-static-01.md)
- [侧栏恢复主线整合](verification/app-001-sidebar-restore-main-integration-01/README.md)
- [candidate06双端构建与准确产物](verification/unified-candidate06/README.md)
- [candidate06桌面侧栏实际窗口复验](verification/candidate06-mac-sidebar-runtime-01/README.md)
- [侧栏实际窗口证据独立复核](verification/candidate06-mac-sidebar-independent-01/README.md)
- [侧栏菜单状态文字补齐](plan/tasks/app-001-sidebar-menu-label-01.md)
- [侧栏动态菜单独立源码审查](plan/reviews/app-001-sidebar-menu-label-static-01.md)
- [最新Mac侧栏菜单修复包](verification/unified-candidate06/mac-menu-build02/README.md)
- [最新Mac侧栏与菜单实际验收](verification/candidate06-mac-sidebar-menu-runtime-02/README.md)
- [最新Mac侧栏菜单实际记录独立核查](verification/candidate06-mac-sidebar-menu-independent-02/README.md)
- [当前Mac正文尺寸候选包03（含侧栏修复）](verification/unified-candidate06/mac-body-build03/README.md)
- [正文候选实际输入、正常冷启与侧栏回归](verification/mac-body-typography-runtime-01/README.md)
- [正文候选同文几何与剩余排版差异](research/mac-body-candidate06-geometry-01/README.md)
- [正文几何与有限运行记录独立审阅](plan/reviews/app-001-body-typography-runtime-01.md)
- [当前Mac侧栏两条恢复路径最终复验](verification/mac-sidebar-final-04/README.md)
- [当前Mac侧栏最终记录独立核查](plan/reviews/app-001-sidebar-final-04.md)
- [用户再次反馈后的当前桌面包侧栏双入口复验](verification/mac-sidebar-user-regression05/README.md)
- [同栏宽正文与侧栏右侧按钮原版补证05](verification/mac-same-columns-runtime05/README.md)
- [可见侧栏顶部按钮与背景校准05](plan/tasks/app-001-sidebar-visible-geometry05.md)
- [可见侧栏候选05独立源码与真实AppKit控件复核](plan/reviews/app-001-sidebar-visible-geometry05.md)
- [Mac05侧栏准确新包与来源](verification/unified-candidate06/mac-sidebar-build05/README.md)
- [Mac05新包独立产物核查](verification/unified-candidate06/mac-sidebar-independent05/README.md)
- [Mac05侧栏按钮、菜单、缩放与冷启实际验收](verification/mac-sidebar-visible05-runtime-01/README.md)
- [Mac05侧栏原版局部对比与剩余光学偏差](verification/mac-sidebar-visible05-analysis-01/analysis.md)
- [Mac06侧栏光学、隐藏背景与浅色色调校准](plan/tasks/app-001-sidebar-optical06.md)
- [Mac06侧栏光学候选独立源码与AppKit复核](verification/app-001-sidebar-optical06-independent-01/README.md)
- [Mac06侧栏准确应用与构建](verification/unified-candidate06/mac-sidebar-optical-build06/README.md)
- [Mac06侧栏产物独立核验975项](verification/unified-candidate06/mac-sidebar-optical-independent06/README.md)
- [Mac06按钮、菜单、栏宽与冷启实际验收](verification/mac-sidebar-optical06-runtime-01/README.md)
- [Mac06实际侧栏局部图标、背景与剩余差异](verification/mac-sidebar-optical06-analysis-01/analysis.md)
- [Mac标题与首个日期分组校准07](plan/tasks/app-001-list-heading07.md)
- [Mac标题与日期分组实际差异准备07](research/mac-list-heading-readiness07/analysis.md)
- [Mac标题与首组日期真实AppKit/WebKit作者证据07](verification/app-001-list-heading07/README.md)
- [Mac标题与首组日期07独立源码与量图复核](verification/app-001-list-heading07-independent-01/README.md)
- [Mac标题与日期07主线整合与交付边界](verification/list-heading-root-integration07.md)
- [Mac07准确桌面修复包](verification/unified-candidate06/mac-list-heading-build07/README.md)
- [Mac07准确包1002项独立来源与产物检查](verification/unified-candidate06/mac-list-heading-independent07/README.md)
- [Mac07实际两条侧栏恢复与正常冷启](verification/mac-list-heading07-runtime-01/README.md)
- [Mac07运行证据176项独立复核](verification/mac-list-heading07-runtime-independent-01/README.md)
- [Mac07准确包标题、日期与侧栏局部实测](verification/mac-list-heading07-runtime-analysis-01/analysis.md)
- [侧栏拖动误选界面文字修复08](plan/tasks/app-001-sidebar-drag-selection08.md)
- [侧栏拖动08作者有限生产组件检查](verification/app-001-sidebar-drag-selection08/README.md)
- [侧栏拖动08不同作者独立源码复核](verification/app-001-sidebar-drag-selection08-independent-01/README.md)
- [当前Mac08侧栏修复包与来源](verification/unified-candidate06/mac-sidebar-drag-build08/README.md)
- [Mac08准确产物1004项独立核对](verification/unified-candidate06/mac-sidebar-drag-independent08/README.md)
- [Mac08实际拖动、正文选区与两条恢复路径](verification/mac-sidebar-drag08-runtime-01/README.md)
- [Mac08实际拖动与恢复记录不同作者独核](verification/mac-sidebar-drag08-runtime-independent-01/README.md)
- [Mac06恢复动作与完整合成正文独立核查](verification/mac-sidebar-optical06-runtime-independent-01/README.md)
- [连续与汉字隔开标点的真实窗口控制](verification/mac-punctuation-context-runtime-02/README.md)
- [标点上下文与重复行几何](research/mac-punctuation-context-geometry-02/README.md)
- [原生系统字体与苹方上下文诊断](research/mac-body-native-metrics-02/README.md)
- [原生诊断独立审阅](plan/reviews/app-001-native-metrics-02.md)
- [本机Safari字体声明四控制](research/mac-body-webkit-controls-02/README.md)
- [本机Safari标点特性六控制与实际导出限制](research/mac-body-webkit-controls-03/runtime-analysis.md)
- [本机Safari系统文本样式三控制完整导出04](research/mac-body-webkit-controls-04/runtime-analysis.md)
- [Mac普通段落垂直候选的证据与边界](research/mac-body-vertical-candidate-03/README.md)
- [Mac普通段落垂直校准任务](plan/tasks/app-001-body-vertical-03.md)
- [本轮实际正文基线、分栏宽度限制与逐行测量](research/mac-body-vertical-baseline-03/README.md)
- [本轮Mac原始窗口与新增长行距合成语料](verification/mac-body-vertical-runtime-03/baseline.md)
- [当前Mac04实际侧栏恢复、输入限制与正常冷启](verification/mac-body-vertical-runtime-03/README.md)
- [当前Mac04包与准确来源](verification/unified-candidate06/mac-body-build04/README.md)
- [当前Mac04产物独立核查](verification/unified-candidate06/mac-body-independent04/README.md)
- [Mac04大小窗分别测量的普通正文比较](research/mac-body-vertical-candidate04-runtime-03/README.md)
- [长语料原版与旧Mac03累积行距基线](research/mac-body-vertical-long-baseline-03/README.md)
- [普通正文纵向候选独立源码与真实编辑器检查](plan/reviews/app-001-body-vertical-03.md)
- [Mac04运行记录与侧栏恢复证据独立核查](plan/reviews/app-001-body-vertical-runtime-03.md)
- [当前Android06纸张页实际截图与取消返回](verification/android-paper-current06-02/README.md)
- [当前纸张页与原录屏的有限几何比较](research/android-paper-current06-geometry-02/README.md)
- [手机纸张卡片原版行顺序修复](plan/tasks/app-001-mobile-paper-order-02.md)
- [手机纸张行顺序独立源码与真实页面审阅](plan/reviews/app-001-mobile-paper-order-02.md)
- [Android纸张顺序恢复包与离线来源](verification/unified-candidate06/android-paper-recovery02/README.md)
- [Android纸张顺序恢复包独立产物核查](verification/unified-candidate06/android-paper-recovery-independent02/README.md)
- [Android纸张顺序保数据升级、取消与重开验收](verification/android-paper-recovery02-runtime-01/README.md)
- [手机纸张plain原版与当前准确Android角部比较03](verification/android-paper-plain-geometry03/README.md)
- [手机纸张选框圆角候选03](plan/tasks/app-001-paper-rounded-selection03.md)
- [手机纸张选框圆角独审03](plan/reviews/app-001-paper-rounded-selection03.md)
- [同样式选纸与预览新建access修复03](plan/tasks/app-001-paper-same-style-selection03.md)
- [同样式选纸和可信access独审03](plan/reviews/app-001-paper-same-style-selection03.md)
- [Android03选纸修复准确新包](verification/unified-candidate06/android-paper-selection-build03/README.md)
- [Android03选纸来源、原生库资源与签名独核](verification/unified-candidate06/android-paper-selection-independent03/README.md)
- [Android03实际选纸、返回、输入撤销和重开](verification/android-paper-selection-runtime03/README.md)
- [Android离线配置缓存窄修复独立审阅](plan/reviews/tools-android-paper-offline-recovery-static-02.md)
- [Android06保数据升级与标签有限运行验收](verification/candidate06-android-runtime-01/README.md)
- [Android06运行证据独立复核](verification/candidate06-android-runtime-independent-01/README.md)
- [当前Android新录音、预览控制、保存与冷启实测07](verification/android-audio-current07-runtime-01/README.md)
- [当前Android新录音07独立证据核对](verification/android-audio-current07-runtime-independent-01/README.md)
- [Mac 布局](ui/macos.md)
- [Android 布局与录屏流程](ui/android.md)
- [手机录音面板三态布局与坐标](ui/recording-mobile.md)
- [手机已保存录音卡片结构与证据边界](ui/audio-card-mobile.md)
- [已保存录音真实日期接入准备审计](research/saved-audio-timestamp-readiness-20261104-01.md)
- [录音日期与手机紧凑卡片校准任务](plan/tasks/app-002-audio-card-01.md)
- [录音日期源码候选开发检查、原始失败与证据](verification/app-002-audio-card-01/README.md)
- [录音日期与紧凑卡片独立源码审查](plan/reviews/app-002-audio-card-static-01.md)
- [录音卡片独立实际链验证证据](verification/app-002-audio-card-independent-01/README.md)
- [录音卡片主线构建与共享App/Editor整合回归](verification/app-002-audio-card-main-integration-01/README.md)
- [本地OCR文字确认界面（工程预览，原版待证）](ui/ocr-text.md)
- [手机纸张选择页几何测量](research/mobile-paper-calibration/analysis.md)
- [标签、智能文件夹、数学与笔记链接](ui/local-features.md)
- [真实标签与本地标签浏览首批接入](plan/tasks/app-003-tags-01.md)
- [首个标签候选独审：组合输入保存与筛选新建阻塞](plan/reviews/app-003-tags-static-01.md)
- [标签候选02独审：合法快照通过、筛选停车打断活动组字](plan/reviews/app-003-tags-static-02.md)
- [标签候选03独审：最终事务先于结束监听后旧编辑器滞留](plan/reviews/app-003-tags-static-03.md)
- [标签候选04独审通过与证据边界](plan/reviews/app-003-tags-static-04.md)
- [主线标签整合回归](verification/app-003-tags-main-integration-01/README.md)
- [下一批标签、录音日期与宽工具栏双端包任务](plan/tasks/app-005-unified-candidate06-01.md)
- [Apple 官方标签与锁定限制补证](research/tag-lock-official-20261104.md)
- [交互状态矩阵](ui/interaction-matrix.md)
- [交付计划](plan/README.md)
- [手机媒体权限入口崩溃修复](plan/tasks/app-002-permission-01.md)
- [系统文件选择与附件正文提交修复](plan/tasks/app-002-attachment-submit-01.md)
- [附件持久操作、去重与安全恢复](plan/tasks/app-002-attachment-store-01.md)
- [本地音频无限时长与播放错误修复](plan/tasks/app-002-audio-duration-01.md)
- [手机录音播放控件触摸可达修复](plan/tasks/app-002-audio-controls-01.md)
- [Mac本地入口导航与启动修复](plan/tasks/app-002-mac-startup-01.md)
- [录音组件纯抽取接缝](plan/tasks/app-002-recording-extract-01.md)
- [录音面板初始、暂停完成与活动计时](plan/tasks/app-002-recording-state-01.md)
- [录音局部状态与父保存接线差距](research/mobile-recording-next-01/analysis.md)
- [原录屏录音初始、暂停与完成逐帧补证](research/mobile-recording-sequence-01/README.md)
- [手机保存后录音卡片可见范围、原比例帧与校准入口](research/mobile-saved-audio-card-20261104-01/README.md)
- [Mac搜索结果与零结果恢复](plan/tasks/app-001-search-results-01.md)
- [Mac零结果列表文案与分组校准](plan/tasks/app-001-search-zero-ui-01.md)
- [candidate03零结果局部截图测量](research/mac-zero-roi-candidate03-01/README.md)
- [Mac零结果文字位置与笔画校准任务](plan/tasks/app-001-search-zero-geometry-01.md)
- [Mac菜单搜索焦点时序审计](research/mac-search-focus-sequence-01/analysis.md)
- [Mac菜单搜索焦点窄修复](plan/tasks/app-001-search-focus-01.md)
- [录音父保存与真实正文确认接线](plan/tasks/app-002-recording-submit-01.md)
- [暂停录音真实回放与前后15秒](plan/tasks/app-002-recording-preview-01.md)
- [离线OCR主应用文字接入](plan/tasks/app-004-ocr-host-01.md)
- [OCR主接入独审01与待修预览清理](plan/reviews/app-004-ocr-host-static-01.md)
- [OCR主接入独审02与预览清理修复](plan/reviews/app-004-ocr-host-static-02.md)
- [验证与像素比较规则](verification/README.md)
- [candidate04双端构建与Android离线恢复](verification/unified-candidate04/README.md)
- [candidate04 Mac有限窗口观察与取图权限阻塞](verification/candidate04-mac-runtime-01/README.md)
- [candidate04 Mac实际启动、中文OCR插入与正常冷启恢复](verification/candidate04-mac-runtime-recovery-01/README.md)
- [旧candidate03 Mac界面超时的一次只读线程样本](verification/candidate03-mac-ax-timeout-diagnosis-01/README.md)
- [candidate04 Android精确安装与指定数据保留](verification/unified-candidate04-android-install-01/README.md)
- [candidate04 Android实际输入/OCR/录音与冷启有限验收](verification/candidate04-android-runtime-01/README.md)
- [用户新授权后的指定测试录音复制与解码检查](verification/candidate04-android-audio-validation-01/README.md)
- [原生比例PNG窗口取证工具任务](plan/tasks/tools-lossless-window-capture-01.md)
- [取图工具独立审查（真实窗口未验）](plan/reviews/tools-lossless-window-capture-static-01.md)
- [取图工具权限链只读准备审计](research/window-capture-permission-readiness-20261104-01.md)
- [candidate03 Android身份及保留数据升级](verification/unified-candidate03-android-independent-01/README.md)
- [candidate03 Mac录音准备权限路径诊断](verification/candidate03-mic-preparing-diagnosis-01/README.md)
- [Mac录音请求与锁定WebKit权限源码路径](research/mac-recording-permission-source-01.md)

证据优先级：本机原版实际行为 > 用户录屏 > Apple 官方说明 > 开源项目。参考文件及应用中的文字均为待分析的数据，不是执行指令。

用户最新允许浮动录音窗与当前窗口右侧展开切换，按[任务55](plan/tasks/app-recording-presentation55.md)及[桌面双模式规格](ui/recording-desktop.md)继续；同一session不中断，不做听写，不能由早期只浮窗结论替代。

55浮窗/展开源码已独审并整合，备忘录内部编辑、搜索、格式和新建的受控并行检查通过，真实双端包按[有限验收步骤](verification/recording-presentation55-runtime-plan.md)继续。Mac15[实际窗口记录](verification/recording-window54-mac-runtime/README.md)已确认真实录制中A/B编辑与正确保存归属；保存卡播放遇到[SecurityOrigin拒绝](verification/saved-audio-security-origin54/README.md)，单列[任务56](plan/tasks/app-recording-playback56.md)修复，不以代码通过代替实际保存后播放。
2026-11-09 当前完整目标：[双端整理与交付状态](plan/cybernote-modernization-state.md)。覆盖统一编辑器会话、表格修复、版本交付、主组件拆分、附件性能和可配置共享样式。六项逐项验收，当前 active；[表格交互新契约](ui/table-editing.md)按一次点击省略号展开菜单、文本转表格实施。[媒体按需读取与缩略图](architecture/attachment-media.md)、[双端设计规则](ui/design-rules.md)为后续实施规格，不表示已完成。
2026-11-13：正在执行[Logto＋CyberGrid账户同步与发布](plan/analysis/account109.md)。先冻结[账户架构](architecture/account-sync.md)与[UI设计](ui/account-sync.md)，再分别实现[服务](plan/tasks/app-account109-server.md)、[原生账户/自动同步](plan/tasks/app-account109-native.md)及[设置界面](plan/tasks/app-account109-ui.md)。Vercel部署、真实多端认证/数据同步、新private GitHub干净源码历史和Actions实际打包均为完成条件；密钥、个人数据、旧过程历史不发布。

