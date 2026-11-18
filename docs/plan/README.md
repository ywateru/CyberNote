# 交付计划

2026-11-18：当前新增 [CyberBus 迁移计划](cyberbus-migration-20261118.md)，覆盖登录后设备目录与完整同步替换，按 core → account → 独立验证推进。

2026-11-17 最新源码交付：[外观与 MCP 测试程序](../verification/feedback117/README.md)。视觉和测试器已在隔离 worktree 完成实现、修复、独立复审及合入组合命令检查；用户自行 UI 验收。未重打 Mac/APK 包；本轮 worktree/分支已清理。

2026-11-17 当前演进：[项目梳理](analysis/project-review-20261116.md)与[Agent MCP / 多主题 / 双端交互路线图](project-evolution-20261116.md)的111–115实现、独审和组合检查已完成；116已完成准确Mac/Android/MCP产物、命令与真实宿主数据链交付。用户接手UI验收，未测项及NATIVE-BACK-01未修复问题单列，详见[交付报告](../verification/project-evolution/DELIVERY.md)和[验证矩阵](../verification/project-evolution/README.md)。下方旧“当前”描述按各自日期阅读。

2026-11-07 当前：已验收工作整合到本地主分支 `main`，当前 Mac32 / Android21。入口见[根 README](../../README.md)和[文档索引](../INDEX.md)。最新[键盘94](../verification/editor94/DELIVERY.md)、[附件93](../verification/attachments93/DELIVERY.md)、[导入92](../verification/apple-notes-import92/DELIVERY.md)及[同步91](../verification/sync91/DELIVERY.md)均有准确交付记录；旧同步 goal 已完成，下方“active/进行中”等按各自历史时点读取，不代表当前仍在等待这些已交付任务。

## 历史阶段记录

2026-11-06：同步84/85与86 UI并行实施，随后[86生产桥接](tasks/app-sync86-adapter.md)和[87双端验收](tasks/app-sync87-e2e.md)；当前完整goal保持active。

2026-11-06：[持久同步核心84](tasks/app-sync84-core.md)与[认证网络85](tasks/app-sync85-network.md)进入实施，随后接Session/UI与真实双端验收；完整同步目标尚未完成。

2026-11-06：82统一设置与83手机快速画廊已完成本轮限定交付。手机直接画廊、亮黄＋一键输入，设置/数据顶部双标签；主线桌面408/手机9+43+290、受影响组恢复与Mac26/Android构建16准确构建及独立核包通过。[交付和原始失败](../verification/mobile-home8283/README.md)、手机IME/provider及原版整窗像素边界可查，原Android录音现场未动。

阶段记录（交付前，2026-11-06）：[统一设置82](tasks/app-preferences82.md)已通过作者52/50和独审32项并合入源码，无blocking；[Android快速首页83](tasks/app-android-quick-home83.md)现串行开发，最终[组合8283](tasks/app-mobile-home8283.md)一次完整回归/准确Mac26与Android16出包。此时尚未完成83或生成新包。

阶段记录（交付前，2026-11-06）：[Android快速画廊首页83](tasks/app-android-quick-home83.md)等待82独审合入后串行开发；手机打开即画廊、一键新建聚焦、精简编辑，82/83合并回归出包。

阶段记录（交付前，2026-11-06）：[统一设置与数据82](tasks/app-preferences82.md)进行中，按用户第三图合并设置和数据；冻结后独审及主线回归/双端出包。

2026-11-06：[空间总览81](tasks/app-storage-overview81.md)、[图片预览与标题栏80](tasks/app-image-preview80.md)及[组合8081](tasks/app-ui-hierarchy8081.md)限定完成，最终ad3a069f经独审SOURCE-READY、主线356/9+43+197与build/production、Mac25/Android15准确构建/独立核包通过。[交付](../verification/ui-hierarchy8081/README.md)保留中间失败与真实边界；原Android现场保持，本轮3个已合隔离worktree/分支已清理。

2026-11-06：[数据管理79](tasks/app-data-management79.md)已限定完成，[后端](tasks/app-data-management79-backend.md)/[前端](tasks/app-data-management79-ui.md)经独审SOURCE-READY、真实Rust→App成功与失败ACK验证、主线六项及Mac24/Android构建14准确构建/核包通过。详见[交付](../verification/data-management79/README.md)。原Android录音现场不动，原生provider/整窗像素及调试CLI性能波动继续单列。

2026-11-06：[录音标识与对勾保存78](tasks/app-recording-indicator78.md)已限定完成，[独审](reviews/app-recording-indicator78.md)48项及静态布局对照通过，[主线整合](../verification/recording-indicator78/integration/README.md)桌面197/手机9+43+43、build/production全通过。原owner列表和当前实时卡有动态标识，桌面✓采用控制器能力并走真实保存流程。Mac23本地包已构建、派生严格签名及内嵌资源/ZIP独立核对通过；原生运行及整窗像素继续开放。Android76保留、原手机录音现场不动。


2026-11-06：[Mac截图三处修正77](tasks/app-mac-feedback77.md)已完成限定源码/浏览器范围，[独立复审](reviews/app-mac-feedback77-recheck.md)PASS（51+6）；主线桌面148、手机笔记9/录音43/附件43、build/production均自然exit0。移除Mac底部新建按钮、右键按真实坐标限制边界、标题/摘要安全橙黄高亮（连续字距和220px首命中修复）。Mac22本地包已构建且派生严格签名通过；整窗原生像素继续开放。Android原生76继续ready，原录音现场不动。


2026-11-06附件75现已限定完成：[独审PASS](reviews/app-android-attachments75.md)及[主线9命令串行整合](../verification/android-attachments75/integration/README.md)均已归档。desktop100/mobile附件43/录音43/笔记9、protocol18、真实Rust21、build/production全部自然exit0；原设备/原生chooser/整页像素仍开放。[原生76](tasks/app-android-attachments-native76.md)ready为下一优先，使用全新AVD与准确新APK，保留原13秒录音现场。[录音Rust74](tasks/app-debug-recording-rust74.md)复用设施，尚未执行。

2026-11-06最新优先为[安卓版附件75](tasks/app-android-attachments75.md)：用户报告添加附件无法保存及显示问题，正在复现实际手机输入框往返、附件落盘、正文ACK与新进程恢复；原设备约13秒未保存录音现场保持，不进行安装或重启。显示与保存分别验收，见[处理分析](analysis/android-quality75.md)。[真实Rust录音落盘74](tasks/app-debug-recording-rust74.md)等待75的共用设施，未执行。

2026-11-06任务73已限定完成：[主线整合](../verification/mobile-recording-primary73/integration/README.md)全部自然exit0，desktop100/mobile43/notes9、构建/生产排除与24态视觉通过。独审发现的saved-card重挂载竞态已修runner真实metadata等待，旧失败保留；视觉依赖扫描提速复验通过，非CLI全局性能保证。完整产品目标继续进行。

2026-11-06准备阶段（已由上方整合结果更新）：[手机中央录音控件73](tasks/app-mobile-recording-primary73.md)当时在独立工作树开发，保持既有录音逻辑，按原视频稳定三态校准并量化同尺寸视觉差异。[重命名研究72](../research/saved-audio-rename72/README.md)已合入，[独审](reviews/ref-saved-audio-rename72.md)确认报告准确；原版AX拒绝导致名称交互未取得证据，任务保持in-progress / ORIGINAL-OPEN，不将源码方案当成功能交付。

2026-11-06任务71完成：[独立最终复审](reviews/app-mobile-debug-recording71-recheck.md)与[主工作区整合](../verification/mobile-debug-recording71/integration/README.md)均通过，desktop100/mobile recording42/mobile notes9，构建和生产排除通过。三项独审阻塞已用真实故障/超时/参数负例关闭，旧blocked与两次失败不改写。默认JS fixture与合成媒体边界保持；完整Mac/Android原生及原版像素仍进行。

2026-11-05任务70已完成：[整合报告](../verification/app-debug-automation70/integration/README.md)记录单命令九组91项全部通过、27.369秒CLI计时，以及构建/生产排除结果；[独立复核](reviews/app-debug-automation70.md)八门槛PASS。后续常态回归按[调试使用说明](../debugging.md)运行，catalog可达性与实际执行覆盖分别记录。

2026-11-05最新工作：[统一调试命令与HTML程序化验收70](tasks/app-debug-automation70.md)，按[测试策略](../testing.md)使用真实App和模拟设备/音源，默认隔离合成数据，生产不提供调试入口。Mac21实际有限结果见[记录](../verification/mac-recording-quit68-runtime/README.md)；主窗关闭/Dock和整体像素仍未授予通过。旧时点“21准备中”已被本次构建与有限运行记录替代。

2026-11-05：最新要求为主窗口右侧唯一非模态录音栏。66侧栏、67首次媒体读取已合入；68菜单/CmdQ与69普通原生退出桥现已独立复核并整合，见[组合审查](reviews/app-mac-recording-quit6869.md)，结论 SOURCE-READY / RUNTIME-OPEN。准确新Mac21准备中；真实退出后原笔记完整录音及另一笔记最新正文仍须实包验收。[Mac20真实记录](../verification/mac-recording-media67-runtime/README.md)的首次授权超时及CmdQ后K缺卡保持历史失败，不能由受控测试追认为通过。Android约13秒原现场完全不操作；旧Mac18约3秒内存现场进程已不在，原因/时点未知，不能称保全或恢复。整体像素与音质仍开放。

历史64状态：2026-11-05用户最新反馈：[Mac录音暂停/关闭自动保存64](tasks/app-mac-recording-autosave64.md)首版通过已测受控边界并合入、生成Mac18，但[实际暂停保存失败](../verification/mac-recording-autosave64-runtime/README.md)，**MAC18-RUNTIME-BLOCKED**。保持in-progress，继续实际App/Host恢复等待与投影边界修复，新3秒录音保留，首版独审不覆盖这个真实失败。手机原现场保持，见[分析](analysis/mac-recording-autosave64.md)。

用户已授权完整 Mac 与 Android 开发。此计划持续执行，不以文档完成替代应用完成。

2026-11-05[Mac授权诊断63](tasks/app-mac-recording-diagnostics63.md)已独审并[主线接收](../verification/mac-recording-diagnostics63-root-integration/README.md)：默认关闭的有界阶段事件及结构化错误保全，首同步输出阻断已修为64槽非阻塞producer与独立writer，保持原单pending/截止/资源语义。源码/假OS/堵塞sink通过，真实采集仍open；未入当前包，不触手机。[原版已保存音频菜单62](../research/saved-audio-menu62/README.md)已留证，追加/改名等功能尚未实现验收，不混入63。

2026-11-05[手机录音波形60](tasks/app-mobile-recording-wave60.md)已完成局部源码独审并[合入主线](../verification/mobile-recording-wave60-root-integration/README.md)：游标/标签可见改善、完整axis边界及窄高真实触达通过，root typecheck/build通过。后续[Android构建13](../verification/unified-candidate06/android-recording-wave-build13/README.md)准确a236b311已生成并独立核包通过、未安装。保留PIXEL-OPEN及作者9像素微小桌面残差，不触原Android现场。58/59旧包身份保持，不追认60进入旧包。

2026-11-05最新录音开发包：Mac17保持fa21657的333产品/352输入，手机更新为Android构建13/a236b311的334产品/353输入（含60、不含63）。此前[58/59双端准确构建](../verification/unified-candidate06/recording-visual5859-preparation/README.md)保持历史身份。[Mac17有限实际复验](../verification/recording-visual5859-mac17-runtime/README.md)覆盖未采集同会话双模式、正文编辑/撤销重做/B搜索/侧栏恢复与保存音频播放/暂停/±15秒。没有新Start，持续收音/采集中双模式/原版全像素仍open。Android13未安装，用户明确保留旧13秒File现场并暂缓设备验收，继续禁止原设备/音频操作。以下时点记录与旧任务结论按各自固定包读取，不能追认为最新包的全部通过。

2026-11-05当前交付为同一d742307产品源的Mac12与Android07：[有限根接收29](../verification/name-mobile29-root-acceptance.md)。准确核包分别494/391项、实际证据独审496/711项通过；侧栏两入口恢复与正常重启偏好、Mac名称操作、手机可见加号及局部几何实际验证通过。Mac文字/选区/环角、手机右下图标及整体像素仍开放；原版删除实验暂停。安装文件见根README当前交付。

2026-11-04 智能文件夹下一批：先执行 [D1本地库防损](tasks/app-smart-d1-storage-open09.md)，再以 [D2真实标签/置顶规则与归档](tasks/app-smart-d2-durable-rules09.md) 接入真实存储，之后完成通知/保存所有权及两端UI。用户选择暂不开展原版删除实验；引用目录删除语义保留待验，继续独立开发，不以静态表单替代功能。既有Mac08侧栏恢复与拖动修复保持交付。

| 任务 | 当前状态 | 交付 |
|---|---|---|
| APP-MOBILE-DEBUG-RECORDING71 手机录音命令验收 | done（限定源码/浏览器范围） | 修复330da9f4独审与主122e5075整合通过；桌面100/手机录音42/notes9、构建/生产排除；原生/Rust/像素继续开放 |
| APP-SMART-D1 本地库防损 | done（源码范围，独立pass） | de3c07f严格旧格式、识别版本优先、原子初始化；不代表新平台包 |
| APP-SMART-D2 真实智能规则与归档 | done（内部源码能力），9bdc441独立pass | 标签四模式/置顶、CAS、同快照、DB2/归档3与旧UI门禁；唯一名称P2修复，作者69pass/独立窄2pass；公开UI、新包/像素仍待O/U |
| APP-SMART-O 元数据顺序与保存所有权 | done（源码08d2206），独立pass | 最终Rust78/0/3ignored、AccessGate16/0与前端/宿主编译通过；独审最终源10项Rust+8条不同bridge/挂载路径，提交后正文撤权/旧ACK/同seq权威重读通过，实际IPC/设备/像素不外推，U门禁保持关闭 |
| APP-SMART-U 两端智能界面 | in-progress，Mac10/Android06有限运行独核pass，整体partial | de372准确包来源分别470/385项独核；runtime18关闭false回填及手机错误/长按选字已观测缺陷；普通Mac实际800×414，剩余表面/焦点及完整离线规则/手机未知状态/像素open。原版删除实验暂停，后续侧栏隐藏偏好差异另修 |
| APP-MAC-FOLDER-FORM-GEOMETRY15 普通新建表单 | 实包有限几何pass，像素partial | 80b01da整合，Mac10普通包络800×414、普通↔智能名称保持/取消有实际记录及62项静态独核；研究19表面/角部/checkbox/焦点/字左缘仍有差异，进入20 |
| APP-SMART-DRAFT-HYDRATION16 置顶false回填 | done（false回填窄范围） | 一行显式value→pinned，源码独审329断言；准确双端runtime18改名/新PID重开false保持，Android置顶成员1→0→1恢复，不同作者有限独核pass；原失败保留，无全部规则/像素claim |
| APP-MOBILE-17 错误可见与目录选字 | done（两项已见缺陷范围） | 三文件源码独审71，Android06实际长按目录无选字/正文仍可选/滚动错误可见与合法重试取消；83原文件/37 PNG/99静态检查独核pass，工程错误样式非原版像素PASS |
| APP-MAC-ORDINARY-SURFACE20 普通表单表面与角部 | done（有限表面范围），Mac11实际/独核通过 | 准确94fbbb36/3cc7188d新包486项核包、运行23及202项证据独核；量图25平坦色对齐/角差304→8/checkbox实际mask616→8，800×414保持。名称/焦点/标签/字形与全像素仍open |
| APP-MAC-SIDEBAR-PREFERENCE22 侧栏显隐偏好 | done（有限偏好范围），Mac11实际/独核通过 | 单键本地settings及首次可信恢复；运行23两入口/动态菜单、hidden/visible各正常与紧接CmdQ恢复通过，PID45493→45907→45957→46007→46056/exe同SHA；202项静态独核。无内部ACK/任意退出保证/新增CmdQ握手，全像素与多窗仍open |
| APP-MAC-ORDINARY-NAME-FOCUS26 名称焦点/选择/对齐 | runtime-verified，像素partial | Mac12准确包494项核包、实际496项证据独核；默认/部分选择、真实输入/往返/取消、侧栏两入口及正常重启显隐保持。bbox对齐/灰内边0，文字仍偏淡、选择色/环角有差；跨应用重激活未验，父目标active |
| APP-MOBILE-FOLDER-VISUAL28 手机文件夹局部视觉 | runtime-verified，像素partial | Android07准确包391项核包、实际711项证据独核；保数据安装/可见plus触摸/导航Back/长按及COLD启动可见保持。局部几何接近原帧；右下中心差−1.733及非目标ROI变化保留，不授整体像素/iOS结论 |
| APP-MAC-ORDINARY-TYPOGRAPHY31 普通表单文字绘制 | source-reviewed，准确Mac13待验 | 独立312项、三次fresh WK及27项索引通过；两个浅色ordinary局部smoothing:auto改善三ROI，布局/输入/checkbox/范围外保持，真实新包仍待后续 |
| APP-MOBILE-COMPOSE-ANCHOR34 手机右下新建锚点 | source-reviewed，准确Android08待验 | e194753局部右padding17→14，不同作者fresh真实App命中条带/有限隔离及ROI通过；实际07平移207.978仅模型，路径形状与整体像素仍open |
| APP-MAC-KEYBOARD-POLICY35 Mac键盘导航系统策略 | source-reviewed，主线已整合 | 六插件路径经独立86项及31原生有限检查通过、21/28证据索引核准；实时系统策略不改DOM/Option，准确Mac13焦点与实际AppKit送达待验，原版Option-TAB差异仍open |
| REF-001 原版取证/需求/UI/调研 | in-progress | 原视频已保全、抽帧、初始规格已写，持续补证 |
| APP-001 跨端完整实现 | in-progress | Mac .app 与 APK 已构建；基础编辑/重启已独立通过，归档/功能/像素仍阻塞 |
| QA-001 独立验证 | 首轮blocked，源码0870d04 | 普通Mac/Android保存重启通过；归档损坏、功能与像素阻塞见qa-001-01报告 |
| APP-001-FIX-00 归档完整性 | verified，独立pass | 原失败、schema跨检、设置/附件保全与六次进程中断恢复通过；见fix-00-02报告 |
| APP-001-FIX-01 编辑与导航修复 | 本轮P1/P2关闭，完整矩阵partial | 最终0d8b245纸张入口、恢复输入与一次冷启独立通过；未覆盖行为与像素继续保留，不标整项verified |
| APP-001-FIX-02 Mac顶部校准 | in-progress，217133a独立blocked/有限功能通过 | 34223af正式Mac4118f77f…/APK0aac2d73…；搜索续输/Undo归属/格式选区/多窗/基本锁态隔离/画廊分栏及Android冷启有限通过；CmdW和公共失活像素仍P2 blocking（独立74.55%），同位置焦点unknown，完整任务未通过 |
| APP-001 原生顶部模块 | 9f4d61b历史有限静态pass，34223af正式宿主已接入 | 当前插件锁对齐2.7.2，并修正搜索祖先临时隐藏导致丢焦；4a16a6a不覆盖新增输入。正式生命周期/焦点/窗口路由由本轮独立复验，Mac真marked composition及完整像素状态仍unknown |
| APP-001-FIX-03 锁定跨窗失效 | 本轮双端有限安全门槛pass，完整矩阵partial | e5fcdc4 Android14断言关闭UUID P1；835751d真实Mac生产Q1/Q7与同源proof15断言，含旧基线冲突/副本冷启/Q2排空/Q3abort/Q4拒绝及恢复，无新P1；S3/四fixtureGUI/对象identity/全矩阵仍unknown，允许FIX02接入 |
| APP-001-FIX-04 Android长停留中文组字 | in-progress/partial，4998e2b独立有限主路径通过 | f3071f3/APK d5c6f59b…；独立空段73.53s/中部77.80s、快速/删除/同Trime混输及一次COLD完整JSON六条通过，原设置恢复；历史格式/后台观察及报告保留，当前归因依FIX06新增平台证据调整，选纸P2继续FIX07；未标整项通过 |
| APP-001-FIX-02-VISUAL-01 顶部内部内容 | in-progress，56d7e05长查询滚动与新快捷键独立7项有限通过 | c13fc4f记录5a5669f+444f03b正式包OptionCmdF、旧ShiftCmdF不触发搜索、续输、实际长尾/回头/追加/clear通过；不覆盖原版查找替换、marked IME、全窗口。蓝色焦点仍FAIL；ec1包1392宽同位置Fill公共ROI MAE8.1027/变化67.83%仍FAIL，不与历史1088宽ROI比较；6c155旧长查询失败记录保留 |
| APP-001-FIX-05 Mac关闭窗口 | in-progress/partial，ec1cf0d三条关闭与一次编辑冷启独立通过 | f3b8a22记录正确目标关闭且另一窗/同PID保留，真实编辑关闭后完整JSON与冷启持久记录相等；未捕获pending时点，保存失败/冲突、末窗退出原因及全生命周期仍unknown；顶部像素另行阻塞 |
| APP-001-FIX-06 Android组字失焦/导航 | in-progress，fa1cdb5平台对照/8b9d6af独立复核完成 | 同Trime普通contenteditable失焦、原生EditText藏IME均同现ni hao‸，现证据反对应用盲目回滚/删字符；旧格式/后台观察与历史报告保留，原版精确语义、导航隔离与宿主存储保全仍unknown；输入设置已恢复，未改产品 |
| APP-001-FIX-07 纸张保存返回选区 | 原选纸P2有限关闭，完整任务partial | 4e2adbd独立复验5c46536/APK5dd6dfc8，取消/grid-large/重开Back均保选区、全文、Editor/View/DOM及父key；自身保存/Home恢复/COLD完整Rust正文与纸张通过。开发真实Store外部变化仅独立只读复核；Undo首步无正文变化unknown，原版/真实第二窗/完整矩阵未通过，旧e117失败保留 |
| APP-001-PAPER-PREVIEW 手机纸张页 | 主1fa9170，dba83641独立七态/短屏/选区有限通过 | android-independent-01记录六mask实际可见、七态原生选择保存重开、全文/selection/真父key与Editor/View/DOM保持，短屏真实滚动末卡可点save，分辨率恢复。低清录屏高清像素/iOS非零安全区未知；不跨后续包追认 |
| APP-001-SEARCH-RESULTS Mac搜索结果 | candidate02显式搜索F07独立有限通过，快快捷键异常/像素未关闭 | 源b144c6e独立static-02；sealed5e948ad9实际unique→zero→clear/禁用/正文UndoRedo通过，严格DOM/Editor/View全程同、A隐藏不可写后恢复。快速OptionCmdF后立即paste一次落正文，已Undo恢复、原因unknown另查；零结果文案/分组仍与原版不同，公共ROI差异非整页且窗口尺寸不同。旧56d7正文残留/11dcbfc4白窗保留 |
| APP-001-SEARCH-ZERO-UI-01 Mac零结果列表 | in-progress，源f992b90独立SOURCE-READY、主edafd3a/59c94c5 | 以真实成功加载事实确认“搜索 / 无结果 / 备忘录＋分隔线”。旧e7首次订阅失败误判P2在独立真实启动重放关闭，5+16+7+12与主build/启动/展示通过，5源码hash同。candidate03已独立显式zero→clear/禁用/正文恢复有限通过；原版旧同尺寸图与新包尚无合法整窗同态pair，像素unknown；蓝金焦点/快快捷键仍独立未关闭 |
| APP-001-SEARCH-ZERO-GEOMETRY-01 零结果文字校准 | in-progress，源47d4446独审SOURCE-READY、主1665dfd | 两产品hash同；仅有侧栏三栏可信零态标题左1/下2pt、副标题左1/上1pt、分组上1pt，divider保持；独审展示16/toolbar13/typecheck/diff通过。700只是候选，Chrome三字重图相同；原生字形/像素待candidate04，旧局部图不构成整窗pair |
| APP-001-WIDE-TOOLBAR-GEOMETRY-01 宽三栏工具组 | 源c050641独审SOURCE-READY、主23492e8；真实窗口待新Mac包 | 唯一toolbar.m与冻结hash相同。独审44生产几何+1045额外矩阵、严格clang和toolbar13通过；root核17证据875379B，aggregate 1baefdb8…。仅七动作/无overflow三栏325pt搜索cap和两处等分余白。非原版内部frame或像素通过，未进candidate04 |
| APP-001-WIDE-TOOLBAR-RUNTIME-01 Mac候选05 | built，05实际搜索/菜单/zoom/画廊及视觉冷启有限观察；完整任务partial | sealed可执行c4a433e1…；runtime02记录三行合成正文、unique→zero→clear/禁用、格式popover、侧栏隐藏恢复、原生zoom宽/小窗、画廊展开返回及列表恢复。CUA CmdQ后首次pgrep因sysmond不可用exit3保留，精确旧PID70803的ps无输出exit1；同完整05路径新PID72706/同hash冷启后可见三行相同。仅视觉正文跨进程恢复，未读完整JSON/DB或跟踪ACK。原图均JPEG，局部几何工具组位置近似但正文仍有差异；连续resize/拖窄、PNG授权/材质/同屏位置与全像素unknown。旧未启动/认证受限历史保留；不重建Android，不含标签/录音日期 |
| APP-002 媒体闭环 | in-progress，candidate03 Mac附件保存/冷启有限通过、录音准备阻塞 | c6594db sealed新包实际picker插txt/png→Rust正文revision3/两引用→owned同SHA→正常退出冷启恢复通过。录音UI一直preparing后取消，无音轨/正文ACK；附件打开工具超时unknown，无新pixel pair。旧Android播放/transport有限结果见子行，完整媒体与绘画未完成 |
| APP-002-PERMISSION-01 手机媒体权限入口 | 主ff6b93a，dba83641独立已授权取消有限通过 | 998de4b静态9项通过；0505534首次Deny无包装弹窗/12秒存活、Allow带包装实际采集及App冷启由独立只读核原始证据；2326c75独立实际无包装进入/12秒/取消与真实资源清理。未重置系统权限。仅关闭已实测子集，不跨3edc4ad0新包追认；同canonical旧Finished无loadID、有效CSP/frame和可听音轨仍unknown |
| APP-002-ATTACHMENT-SUBMIT-01 附件提交 | in-progress，源d81dd57独立SOURCE-READY、主c793166/01aada6 | 旧607950a取消P1在新源独立实际App8+新增3及23模块中关闭；等待真实run/FileReader/IPC终态前保留身份。8源码主整合hash相同，主build/23+8回归通过。真实系统选择器/正文ACK/冷启/预览待新包，旧孤儿失败保留，不以source-ready结束整项 |
| APP-002-ATTACHMENT-STORE-01 附件持久操作 | done（仅模块），源4d5898f独立SOURCE-READY、主42b2631 | 独立14项真实附件/六次exit78及Session11通过，原六Rust主整合hash一致；真实窗口incarnation/持久身份/查询去重/窄补偿/冷恢复已提供，旧store入口保持。前端pendingDocs/正文ACK与系统选择器仍由父任务负责；当前统一包不含此模块 |
| APP-002-AUDIO-DURATION-01 音频卡片时长 | 3edc4ad0独立真实1:06/初始暂停/播放暂停有限通过 | f4d3a02独立审查通过生产helper11组及真实AudioPlayer/离线Chrome156：原WebM探针66.004秒、主初始0暂停、有限WAV不建探针、错误/重试/晚事件清理；不重编码原文件。216项输入前后不变，APK3edc4ad0…；Android91独立媒体revision30/429547B原SHA保持，真实1:06/初始0paused与play-pause通过；展开不可达，跳转/冷启/Mac未验，非可听采集/像素通过 |
| APP-002-AUDIO-CONTROLS-01 手机播放控件 | APK a50dded8开发真实transport通过，独立native动作BLOCKED | 主ae35bc3/41131ae源8893bed独立SOURCE-READY，candidate02的219输入同；Android91原生标题展开/play-pause/range29→44→29/两端0..66.004/收回无IME通过，全文/revision/附件原SHA保持。54项manifest已冻；末端平台duration由Infinity变66.004/HTMLstep值66分别记账。独立只读确认安装/原字节/完整filtered Store不变，headless模拟器无可绑定CUA surface，镜像有界尝试后停止，未执行native动作；旧3ed失败保持，原版展开手势及像素unknown |
| APP-002-MAC-STARTUP-01 Mac入口加载 | sealed5e948ad9独立实际有限通过 | fabafcf确切包/219输入核同，启动显示tauri://localhost/三栏/原生顶部；显式搜索unique→zero→clear/禁用/正文UndoRedo与严格DOM/Editor/View同一有限通过。72项Mac证据已冻结；快速快捷键粘贴异常与公共ROI像素FAIL保留。旧11dcbfc4白窗仍为旧包失败，不追认当前主树 |
| APP-002-RECORDING-EXTRACT-01 录音组件接缝 | done（仅抽取），源966ba7d独立SOURCE-READY、主63603d1 | 实际App中RecordingPanel纯抽取，完整组件/props/父保存/周边字节等价；独立typecheck/26cleanup通过，主两个产品文件与冻结同。不修初始自动录制/暂停完成/正文ACK，不追认旧包已含此模块 |
| APP-002-RECORDING-STATE-01 录音面板状态 | done（仅模块），源12b94d7独立SOURCE-READY、主784a1e8 | idle显式开始/单调活动计时/暂停直接完成/同File失败重试，独立实际Panel+Session受控17与原26通过，主11输入字节核同且pnpm build通过。原物理触点unknown；未接父正文ACK、设备有效音轨/完整回放/转写/像素，开发diffcheck原日志空行已更正记账 |
| APP-002-RECORDING-SUBMIT-01 录音父保存 | in-progress，源8ee0111独立SOURCE-READY、主6ebacbe | 两入口同原目标/票据与operation，正文ACK前reject保留File、ACK后关面板且刷新单列；取消等待真实run并保全pending，唯一close监听复用。独立20+23+8+26及新增5组通过，主2源码hash同/build/父20/搜索5+16通过。真实录制/正文ACK/冷启/可听与像素待统一candidate03，不以受控源检查追认旧包 |
| APP-002-UNIFIED-C03 统一新包 | built，Mac附件/冷启与Android保留数据升级有限通过 | c6594db冻结232输入499805fa…；zip800b7fb1…/APK bd29ae0b…已保存。Mac真实picker/两附件正文ACK/owned字节/正常退出冷启通过，录音preparing未采集；Android replace安装后实际base.apk同，三指定合成行/附件/SQLite及WAL字节不变，未启动或执行交互。root复核Mac49及Android9证据；整窗像素、可听录音及新包Android交互未通过 |
| APP-002-UNIFIED-C04 统一新包 | 双端built；Mac实际OCR/正常冷启及Android输入/OCR/录音冷启有限pass；像素未验 | Mac d8f832e/ZIP6a821684…、Android3d55dba/APKbbc4c1a8…。Android实际键盘保存、系统选图OCR、新26秒录音保存/force-stop冷启/新旧卡片播放控制pass，原三行/旧附件/音频保持；root核159文件6615140B，aggregate73472a82…。旧导出拒绝原样保留；用户新授权后仅指定音频同SHA本地复制/完整解码26.46秒/非零通过，root核14文件200087B、aggregateb4779c60…。峰值−80.93dB/RMS−102.55dB极低，可听或有效收音unknown；正常退出/首次离线未证。Mac04原27证据OCR/正常冷启有限pass保持，录音未验。当时PNG权限已获同意但工具未实际授权；11月4日用户选择Computer Use，后续不继续helper授权，整窗像素pair仍未得 |
| APP-002-RECORDING-PREVIEW-01 暂停回放 | in-progress，源e01c90a独立SOURCE-READY、主e9e426f | 原P2重载就绪门禁关闭；独立repro/恢复4/模块16/有界提交后Panel25通过，原脚本两次时点失败保留非阻塞。主6源码同/build/preview16/父20通过；candidate03不含此实现。WK/Android真实前缀可播/可定位/可听与像素仍待后包 |
| APP-001-SEARCH-FOCUS-01 Mac菜单搜索焦点 | in-progress，源d9bc5a4独立SOURCE-READY、主175cd1f | plugin精确MenuEvent同步请求真实唯一focused main当前enabled绑定，与IPC共body；独立与主cargo13/13通过、两产品hash同。无新包快输入/marked text实测，异常原因unknown和Tauri排队仍保留，不承诺已修复 |
| APP-003 本地高级功能 | pending，依赖APP-002 | 标签/智能文件夹、数学/笔记链接、Markdown/PDF与类型浏览；分步实施验收 |
| APP-002-AUDIO-CARD-01 手机紧凑录音卡 | 源9303b48独审b477f79 SOURCE-READY，主线4dbdbd整合回归通过 | 首次实际start日期贯通同RecordingResult/票据/operation/受权read/归档1与2；独立Rust47+额外5/Session权限8通过。主线238产品/11改动脚本逐字同冻结；build、schema96/access16/toolbar13/OCR37、Panel到准确Rust5/卡片8、当前App/Editor标签浏览27/保存11与53条/组合12与170条Store action通过，CLI身份分列。仅源码及列明受控链通过，新包/有效音轨/设备冷启/原版取时与像素仍unknown；见audio-card-main-integration-01 |
| APP-002-AUDIO-RUNTIME07 当前Android新录音闭环 | 准确d6350a APK实际有限通过；不同作者有限证据PASS已封存 | 仅QA-AUDIO-20261104-07真实开始/暂停、41.714秒预览播放暂停与±15秒两端边界、继续录制后暂停并完成保存；卡片日期2026-11-04 19:52、2:03和798500B新附件在正常重开与强停冷启保持。19635→21594且旧两附件元数据保持；同克隆固定正文ROI零差异。独审97作者文件/104输入/7预览与3卡片样本、604800像素ROI全部重算一致。续录活动态完成禁用的29–31预期失败保留，33才实际保存。最终媒体duration Infinity、最终编码精确秒数与可听unknown，无音频导出/DB读取，不代替原版像素对照。见android-audio-current07-runtime-independent-01 |
| REF-SMART-FOLDERS-RUNTIME-01 原版智能视图 | in-progress，01/03/07封存；07有限事实已独审；删除与引用生命周期未知 | A/A1/B样本已有目录/PIN/搜索/新建观察；03另实存A+B token三条/改名、A外B置顶任意三条/全部一条、不含A且置顶仅B，智能移动目标存在disabled。07正常退出70207后新PID86322，同定义/两结果保持；QA前缀可见候选仅物理A/A1/B、草稿取消后原定义保持。输入及误菜单失败只有作者回顾，独审不冒称原始动作证明。未实际移动/删除，无像素PASS，克隆智能查询尚未实现 |
| APP-003-TAGS-01 真实标签 | in-progress，候选04独审SOURCE-READY、主b598a74整合通过，设备待验 | 37ee2bd的12产品aggregate438a0cc3…逐字合入；独审12场景159 action关闭旧02活动组字丢输入和03结束后旧编辑器滞留。主build/schema96/access16/toolbar13/OCR37/标签27/save-boundary11（53 Store action）/composition12（170 action）/Rust指定1例通过；3次监听EPERM原日志保留、独立run02成功。root核68证据2517706B、aggregate632a5664…。历史失败保留；未进安装包，原生IME/native IPC/Session及像素unknown，不关闭父任务 |
| APP-004 离线扫描与文字识别 | pending，依赖APP-002 | 真实相机/文稿裁边/多页PDF、随包中文OCR、Mac本地Vision；未实现 |
| APP-004-OCR-HOST-01 OCR主App文字接入 | in-progress，主cd7c94e，04双端单图实际OCR/正文冷启有限pass | 源5b707ae独审02及主接线保持。Mac本地fixture三行中文识别→插入→正常CmdQ→新PID完整正文恢复；Android系统picker选同图→三行识别→插入→force-stop新PID完整JSON恢复通过，实际插入位置/空首段及末行空格差异已记录。内部session ACK未直接追踪、未强制断网；完整矩阵/320图/像素unknown，完整文稿/PDF另批 |
| APP-004 原生模块 | ec6b6dc运行修复独立通过，待接入 | 首次离线中文OCR、透视/两页PDF、10项路径边界独立通过；原目录P1关闭，主App/实体相机/noGMS/像素仍未验收 |
| PARITY-001 修正差异 | pending，依赖顶部/媒体/本地功能/扫描接入 | 逐页几何、菜单、手势/动画、字体与材料校准；明确原图/叠图/差分和未知项 |
| APP-005-UNIFIED-CANDIDATE06-01 双端候选与Mac侧栏补包 | built，双端有限运行已独核，整体partial | f18源Mac06/Android06已构建；Android06保数据升级、ASCII标签保存/筛选/强停冷启及旧未知日期录音卡有限通过（166记录断言）。Mac菜单包b5063fd/731695ca…的画廊与侧栏验收保持；当前运行正文包a90e55f/b3c9013f…另见下一行。不同来源逐包保留，不能追认为同一APK源码或全像素/全部新元数据设备验收 |
| APP-001-BODY-TYPOGRAPHY-01 Mac普通正文尺寸 | in-progress，源码独审通过，build03/同文有限运行完成 | 仅Mac主窗顶层p实验13px，受控CSS排除Android/独立窗/结构块；a90e55f准确新包产物929项独核。PID88780→正常退出→89698后人工重选完整corpus、侧栏按钮/菜单回归通过。07↔03同画布JPEG前三行宽差+1/+2/+2、高度相同；标点+74宽差和首行提前4仍未修，保留实验继续校准，不判像素通过 |
| APP-001-SIDEBAR-RESTORE-01 桌面文件夹恢复 | done（本次功能故障范围），整窗像素仍open | 菜单补包实际列表工具栏/菜单、画廊与冷启通过；最新Mac04 exe db921823…再次实际两条恢复路径通过，QA正文/计数保持。隐藏后保留左上直接按钮、菜单动态文字同原版。JPEG非像素通过，连续窄窗/完整焦点与DB未全验 |
| APP-001-SIDEBAR-MENU-LABEL-01 侧栏菜单状态文字 | done（主窗状态文案范围） | 源8bfeb43独审72ad237 SOURCE-READY；准确b5063fd新Mac实际可见“隐藏文件夹”/隐藏“显示文件夹”及菜单恢复、画廊与冷启通过。独立源码16/host/guard1与实际记录28有限通过；独立窗口真实焦点与整窗像素未认证 |
| APP-001-SIDEBAR-VISIBLE-GEOMETRY05 可见侧栏按钮 | 准确Mac05已运行、两入口与冷启再切换通过，局部像素仍partial | 源0b9604…/HEAD093986d新包333b356a…933项产物独核；真实top/menu隐藏恢复、228→208→228与正常退出后再切换成功，正文257码点保持。去共同胶囊/黄色且右锚随宽移动；独立JPEG仍见folder(-3,+2)px、toggle(-1.5,+.5)、隐藏面72vs80px与色深差，进入06。重启回visible不宣称隐藏状态持久化，非整窗像素PASS |
| APP-001-SIDEBAR-OPTICAL06 顶部光学与隐藏面 | 限定实施完成，像素partial | 源09fee3e/准确Mac06 f69b9e…经975项产物独核；实际新包按钮/菜单恢复、拖动后复位与正常冷启再切换成功。独立JPEG文件夹框重合、隐藏横差−9→0/背景约80px，仍切换半像素轮廓、标题上4px和今天上8px；保留open，不授全像素PASS。11–13冷启快速备忘录/未有效隐藏排除，14–16才为QA再切换 |
| APP-001-LIST-HEADING07 普通列表标题与首日期 | SOURCE-READY，准确Mac07实际记录176项及局部量图独审完成 | 源8614d78/新exe0de1ab…、ZIP92c1ff…经1002项产物独核；实际94925正常退出后95696重开同SHA。按钮及动态菜单恢复在初次与冷启后均通过，QA257全文/7计数/14:19可见保持；17错误拖动选空目录排除，19才实际边界左移40px、20复位，19底部与20日期/列表选中文字局限保留。三栏标题11/27及首日期15.25/top9.5已实包展示；作者与独审WK160字框57×28/y130/div183局部一致，ink/灰/其他阈值仍open。实际图像另核，不授完整像素PASS。见mac-list-heading07-runtime-01、runtime-independent-01与runtime-analysis-01；拖动副作用由08修复 |
| APP-001-SIDEBAR-DRAG-SELECTION08 分隔线拖动选字 | done（侧栏拖动误选范围），实包CUA与不同作者有限独核通过 | 仅ResizeHandle pointerdown取消默认行为，宽度/capture/结束算法保持；源845f123、exe9de099…经1004项独立产物检查。实际侧栏及列表各往返，未新增界面选字，ABCDE正文选区保持；初次与正常冷启后按钮/菜单恢复通过，原始45文件/51输入独核保持，18正常AX全文257码点一致，旧07蓝选失败作为正控保留。Android不重建，完整像素仍open |
| APP-001-PAPER-ROUNDED-SELECTION03 纸张选框圆角 | 新APK与设备有限通过，完整像素partial | 093986d新APK d6350a…独立882来源+原生库内Brotli资源逐字节/签名门槛通过，install-r保数据；grid-large/plain实际四角圆角可见，旧方角同设备图保留。全部七态/录屏高清像素仍unknown |
| APP-001-PAPER-SAME-STYLE-SELECTION03 同样式选纸 | 新APK与设备有限交互通过，内部identity/revision未实证 | 源6eff8…经源码独审，新APK d6350a…真实plain/grid-large重复选纸保留Beta蓝选区，临时输入undo（grid另redo/undo）、system Back、正常完成离开重开保存通过。测试字符已删除、Alpha粗体Beta Gamma与grid-large恢复，日期随实际输入更新18:54。无WebView/DB注入，未声称内部PM对象/history JSON或零revision写 |
| APP-001-MOBILE-PAPER-ORDER-02 手机纸张顺序 | 有限顺序缺陷关闭，完整选区/像素partial | 仅重排mobile选项，源码与真实App独审通过。recovery02包843e0c01…独核881断言并实际install -r；原QA正文/可见粗体/日期与grid-large保留，新7卡顺序同参考，取消/重开仍grid-large。未点卡、未新验保存/选区JSON；旧新Chrome首plain均移选区观察保留，不扩张为七态原生或像素通过 |
| APP-001-BODY-VERTICAL-03 Mac普通段落纵向 | partial，Mac04实际纵向改善，宽度/输入仍open | b2f3570仅全p守卫17px与2pxpadding，开发/独审各72受控检查通过；准确62244d4包db921823…独核929断言。完整窗口20Ag与原版逐行对齐、两空段推进102，长段起点改善6图像像素，wrap保持旧clone；连续标点/Latin阈值与宽度分栏差异保留。直接中文键入两边失败，不能称IME或整窗像素通过 |
| REF-MAC-PUNCTUATION-CONTROLS-03 标点特性 | 有限运行完成，无可用产品修正 | Safari六组摘要宽度与推进相同；trim不支持，chws/palt仅语法支持。18块AX均512字符截断、JSON不能解析，聚焦/多行导出无改善；不声称computed或特性实际应用，不据此加入无效CSS |
| REF-MAC-BODY-WEBKIT-CONTROLS04 系统文本样式 | 实际Safari完整短JSON独立解析，无可用字体修正 | 26块全部可解析，UICTFontTextStyleBody/ShortBody只改变computed family，其余14属性相同、三串宽度Δ0。运行prepared输入快照与当前CSS分开记账；无产品字体更改或像素通过 |

docs/requirements.md 是功能范围，docs/architecture.md 是接入契约，docs/ui 是视觉证据。实现阶段遵循 docs-sprint 的 develop/verify 分离。空仓库先建立 Git 基线，串行实施开发/验证；不要求用户批准已授权的常规设计补全。测试必须覆盖真实持久化边界和 UI 用户路径，不能只测试同实现的常量。

具体模块边界与必须实证的调用链见 [交付分解](analysis/delivery-map.md)。后续每项阻塞差异建立最小可验收任务，先修再复核。

2026-11-05后续37：同源Mac13/Android08已构建并独立核包通过。Mac13侧栏两入口、菜单动态文字、hidden/visible正常重启实际36有限通过；文字31实际量图改善但仍残差。普通Tab/OptionTab仍差异，新增[局部循环37](tasks/app-mac-ordinary-tab-loop37.md)继续。Android08保数据设备记录进行中，空白新建无输入返回后8→9，保留现场、不删除，不追认为原版语义一致。

2026-11-05只读38：Android空白新建返回8→9由创建时立即持久化实体、返回仅导航的调用链解释；既有录屏未形成完全无输入同路径证据，原版策略UNKNOWN。见[准备38](../research/mobile-empty-note-readiness38/README.md)。不以plainText或revision0删除空实体，保持现场；这不是已确定的产品缺陷或取消通过。

2026-11-05后续40–42：原版未保存草稿已观察OptionTab中间插入、选区替换及一次真实撤销/重做；隐藏WK候选保留真实React输入和编辑历史，但未验证产品按键路由。[任务42](tasks/app-mac-ordinary-option-insertion42.md)依赖37合入，当前pending，不与37重叠实施。用户再次明确“先不删除，继续其他开发”，原版删除/恢复实验和Android新空笔记清理继续暂停。Android08实际36有限运行及独立证据复核已经完成，当前包不改，计数9保留。

2026-11-05当前状态：Mac14准确d9ce9c4已核包/实际47/独立48有限接收，Android保持08原来源；见[根接收47](../verification/mac-ordinary-keyboard47-root-acceptance.md)。上文37/42“待新包”“Tab仍差异”是当时历史记录，当前指定关闭导航故障路径已通过，其余边界开放。新优先项[录音交互50](tasks/app-recording-interactions50.md)实施中，排除听写/转写。

2026-11-05录音50最终12e5源独审SOURCE-READY，主线50+52六项整合检查通过；准确Mac15/Android09与实际后台录音待验，见[主线整合54](../verification/recording-window54-main-integration/README.md)。不追认旧Mac14/Android08或原版像素通过。

2026-11-05录音后续状态：55浮窗/主窗右栏与56保存卡播放已独审合入，Mac16源9167db9实际双模式及Notes编辑/新建/搜索/加粗有限通过，但新Start被系统授权请求无返回阻塞，采集中双模式仍未通过；已有44:58长录音正常重开后播放及±15秒通过。旧Android构建10实际采集/暂停/试听/继续至13秒通过，Done拒绝的File仍保留。57手机保存修复已源独审/主整合通过，标准[Android构建11](../verification/unified-candidate06/android-recording-save-build11/README.md)源747a509准确收集完成但尚未安装；指定本地备份问题待答复，保全前不升级原设备。不把源码、构建或非采集GUI通过当完整录音设备验收。

用户后续已选择保留原13秒录音现场、暂不继续手机设备验收；不备份、不装包、不关闭/停止/重启或操作原模拟器，不再重复请求该备份。完整goal保持进行，当前继续[录音视觉58](tasks/app-recording-visual58.md)及Mac独立工作。
