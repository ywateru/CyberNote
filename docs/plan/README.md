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
| APP-001-SEARCH-RESULTS Mac搜索结果 | b144c6e独立source-ready，f4d3a02统一双端已构建、待实际 | f3e5c84冻结static-02：原P2停放restore、P1隐藏A失效切Boverlay均源码修正；7组/12顶部通过。11/4双端冻结216项aggregate a6b19154…前后不变，APK3edc4ad0…；Mac派生sealed exe11dcbfc4…严格本地签名检查通过、实际待验。原版a2dcde9与旧56d7差异保持；真实Mac唯一→零→clear/焦点/Undo、有限像素和新包手机smoke仍待验 |
| APP-002 媒体闭环 | in-progress，dba83641独立实际取消与媒体身份有限通过，时长仍FAIL | android-independent-01独立无包装进入12s/Cancel真实资源状态、完整JSON不变；已有429547B/SHA/1101packets核证。首次Deny/带包装Allow保存冷启仅原始开发证据独立核，分别记账。HTML Infinity/0:00真缺口；旧5dd6及Mac附件/孤儿FAIL保持，可听/物理释放/绘画未验 |
| APP-002-PERMISSION-01 手机媒体权限入口 | 主ff6b93a，dba83641独立已授权取消有限通过 | 998de4b静态9项通过；0505534首次Deny无包装弹窗/12秒存活、Allow带包装实际采集及App冷启由独立只读核原始证据；2326c75独立实际无包装进入/12秒/取消与真实资源清理。未重置系统权限。仅关闭已实测子集，不跨3edc4ad0新包追认；同canonical旧Finished无loadID、有效CSP/frame和可听音轨仍unknown |
| APP-002-ATTACHMENT-SUBMIT-01 附件提交 | pending，最小持久操作/原目标重验证方案已准备 | 依赖权限候选源码交接。系统面板返回后来源/目标失效需精确归因，不跳guard；PDF30956B未被正文引用且冷启保持，须有持久操作身份、安全补偿/去重和正文ACK。旧孤儿保留证据，不能以文件存在算预览通过 |
| APP-002-ATTACHMENT-STORE-01 附件持久操作 | in-progress，Rust模块隔离实施 | 权限源码已合入；先提供真实窗口/会话归属、稳定操作身份、查询/去重、安全补偿与冷启恢复，和F07 App路径隔离。模块通过后再父任务接线，不算系统选择/预览通过 |
| APP-002-AUDIO-DURATION-01 音频卡片时长 | ae567ef独立source-ready，f4d3a02双端已构建、待实际 | f4d3a02独立审查通过生产helper11组及真实AudioPlayer/离线Chrome156：原WebM探针66.004秒、主初始0暂停、有限WAV不建探针、错误/重试/晚事件清理；不重编码原文件。216项输入前后不变，APK3edc4ad0…；Android91既有媒体真实播放/跳转/冷启及Mac仍待新包验证，非可听采集/像素通过 |
| APP-003 本地高级功能 | pending，依赖APP-002 | 标签/智能文件夹、数学/笔记链接、Markdown/PDF与类型浏览；分步实施验收 |
| APP-004 离线扫描与文字识别 | pending，依赖APP-002 | 真实相机/文稿裁边/多页PDF、随包中文OCR、Mac本地Vision；未实现 |
| APP-004 原生模块 | ec6b6dc运行修复独立通过，待接入 | 首次离线中文OCR、透视/两页PDF、10项路径边界独立通过；原目录P1关闭，主App/实体相机/noGMS/像素仍未验收 |
| PARITY-001 修正差异 | pending，依赖顶部/媒体/本地功能/扫描接入 | 逐页几何、菜单、手势/动画、字体与材料校准；明确原图/叠图/差分和未知项 |

docs/requirements.md 是功能范围，docs/architecture.md 是接入契约，docs/ui 是视觉证据。实现阶段遵循 docs-sprint 的 develop/verify 分离。空仓库先建立 Git 基线，串行实施开发/验证；不要求用户批准已授权的常规设计补全。测试必须覆盖真实持久化边界和 UI 用户路径，不能只测试同实现的常量。

具体模块边界与必须实证的调用链见 [交付分解](analysis/delivery-map.md)。后续每项阻塞差异建立最小可验收任务，先修再复核。
