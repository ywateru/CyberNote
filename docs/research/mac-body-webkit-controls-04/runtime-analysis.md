# Safari 系统文字样式控制04：实际导出分析

2026-11-04。root 操作 Safari 并保存 AX / CUA 图像，本文作者独立读取保存证据；没有重放 GUI。结论是 **26 个短 JSON 完整导出，三个文字样式的样本宽度相同**。这是本轮控制实验的负结果，不能作为原版 Notes 或产品像素一致性通过结论。

## 采集端点与完整性

`runtime01.ax.txt` 标题是“未命名”，没有 HTML 内容和 JSON；配对图像也是空白新标签。保留它为加载前端点，不纳入字体实验。

`runtime02.ax.txt` 有准确标题、file URL、3 控制和 23 元数据。只提取独立 AX“文本”节点内完整 `{...}`，且其前一行必须是对应文本输入区；每块直接 JSON 解析，无补齐、修复、拼接或重复计数。26 块都有效，无 pending / error，最长 322 个 JavaScript UTF-16 字符，小于 350 上限。完整原文、AX 文件行号、AX 节点、解析值与长度全部保存在 `runtime-analysis.json`。控制 id、请求字典、15 属性顺序、3 样本及顺序、固定属性和 8 输入摘要逐项核对。

查看了两张 CUA 原图，实际编码都是 JPEG / RGB / 2648×1806。runtime02 图像显示三个完整控制块及上部元数据；其余元数据完整性依据 AX，不声称截图全屏包含全部内容。CSS px 未换算为 JPEG 像素。root 打开文件的中途输入与异步状态见 `root-runtime-ledger.md`，本文未独立验证那些中间动作。

## 三组实际结果

| 控制 | 请求 | 实际 computed font-family | old-mixed 宽度 | adjacent 宽度 | han-separated 宽度 |
| --- | --- | --- | ---: | ---: | ---: |
| b | 完整生产 font-family 栈 | 完整原样栈 | 276.742432 | 103.190659 | 219.280151 |
| body | font: -apple-system-body | UICTFontTextStyleBody | 276.742432 | 103.190659 | 219.280151 |
| short | font: -apple-system-short-body | UICTFontTextStyleShortBody | 276.742432 | 103.190659 | 219.280151 |

单位是 DOM Range 的 CSS px，保留六位小数。两种 shorthand 相对 b 的三个差值均为 0，三组唯一不同的 computed 属性是 font-family。其余 14 项完全一致：13px、17px、400、normal、100%、normal、auto、normal、normal、none、normal、0px、optimizelegibility、antialiased，顺序对应字典中的 font-size 至 -webkit-font-smoothing。

请求中的 font-stretch: normal 显示为 computed 100%，word-spacing: normal 为 0px，text-rendering: optimizeLegibility 为 optimizelegibility；记录序列化差异，不把它们说成请求字符串逐字保持。三组 a/s 都为 true；a 是恢复共同 longhands **之前**的 inline 请求序列化相等，s 是 CSS.supports 的语法结果。两者和 computed family 都不能识别某个汉字实际使用的字形字体。

实际环境元数据：Safari UA 的 Version/26.4、AppleWebKit/605.1.15，DPR 2，viewport / visualViewport 为 1324×813、scale 1，root zoom 1，document ready complete、fonts loaded，document lang / navigator language 均为 zh-CN。UA 中兼容性的 Mac OS X 10_15_7 文本不用于推断真实系统版本。

本轮只支持这样的窄结论：在这些固定 13px / 17px 的三个样本中，改走 body / short-body shorthand 没有改变所报宽度。它不证明原版 Notes 使用哪种字体接口、不证明真实 fallback 字体、不证明复杂文本或换行等价，也不构成产品 WKWebView、iOS 或 Android 的运行结论。

## 准备快照与当前文件

`controls.html` 内嵌 fixture 与 `fixture.json` 逐项相等，准备 manifest 的 6 文件全部符合原始 bytes / SHA 和 aggregate，原准备文件未改。运行块的 8 个 input 与准备 fixture 全部一致；这些值来自准备时写入页面的常量，页面没有在运行时读取磁盘文件。

独立读取当前 8 个源文件得到 7 个与准备快照相同。唯一变化是 `src/style.css`：准备时 66223 bytes / `de2222e4b3c8e4ccde3af4312e8d0db5480dabea1a3c54fe4a0bf9c2a3feb962`；分析时 66381 bytes / `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`。root 的运行记录说明样式已有后续手机描边候选；本文只验证文件身份变化，不据此推断变更的完整内容。当前身份采集 UTC 时间见 JSON，后续产品编辑不影响准备 fixture 的历史身份。

## 封存范围

写输出前检查磁盘空间超过 2 GiB。12 份准备/运行输入在分析输出前后全部 bytes / SHA 不变。`runtime-manifest.json` 列出这 12 输入及本文和 JSON，self excluded，aggregate 计算规则是按相对路径排序，每项 `path<TAB>bytes<TAB>sha256<NEWLINE>` 的 UTF-8 SHA-256。旧 `manifest.json` 保留准备范围，不被新运行证据扩写。未更改产品、旧控制页、原始采集、根索引、构建或 GUI 状态。
