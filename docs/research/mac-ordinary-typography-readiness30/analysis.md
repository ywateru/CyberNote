# 普通 Mac 表单文字：有限准备30

2026-11-05，Asia/Shanghai。原版26与Safari26中，名称和“制作智能文件夹”的墨迹位置已对齐，但目视原版仍较浓重。**现有证据不能把差异确定为字重、字体族、颜色或抗锯齿中的任何一项，也未选定下一项实现。** 本准备只定位当前生产源码的局部接缝，等待准确Mac12真实截图；无新渲染、测量、GUI或测试，不授像素PASS。

## 证据与当前源的身份边界

[输入清单](input-manifest.json)固定26项身份；[相关源码片段](source-excerpts.md)保存本次读取版本的行号和原文。当前App/style处于task28源码准备及独审期间，不能把当前全文件当作Safari26的构建输入，更不能将28样式变化当作原版变化。

| 当前读取文件 | SHA256 | 与26关系 |
| --- | --- | --- |
| src/App.tsx | `d7b20f13b2ee076ab2708c0e837be60f8b2387a2bdeccc6d2fa8ae9e06526911` | 当前挂载路径身份；无26同文件身份对照，不宣称历史相同。 |
| src/style.css | `df752ab5f04beb94372b25349a78e027028818eb6c4d75b25c77f46634916008` | 不同于26源清单的 `99628d2bc1cae683f620675d062a7a9542bbbb91db0ab05e45274f093b7729bf`；只描述当前静态声明。 |
| src/SmartFolderForm.tsx | `b2e4d60e5cbe0265b1bca7a67cd5c2d7412b3697e34152d870c0d0344770c15c` | 与26源清单相同。 |
| src/smart-folders.css | `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c` | 精确等于26候选CSS身份。 |

[26 Safari封存](../mac-ordinary-name-focus26-safari-analysis/analysis.md)索引SHA `d1dfff44c5a8311a842a5ac6c58c6f2e119a5c0c9b324a27559adfdbe1841269`；[原版26](../mac-ordinary-name-focus26-original-runtime/README.md)索引SHA `841ce671a17ffba8e9eb24b019318e3a8e4def972a960638553db4acc04b84a0`；[25真实Mac11研究](../mac-ordinary-surface25-runtime-analysis/analysis.md)索引SHA `3a13b39ef6770dba0d823a656056e558af3643141ecb7a0e761df85c66ddd213`。本轮重看已保存的三联图，没有重裁图、重定ROI或重算阈值。原版26全选与旧参考是同字节，只算一个全选样本。

## 已成立的有限差距

| 项目 | 已封存证据 | 尚不能推出 |
| --- | --- | --- |
| 名称墨迹 | 原版与Safari全选/部分均为 `[142,125,268,149)`，此前4px右移已消除；目视原版较浓重。 | bbox相同不证明字形、覆盖量、前景色、字重或抗锯齿相等。 |
| 智能标签墨迹 | 原版与Safari为 `[85,197,262,221)`，此前2px右移已消除；目视仍有墨迹细差。 | 无需据此继续改gap、横移、字号或scale。 |
| “名称：”标签 | 原版右缘100、Safari99，左缘41及y相同。 | 1px边缘含JPEG/抗锯齿限制，不支持单独改字重。 |
| 25/19旧表单文字 | 25保留标题/说明字形细差；19曾报标题1531→1402、说明2424→2096的阈值深色覆盖差。 | 这些是旧宿主/旧状态、不同文字ROI和捕获图结果，不能转授为26名称覆盖量或统一加粗依据。 |
| 选择状态 | 原版26/Safari26都有完整默认名称和“件夹”部分选择证据；暖选区已成立，背景颜色仍不等。 | 选区背景差不能当作前景字重差；Safari03表单保留，取消仍未通过。 |

原始JPEG、相同Display ICC转换到sRGB、宿主渲染路径和指针光晕的限制沿用26封存。字形观察位于光晕之外，但排除光晕并未使两宿主的抗锯齿或捕获流程相等。没有原版公开字体属性、实际glyph字体身份或同条件无损字形对照，不能命名原生字体或确定原生weight。

## 当前生产路径与最小接缝

`main.tsx:9`导入全局style；`SmartFolderForm.tsx:28`导入表单CSS。App4595–4612按folderForm挂载真实SmartFolderForm，传入mobile及回调，没有该调用点的内联字体。SmartFolderForm335/350仅在桌面、非编辑、非smart草稿时组合 `.smart-mac .smart-ordinary`；切到智能状态或移动端即不在此普通选择器范围。名称是596–605的真实input，智能标签是607–627的label文本与checkbox，没有独立文字span。此处是静态路径，未冒充运行computed或实际字体解析结果。

| 规则位置 | 当前静态声明/继承关系 | 后续可局部隔离的参数 |
| --- | --- | --- |
| style.css1–24 | 系统字体栈；root14px、400、font-synthesis:none、`-webkit-font-smoothing:antialiased`、text-rendering:optimizeLegibility。 | 普通表单内精确节点的weight、smoothing、渲染请求可作为独立诊断轴；不修改root。 |
| style.css36–42 | input等控件 `font:inherit; color:inherit`。 | 名称input可单独声明，避免同时改变“名称：”文本和其他控件。 |
| smart-folders.css35–49 | `.smart-name`13px；input沿用字体声明，颜色继承。 | `.smart-mac .smart-ordinary .smart-name input`是默认名称的最小接缝，已有padding5与height24保持为对照。 |
| smart-folders.css55–63、534–537 | `.smart-make`13px；普通label gap6、line-height16；本地没有weight/family/smoothing覆盖。 | `.smart-mac .smart-ordinary .smart-make label`可局部调整文字声明；它也包含checkbox，后续必须观察checkbox和布局。无需为本准备改DOM。 |
| smart-folders.css12、527–530 | form颜色请求 `var(--text,#202020)`；聚焦名称选区显式深色 `#202020`、暖底 `#fceac1`。 | 普通未选文字与选中字前景需分开观察；继承color和::selection color是不同接缝，当前无原版目标前景色证据。 |

h2沿用桌面700并由普通规则改成13px/16px；说明p有独立次级色与13px/16px；footer按钮另有样式。它们不在本次名称/智能label最小候选范围内，不能把整个 `.smart-ordinary`统一加粗。源码本地没有文字描边、阴影、横向缩放或字距补偿声明，不提出用这些方式模拟当前差距。

## 既有字体/抗锯齿诊断的可用边界

[02字体族与kerning控制](../mac-body-webkit-controls-02/README.md)的三种正文样本宽度相同，完整JSON导出曾截断；[03六控制](../mac-body-webkit-controls-03/runtime-analysis.md)的摘要同宽，computed未完整导出；[04系统文字样式](../mac-body-webkit-controls-04/runtime-analysis.md)完整26短JSON导出，family声明不同而三样本宽度相同，其余14项computed包括400、antialiased均固定。

这些是Safari正文Range宽度结果，既没有本名称/智能label的单变量墨迹比较，也没有改变smoothing来测其视觉作用。它们不证明名称字体相同、weight错误或AA根因排除，不值得无证据重跑同一大矩阵。本准备只复用这些负结果及限制，不新增控制页，不提取字体，不推断Notes内部字体接口。

## Mac12到达后才能决定的内容

先核准确包、实际输入源身份、普通创建状态、默认全文与“件夹”部分选区、活动/失焦状态、窗口比例和捕获流程。以26原版对应状态比较，保留原始图；只看已固定的名称与智能label区域，确认当前真实宿主是否仍存在同方向文字差距，不把Safari预览替代该证据。

若差距仍在，可先读取真实节点computed font-size/weight/family、color、smoothing、text-rendering、letter-spacing与可取得的缩放信息。computed family只是声明/解析值，仍不等于每个glyph的真实字体。此记录用于判断是否需要局部诊断，不预先选择新的数值。

| 候选轴 | 仅在后续证据支持时的局部范围 | 本轮决定 |
| --- | --- | --- |
| font-weight | 默认名称input与智能label分别观察；一次只变一个声明，保留原400对照，不预定500/600等目标。 | 未选定。视觉较浓重不足以直接加粗。 |
| `-webkit-font-smoothing` / text-rendering | 上述同一精确节点，分别做单变量对照；记录请求和真实结果，不假定换值一定改变绘制。 | 未选定；现有实验没有AA视觉因果证据。 |
| 前景color及::selection color | 未选智能label与选中名称分别核查，背景仍按26状态；不得把JPEG边缘色直接抄成CSS。 | 未测原版稳定前景，不能给目标色。 |
| family / text-style路径 | 仅在真实证据显示更窄的原因后考虑，不重放已负结果正文宽度矩阵。 | 无本表单支持，优先保持现栈。 |
| font-size / gap / padding / letter-spacing / transform | 位置和126×24/177×24墨迹外框已对齐，无新的尺寸/布局差证据。 | 保持现状作为对照，不为浓重感改这些量。 |

准确Mac12截图尚未到达，本准备不要求现在实施任何候选。选中/未选、失焦重激活、Escape卸载及其他真实交互仍由准确包后续验收；也不扩展到智能表单、正文、移动端或全应用字体。

## 保全与停止

26项输入在收尾重核大小、SHA和mtime，结果见清单；仅新增本目录的准备文件。全部旧研究、root预览、原图、录屏、产品、共享文档与Git保持不改，无GUI、渲染、代码/应用测试、构建、下载、缓存操作、数据库或设备操作。[证据索引](evidence-index.json)覆盖本目录其余文件，排除自身。**READY STOP：只读准备完成，没有实现选择或像素PASS。**
