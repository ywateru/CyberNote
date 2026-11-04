# 本地WebKit标点六控制03

用Safari打开本目录`controls.html`。本轮只有研究页，产品13px/17.22px与旧原件保持；开发代理未执行GUI或平台构建。实际运行由root用CUA采集。

严格六组：生产基线、仅`text-spacing-trim:space-all`、仅`trim-all`、仅`font-feature-settings:"chws" 0`、仅`"chws" 1`、仅`"palt" 1`。全部使用完整生产字体栈、13px/17.22px、kerning auto、text-rendering optimizeLegibility、lang zh-CN。记录CSS.supports、实际inline接受值与所测p的computed样式；true不等于具体字体feature已应用。

每组同18个纯文本顶层p：旧混排、紧连、中隔、8孤立标点、4行Ag中文、汉字、Latin、数字对照。冻结文本与派生规则内嵌页面，两个来源SHA在每组JSON中保留，无fetch依赖。无外部资源、网络/浏览器存储API；CSP禁止外部加载和连接。

所有状态、摘要、textarea先建立固定高度；六组几何全部读取完成后才更新摘要与结果，避免结果文本引发布局位移。每组独立只读textarea，以“控制N … 完整JSON”命名；字符串必须严格小于16000字符，超限显示可见FAIL和完整错误JSON，不截断。数值rect保留六位小数，单位CSS px；不反推截图倍率或实际字形字体。

紧凑JSON中`sampleColumns`定义样本数组：id、文本、Range宽高、段落top、Range top、逐字符数组。`characterColumns`定义逐UTF-16数组：索引、字符、相对段落的Range x、Range宽、prefixWidth。当前语料无代理对字符；其Range宽/prefix并非CoreText glyph advance。

静态核验见`static-validation.json`：冻结/派生文字、严格六单变量、JS语法、无外部资源及网络/存储API检查通过；序列化15999/16000/16001字符边界测试通过，输出均独立可解析。保守合成大坐标/长计算样式结果13416–13456字符，不替代实际Safari运行；运行期上限仍强制执行。`manifest.json`记录本页及来源SHA，排除自身。
