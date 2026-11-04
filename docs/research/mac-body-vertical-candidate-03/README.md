# Mac 普通正文纵向候选 03：只读分析

现有两组截图**支持把 17 CSS px 行高与约 2 CSS px 起点补偿列为可测候选**，尚不证明它们是原版的真实参数，也不是已验证修复。最小候选保留 13px 字号，将普通顶层 `p` 的 `line-height` 和 `min-height` 同时从 17.22px 改为 17px，并将起点补偿限定到全篇由普通顶层段落组成的 Mac 文档。本文没有修改产品、运行 GUI/REA、测试或构建。

## 已有证据与索引

只读输入为 `mac-punctuation-context-geometry-02/result.json`、旧 `mac-body-candidate06-geometry-01/result.json`、当前 `src/style.css` 和 `src/Editor.tsx`。四份输入的尺寸、SHA-256 及前后相同结果在本目录 `result.json`。没有生成新图片、移动旧图片或修改旧测量。

下文 `n` 是从首行开始的零基**可见行推进索引**，空段计一行，换行后的第二视觉行也计一行。它不是 DOM 实测或基线。context02 的空段为 n7；旧 corpus 的空段为 n8，旧长段两个视觉行为 n10/n11。

context02 三阈值的 top 数字完全相同：

|n|原版墨迹 top|clone top|观测差 clone−原版|
|---:|---:|---:|---:|
|0|175|171|−4|
|1|207|203|−4|
|2|241|238|−3|
|3|275|272|−3|
|4|309|307|−2|
|5|343|341|−2|
|6|377|376|−1|
|7|空段|空段|不测墨迹|
|8|445|445|0|
|9|479|479|0|
|10|513|513|0|

context02 七行完全相同的 `Ag中文` 原版推进为 `34,34,34,68,34,34`，clone 为 `35,34,35,69,34,34`。旧 corpus 的三行相同 `Ag中文` 后缀推进也为原版 `34,34`、clone `35,34`，空段后相差为 68/69。重复同字的推进比混合字形 top 更能约束累积趋势。

旧 corpus 阈值160的 n 为 `0,1,2,3,4,5,6,7,9,10,11`，差为 `−4,−4,−3,−2,−2,−2,−1,−1,0,0,0`。其中 n3 的字母行在阈值120为−3，160/200为−2；这是可见墨迹边界的阈值敏感性，应保留，不能当基线差抹掉。

整体统一下移 4 个截图像素会将已对齐的后段推低 4 像素；只改行距又保留首行约−4的误差。因此“起点项 + 随行推进累积项”比只改一个常量更贴合已有数据。

## 数值兼容性，不是运行预测

当前 CSS 只对 Mac 普通顶层段落设置 `font-size:13px; line-height:17.22px; min-height:17.22px`。设候选改为 17px，则每次推进少 0.22 CSS px。用未知有效响应系数 `R` 表示 CSS 位置变化对现有截图坐标的影响，起点加 2 CSS px 的候选校正可写为：

`Δy(n) = R × (2 − 0.22n) + ε(n)`

`ε(n)` 包含行框内字形位置改变、量化、字体度量、换行等未知项。这里没有测量 R，也没有假定 DPR。以下**仅展示 R=2 且 ε=0 的参数情景**；R=2不等于测得设备像素比，不是浏览器运行结果。17px 的行高本身也可能改变首行墨迹在行框内的位置，所以精确起点补偿可能不是恰好2px。

|n|context02 观测差|R=2 情景校正|代数残差|
|---:|---:|---:|---:|
|0|−4|+4.00|0.00|
|1|−4|+3.56|−0.44|
|2|−3|+3.12|+0.12|
|3|−3|+2.68|−0.32|
|4|−2|+2.24|+0.24|
|5|−2|+1.80|−0.20|
|6|−1|+1.36|+0.36|
|8|0|+0.48|+0.48|
|9|0|+0.04|+0.04|
|10|0|−0.40|−0.40|

同一情景在旧 corpus 的残差范围为阈值120 `[-0.84,+0.36]`、160/200 `[-0.84,+0.68]` 个图像像素。这是与两组已有观察兼容的数值候选，不代表未来截图将落入这些范围。完整逐行表在 `result.json`。

直接对已有误差拟合 `e=a+bn`，context02 为 `a≈−4.091,b≈+0.456`；旧 corpus 为 `a≈−3.965,b≈+0.407`（120）或 `a≈−3.786,b≈+0.391`（160/200）。这些只以图像像素和推进索引为单位，表明初始偏高与约0.4像素/推进的累积趋势；不能用拟合反向宣布 CSS 17px、起点2px 或 DPR 已经确定。

## 最窄实现边界建议

当前源文件的定位：

- `src/style.css:602`：通用 `.tiptap` 根为14px、行高1.23；`615`通用p margin0与min-height1.23em。
- `src/style.css:620`：现成 `.desktop.native-toolbar:not(.separate) .note-document .tiptap > p` 是已局限到 Mac 顶层普通段落的规则，当前13/17.22/17.22。
- `src/Editor.tsx:340`附近：受限首次纯文本粘贴按每个换行构造一个 `paragraph`，包括空行。受控 corpus 因而与顶层 p 流兼容；AX 本身不能证明 DOM。
- `src/Editor.tsx:385`：`note-document` 外层包住 `EditorContent`，适合增加不写入文档内容的、仅表示当前全p流状态的样式 class。

推荐优先使用纯 CSS all-p 守卫，避免为这个有界候选新增 Editor class 或 JS 状态。`.tiptap:has(> p):not(:has(> :not(p)))` 表达至少有一个直接 p，且没有直接非 p 元素；判断的是元素子节点，文字/注释不参与。两个 `:has()` 并未彼此嵌套。保留已有一般 Mac p 的13px规则，将17px line/min-height与一次性2px起点项同时限制在守卫下：

```css
.desktop.native-toolbar:not(.separate) .note-document
  .tiptap:has(> p):not(:has(> :not(p))) > p {
  line-height: 17px;
  min-height: 17px;
}
.desktop.native-toolbar:not(.separate) .note-document
  .tiptap:has(> p):not(:has(> :not(p))) {
  padding-top: 2px;
}
```

这只是后续实现表达，并未应用。根 padding 只负责一次性起点项；不能给每个 p 都加2px，也不要增加每段 margin，否则会再引入逐段累计。只修改 line-height 而保留17.22px min-height，亦不足以作为干净的17px空段/单行候选。不要用 transform、relative top 或截图配准隐藏实际布局差。

为判断守卫是否会被编辑器辅助元素关闭，只读检查了 `src/editor-schema.ts` 及本地安装依赖的对应源码：

|来源|静态观察|对 all-p 守卫的影响|
|---|---|---|
|当前 `Editor.tsx` / schema|`EditorContent` 内的 PM 根由默认段落渲染；受限首次纯文本按行构造 paragraph；无普通段落自定义 NodeView|与这两组纯p corpus兼容；AX不能独立证明实际DOM|
|Placeholder 3.32.2 `createPlaceholderDecoration`|`Decoration.node` 对现有空节点加class和data属性，无额外widget元素|空p仍是直接p，不会因占位class退出|
|patched ProseMirror-view1.42.9 `addTextblockHacks`|空textblock的BR及Safari需要的separator IMG加在textblock内；由`node.isTextblock`调用|普通p内的`ProseMirror-trailingBreak`、separator不成为根直接非p|
|prosemirror-dropcursor1.8.4|拖拽指示DIV append到`editorView.dom.offsetParent`，不是append到编辑根|当前CSS根没有position定位，`.editor-scroll`有relative；该实现不把指示DIV放成根直接子节点，但实际offsetParent仍需复验|
|prosemirror-gapcursor1.4.1 / StarterKit|StarterKit未禁用gapcursor；特殊GapCursor选区产生`ProseMirror-gapcursor` DIV widget；valid要求两侧closed|潜在直接非p。正常全p文档在段落边界会遇到开放inlineContent paragraph，valid不成立；含原子块的混合文档应退出守卫。不能由静态代码宣称全部交互中永无widget|
|当前 NoteTag|标签为inline mark span，不创建根widget|段落中的标签span不会关闭直接子元素守卫|

因此，对这两组纯p候选没有发现必须新增 JS class 才能避开的常驻直接辅助元素。守卫更保守：未知/未来的直接非p widget会关闭候选，可能引起2px起点及行高在交互时切换。不要为了“兼容”而忽略所有 `contenteditable=false` 或所有DIV，这会把真实附件等块放进范围。若实际记录显示纯p流在有效交互中出现瞬时辅助根节点，再按确切类名单独处理或退回基于实时编辑文档的class，不能先假定。

本轮没有在WKWebView调用selector匹配、读取运行DOM或测试CSS支持；此处是本地源码的静态判断，下一轮必须记录实际根`children`的tag/class及守卫匹配情况。

若后续发现普通段落内有自行改变字号/行距的文本样式，应将其排除出“普通”条件或单列复验。混合文档中仅一段是p的情况没有现成控制样本，不能直接推广起点补偿。保持标题、列表/核对清单、表格、附件、独立窗口、移动端、日期和 native-top规则在本候选之外；无需调整编辑 schema、保存路径、Rust或原生控件。

## 下一轮原版复验项目

1. 用同一窗口/Fill、相同完整纯文本、相同焦点、相同滚动起点、指针在正文之外，分别保存当前基线与候选的实际构建/进程身份和原始截图。图像尺寸相同仍不足以建立 DPR。
2. 分开记录“只改17/17”和“17/17并补偿2”的候选，或至少另加一次仅改变根padding的受限运行测量，得到实际起点响应与行距变化对首行墨迹的影响。使用这些运行数据调整补偿，不能把上表当已生成截图。
3. 复跑 context02 与旧 corpus。测量首行、所有相同 `Ag中文`、空段前后及旧长段两条视觉行，三阈值全部保留；同时核对换行点、左右边界和墨迹高度未因字号/字体变化而改变。
4. 增加20–30行相同正文、连续两个空段、单个p内至少3条自动换行的控制样本。已有10–11次推进不足以排除长文累计误差。保持原版同文字复验，不能只看候选自身是否整齐。
5. 逐项复验首段为空、最后一段为空、文末插入光标、回车与删除空段、上下移动、选择、正文滚动和重新打开笔记；核对实际交互位置与文字位置一致。
6. 检查从全p流转成标题/列表/核对清单/表格/附件以及撤销恢复时，all-p守卫匹配能及时变化，并记录根直接children的tag/class；核对占位、空p、拖拽、选区/光标和输入过程中未发生辅助元素导致的样式跳动。未被控制样本覆盖的文档不能意外套用起点项。移动端和独立窗口做范围排除核对。

本报告不宣告像素级通过。JPEG墨迹top不是真实baseline；前后hash相同只保证本次分析所读源没有改变，不证明现有截图与当前源码的运行对应关系。所有输出阶段均检查至少2GiB可用空间。
