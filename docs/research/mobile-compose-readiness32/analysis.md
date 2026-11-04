# Mobile compose readiness32 — READY STOP

右下角“新建备忘录”的现有证据支持下一步仅校准文件夹页右侧按钮槽位：当前 Android07 按钮与 SVG 盒子已正确同心，实际 Lucide 路径的几何中心反而向右偏约 0.498 SVG 单位。录屏参考中的外包络宽度与当前图标接近，而当前整体位置向左；不能把这一差异归因于路径天然向左，也没有证据支持通过放大图标补偿。本准备阶段未选定任何目标 CSS 数值，未修改产品。

## 范围和证据身份

本轮只读当前 `App.tsx`、`style.css`、实际安装的 Lucide SquarePen 实现、已保存的原版 14/62 秒帧及 Android07 稳定和重启截图；未读取正在调整的 `src/smart-folders.css`，未扩大到其他控件或重跑全页矩阵。初始 16 项输入身份记录于 [input-manifest.json](input-manifest.json)，相关源代码摘录见 [source-excerpts.md](source-excerpts.md)。录屏及既有证据均保留。

唯一新增运行证据是一次只读 WebView DOM 几何采集。[device-preflight.json](device-preflight.json) 与 [read-only-cdp-result.json](read-only-cdp-result.json) 保存命令、精确请求、表达式和原始响应；[read-only-cdp.mjs](read-only-cdp.mjs) 为采集实现。设备为 `emulator-5580`，PID 前后均为 `27930`，APK SHA-256 为 `e19965fd97c45ac3184e569777146d68b4d312bd561bbb2862d27ad93c6a86c6`。采集前后身份一致，自己创建的临时转发已核验并移除。没有输入、导航、样式或 DOM 写入、桥接调用、数据库访问、安装、启动或重启。

页面为 `http://tauri.localhost/`，`.app.mobile.page-folders`、footer、按钮和 SVG 可见，文档完成、字体加载完成，检查的对话框/菜单/浮层选择器无可见项，document scrollTop 为 0。**采集器误用了 `.folder-list` 而源码实际为 `.folder-scroll`，因此 `folderScrollTop:null` 不能证明实际文件夹滚动区为零。** 原始记录保留，此处不补采；已保存截图的稳定状态沿用 runtime29 的证据。

## 保存图像中的位置和大小

[compose-local.json](compose-local.json) 保存四张图像的局部计算，[compose-local.py](compose-local.py) 保存可复现脚本。边界为半开区间，两种既有金色阈值均得到下表边界。

|证据|原图大小|金色边界（原图像素）|按图宽归一化的中心 X|按图宽归一化的宽度|
|---|---|---|---:|---:|
|原版 14 秒|224×480|[202,442,214,454)|208|12|
|原版 62 秒|224×480|[202,442,214,454)|208|12|
|Android07 稳定|1080×2280|[966,2049,1023,2105)|206.2667|11.8222|
|Android07 重启后|1080×2280|[966,2049,1023,2105)|206.2667|11.8222|

这里只用 `1080/224` 进行图像宽度归一化，没有反推原版的 CSS、dp、pt 或 DPR。当前 Android 边界归一化为左 200.3556、右 212.1778；相对原版分别向左约 1.6444、1.8222 参考图像素，中心向左约 1.7333。外包络宽度已经接近。两张原版严格阈值计数均为 39，宽松阈值计数为 92/99，反映压缩边缘敏感性；Android 两阈值均为 1050。四张输入无嵌入 ICC，计算沿用既有 RGB 方法，不能据此宣布颜色等价。

局部图见 [compose-native-crops.png](compose-native-crops.png) 和 [compose-width-normalized-nearest8x.png](compose-width-normalized-nearest8x.png)。后者仅将 Android 局部按整图宽比例缩小，再最近邻放大供观察；不同裁切原点已标注，不是逐控件拟合，也不构成像素评分或纵向校准目标。

## 当前按钮、SVG 盒子和实际路径

只读 DOM 得到：footer 高 52 CSS px，左右 padding 各 17，flex `space-between`；右按钮为 30×35，x=346.0909119，中心 x=361.0909119；SVG 为 24×24，x=349.0909119，中心同为 361.0909119。按钮和 SVG 均没有 transform，SVG 在按钮内居中。SVG viewBox 为 `0 0 24 24`，stroke 为 `rgb(198,158,0)`，stroke-width 为 1.4px。

实际 `getBBox()`（不含 stroke）为 x=3、y=2.0044124、width=18.9955902、height=18.9955883，几何中心 x=12.4977951，相对 viewBox 中心 12 **向右** 0.4977951。外框路径单独为 x=3、y=3、18×18；斜笔路径为 x≈7.9960、y≈2.0044、约 13.9996×13.9996。DOM 中两条 `d` 与安装的 `lucide-react@0.468.0` SquarePen 实现逐字一致。

当前 DPR=2.75；SVG 屏幕矩阵 a=d=1、b=c=0，e=349.0909091。由路径几何中心计算的当前原生横坐标为 994.3689365，保存图像金色边界中心为 994.5，残差约 **0.1311 当前原生像素**。几何边界加半描边再乘当前 DPR 的模型为左 966.325、右 1022.4129，和保存整数边界 [966,1023) 在局部精度下相容。这只是几何解释，没有独立光栅化 SVG，也不是抗锯齿或阈值边界的精确预测。

当前 app 宽约 393.090912 CSS px，乘 DPR 约 1081，而截图宽为 1080，存在分数布局、取整或捕获边界差别。因此保留两套坐标，不强制等同比例；DPR 仅解释当前 Android 几何，不应用到原版。

## 图形形状和仍未解决的差别

保存原版局部可见方框与右上对角书写符号，但原录屏仅 224×480 且有压缩，开口、笔尖、拐角和内部镂空细节不足以恢复。当前 Lucide 局部可见圆角外框、明显的右上开口、向外突出且带圆端的长笔头，以及左下较清楚的中空收尖结构。原版斜笔在这个分辨率下更像窄实线或模糊斜线；这**不能证明**原版确为实心，也不能证明它使用不同的端帽或笔尖，因为压缩会抹去内部细节。

因此包络大小接近不代表拓扑、线重、颜色或拐角一致。没有恢复原生 SF Symbols 路径，没有原版按钮槽位或 viewBox 几何，不作 path-perfect 或像素级通过结论。

## 下一步的局部接口与有限验证

可局部检查 `.mobile.page-folders .folder-footer` 的右侧 inset/padding；若需要更明确隔离，也可利用现有 `IconButton.className` 为文件夹页右按钮增加专用类。应使槽位与命中区域一起移动，保留左侧 padding、加号的命中区域和覆盖层、footer 高度/safe-area、现有按钮和 SVG 大小、两条实际路径。不要更改全局 `.icon-button`、所有 `.folder-footer svg`、SquarePen 定义，或影响 notes-footer/编辑器路由。本准备不选择目标数值。

后续由实际生产渲染和新的 Android 包验证：对照精确输入和安装包身份，记录稳定文件夹页及重启后状态，对同一 compose 局部重算左右边界、中心与宽度，确认左侧加号、footer 高度、文件夹内容和其他路由保持预期，并实际验证点按右侧按钮进入新建笔记。图形拓扑与原版低分辨率不确定性需单独记录，不能以平移结果替代形状验证。本轮到此封存，不再操作设备。
