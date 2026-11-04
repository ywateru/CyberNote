# Mac正文 Safari/WebKit四控制02封存

本次Safari实测不支持“仅删除显式fallback字体族”或“换成system-ui”就能修复连续标点占宽。四个控制的原混排宽、中隔串宽完全相同；紧连串差仅0.000015 CSS px，不能作为修复。当前只封存研究，没有修改HTML、产品或进行新GUI操作。

父代理通过本机Safari的File Open打开原有`controls.html`并用CUA采集`runtime01.ax.txt`、`runtime01.cua-image`。本分析从原始AX摘要表提取20个单元格值，核对HTML及其初始manifest，并读取可见的计算样式和结果JSON前缀。截图作为原始运行证据保留，本报告没有新增截图墨迹测量。

| 请求控制 | 原混排Range宽 CSS px | 紧连标点Range宽 CSS px | 中隔标点Range宽 CSS px | 重复段落top推进 CSS px |
| --- | ---: | ---: | ---: | --- |
| 当前完整root字体栈 | 276.742432 | 103.190659 | 219.280151 | 17.218750 × 3 |
| 仅`-apple-system` | 276.742432 | 103.190674 | 219.280151 | 17.218750 × 3 |
| 仅`system-ui` | 276.742432 | 103.190659 | 219.280151 | 17.218750 × 3 |
| `-apple-system`且`font-kerning:normal` | 276.742432 | 103.190674 | 219.280151 | 17.218750 × 3 |

表格由页面`toFixed(6)`输出，因此精度为六位小数，不伪称完整底层浮点结果。样本文本逐字嵌入HTML，原混排取正文corpus第5行，紧连和中隔串取context corpus第2/3行，重复四行均为`Ag中文`。

四组可见计算样式为fontSize13px、fontWeight400、lineHeight17.219999px、fontFeatureSettings normal、fontVariantEastAsian normal；前三组kerning auto，第四组normal。请求行高17.22px的实测段落推进17.218750px，与请求值差−0.001250px。这是本页段落几何，不能据此确定原版Notes基线或修复其首行残差。

结果前缀记录Safari Version/26.4、AppleWebKit/605.1.15、devicePixelRatio2、viewport1324×851、visualViewport.scale1。这些只属于本次Safari页，不建立此前原版/克隆截图的DPR，也不能代替打包应用WKWebView运行结果。

## 完整性与导出限制

原始AX的长“测量结果”textarea值恰好只捕获100000个字符，末尾停在嵌套rect的`top`字段之后；JSON解析失败（line3593 column6 / char100000）。因此**没有完整JSON导出**，也没有完整逐字测量数据导出。可见页面状态声称“包含完整JSON”只描述页面内值，不证明AX导出完整。较短摘要表和已可见字段仍可独立成立；不可用截断前缀补造剩余数据。

HTML SHA256仍为`230c19d816bb716c25fd44bfc7c6f31482f1e8aa9637df763ae17d181b50d5af`，字节数8777，匹配最初manifest；两个冻结corpus的SHA也逐一匹配。`analysis.json`保留提取行、环境、精确截断错误、输入文件SHA和限制；`directory-manifest.json`保存目录文件的字节数与SHA，明确排除自身以避免自引用。最初`manifest.json`与`static-validation.json`是运行前静态阶段记录，保持原样，不将其旧“static only”文字冒充后续没有发生Safari实测。

computed font-family反映请求声明，不能鉴定实际glyph字体；四组同宽也不能证明字体相同。CoreText CLI中的实际UI fallback、原生点单位advance、PDF导出坐标、Safari Range CSS px和JPEG墨迹bbox各有测量边界。Safari的同宽结果不推翻原生CLI存在的字体/上下文差异，但表明仅改字体族声明未在本页复现那种差异。

## 后续可判别方案（仅提案，未实现）

当前页面只探测了字体族、kerning及normal值等语法支持，**没有探测本机`text-spacing-trim`、`chws`或`palt`**。不能根据版本号或标准印象宣称它们在当前Safari/WKWebView已支持，更不能将`CSS.supports('font-feature-settings', '"chws" 1')`为true视为具体字体实现了该feature。原生CLI请求feature返回null，也不能替代WebKit实际CSS结果。

下一轮先记录本机解析与computed round-trip，再最多测以下六个单变量控制；此提案不生成新页面，不写产品：

1. 当前完整字体栈和所有现有排版声明，作为基线。
2. 仅`text-spacing-trim:space-all`，本机不接受则原样记录失败并跳过视觉推论。
3. 仅`text-spacing-trim:trim-all`，同样先检查解析与computed值。
4. 仅`font-feature-settings:"chws" 0`。
5. 仅`font-feature-settings:"chws" 1`。
6. 仅`font-feature-settings:"palt" 1`，作为更广泛比例宽度变化的控制，不预设为修复。

第一轮不组合trim和手动feature，字号、行高、kerning、text-rendering、语言及可用宽度完全固定。保留三条冻结标点串，补孤立标点及普通汉字/拉丁对照，记录整行宽及prefix差。只改变紧连标点而不改变中隔、孤立和普通文字的候选，与同时改变各语境宽度的候选可明确区分；任何普通文本或断行变化也必须保留为结果，不通过缩放或负字距遮盖。

导出应使用有界的每组完整JSON块或紧凑文本值，逐块解析验证，避免再次超过AX上限。找到有判别力的单个候选后，仍需在实际打包应用中与同期原版同文本运行对比；Safari控制本身不构成产品修复或像素验收。
