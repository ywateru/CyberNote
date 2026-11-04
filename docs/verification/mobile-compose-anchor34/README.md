# Mobile compose anchor34 — SOURCE-READY STOP

2026-11-05（Asia/Shanghai）。产品仅在 `src/style.css` 增加三行 `.mobile.page-folders .folder-footer { padding-right: 14px; }`，局部覆盖旧17px右内距。按钮、SVG及两条路径共同右移3 CSS px；左/底内距、footer52px高、按钮30×35、SVG24×24、描边1.4、颜色、路径、DOM和回调均保持。源码阶段有限证据已完成，未构建或操作设备；整个像素/交互目标仍未完成。

## 固定输入与单一候选

`input-manifest.json`固定当前HEAD `a69146a88b78f7565ac09bf45a90a7376e60810d`、产品及原始帧的字节/SHA。START指定e687…至当前HEAD只变docs，root明确允许以当前身份继续。未读取/修改平行35的工作树或插件文件。`baseline-style.css`保留完整原CSS；`source.patch`为唯一产品差异，`protected-inputs-after.json`验证除本样式外的冻结输入保持。准备32与原录屏/Android07保存帧原样保全。

实际Android07宽归一中心206.2667，对原14/62秒208的差距1.7333；结合当前DPR2.75的平移估算约3.039 CSS px。只选择右移3像素这一候选，即17→14；不通过大小、路径或颜色补偿，不针对Chrome宿主光栅边缘扩大搜索。

## 完整生产App与有限交互

`check-production-initial.mjs`用于baseline；修正SVGRect序列化后，`check-production-candidate.mjs`用于candidate（与`check-production.mjs`相同）。直接导入当前真实App/Editor/bridge和完整生产CSS，真实生产浏览器预览持久层仅使用独立context的`notes-browser-preview`合成8条记录；所有非本机HTTP请求被拒绝。没有替换生产UI或事件，没有访问用户数据库。命令与退出身份见`run-log.json`。

Chrome采用准备32实际`innerWidth/innerHeight`393×751和DPR2.75。Chrome只允许整数CSS viewport；Android实际visualViewport为393.0909×751.2727，二者分数余差未强行校准。Chrome PNG为1081×2065，Android保存图为1080×2280（包括系统区域）；图像宽比均各自计算，不把当前DPR套到原版录屏。

baseline、candidate均PASS。candidate保留8个有限坐标检查：左侧加号圆中心、近右缘均打开真实新建文件夹对话框并Escape取消，右/上/下外界均不打开；右侧compose按钮右/上/下外侧不触发，按钮中心走真实newNote回调、进入`.page-editor`并使独立fixture记录从8增至9。SVG完全处于随之移动的按钮内。

首页345元素中，差异恰好为footer的padding-right/padding-inline-end，以及右按钮、SVG、两条path的x各+3，其他全部计算样式、位置、尺寸、文字保持。左按钮全部字段相等，路径逐字相等，候选getBBox与准备32实际值相同。首页逐RGB差值仅在[966,1964,1031,2021)图标区域。桌面315元素、稳定手机列表133元素的全部计算样式/几何/文字及独立fixture相等，对应PNG逐RGB零差。

## 保存的控制补采与失误

原始`baseline/notes.png`和`candidate/notes.png`在200ms仍处于已有240ms page-in动画，造成不足0.01px的瞬态位置差；没有把它们解释为产品稳定结果。仅补采notes并等待实际动画finished，确认transform=none。`check-stable-notes-attempt01.mjs`的并行补采在baseline发生本地Vite WebSocket端口24678冲突，保存的`baseline-stable-notes/result.json`明确FAIL；同批candidate成功。单独重跑baseline（`baseline-stable-notes-retry01/`）PASS，最终使用此基线与成功candidate比较。未因工具连接冲突改产品或删证据。

首次baseline的getBBox使用JSON.stringify(SVGRect)，得到空对象，保留原始文件；候选改成逐字段序列化。baseline路径字符串、rect/computed可比，且准备32封存了实际几何，不为baseline补造几何。分析初稿`analyze-attempt01.py`错误要求该空对象与候选对象相等而断言；`analyze.py`改为比较全部元素computed/rect/text以及实际可比的left/viewport/app/storage，保留初稿。均非产品失败。

## 局部量图与结论边界

`analysis.json`及可复现`analyze.py`沿用原14/62、实际07的共同ROI和strict/loose金色阈值；Chrome固定宿主ROI[930,1935,1060,2045)，仅平移宿主裁切纵向原点以覆盖本机footer，不为每个候选拟合。所有bbox为原图半开坐标，按各图宽/224归一；不进行纵向拟合或恢复原版CSS/dp/pt/DPR。

|证据|金色bbox（两阈值一致）|宽归一中心x|宽归一宽度|
|---|---|---:|---:|
|原14/62|[202,442,214,454)|208|12|
|实际Android07保存帧|[966,2049,1023,2105)|206.2667|11.8222|
|Chrome baseline|[966,1964,1022,2021)|205.9722|11.6041|
|Chrome candidate|[974,1964,1031,2021)|207.7336|11.8113|

Chrome垂直bbox保持1964..2021；bbox宽从56到57原生像素是同一几何的分数边缘平移取整/阈值结果，SVG/按钮尺寸及路径没有变化。以实际Android07中心为起点、只加入3×2.75=8.25当前原生像素的平移，**模型**中心207.9778，差208为−0.0222；这不是新Android渲染结果。宿主候选自身中心仍差−0.2664，完整保留，不按有利坐标系宣称像素通过。

已目视`compose-width-normalized-nearest8x.png`：当前框和笔的轮廓随整体平移保持，原录屏压缩抹去了细部；原版笔尖镂空、端帽、开口、线重、颜色和原生按钮slot仍无法确认。放大图按整图宽比均匀缩放、最近邻8倍，注明各自ROI，不是逐控件拟合或评分。没有SF Symbols原生路径恢复，不授path-perfect、完整像素、iOS原生宿主或实际新包PASS。

后续由root提交后，不同作者窄独审；准确同源Android新包的稳定/重启截图、右下新建真实点按和原ROI量图后才可授实际局部交付。本轮无GUI、ADB、平台构建、下载、数据库、删除或媒体导出。
