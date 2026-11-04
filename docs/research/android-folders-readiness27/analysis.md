# Android 文件夹首页：下一最小修正准备27

2026-11-05，Asia/Shanghai。**准确Android06已有稳定、未滚动的文件夹首页，可直接用作下一批基线。快速行文字仍约早4个原录屏像素，快速图标和底栏新文件夹图形不符，普通文件夹偏窄，标题墨迹偏宽。** 建议限定手机文件夹首页的本地矢量图标、文字槽距、底栏左图标与标题局部样式；不改文件夹业务或已验长按行为。

## 准确06状态，而非沿用05

主图为[39-final-folders-count1.png](../../verification/android-folder-fixes-runtime18/39-final-folders-count1.png)，复核[03-stable-after-upgrade.png](../../verification/android-folder-fixes-runtime18/03-stable-after-upgrade.png)。两图均1080×2280，展开大标题、完整搜索、顶部快速行与底栏都可见；无搜索、键盘、编辑态或菜单，未滚动。39显示quick0、全部8、普通8、合成智能R2计数1及标签；03为改名之前R1。无需为本准备追加ADB捕获。

[runtime18](../../verification/android-folder-fixes-runtime18/README.md)的01准确包门槛、02保数据install-r成功及设备base.apk SHA记录对应源 `de372d31e0578a7f2619413c0abde6a8439bb3c6`，APK SHA `8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac`。本次只核固定记录，没有重读APK、安装或操作设备；选定8项runtime18文件匹配其封存索引。

参考为已保存的[14秒帧](../../../references/mobile/frames-2s/frame-008.png)与[62秒帧](../../../references/mobile/frames-2s/frame-032.png)，均224×480，取自保全原视频。原视频仍为8,452,211字节，SHA `2bed50027479becf059cc32b68c361107a0c3f840f027f79933a4b99bc4e394d`，本次核字节身份，没有重新解码或转码；帧与源逐RGB校验沿用[baseline14](../mobile-folders-baseline14/README.md)既有封存事实。没有猜iPhone型号、iOS版本、DPR或物理安全区。

## 最少共同量图

[measure.py](measure.py)复用14已有ROI与阈值，真正重新读取06的03/39，结果详见[measurements.json](measurements.json)。只比较图像像素，矩形为半开区间。宽度比 `s=1080/224=4.82142857` 只作宽度归一，不是dp、pt或CSS换算。

| 共同对象 | 原版14秒 | 准确06主图39 | 有限差距/目标 |
| --- | --- | --- | --- |
| “快速备忘录”墨迹 | `[42,120,89,128)` | `[183,530,413,573)` | 06左缘183/s=37.956，早4.044源像素；目标约42。 |
| 快速图标金色bbox | `[20,118,32,130)` | `[94,523,148,577)` | 外包接近，但原版矩形有顶部带/内部短纹样，06是空白折角纸张；换形状。 |
| 普通文件夹金色bbox | `[18,253,33,264)` | `[91,943,151,994)` | 原版15×11，06归一12.444×10.578，宽少2.556源像素；优先扩横向形状，不能统一放大高度。 |
| 底栏左图标 | `[12,442,29,454)`，中心x20.5 | `[50,2051,110,2102)`，中心x/s16.593 | 中心左3.907，宽17对12.444；原版加号/徽标位于文件夹右上外侧，06在内部。形状和锚点需一起修。 |
| 标题“文件夹”墨迹 | `[10,58,64,75)`，54×17 | `[47,215,327,305)`，归一58.074×18.667 | 左缘近似，墨迹宽多4.074源像素。低清无法据此确定字体文件或字重原因。 |
| 搜索填充 | 206×21 | 归一205.956×20.533 | 已接近，不重做搜索宽高。 |
| 共同单行pitch | 25 | 分隔线908/1029，121/s=25.096 | 已接近，不改44px行高或组卡高度。 |

62秒相同文字、标题与左右footer严格阈值bbox复现；快速/普通图标高度依阈值与压缩边缘有1–2源像素变化，不据此修细线。06的03与39上述8项bbox完全一致，也恰与05相同；这是对06本身测量后的结果，没有假设05就是06。05→06的标题/搜索/快速文字ROI RGB确实相同，图标ROI有少量变化，未声称应用整图相同。

[总览](overview-width-normalized.png)清楚标注原版两帧原宽224、06仅按宽度均匀缩到224，保留不同系统栏及总高；[06原生标注](android06-39-native-guide.png)与[原帧标注](original14-native-guide.png)不缩放。[快速行](quick-comparison-diagnostic.png)、[普通文件夹](ordinary-folder-comparison-diagnostic.png)、[底栏左侧](footer-comparison-diagnostic.png)为明确标注的诊断裁片，06先按同一宽度比缩小，再近邻4倍显示，不能拿重采样图当零差评分。所有图均已目视。

## 可落地的最小源接缝

只读当前[App.tsx](../../../src/App.tsx)、[style.css](../../../src/style.css)与package依赖。当前源并非宣称等于06完整source，仅说明后续生产接入点；字节固定在manifest。未读取或触碰26正在修改的smart-folders.css。

| 部位 | 当前接缝 | 最小改动边界 |
| --- | --- | --- |
| 行图标 | App2477–2484：smart=FolderCog、quick=StickyNote、trash=Trash2、普通=Folder，均来自lucide-react | 新建本地手机矢量组件，例如拟议 `src/MobileFolderIcons.tsx`，仅mobile分支使用Quick/ClosedFolder；保留Mac及smart/trash分支。无需换图标库。 |
| 文字槽距 | App2455附近mobile内联paddingLeft16；CSS1932行高44、左右padding16、gap10；1957首svg24×24 | 保留卡片与图标左锚。可先在page-folders行内增加文字槽距约19.5物理截图px（4.044源px），通过局部gap或独立图标槽实现；不要整体右移整行或加padding使图标也跑偏。 |
| 底栏左图标 | App4097–4103按钮名与newFolder回调；4102为FolderPlus；CSS1981–1998设footer与24×24 svg | mobile专用FolderAdd矢量，加号/徽标移到右上外侧；保持原button、可访问名称与回调。按新绘制bbox联合调整宽度及锚点，不把旧中心差当纯translate。 |
| 普通文件夹宽度 | App2484的Folder；CSS首图标统一24×24、stroke1.4 | 手机ClosedFolder独立宽高/路径：横向更宽、较扁轮廓及上方折线，优先保持高度和行中心。不可全局拉伸所有svg或改chevron。 |
| 标题墨迹 | App4003的h1；CSS1879–1886为34px/700/line-height41/letter-spacing0.3与固定margin | 仅page-folders h1的局部字体尺寸/字距候选，保留41px行框和搜索/卡片锚点；宽度目标54而非58.074源px。约31.5–32px字号可作工程试验起点，不是恢复出的苹果字体参数，不凭低清推断字重。 |

矢量应由本地SVG path/rect/line代码绘制、使用currentColor、装饰性SVG不接事件，继续由现有button命中与读屏名称承载交互；不借原版raster，不粘贴SF Symbols原生资源。参考只足以规定可见轮廓类别、相对位置及bbox；Quick内部短纹样、右上加号徽标的精确曲线和线宽仍需候选与低清参考并列核查，不能声称已知原生路径。

底栏尤其须联合处理：目标金色x `[12,29)`，06归一为 `[10.370,22.815)`。新图形需要同时扩宽与稍右移；若先整体移中心3.907再向右扩展，会再次偏右。底栏图标相对各自栏顶的中心距离为原版15源px、06归一14.622，先保留纵向位置及footer高度。共同文本可用局部gap候选，需同时核长名省略、计数/chevron右锚；现有span flex1、count及chevron规则不能被挤走。仅凭保存截图不能确认CSS实际设备缩放，最终参数须生产渲染后量图。

## 验证范围与不能证明的部分

下一批的最小产品文件范围为App手机图标选择、一个小型本地SVG组件、style的手机page-folders局部规则；不改Rust、存储、smart业务、全局字体、图标库、行高、搜索、卡片或系统栏。固定同一合成数据状态复拍准确新APK，按原14/62参考与本06基线量图；核快速行点击、普通目录点击、底栏新建并取消、长名/计数，以及既有长按菜单不出现选字把手。保留Android Back与正文长按路径。候选视觉通过不能替代真实包及触摸回归。

原版首组三行，06只有快速一行；原版iCloud长目录与06本地3行/标签区内容不同。因此不比较第二组绝对y、整卡高度或标签区是否存在，不新增伪造通话/共享行来凑图。原版辅助内容区 `[0,28,224,466)` 是分析排除约定；06状态栏 `[0,0,1080,83)`、三键区 `[0,2148,1080,2280)` 单列。按宽度缩放后辅助区高度仍差约46.79个Android图像像素，不能顶底同时贴齐或拉伸纵向来造零差。

原视频224×480压缩不足以授高清字形、精确色值/描边或完整像素PASS。本批不扩展智能文件夹未知页面、动画、其他iPhone版本或真正iOS宿主。现有Android06业务验收与本页视觉余差分别成立；全Android交互与像素目标继续开放。

## 保全与停止

[input-manifest.json](input-manifest.json)固定25项输入与收尾复核；[evidence-index.json](evidence-index.json)索引本目录输出。仅写本新目录，未产品/共享文档/Git/GUI/ADB/DB/下载/cache/构建/应用测试操作，未重解视频。**READY STOP：下一批可直接从准确06保存的顶页基线推进局部UI及矢量修正。**
