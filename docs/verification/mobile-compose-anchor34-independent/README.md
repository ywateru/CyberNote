# 手机新建按钮锚点34：独立窄复核 — SOURCE-READY STOP

2026-11-05，Asia/Shanghai。不同作者复核 develop_app 的 task34。root 固定主树 HEAD 为 `e194753cdfb2edda342342ae094ec43bdc5b61ff`，style SHA-256 为 `5ceac05bf79ca9fa83e0237b909c76281c2b03993ab654dbc6bed37191060929`。没有发现本次源码范围的阻塞问题，**仅授源码与隔离浏览器预览通过**。未构建新包、操作设备或访问笔记数据库，不授实际 Android/iOS、原版完整像素或整个任务通过。

## 独立检查内容

[author-index-check.json](author-index-check.json) 将作者30个成员按**作者目录相对路径**逐一核对字节与SHA，全部匹配；作者索引 SHA-256 为 `4f61011adfe2125ea22a4e84432a5f1ec3c958f8e2b39055e4017b9a7bc0e796`。作者缓存保留且不纳入成员，不把目录相对路径误解为仓库根路径。

独立对保全的完整 `baseline-style.css` 与固定当前样式作逐字比较，只差 `.mobile.page-folders .folder-footer { padding-right: 14px; }` 三行；移除这一处后字节相同，见 [source.diff](source.diff)。其他六项冻结产品输入 App/Editor/bridge/smart-folders.css/package/pnpm-lock 与作者冻结身份匹配。HEAD 来自root固定交接，没有重跑Git或全仓库无关差异矩阵。

源码显示右按钮仍是同一个 `IconButton`，SquarePen 未替换，mobile onClick 仍为 `newNote → createNote → action(createNote) → metadataRefresh → setPage(editor)`。左按钮与其 `::before` 命中扩展未修改，既有布局的 footer `space-between` 使右内距只改变右侧按钮的位置，不通过 transform 偏移画面。

## 一次独立窄生产复现

[check-production-narrow.mjs](check-production-narrow.mjs) 直接导入真实 App/Editor/bridge 和完整 CSS，在单个独立 headless Chrome context 中先使用保全基线、再使用固定候选。合成预览存储仅三条笔记，所有非该本机origin的HTTP请求拒绝；没有替换生产UI或事件函数。viewport 393×751、DPR2.75；整数浏览器viewport与 Android32 分数visualViewport差异保留。

[fresh-production.json](fresh-production.json) 和 [fresh-production.log](fresh-production.log) 为唯一进入App的复现结果，exit0，无page error或外部请求。只采 footer、左右按钮、SVG、两条path和伪元素的有限几何/样式，不生成作者那类巨型全属性快照。

- 右按钮 x346→349，SVG x349→352，两条path也各右移3 CSS px；y、宽高、所采样式、描边、颜色和两条 `d` 不变。SVG仍完整位于30×35按钮内，尺寸24×24。两次fresh `getBBox` 均显式捕获且相等。
- 左按钮仍为 x17/y713/24×24，`::before` 仍为 right−10、宽34、高24。圆加号中心(45.6,718)、近右缘(50.1,718)均打开真实新建文件夹对话框并Escape取消；(51.25,718)外侧不打开。
- 旧按钮左条带(347,725)不再命中；新右侧条带(378,725)属于同一新建按钮并走真实生产回调，合成笔记3→4、空白正文、进入 `.page-editor`。中心hit-test也指向“新建备忘录”。右/上/下外界均不创建笔记或打开对话框。
- 在真实进入的编辑器路由，规则匹配数为0；基线/候选切换时隐藏footer及左右按钮/SVG有限computed/rect相同，右内距仍17。这里只证明该局部规则未影响这些字段，不宣称完整编辑器外观或输入回归。

共8次有限坐标点击，其中两次左加号成功并取消、五次外界拒绝、一次新右条带创建。截图 [fresh-compose-opened.png](fresh-compose-opened.png) 在路由成立后立即取得，仍有原有入场动画，**不用于稳定编辑器几何或像素验收**；后续局部隔离采集由脚本等待有限动画完成。

默认权限下第一次尝试在listen127.0.0.1阶段遇EPERM，未进入App，原始日志 [fresh-production-listen-permission-failure.log](fresh-production-listen-permission-failure.log) 保留。同脚本通过工具的本机端口权限升级后运行成功；没有为此修改产品、扩大请求范围或删除缓存。启动命令及脚本身份见 [fresh-command.json](fresh-command.json)、[fresh-run-results.json](fresh-run-results.json)。

## 局部量图和范围外控制

[verify-bounded.py](verify-bounded.py) 独立重写固定compose ROI和既有strict/loose RGB阈值，只复算原14/62、旧Android07、作者host前后、本次fresh前后七组图像的14项mask记录，全部与已有可比记录一致。结果见 [bounded-result.json](bounded-result.json)、[verify-bounded.log](verify-bounded.log)。

|图像|两阈值共同bbox（半开原图像素）|按整图宽归一的中心x|
|---|---|---:|
|原14/62|[202,442,214,454)|208|
|旧Android07|[966,2049,1023,2105)|206.2667|
|作者与独立host基线|[966,1964,1022,2021)|205.9722|
|作者与独立host候选|[974,1964,1031,2021)|207.7336|

两套host前后全图逐RGB差异bbox均只有 `[966,1964,1031,2021)`，垂直范围相同。宽56→57原生像素与不变几何的分数边缘光栅取整相容，不能解释为SVG放大。候选host中心相对原208仍差−0.2664，未以模型余差代替此真实host余差。

Android07保存中心仅作平移模型：加3×2.75原生像素再按1080/224归一，206.2667→207.9778，差208为−0.0222。**这不是新Android结果，也不能恢复原版DPR/CSS/slot。** 独立算术匹配作者模型；当前Android实际分数viewport乘DPR约1081与保存截图宽1080的差别继续保留。

范围外仅使用已保存的desktop与稳定notes控制：各选择5个相关节点、10项相关computed属性和rect/文字核对相同，fixture存储也相同；独立解码逐RGB检查两对PNG均零差。没有盲目重跑全部页面或全属性矩阵。

已目视 [compose-diagnostic.png](compose-diagnostic.png)：host候选和独立候选保留相同框、斜笔与开口，整图宽归一后整体右移。原录屏低清压缩，现有Lucide的圆角、镂空笔尖和突出圆笔头与原图细节仍无法确认等同。图中各自ROI、整图宽比例和nearest8x明确，不逐控件拟合，不授path-perfect。

## 作者失败记录核对与最终边界

作者原始notes在200ms取样，尚可能处于240ms入场动画；最终控制使用等待动画完成后的baseline retry与candidate，未把初始瞬态当稳定隔离结果。作者并行stable-notes首次baseline确实在JSON中标记FAIL，含WebSocket关闭错误，重试才PASS；相关原始文件和端口冲突说明保留。初始baseline SVGRect被序列化成空对象、首个分析断言脚本因此失败的限制也保留，没有补造原几何。本次fresh前后均实际逐字段捕获getBBox。

本轮独立检查未发现新增阻塞问题。准确Android新包稳定/重启状态、真实点按、原ROI量图仍待后续；iOS非零safe-area、原生路径/线重/颜色/slot、完整手势与整页像素均未关闭。只读32的滚动selector误读也不因本轮浏览器结果变成已解决的设备证据。

输入前后身份见 [inputs.before.json](inputs.before.json) 与 [integrity-result.json](integrity-result.json)。本轮仅新增本目录和指定独立review文档，未修改产品、作者/旧参考/缓存、共享文档或35工作树，未运行Git、平台构建、Computer Use、ADB、数据库操作或下载。
