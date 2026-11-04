---
id: app-mobile-folder-visual28
scope: mobile folders page local vector icons, label spacing and title ink
status: ready
depends-on: [android-folders-readiness27, app-mobile-folder-interactions17]
---

## Objective and evidence

继续完整Mac与Android原版像素/交互父目标。准确Android06 runtime18/39与原视频14/62秒已有共同ROI，见../../research/android-folders-readiness27/analysis.md、measurements.json。下一项只关闭已识别文件夹首页视觉差异：快速行文字早约4.044原帧px、快速图标错误、普通文件夹偏窄约2.556、底部文件夹形状/中心偏左约3.907、标题墨迹偏宽约4.074。上述是图像量，不是CSS参数；源224×480且DPR未知，保留低清局限，不授高清全像素PASS。

## UI and preserved behavior

```text
文件夹                          编辑    ←标题仅墨迹局部候选，41px行框不变
[搜索                              ]    ←位置/宽高保持
┌───────────────────────────────────┐
│ [快速矩形与内纹]  快速备忘录  数量 >│    ←图标左锚保持，文字槽距校准
└───────────────────────────────────┘
在我的设备上
│ [扁宽闭合文件夹] 普通目录    数量 >│    ←闭合folder局部形状
[文件夹+右上外侧加号]        [新笔记]    ←按钮命中/纵向/回调保持
```

只用本地currentColor SVG，无外部资源或SF Symbols拷贝。快速矩形与内部短线、闭合文件夹、右上外侧加号三类轮廓须同时检查bbox和可见形状；不以bbox相等替代形状。底栏联合调整路径横宽与锚点，不能先整体移3.907再扩宽导致重复补偿。图标SVG装饰性，无事件，现有button保持可访问名称、click/520ms长按/TouchMove与End取消。Mac、all/smart/trash现有图标保持；普通目录仅mobile分支。快速行文字槽距应据真实生产渲染测量选参数；无共同文字测量的行不可盲移。可给quick行局部class，不给所有目录全局gap。

标题允许mobile page-folders局部字号/字距工程候选（31.5–32px可作为起点）；保持margin/41px行框/搜索及卡片锚点，不猜苹果字体/字重、不改全局字体。保留card、44px行高、search、count/chevron右锚、长名省略、选中状态、footer高度、正文、导航/系统栏与数据。不同目录数量和本地标签保留，不伪造iCloud/共享/通话内容凑图。

## Ownership and implementation

产品仅src/App.tsx的mobile图标/局部class接入、src/style.css的mobile page-folders局部规则、新src/MobileFolderIcons.tsx（或同等小组件）。不得改smart-folders.css26、SmartFolderForm、Rust/native/存储/bridge/依赖/lock/工具或其他页面。唯一作者develop_app；root管理shared docs/Git，作者仅任务状态与新docs/verification/mobile-folder-visual28/。在26独审固定输入完成前不改App/style，root通知后实施。旧目录/视频/包/cache保留，无GUI/ADB/用户DB/原版删除/音频导出/下载/正式包构建。

## Validation and delivery gate

用真实App/完整CSS的有限生产渲染验证候选，相同数据比较修前修后共享ROI，记录logical viewport与像素尺度；Quick图形、文字左缘、ClosedFolder横宽和纵向锚、footer形状/锚点、标题墨迹分别量图，清楚标记模拟host与Android真实包差异。核长名/大计数/chevron右锚、快速/普通点击、底栏新建取消、原长按事件不变，以及Mac图标/其他页面隔离。只为真实边界作有意义检查，一次必要typecheck，禁止常量镜像测试或无限调色。

作者SOURCE-READY STOP→不同作者独审→root固定提交。计划同一固定源串行新Mac12及Android07 canonical freeze/build/collect、独立核包。Mac实际Computer Use复验26与侧栏，Android保数据install-r后实际触摸/Back/长按及同态首页复拍量图。没有准确新包与实际交互不得提前关闭本任务或父目标；原版删除实验仍暂停。
