# Mac WebKit 系统文字样式三控制04：运行前研究

状态：**prepared / Safari runtime pending**。只新增离线研究页及本目录材料，没有修改产品、旧控制页或既有证据，没有启动浏览器、构建、设备、字体提取、私有API或依赖下载，未commit或修改INDEX。Mac GUI仍由root独占。本材料不提出产品候选，更不以语法接受认定标点修复。

已有02四个字体族/kerning控制的三样本宽度相同；03六个trim/feature控制在已保存摘要中同宽，完整computed JSON未导出。这两项负结果不重复当作本轮进展。本轮新增问题是：**系统文字样式的font简写，在固定普通字号与其他长属性后，是否仍与生产字体族路径产生可观测宽度差异？**

## 官方与本机公开依据

WebKit官方2015文章区分系统字体族与包含字号/字重的文字样式简写，且当时在iOS Dynamic Type语境介绍文字样式，故历史文章不能证明当前Mac接受这些值。当前WebKit main公开源码中，body/short-body简写生成文字样式family；TextStyle和SystemUI分支分别处理，文字样式分支计算cascade。这个源码差别支持做对照，但main不是本机Safari源码版本，也不保证相同fallback或标点表现。

本机MacOSX26.5公开SDK把系统UI字体工厂与AppKit文字样式工厂分列；CoreText文档说明UI用途映射可以随平台/OS变化，并要求避免按保留的点开头私有名称请求系统字体。因此本页不硬编码任何私有字体名、不提取字体。官方来源、行段、版本边界及推断见references.json；本机头文件身份保存在fixture.json。

## 三组及唯一变化

- b：当前生产完整字体栈，普通全p正文13px/17px。
- body：同一元素初始生产字体族，随后仅请求`font:-apple-system-body`。
- short：同上，仅请求`font:-apple-system-short-body`。

所有组在请求后立即统一重设字号13px、行高17px、字重400、style/stretch/variant normal、kerning auto、feature/east-asian normal、synthesis none、letter/word spacing normal、text-rendering optimizeLegibility与抗锯齿antialiased。这样保留文字样式family路径，同时隔离简写可能带来的字号、字重和font-variant重置。普通p无额外字体声明，直接继承同组样式；每组同样lang zh-CN、同样无换行文本。

当前src/style.css的全p生产行高已经17px，本轮不沿用旧02/03的17.22px。三个样本依次是旧混排、紧连标点、中隔标点；逐字来自冻结corpus，不新增用户笔记。无缩放、负字距或组合feature控制。

## 紧凑、完整导出协议

每组是一行完整JSON，**JS字符串长度≤350**。q使用请求字典：F为`font-family:$font`，B/S分别为body/short-body的font简写；$font由独立完整块给出。c按独立字典列出15个实际computed值，w为三样本DOM Range宽，CSS px保留六位小数。s是CSS.supports语法结果；a只表示统一长属性重设前，inline请求属性的序列化字符串是否与请求完全相等，false也可能来自规范化，不能单凭它判断字体应用。

环境分别导出完整UA、语言/平台、DPR/viewport/visualViewport/zoom/字体加载状态、URL与screen信息；每个输入路径、字节数、SHA-256独立成块，样本文字、请求字典、computed顺序和固定属性字典也分别成块。**每块都实施同一个350字符上限**。超限只输出可解析完整BLOCK_LENGTH_LIMIT错误JSON及原长度，不补括号、不截断科学数据、不中途省略字段。状态显示实际最长块；这仍只是页内完整性声明，必须在AX保存后逐块JSON解析才算导出完整。

本页继续使用带标签的只读文本框，是因为旧03的512字符单节点截断已经被≤350的强制上限隔离；不会再次放入6KB结果并声称导出成功。三个控制结果置顶，元数据在后，结果区和样本区分离。若主控制或任一元数据出现长度错误，不用其余摘要补造缺失computed或环境。

## root操作入口

准确文件：`/Users/water/work/2026/Apple-Notes-Clone/docs/research/mac-body-webkit-controls-04/controls.html`。

用Safari File Open打开该文件；如仍在打开面板，确认选中文件并点“打开”，直到页面标题是“Mac WebKit 系统文字样式控制04”。页面自动测量，也有按钮“重新测量三组”。三个可聚焦元素的完整AX标签分别为“控制 b 完整JSON（≤350字符）”、“控制 body 完整JSON（≤350字符）”、“控制 short 完整JSON（≤350字符）”。其后元数据标签均以“元数据 … 完整JSON”开头。没有存储写入、上传或下载按钮。

root应保存页面实际AX和原始截图；先确认三个控制和所有元数据块均可独立JSON.parse、每块≤350、最后括号完整、状态无FAIL，再分析s/a/c/w。不要仅根据CSS支持true、页内完成状态或一张截图形成产品候选。若三组w相同，结论限于本页没有显示新路径宽度效果；若不同，先看15项computed是否有超出目标family的变化，再决定是否值得在准确产品WKWebView复验。Safari CSS px不直接换算原版JPEG的60图像像素差，也不能鉴定实际glyph字体或Notes内部实现。

静态核查见static-validation.json，只有HTML/JS语法、纯序列化边界与输入身份核查；不包含浏览器运行结果。
