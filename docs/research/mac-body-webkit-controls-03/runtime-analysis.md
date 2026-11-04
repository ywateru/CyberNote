# WebKit 六控制03：runtime01–04有限结论

root已实际运行本地Safari研究页。可确认**六组摘要显示相同的三种文本宽度与重复段落推进**，但完整JSON没有通过现有AX记录导出。不能把这个结果写成computed值已确认、指定字体feature已应用、API失效或可据此修复产品。

本文只读整理既有runtime01–04、两份HTML及静态说明/清单，不运行GUI、浏览器、测试或新构建。原`manifest.json`与`multiline-manifest.json`不修改；新增`runtime-manifest.json`单独记录本报告与全部既有输入身份。

## 各次采集的真实范围

|记录|可观察内容|边界|
|---|---|---|
|runtime01.ax.txt|Safari标题为“打开”，AX根为`open-panel`，选中controls.html，仍有“打开”按钮|**文件打开面板**，不是研究页运行结果，不能计作六组实验|
|runtime02.ax.txt / .cua-image|页面URL为controls.html，显示测量完成、六组摘要和各组结果长度状态|AX每组结果正文只有512字符前缀；没有独立可解析完整JSON|
|runtime03-focused-baseline.ax.txt|同controls.html，末尾focused element为“控制1 baseline 完整JSON”文本输入区|聚焦成功的证据；其Value仍是文本输入区占位描述，子文本仍只含512字符前缀，没有因此获得完整baseline数据|
|runtime04-multiline.ax.txt / .cua-image|页面URL为controls-multiline.html，六组摘要相同，多行序列化结果状态|换行保留在AX子文本中，但每组仍只有512字符，完整JSON仍未导出|

两张`.cua-image`实际编码均为2648×1806 JPEG。runtime04截图目视可见六组摘要与baseline文本样本；右端推进列显示区域会裁切，其完整三个数字使用AX表格读取。截图不补足未保存的逐字符数据。

## 已保存的摘要

runtime02、runtime03、runtime04的六行表格值逐项相同，下列宽度/推进单位依研究页逻辑为**CSS px**，显示到6位小数：

|控制|CSS支持摘要|旧混排宽|紧连标点宽|中隔宽|重复段落top推进|
|---|---|---:|---:|---:|---|
|baseline|基线|276.742432|103.190659|219.280151|17.218750 / 17.218750 / 17.218750|
|spacing-space-all|false|276.742432|103.190659|219.280151|同上|
|spacing-trim-all|false|276.742432|103.190659|219.280151|同上|
|chws-off|true|276.742432|103.190659|219.280151|同上|
|chws-on|true|276.742432|103.190659|219.280151|同上|
|palt-on|true|276.742432|103.190659|219.280151|同上|

HTML对应的请求分别为：生产基线；仅`text-spacing-trim:space-all`；仅`trim-all`；仅`font-feature-settings:"chws" 0`；仅`"chws" 1`；仅`"palt" 1`。摘要CSS支持来自页面的`CSS.supports(property,value)`，只说明页面报告的语法接受结果，true不证明具体字体实施该feature。表格“相同”限于这些已显示的摘要字段，不代表所有逐字符位置、计算样式或像素完全一致。

这些研究样本使用生产字体栈、请求13px/17.22px、lang zh-CN、kerning auto；段落固定为纯文本p。该固定实验条件可由已保存HTML核对，**不等于已独立读出运行computed属性**。研究页不是产品WKWebView，也不是原版Notes，不直接将它的CSS px宽度减原版截图墨迹宽或乘所谓DPR解释产品差值。

前缀内完整可见的environment自述包括Safari UA `Version/26.4 Safari/605.1.15`、platform MacIntel、页面lang zh-CN、`dpr:2`、viewport `[1324,851]`与visualViewport `[1324,851,1]`。这里只记录**该研究页的自述环境**；没有据此建立原版/克隆截图、AppKit point或其他会话的缩放关系。

## 完整数据仍缺失

页面长度状态分别为：

|控制|runtime02/03自报JSON字符数|runtime04多行自报字符数|
|---|---:|---:|
|baseline|6157|6174|
|spacing-space-all|6234|6251|
|spacing-trim-all|6234|6251|
|chws-off|6253|6270|
|chws-on|6246|6263|
|palt-on|6246|6263|

这是页面自身对`textarea.value`序列化长度及首末括号的状态文字，不是AX导出通过。独立从保存AX中取每个`文本 {…`节点至下个AX节点：runtime02、runtime03、runtime04各有6块，每块**恰为512字符**，18块全部在sources字段路径字符串中断，JSON解析均失败；没有补`}`、恢复字段或用静态预期填充片段。

这些片段没有包含`applied`、`computed`、`samples`、`repeatedParagraphTopAdvances`或最后`interpretation`字段。因此：

- 实际inline接受值和computed属性值没有完整导出证据。
- 逐UTF-16位置、prefix宽、孤立标点与上下文位置数组没有保存为可重算的运行结果。
- 多行变体只显示改变了结果传递格式，尚未解决现有AX每块512字符截断。
- 研究页长度状态PASS和静态序列化边界PASS均不能替代运行数据导出PASS。

## 对当前产品的意义

本机这次Safari研究页没有在已保存摘要中显示`chws`或`palt`请求带来的宽度变化，两种trim请求的支持摘要为false。这是有边界的负结果，**不足以选择某个feature作为已生效修复，也不能证明字体根因被排除或API发生故障**。

下一轮如继续字体/标点研究，应先取得每组独立、可解析且保留输入身份的完整运行JSON，核对实际inline/computed字段，再检查逐字符与上下文差，并在产品实际WKWebView与原版重新复验。当前纵向17px/起点候选可以作为独立研究线，不应与未经确认的标点feature合并后将变化归功于其中一项。

本报告没有新增运行结论、修改静态清单或产品，未重新捕获界面。全部14份既有文件前后身份一致，记录于新runtime清单；输出阶段检查至少2GiB可用空间。
