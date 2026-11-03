# 统一 candidate02：独立实际验收计划

日期：2026-11-04（Asia/Shanghai）。执行者 verify。状态：**PREPARED，等待开发正式交回确切包与对应界面/设备；未开始 candidate02 实际验收。** 本文件只更新文档，不操作 GUI、原版 Notes、运行中克隆、设备、构建或共享 target。

冻结源：`fabafcf9723e400c67fd842f870dad9d4ae79d19`。本批含已独立 SOURCE-READY 的 F07、AudioPlayer、Store 模块、移动音频控件、Mac custom-protocol 空 path 根入口修复。develop 目前串行 Mac release→完整 bundle 签名→Android APK→开发实际，独占构建 target 和设备；root 统一调度 Mac。verify 收到正式回交才操作对应 surface，不能因只读文档已准备好就提前连接设备或界面。2026-11-04 本轮文档准备已向 develop 正式移交 Android，交接事实基于上轮清理断点，不冒称本轮实时观察。

## 当前已知事实与不继承边界

| 输入或旧结果 | 准确状态 | candidate02 的用法 |
| --- | --- | --- |
| 旧 dba83641 Android | 原权限开发证据、独立录音取消、纸张七态/短屏有限实际；Infinity/0:00失败 | 保留历史；不重跑首次权限或据此追认新包 |
| f4d3a027/旧APK3edc4ad0 | 独立1:06、解析后time0paused、真实play/pause、媒体/纸张导航和完整对象保持通过；audio-expand隐藏、range/±15未验 | 新包必须单独核身份与实际控制链，旧有限通过不能跨包继承 |
| 旧Mac sealed exe11dcbfc4… | strict签名通过，真实白窗/WK URLnull/navigation Ignore；未到React/F07 | 旧失败保留。新包先启动门槛，再进入F07；不声称旧private初始URL已捕获 |
| 音频控件8893bede/8a8f995 | 独立SOURCE-READY、Chrome156真实NodeView触摸/keyboard/lifecycle通过 | 不等于Android91系统IME、Rust ACK或Mac应用通过 |
| Mac入口c4890fc | 独立SOURCE-READY、实际生产Rust12组通过；仅精确tauri://localhost空path等价根入口 | 新包启动与实际页面另验，导航允许不等于媒体许可 |
| Store4d5898f/主42b2631 | 独立SOURCE-READY及Rust定向通过 | 此包含模块不代表附件前端已接新operation API；本轮不扩展为事务/补偿/孤儿验收 |
| 原版F07原始资料 | Notes4.13/macOS26.4中文浅色唯一→零→clear有界取证，2782×1806PNG但当次未测pt/DPR | 可用作行为参考；不能推定本轮比较尺寸或直接据此给整页像素分数 |

本批四类结论分开写：源码与包身份、启动/页面、有限实际功能、公共ROI像素。任一通过不覆盖其他项。原版播放器展开手势/外观仍unknown，修复可用性不能冒充原版一致。

## 开始前的正式包与surface交接

开发交付实际build源HEAD、逐项输入清单/aggregate（含源码/原生toolbar/配置/锁/必要生成依赖输入）、构建命令/退出码、Mac原始release与最终sealed路径、完整bundle清单/aggregate/exe hash、签名检查输出、APK路径/SHA/size、安装读回身份、实际PID/窗口/页面、开发原始实际证据与manifest、其CDP/REA/转发/观察工具清理状态。后续仅文档提交不改变实际build源身份；若产品输入变化，按实际新冻结源记录，不能硬套本计划标签。

独立只读重算产物及输入hash，开发manifest逐项匹配。Mac核最终签名bundle而非只核旧release exe；实际运行路径与被核sealed app一致，不能因同bundleID误选旧包。Android核安装base.apk实际字节与冻结APK相同。若身份不符，保存差异并停止成功判定，不先操作另一包后追认。无默认proof/受控暂停标记，使用默认生产构建；仅已明确交付的诊断证据另行说明。

Android保留：`emulator-5580`，emulator PID3197/original session73263，read-only AVD；不终止/重启/wipe/卸载/clear data/重置RECORD_AUDIO，host mic OFF不启用。上轮actual app9355仅参考，新PID以正式回交后实时读取为准。上轮physical1080×2280/density440/nooverride，paper grid-large，菜单/IME关闭，媒体最后paused；开发可能正常改变页面，实际新基线由回交读取。

只保存合成测试笔记和必要公共画面，避免采集私人正文/数据库。只读实际Rust load_workspace可用于过滤测试对象，不因本轮验证而读写整份私人DB。CDP/REA仅作只读页面、editor/selection/对象身份、真实媒体和必要窗口度量；UI动作只能通过真实原生触控/按键。无DOM click、React/ref/editor写入、产品方法调用、假媒体、API替换或人为写入duration/currentTime作为通过。

## Mac门槛：新包正常启动与真实页面

1. 正式取得Mac后读实时state及精确app/process/window身份，核相应bundle/exe。允许一次已交接的新包正常启动观察；不因工具白屏重复拉起同包刷成功。保全正常原始日志、截图/AX、实际本地WK URL/loading/title和React根/内容观察（工具可读时）。未能读WK URL不自动推测值，由实际页面和日志分别记账。
2. 预期本地入口加载、三栏与原生toolbar可见，能正常通过UI选合成note并看到对应正文。process存在、signature通过或只见toolbar都不等于React/正文通过。若仍白窗/加载失败，冻结一次完整异常和可取日志，F07/pixel记pending/unknown，不将startup问题写成F07产品失败；保持可诊断运行状态交root，不修改权限/默认策略/CSP绕过。
3. 新启动成功只证明本包页面链；不授予媒体许可、首权限或Store事务的额外通过。无必要不连接额外诊断工具；如用REA，保留原始probe及detach/close状态，不能让验证探针长期注入后续过程。

## Mac功能：一次F07 unique→zero→clear与真实编辑历史

使用已交付的两篇合成A/B；如果没有合适夹具，正常UI创建A/B并分别加入独一检索标记，保留title/id/完整JSON/revision。A为进入搜索前选中，B为唯一结果；不使用私人标题。只读持有A的实际Editor/View/DOM、真正note/session/epoch父key及完整doc/selection/history基线。

1. 正常在A正文输入一个短、可识别后缀。记录实际保存队列状态、完整doc/selection和Rust对象。若已settled，明确本次不是pending queue保全证据；不调用flush/挂起响应伪造时序。
2. 原生Option+Cmd+F聚焦搜索，真实输入B的独一标记。检查唯一B实际展示、活动editor和B归属；A停放且不可写，A完整doc与真实对象仍保留。用原生AX/field-editor焦点和只读DOM activeElement等记录真实搜索焦点，不把JS toolbarState当原生焦点证据，不让UI以外命令抢正文焦点。
3. 同一真实搜索字段全选改为固定零结果query：`QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。列表无旧note/选择，正文无旧日期/内容/操作目标；格式、清单、表格、附件、分享、更多等实际原生控件disabled；全局新建、搜索可用。保存AX+截图+真实宿主/停放状态，不能只断言某个React布尔值。
4. 原生clear（优先与原版同义的搜索内取消/clear）或真实Escape清空搜索，记录实际使用哪种。恢复原A与进入搜索前folder/selection上下文；完整JSON、同一Editor/View/DOM/真实父key和历史保留。先采真实焦点，避免clear后的搜索field editor Undo冒充正文Undo。
5. 用户正常点A正文后，CmdZ仅撤销该短后缀；CmdShiftZ恢复后缀。保存前后完整JSON与实际选区/焦点，B不能被写入。未实际触发保存pending、不做跨窗授权时序/附件弹层晚回调或全中文IME矩阵。最后只保留本轮明确合成的合法变化并保存安全页面；不清原有历史失败夹具。

## Mac像素：原版与克隆同条件F07公共ROI

功能序列与pixel单独判定。仅在Mac归verify并功能状态能确定后，有限操作原版Apple Notes合成folder“Notes Clone UI 对照”，不修改其正文。固定同一零结果query、中文/浅色、同等窗口活动态与同等分栏。在必要时补采原版一次零结果，结束清query并恢复原“每日 TODO”与合成folder。已有03-zero-match.png先保全，不据其2782×1806推定DPR2；其他历史1088×660pt/2×场景的测量不能套在该图。

采集前记录双方真实逻辑frame/content bounds、屏幕位置/缩放、raw PNG尺寸、DPR的独立测量来源、App/OS/主题/语言、活动状态、侧栏/列表宽度和捕获时间。尽量同屏位置、同逻辑尺寸、同列宽、同背景分别采同活动态；实际做不到则明确限制。不能先看差异再自动寻找平移/缩放最优解。

在计算之前登记ROI几何，保存两张原图对应raw坐标和逻辑映射：

- ROI1：零结果列表公共区域，包含已证分组/搜索无结果标题、列表边界及空列表；不同本地账户侧栏另行说明，不悄悄遮罩成全页通过。
- ROI2：空正文内容区域，包含原日期/正文所占公共区域与列分隔；不拿纯白内区代替组件和边界。
- ROI3：公共顶部原生工具/搜索及disabled状态区域（在bounds/活动态可比时独立列）；同原图的字段焦点、选区、插入光标变化按实际记录，非任意抹去文字/边缘。

在 `mac/pixels-zero/` 保留 original.png、clone.png、50%overlay.png、absolute diff.png、metrics.json与操作/度量记录。相同raw尺寸和度量时按已声明边界直接裁剪，RGB每像素任一通道不相等计changed，输出exact mismatch ratio、mean channel absolute error、maxchannel error，说明alpha合成规则。任何外部系统徽章/指针遮罩需坐标+理由，原raw指标仍保全；不同尺寸只在明确映射后给辅助重采样图及规则，不能用重采样图替代原始差异或给整个页面误导分数。没有可靠对齐的ROI则标unknown，不编数字。数值不设自动豁免阈值，非零差异不宣称像素完全一致；材质受位置/背景影响按实情披露。

## Android功能：同一受管媒体的真实触摸完整有限序列

既有媒体note `a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3`、attachment `cb3fa001-9d73-4580-b959-38481fbba90b`。app根路径 `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm`（非files/attachments），429547B、SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`。ffprobe1101packets timeline66.064秒是旧原文件核证；平台probe66.004秒可合理不同，不能把这些离线数值写回生产播放器。

1. 正式回交后只读核身份、实际API/WebView/size/density、已允权限及hostmicOFF；无他人并行操作、API wrapper/observer/残留forward。保存完整MEDIA02/QA-PAPER过滤对象、revision、attachmentmetadata和实际媒体bytes/hash。只在必要且交接清楚时一次app-only冷启，记录PID；不重启模拟器、不fabricate首权限，普通导航重建媒体session也可证明本轮初始状态，不把它称冷启。
2. 真实原生打开媒体note，尽早取初始currentTime/paused/UI/error/IME/真正父key，最多等生产15秒期限加有限调度余量。若解析已完成才观察，写明不能覆盖此前所有瞬态。期望summary约1:06、实际初始0/paused；actualduration如Infinity原样记录，controller有限值与主metadata分开。一次真实异常冻结，不循环重试直到通过。
3. 原生单次点标题/时长区域展开：aria-expandedtrue、detail真实可见、range max有限且约66秒，保持未播放/未跳转；正文doc/selection与真正editor身份保持，无误起IME、无正文focus新增。不能通过DOMclick/CSS/state写入展开。播放胶囊点击只改变play状态，不能同时展开/收回。
4. 原生Play1–2秒→Pause；记录实际main time推进/paused和按钮状态/error，非声音验收。暂停时用真实range横向拖到约30秒，记录实际input值与main currentTime接近，随后+15约45/-15回约30。坐标来自只读真实bounds，动作只能adb input真实触控，不调用seek/skip控制器。
5. 再原生拖近开始（约2秒）→-15夹至0；拖近结束（约64秒或实际上界前约2秒）→+15夹至有限上界。允许range step0.05造成显示66.0而actualduration66.004，记录真实input/main差异，不强求字符串全等。seek到上界的ended状态不当作完整播放结束验收。每一步记录main time/paused、range/aria、IME、doc/selection/key；保持暂停且不改正文。
6. 原生标题单次点收回，expandedfalse、detail消失、不改变已暂停进度；再经正常列表重开媒体，期望新session初始0/paused，归属仍同note。若条件需要仅一次重开确认清理，无重复完整66秒播放或新录音。errornull只是采样，不冒称完整平台事件史。
7. 最后实际字节hash再核、过滤完整JSON/revision/metadata严格对本轮基线。旧媒体revision30仅参考，开发本轮有合法既有变化时记录实际基线，不用旧值造失败/通过。原版单/双击展开未知继续unknown；入口修复功能通过不等于原版手势或展开外观一致。

## Android共享宿主最小回归与清理

从媒体→列表→paper `1a0718dd-c71c-4192-89b6-bd58cb9ba475`（QA-PAPER-INDEPENDENT-20261103C，grid-large、Alpha **Beta** Gamma）→列表→媒体，再回paper，核正文/附件归属和真正note/session/epoch key。不重复上轮纸张七态/短屏或格式矩阵；若发生与新版controls相关的选区/IME异常，只保全一次真实失败并停止该路径。必要一个paperCancel/reopenBack smoke只在开发改动/本轮未解决共享宿主疑点时执行，不为累计通过数重复旧矩阵。

最终关菜单/IME、停止媒体、无录音，记录实际安全页面/selection而非照抄上次Beta39..43；释放自有remotehandles/socket并移除自有forward，确认没有残留观察/API改写/设备XML，保留emulator/hostmic/权限/数据。若使用app-only冷启在记录中单列。正式向root/develop交回后不再操作。

## 证据和停止边界

本目录分 `mac/`、`mac/pixels-zero/`、`android/`，分别保存identity、原始nativeactions、完整合成对象、AX/screens、实际媒体/编辑器只读观察、结果及manifest。报告按确切包/平台分开写，功能PASS/FAIL/unknown和pixel结论各列。保留旧3edc4ad0 hiddenexpand与旧Mac11dcbfc4白窗原证据，不改写成新包历史。

任何真实失败保全当前状态、必要暂停/关面板后冻结该路径，不自动重复刷通过；Mac若锁定记pending并继续不依赖GUI的核证，不因旧locked再次要求用户解锁。除正式交接需要之外，不额外请求已授权操作的确认。包身份、surface所有权或新产品变更不明确先报告root，仍可整理独立文档但不启动对应实际动作。
