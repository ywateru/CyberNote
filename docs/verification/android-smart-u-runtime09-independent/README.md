# Android runtime09 根证据独立审计

2026-11-05，Asia/Shanghai。**完整性通过；有限可见运行链有依据；P1 回填反向阻塞仍在，不能判定完整智能文件夹或像素一致性通过。** 此结论仅针对密封 Android05 记录，不追认后续源码修复或新包。

## 范围与完整性

只读 [runtime09 固定目录](../android-smart-u-runtime09/README.md)、[后续实际记录 RUNTIME](../android-smart-u-runtime09/RUNTIME.md)、[Android05 包独审报告](../../plan/reviews/android-smart-u-independent05.md) 和 [task16](../../plan/tasks/app-smart-draft-hydration16.md)。未操作 GUI、ADB、应用、原版 Notes、用户数据库或音轨；未读产品源、APK 实物、target、缓存；未测试、构建、stage 或 commit。只新增本审计目录。

根 `root-evidence-index.json` SHA256 为 `041de935002910fb2b5ff97e7cd29aada9542cf1241fc7eba9fb92878f6c272f`。53 条记录路径无重复，文件大小和 SHA256 全部匹配；根目录实际 54 个文件，唯一未列文件为索引自身。42 张截图均能完整解码，格式 PNG、RGBA、1080×2280。五张联系表覆盖全部截图；联系表已缩小，只作浏览导航，不能作为原生像素证据。

[checks.json](checks.json) 记录逐项核验、56 个输入初始快照和收尾状态；[findings.json](findings.json) 记录三项已有缺陷的独立证据边界。[evidence-index.json](evidence-index.json) 索引本目录产物但不含自身。原生裁片保持采样尺寸，坐标印在图上，仅为阅读便利，不是跨平台像素比较。

## 准确包与两次冷启动的记录链

[03 根包门槛](../android-smart-u-runtime09/03-root-package-gate.json) 的源 `e482dac285a1e2b66f88bac035824b7c98e832a7` 与包独审报告相同。报告中的准确 APK 为 179,247,354 字节、SHA256 `a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322`；[04 设备包 SHA 记录](../android-smart-u-runtime09/04-apk-after.sha256.txt) 与之相同。升级前记录为 `d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c`。此次只核这些固定记录相互一致，未重新读取或签名验证 APK。

00/04 包信息均为 `com.local.notesclone`、userId10169、versionCode1000/versionName0.1.0，firstInstallTime 均为 `2026-11-03 22:09:17`；lastUpdateTime 从 `2026-11-04 18:41:56` 变为 `2026-11-05 01:20:52`，安装路径相应变化。两份 dump 中签名摘要相同。该记录支持保留安装身份的升级链，不能单靠 userId 证明数据库全部内容不变。RUNTIME 的 install-r Success 是作者动作说明；固定目录没有独立 install stdout 文件。

[33 首次冷启动](../android-smart-u-runtime09/33-cold-process.json) 记录 PID24032→停止后空/exit1→PID24985；[43 第二次冷启动](../android-smart-u-runtime09/43-second-cold-process.json) 记录 PID24985→停止后空/exit1→PID25356，两次 launch 均指向准确包 MainActivity，并记录 noClearNoUninstall=true。35、44 是后续稳定界面。此次没有重新探测进程，不能把固定 JSON 当新近现场观测。

## 有限可见状态

| 固定证据 | 支持的观察与限制 |
| --- | --- |
| 00/01/02 与 05/06/07/08 | 升级前后 all/default 均显示7，快速0，旧 QA06Tag 仍可见；列表保留旧 QA 标题。只能确认可见条目及计数，未逐篇检查全部旧正文或内部 identity。 |
| 00 与 07 | 同一可见录音 QA 标题 `QA-AUDIO-20261104-07`、正文 `Local audio lifecycle QA`，卡片“新录音”、`2026年11月4日 19:52`、`音频 · 2:03` 均保留，见[原生裁片](detail-audio-native.png)。未播放、导出、读取音轨，不证明媒体字节、播放或完整音轨保全。 |
| 09/10→13/14 | 新建名称页与独立筛选子页可见；allSelected 为0个标签，日期等显示暂不支持。取消子页后名称 `QA-SMART-U09-Android` 保留，再取消后无该智能行且仍7篇。动作顺序以 RUNTIME 为据，未据此声称空标签完整通过。 |
| 15/16→18/19 | 新合成笔记显示标题 `QA-SMART-U09-Android-Tag`、正文 `Local smart folder validation.` 与金色 `#QASmartU09Android`；真实 note 菜单18显示置顶入口。19 all/default 均8，旧新标签同时可见。增量7→8支持本次一篇可见新笔记，不能证明数据库仅有这一个写入。ASCII 输入不代表 marked 中文 IME。 |
| 20/21→22→23/25 | 20有真实新标签候选；21选中1个真实标签、所有已选标签、匹配全部，置顶包含；22回名称页显示2项，仍是草稿；23智能列表为同名笔记1篇且处于置顶组，25智能行 count1、普通8。两阶段草稿/实体的可见结果受支持。 |
| 27/28/29→30/31/32 | 28重开时仍为真实标签+置顶包含。29菜单初始选中包含，同时列不包含/关；该图本身没有显示不包含被选中后的状态。RUNTIME 记录之后选择不包含并确认。30名称追加-R1，31新名 count0，32打开为空。这支持记录中的最终行为，不是读取了持久化 JSON。 |
| 33→35→36/37 | 首次冷启后35保留-R1/count0、普通8和两tag。36却显示置顶“包含”，37取消返回仍count0。36文件名中的 exclude 不能覆盖图像实际含义。 |
| 38/39→40/41/42 | 38普通列表中合成 note 处于置顶组，39菜单显示“取消置顶”。按 RUNTIME 取消置顶且未改定义后，40智能 count1，41真实列表出现同名 note，42正文与金色标签可见；见[原生正文裁片](detail-member-body-native.png)。这是与排除置顶规则持续生效一致的行为证据，未独立读取规则 value/UUID/revision/ACK。 |
| 43→44 | 第二次冷启后44保留-R1/count1、普通8、旧新两tag。44只为文件夹页，未在第二次冷启后重新打开正文或编辑面板，不代表36已修复。 |

04-screen-after 为设备桌面启动过渡，34为白屏过渡，均排除稳定运行通过结论。17实际为列表更多菜单，不是 note 菜单；18才是 note 菜单。原始误操作和过渡图均保留。24列表菜单与26智能行 context 菜单分别观察，不把二者混作同一入口。

## 阻塞与边界

**F1 / 既有 P1：重开定义的置顶回填与查询行为相反。** 35的 count0 与36的“包含”并存，取消错误草稿后仍count0；39取消合成 note 置顶后40/41变为成员1，第二次冷启44仍1。该链支持“原查询仍按排除表现，而编辑回填错误”的有限结论，见[原生规则裁片](detail-rules-native.png)。精确 `{value:false}` 被默认 `pinned:true` 覆盖的源码原因只归属 RUNTIME 第29行和 task16 第12行，本审计没有读源或数据库；也未实际保存错误草稿或验证只改名会改查询。当前包不具备完整智能编辑通过条件，需要准确新包重测 false/true 重开、只改名、取消、成员及冷启，不能用 task16 源码修复追认旧包。

**F2 / 可见反馈缺口：空标签确认后当前视口无错误。** 10和11字节完全相同；12仍是0个标签草稿，整个保留视口没有错误/警告，见[原生裁片](detail-empty-native.png)。RUNTIME 记录已点确认，但截图不能独立证明点击投递或后端拒绝；也没有滚到错误、AX、错误正文证据。“错误在长面板末尾”的源码解释仅作者归属。结论为可见反馈未通过，不能把停留草稿等同于完整校验通过或持久化失败证明。

**F3 / 长按交互差异：目录 context 与系统选字同时出现。** 26显示“编辑智能文件夹”菜单，同时标题 `U09` 被选中并出现系统选择把手，见[原生裁片](detail-context-native.png)。支持可见文字误选；长按动作依据 RUNTIME，未从单帧推断触摸时序或整套原版 context 行为。未进行删除实验。

三项均为根记录已披露的问题，没有新增未报告产品缺陷。除上述有限状态外，不外推完整数据保全、查询模式真值表、日期/其他未支持条件、智能中新建物理归属、完整搜索/取消、移动目的地、中文组字、失败ACK、跨窗、归档回放、音频或 Apple 原版像素一致性。此审计未读取外部几何研究，亦未重测其 ROI 结论。

## 收尾

全部56个限定输入在收尾重算，大小与SHA256均保持初始值；根目录文件列表不变。新产物与本报告链接核验结果写入 checks。**STOP：审计完成，未改根证据目录，未获取或操作设备/共享 target。**
