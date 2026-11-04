# Mac正文无界面原生排版诊断02

本研究不改产品。原生系统13pt默认排版回退到`.PingFangUITextSC-Regular`，与普通`PingFangSC-Regular`在连续标点的占宽和上下文调整有明显区别；中隔标点串差异显著缩小。这提供了可判别的字体回退/上下文候选，不能直接确定当前WebKit所用字体或原版屏幕实现，更不能据此把截图像素与原生点换算。

## 范围与边界

父代理明确授权后，仅在本目录新写`measure.m`，通过系统clang编译无界面Objective-C CLI。没有创建NSApplication、NSWindow、NSTextView或绘图上下文；没有真实GUI、屏幕、剪贴板、数据库、网络、依赖安装、Rust target或共享编译缓存访问。编译使用`-fno-modules`，临时二进制及TMPDIR只在独有`/private/tmp/notes-native-metrics-02-*`目录。未提交git。

输入冻结：

| 输入 | SHA256 |
| --- | --- |
| `docs/verification/mac-body-typography-runtime-01/corpus.json` | `bb1ea53fc968f97ce5b17ac7566bf6afc7633927427ad9074864a9f83bd56e19` |
| `docs/verification/mac-punctuation-context-runtime-02/corpus.json` | `572d1d4ef54bf19089c9c9515cc6d222137d0c973303765231ce7f5e51b33e17` |

原生数值单位全部为点；CTLine glyph-path bounds、typographic advance与JPEG墨迹bbox是不同测量量。CTLine完整按整行shape，语言属性显式`zh-Hans`，不加tracking/kern。CTRun记录实际回退字体、UTF-16范围、标点字形ID、位置及advance。其他行保存run摘要。

PDF独核初报提供`.PingFangUITextSC-Regular`字体资源和名义文本矩阵12、外层scale0.9798793，因此请求UI字体13pt与12pt作为两个命名字体控制；两次`NSFont fontWithName`均返回nil。结果保留失败与CoreText日志，没有拿其他字体替代。PDF资源是导出证据，不能将其12pt认作屏幕12px。

## 实际字体与上下文结果

system13使用`NSFont systemFontOfSize:13 weight:NSFontWeightRegular`，主字体`.SFNS-Regular`，CJK run实际为`.PingFangUITextSC-Regular`（`.PingFang UI SC`），方括号run还出现`.CJKSymbolsFallbackSC-Regular`。UI回退与普通苹方都来自系统Reserved/PingFangUI.ttc，但实际PostScript字体、字形ID及metrics不同，不能以文件相同视为同字体。

| 语料/控制 | system13（实际UI回退）advance pt | 普通PingFangSC-Regular13 advance pt | 普通−system pt |
| --- | ---: | ---: | ---: |
| 原混合标点行 | 239.942800 | 277.040457 | 37.097656 |
| `，。！？；：《》` | 66.391051 | 104.000000 | 37.608949 |
| `中，中。中！中？中；中：中《中》中` | 217.021595 | 221.000000 | 3.978405 |

system13的八个孤立标点各advance6.575875pt；紧连串中相同字形advance依次8.713035、7.473736、9.459144、7.549611、7.473736、12.570039、6.575875、6.575875pt。中隔串中，逗号等标点多数advance13.075875pt、汉字“中”多数12.898833pt；书名号附近还调整前一“中”和右书名号advance。普通苹方这些标点与“中”在全部三种语境都为13pt，且标点字形ID不同。具体glyph及UTF-16对应以`result-attempt03.json`为准。

请求`palt=1`、`chws=1`、`halt=1`的四个有界控制，返回字体的`CTFontCopyFeatureSettings`均为null，整行advance与默认相同。请求值和返回值分别保存；不能宣称这些feature已有效应用、受支持，亦不能据无变化排除其他引擎中其作用。没有继续猜任意feature。

## 实际TextKit行片段

使用NSTextStorage/NSLayoutManager/NSTextContainer，完整语料保留换行，包括空段；容器宽10000pt避免未知屏幕宽度引入自动换行，padding显式0（系统初始值5pt每侧）。默认NSParagraphStyle，另测`usesFontLeading=NO`与minimum/maximumLineHeight均17.22控制。这里是一条带换行的原生文本，不等同生产DOM多p结构。

两个完整corpus的真实`lineFragmentPt.y`均如下，混排没有额外扩大这些片段：

| 控制 | y序列pt | 每片段高度pt | 可见文本默认首基线pt |
| --- | --- | ---: | ---: |
| system13自然默认 | 0,16,32,48,64,80,96,112,128,144,160 | 16 | 13 |
| ordinary PingFang13自然默认 | 0,18,36,54,72,90,108,126,144,162,180 | 18 | 14 |
| 两者固定17.22 | 0,17.22,34.44,51.66,68.88,86.1,103.32,120.54,137.76,154.98,172.2 | 17.22 | system14.22 / ordinary13.22 |

自然默认与关闭font leading的片段、基线完全相同；字体leading实测均0。空段占位glyph的`locationForGlyphAtIndex`与可见字形基线语义不同，不拿其baseline当墨迹位置。原始JSON仍完整保存。这里没有得到原版屏幕17点行距，不能因截图34像素推进就把原生默认16或18改写为17。

## 运行与真实失败

attempt01编译失败：辅助函数`Rect`、`Point`与SDK的MacTypes typedef重名；保留`compile-attempt01.log`与manifest。修正辅助函数名后attempt02编译/执行成功，先测原corpus。父代理随后要求上下文语料与完整lineFragment y，因此attempt03增加同一有界测量，保留前轮，不覆盖。

最终attempt03：编译exit0、运行exit0，总1.608秒，二进制75944字节，结果114674字节（低于300KiB）；编译前后可用空间36,709,437,440/36,709,179,392字节，均高于2GiB。最终源SHA256 `586f35a1e6d770bf9aa75f6ecf261ad0f2f7cc37979d4809c2bed49444ec9dc9`，二进制SHA256 `e87b9320ddb2db3302e8435f2da5bf4c795f4d51a80580ca5dcce2cc4a56eb11`。目录中的attempt manifest记录精确命令及临时位置；命名字体失败留在result.failures与运行日志。

这组结果支持在WebKit内先区分当前完整字体栈、`-apple-system`、`system-ui`和kerning控制，再由实际字体语境决定产品候选。它不构成最终像素验收，不覆盖移动端或未测样本。
