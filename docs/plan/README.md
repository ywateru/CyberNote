# 交付计划

用户已授权完整 Mac 与 Android 开发。此计划持续执行，不以文档完成替代应用完成。

| 任务 | 当前状态 | 交付 |
|---|---|---|
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
| APP-001-WIDE-TOOLBAR-RUNTIME-01 Mac候选05 | built，Mac锁定使首次切换未启动05 | 精确5201d315/285输入e78df071…，32.094s构建/严格签名通过；ZIP ed29e5d4…已独占保存artifacts/mac-candidate05-wide-toolbar。root核24证据348176B及完整包/ZIP；旧04 PID56019未退出，05未启动。宽窄窗/搜索/菜单/PNG与像素待用户解锁后复验；不重建Android、不含标签 |
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
| APP-002-UNIFIED-C04 统一新包 | 双端built；Mac实际OCR/正常冷启及Android输入/OCR/录音冷启有限pass；像素未验 | Mac d8f832e/ZIP6a821684…、Android3d55dba/APKbbc4c1a8…。Android实际键盘保存、系统选图OCR、新26秒录音保存/force-stop冷启/新旧卡片播放控制pass，原三行/旧附件/音频保持；root核159文件6615140B，aggregate73472a82…。新音频主机导出被自动审批拒绝，解码/非零音轨blocked，可听unknown；正常退出/首次离线未证。Mac04原27证据OCR/正常冷启有限pass保持，录音未验。PNG授权已获同意，系统认证/再次锁屏仍阻塞，整窗pair未得 |
| APP-002-RECORDING-PREVIEW-01 暂停回放 | in-progress，源e01c90a独立SOURCE-READY、主e9e426f | 原P2重载就绪门禁关闭；独立repro/恢复4/模块16/有界提交后Panel25通过，原脚本两次时点失败保留非阻塞。主6源码同/build/preview16/父20通过；candidate03不含此实现。WK/Android真实前缀可播/可定位/可听与像素仍待后包 |
| APP-001-SEARCH-FOCUS-01 Mac菜单搜索焦点 | in-progress，源d9bc5a4独立SOURCE-READY、主175cd1f | plugin精确MenuEvent同步请求真实唯一focused main当前enabled绑定，与IPC共body；独立与主cargo13/13通过、两产品hash同。无新包快输入/marked text实测，异常原因unknown和Tauri排队仍保留，不承诺已修复 |
| APP-003 本地高级功能 | pending，依赖APP-002 | 标签/智能文件夹、数学/笔记链接、Markdown/PDF与类型浏览；分步实施验收 |
| APP-002-AUDIO-CARD-01 手机紧凑录音卡 | pending，等待标签源码整合后串行开发 | 原片35.5秒证三行标题/日期/音频·2秒与白播放按钮；新增可选recordedAt的首次实际开始工程契约、operation重试/受权read/归档1与2兼容已明确。未实现日期、未改安装包；展开/原版取时/像素仍unknown |
| REF-SMART-FOLDERS-RUNTIME-01 原版智能视图 | ready，Mac当前锁定待解锁 | 已有表单选项证据不代表创建后结果；按专用合成目录/置顶/全部任意/搜索/新建/正常冷启步骤补证。存储与归档准备审计已保全，不把建议当原版行为 |
| APP-003-TAGS-01 真实标签 | in-progress，candidate03独审结束后旧编辑器滞留P2阻塞，04窄修中 | a0989b3出站合法快照关闭旧archive_invalid，三种标签筛选入口新建目标有限通过；独审真实App→Store确证活动composition失去最后匹配后被park/真实blur，后续输入未进入原正文。root核22证据631964B，aggregate cfa14ea4…；03关闭受控续字但浏览器引擎最终事务先于end监听后仍hold，普通续字继续写空结果旧目标；root核16新证据572477B、aggregate c3c269b6…。4fc78b0补齐局部组字保留/访问屏障优先契约，开发04修复。受控DOM非nativeIME，未合入/未进安装包、像素未验，不关闭智能文件夹及父任务 |
| APP-004 离线扫描与文字识别 | pending，依赖APP-002 | 真实相机/文稿裁边/多页PDF、随包中文OCR、Mac本地Vision；未实现 |
| APP-004-OCR-HOST-01 OCR主App文字接入 | in-progress，主cd7c94e，04双端单图实际OCR/正文冷启有限pass | 源5b707ae独审02及主接线保持。Mac本地fixture三行中文识别→插入→正常CmdQ→新PID完整正文恢复；Android系统picker选同图→三行识别→插入→force-stop新PID完整JSON恢复通过，实际插入位置/空首段及末行空格差异已记录。内部session ACK未直接追踪、未强制断网；完整矩阵/320图/像素unknown，完整文稿/PDF另批 |
| APP-004 原生模块 | ec6b6dc运行修复独立通过，待接入 | 首次离线中文OCR、透视/两页PDF、10项路径边界独立通过；原目录P1关闭，主App/实体相机/noGMS/像素仍未验收 |
| PARITY-001 修正差异 | pending，依赖顶部/媒体/本地功能/扫描接入 | 逐页几何、菜单、手势/动画、字体与材料校准；明确原图/叠图/差分和未知项 |

docs/requirements.md 是功能范围，docs/architecture.md 是接入契约，docs/ui 是视觉证据。实现阶段遵循 docs-sprint 的 develop/verify 分离。空仓库先建立 Git 基线，串行实施开发/验证；不要求用户批准已授权的常规设计补全。测试必须覆盖真实持久化边界和 UI 用户路径，不能只测试同实现的常量。

具体模块边界与必须实证的调用链见 [交付分解](analysis/delivery-map.md)。后续每项阻塞差异建立最小可验收任务，先修再复核。
