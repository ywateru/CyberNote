# 手机文件夹视觉28独立复核

结论：**BLOCKED / STOP**。三处产品改动范围与事件保全核对通过，但新增底栏圆加号存在真实不可点击区域，必须修复后才能固定这一候选并进入准确包阶段。

## Findings

**[P2，blocking] 新建文件夹的可见圆加号位于按钮命中范围外。** 任务28要求底栏图形与交互保持，`src/MobileFolderIcons.tsx:50`起的Add图标以24×24 viewBox绘制，圆心cx28.6、半径4，依靠overflow visible显示外侧加号；SVG自身pointerEvents为none。`src/App.tsx:4105`附近仍由原footer button拥有onClick，现有CSS保持按钮24px宽。

独立挂载当前完整生产App/Editor/bridge与所有CSS、隔离browser-preview存储，在390×746 logical viewport实测：button及SVG均为x17/y708/24×24，按钮右缘41；可见加号圆心为x45.6/y713。`document.elementFromPoint(45.6,713)`落到 `.folder-footer`，没有解析到按钮；随后真实浏览器坐标点击该点，dialog数量仍为0。作为正对照，同一button中心点击能打开生产新建表单，Escape能卸载表单，合成目录数组保持。问题不是locator选错按钮或取消回调故障。

证据：`docs/verification/mobile-folder-visual28-independent/app-result.json`中的footerHit、`app-command.json`及`mobile-current.png`。新图标的有效绘制最右至viewBox x32.6，不能只证明button中心可点就接受整个新图标交互。需要最小修复使可见加号区域也命中同一新建按钮，同时保持既有绘制位置、标题/搜索/行/底栏外部布局及其他分支。root已确认本项blocking，修正具体实现归产品作者；本审阅不改产品。

**[P3，non-blocking当前源码范围；准确包验收仍gate] 模拟宿主的有限几何与轮廓结果不能当新Android07结果。** 作者同态mock-host标题宽52.889对原视频54；准确旧Android06宽58.074与模拟修前57.244不同。它们不是同一宿主，不据此追加调参或宣称实际07标题已对齐。原224×480压缩帧仅有约1–2源像素边界精度；Quick内纹/闭合folder/外圆加号三张诊断图目视类别和锚点改善，但不是原生路径精确复原或全像素PASS。notes旧/新8个像素、最大通道差1保留为细差，未重复测试凑零差。

## 已通过的有限核对

69项身份检查通过，涵盖作者53条索引与索引自身、15项源/参考身份；70项去重受保护输入结束时全部未变。精确产品：App `d7b20f13b2ee076ab2708c0e837be60f8b2387a2bdeccc6d2fa8ae9e06526911`，style `df752ab5f04beb94372b25349a78e027028818eb6c4d75b25c77f46634916008`，MobileFolderIcons `bcfb1e37dc95761342ec3c4669c3444a432c7236c90ea239160f5b9d4283395f`；26CSS保持 `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c`。

14项静态核对通过：当前App可完全由封存基线的import、手机quick局部class、三处手机图标分支替换重建；style完全等于基线加现有mobile媒体范围内的两条page-folders规则。独立TS AST核对startLong、stopLong及folderRow五类事件共7段原文和哈希均不变，timeout仍520ms。3个本地currentColor SVG均无导入/外部资源/自有事件，aria-hidden/focusable/pointer-events边界明确。普通目录图标仅mobile分支，all/smart/trash与桌面原图标分支保持。

新的小范围实际生产App检查5项通过：all/smart/trash图标保留、quick-only class及装饰SVG、直接点击Quick图标进入真实快速notes再Back、原footer中心打开后生产App Escape卸载且目录数组保持、无JS错误/外部请求。外侧加号坐标点击另外如实记录为失败，所以helper的5项pass不代表本轮交付pass。没有重跑作者7类全套或typecheck。

作者baseline06/candidate03的7类生产检查与一次typecheck原记录准确保留，含普通导航、底栏取消、520ms长按、touchmove/end取消、280窄窗长名/1234计数；它们是隔离浏览器事件，不替代原生触摸、选字把手或Android Back。封存DOM快照独立核对标题行框41px、search/footer/button rect、所有行/计数/chevron、非quick文字rect不变；quick文字只局部槽距变化。desktop零像素差仅此模拟宿主有限隔离。

本审阅首次测试误把现有lucide-trash2类名写成lucide-trash-2，原失败脚本/结果/命令已保留；仅修fixture后有限检查通过。所有无界面浏览器/Vite/HTTP资源均finally关闭，专用cache仅写新独审目录并保留、不进入索引；无GUI/ADB/用户DB/Git/下载/正式包构建或旧证据/视频/APK/ZIP/缓存删除。

后续仅需先修外侧加号命中并做该边界及隔离回归，再交root进入共同源Mac12/Android07标准出包与实际验收。完整跨端父目标继续开放。**BLOCKED STOP**。
