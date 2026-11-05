# Unified candidate06

## 当前可用包（2026-11-05）

最新录音开发包为Mac16（源9167db9）及[Android构建11](android-recording-save-build11/README.md)（源747a509），不同来源分别记账，直接产物链接见[根README](../../../README.md)。[实际录音记录](../recording-presentation55-runtime/README.md)区分Mac非采集双模式/Notes操作、已有长录音正常重开后播放，以及旧Android构建10的真实采集/暂停/试听/继续。Mac新采集授权请求无返回，Android11尚未安装，原13秒失败录音的指定本地备份问题待答复；完整录音与像素验收未完成。此前有限接收为Mac14/Android08，见根README。

以下是按时点保留的历史交付；其中“当前”只指对应记录时点。

## 2026-11-05 早前名称与手机文件夹交付

当时交付为同一固定产品源d7423070207684c5a2bb584281350723c44e9d9c的[Mac12](mac-name-focus-build12/README.md)及[Android07](android-folder-visual-build07/README.md)。Mac准确核包494项、实际证据496项独立复核通过；Android准确核包391项、实际证据711项独立复核通过。两端包位于各自artifacts run的attempt01。Mac两条侧栏恢复与正常重启偏好、普通名称操作，以及手机可见加号/导航/长按/冷启动可见内容保持均有实际记录；文字/选区/环角、手机右下图标和整体像素仍开放。准确SHA、排除项及限制见[本批根接收](../name-mobile29-root-acceptance.md)。

## 2026-11-04 历史可用包

当前桌面包为[侧栏Mac06](mac-sidebar-optical-build06/README.md)，准确源码09fee3ec05dcf3be22037e0a842ea6d2df275cff。封装应用可执行SHA256 f69b9e3856ebb62ee64c6547d55a420762a31e58ab3b9244391981fff239f8bf，ZIP SHA256 56907af1d0b13ee6807a4236f67644a83b41b2baacf77744ae4931627184447c。[独立产物核验](mac-sidebar-optical-independent06/README.md)975/975通过。root实际新窗口两条恢复入口、208/228栏宽、正常重启再切换已执行，见[运行记录](../mac-sidebar-optical06-runtime-01/README.md)；[独立运行复核](../mac-sidebar-optical06-runtime-independent-01/README.md)有限通过且无阻塞。这是本次“隐藏后无法显示”修复包；[局部对比](../mac-sidebar-optical06-analysis-01/analysis.md)已消除旧文件夹(−3,+2)和隐藏按钮约−9px横向偏差，仍有半像素轮廓与标题纵向差异，整窗像素目标继续开放。

当前Android包为[选纸Android03](android-paper-selection-build03/README.md)，准确源码093986d170ef279fbce0f66e59891fd5f94aecad，APK SHA256 d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c。[独立产物核验](android-paper-selection-independent03/README.md)882项及签名、包内资源核验通过；[保数据实际验收](../android-paper-selection-runtime03/README.md)覆盖圆角、重复选纸、返回、输入撤销和重开。Mac06仅修改Mac工具栏，Android保留独立源码来源。

以下均为历史候选和当时状态，不代表当前运行包。

## 初始候选历史

准确源码f18da0ccf8bb6e131e80e22b9752f0df2725245d；产品238文件aggregate f409cc270772c6ff8a66e6a92576cae8b375409ff40619ebfbb44566f286526c，完整301输入aggregate 4d52edcb2c2851105ede8fa0399ba2dd10f6e0e2af93bb1bc7d77afc580fa301。含本地标签、录音日期与紧凑手机录音卡、宽三栏工具组、桌面隐藏后直接恢复侧栏。菜单动态标题是后续独立补丁，不在本候选。

两平台已实际离线构建/收集并独立核查。冻结、命令、前后输入、原始日志和结果均在各build01目录；实际前次最终输出只原子改名保存于prior-outputs，不纳入Git，未删除。当前final app/APK保存在artifacts。独核报告限定字节与既有来源记录，不等同功能或像素通过。

| 平台 | 可用产物 | 身份 |
|---|---|---|
| Mac | artifacts/unified-candidate06/mac-build01/mac-attempt01/mac-sealed.app | exe15990560B SHA152ad9e5f9fe0bc6eeab2f08bb6980b2610884ec8b43f9610ad4bc0d883f7f6c |
| Mac ZIP | 同目录mac-sealed.zip | 4747762B SHAb7f601d5ad96500029216ca4b315efc31e00a5509d55580b70148c782e437505 |
| Android | artifacts/unified-candidate06/android-build01/android-attempt01/android-original.apk | 177445114B SHAd773e08fd76ba5bbb8e77be9acbfe6e42159bd4efea6674c1af03aae66fecfc4 |

Mac原始包strict签名exit1（原始错误保留），sealed派生包既有strict检查exit0；不可把原件称为通过。Android既有apksigner exit0/v2=true，证书与04一致；独核直接解析06与04当前v2证书DER身份，未重新密码学验签。25OCR模型2490310B与冻结AAR及04记录相等，ABI仅arm64-v8a。

初始Mac06实际侧栏有限验收在../candidate06-mac-sidebar-runtime-01/，动态菜单补包及Android后续有限运行结果见下节。有效收音与整窗像素均未通过。

## Mac菜单补包

侧栏动态菜单补丁已独审并合入准确b5063fd，独立构建于[mac-menu-build02](mac-menu-build02/README.md)，为上一轮侧栏验收包；上表原Mac06产物继续保留自身准确来源。其Mac exe731695ca…，菜单和直接恢复实际有限验收见../candidate06-mac-sidebar-menu-runtime-02/。Android06已完成保数据升级、ASCII标签输入保存/选择/强停冷启与旧未知日期录音卡有限验收，见../candidate06-android-runtime-01/及其独立复核；仍不扩张为全部标签/新音频有效收音/像素通过。

当时Mac实际运行包更新为准确a90e55f的[正文候选build03](mac-body-build03/README.md)，exe b3c9013f…，保留侧栏修复，新增普通段落尺寸实验。实际输入、正常退出后手动重选完整正文、左上直接恢复与动态菜单再次有限通过，见../mac-body-typography-runtime-01/。同文局部分析支持字号改善，标点与前几行垂直起点仍不同；该包不是pixel PASS。Android未因本次Mac实验重建，仍以表内f18来源为准。

## 2026-11-04 后续包

上段为此前body03运行状态。该阶段Mac包为源码62244d4的[body-build04](mac-body-build04/README.md)，sealed exe `db92182330f81f0adfef38d5a9a103e705f166c27c3ff5d3578a8a0e0df85a8e`，独立929断言产物核查通过。新增的普通全p文档纵向CSS已实际运行；最新两条侧栏恢复路径、直接输入失败控制、正常退出与冷启可见正文恢复见[实际窗口记录](../mac-body-vertical-runtime-03/README.md)。完整输入/排版与像素目标仍未通过。

Android纸张顺序新包来自源码347660b（与62244d4产品字节相同），见[recovery02](android-paper-recovery02/README.md)。原paper-build02命令虽exit0，但runner缺少本次离线标记而失败，未收集为ready或安装。recovery02保留旧结果与旧APK，用新复制工具关闭配置缓存，实际重新构建后本次离线标记出现、收集ready=true；不得回写旧失败为成功。其APK SHA843e0c01…与旧失败包字节相同，来源仍须由新attempt隔离/新生成记录证明。运行验收由不同代理另行保存，ready不代表已安装或像素通过。

recovery02随后已由不同代理完成[881项产物核查](android-paper-recovery-independent02/README.md)及[保数据实际升级与纸张顺序有限验收](../android-paper-recovery02-runtime-01/README.md)：设备APK实算843e0c01…，同QA正文、可见粗体、原日期和grid-large保留，7卡行序同参考，取消与重开保持；最后取消回原文。未选择纸张卡，不扩张为新包七态保存、PM选区JSON或像素通过。Mac04的[运行叙述独立核查](../../plan/reviews/app-001-body-vertical-runtime-03.md)亦支持保存的侧栏恢复/可见正文记录，仍保留输入与像素限制。
