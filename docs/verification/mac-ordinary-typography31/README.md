# 普通 Mac 文字局部校准31

2026-11-05，SOURCE-READY STOP。唯一产品变更是src/smart-folders.css新增两个浅色ordinary文字选择器，共一条 `-webkit-font-smoothing: auto` 声明。作用于名称行（真实input继承）和“制作智能文件夹”label；`:root:not(.dark)`保持深色原样。字重仍400、字号仍13、颜色仍#202020；没有改尺寸、字距、DOM、事件、选区背景、焦点环、手机或全局变量。

固定初始HEAD `5130d4caf4323553d62a41b2f211079c5f9024fc`；产品基线仍为d742307/source aggregate7c838170…，基线CSS SHA `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c`。候选CSS11199字节，SHA `7e7a7bfa274858cbb1449e55e96026427dfa398489613dc60592e2608dc48005`。source.patch是本轮精确4行CSS差异。

## 有限生产WK诊断与选择

使用生产SmartFolderForm/React与完整style.css、smart-folders.css；既有geometry15/webkit-render，nonPersistentDataStore、unattached、inactive，无可见/key/main窗口，不调用屏幕截图/TCC。HTML在新目录离线自包含，无网络/后端/DB。自然未选input是原生产绘制；全选仅将生产:focus声明映射到测试class，以观察选区内字形。后者不证明活动窗口/实际Mac包绘制。

先复现400/#202020/antialiased基线，再有限单变量：

| 单一变化 | 名称raw160 | 名称标签 | 智能标签 | 判断 |
| --- | ---: | ---: | ---: | --- |
| 自然未选基线 | 985 | 419 | 1392 | 复现偏淡 |
| 仅未选前景#000 | 1067 | 433 | 1488 | 补齐不足，不选 |
| 仅text-rendering geometricPrecision | 985 | 419 | 1392 | 整张表单逐RGB同基线，不选 |
| 仅smoothing auto | 1167 | 504 | 1657 | 三ROI同时接近，外部rect保持 |
| 新原版02自然无选择 | 1162 | 497 | 1636 | 参考，不反推原生内部属性 |

选中字前景也单独试#000：全选名称1006→1071，对原01的1229仍不足。auto全选诊断为1181，仍比原少48（−3.91%），未追求阈值相等。已有单变量足以选auto，**未试字重/family矩阵**。未选择的color/selection-color与无效rendering输出完整保留。

所有100/160/200阈值、bbox、sRGB像素误差和真实computed记录见measurements.json。自然未选raw160名称外包始终[142,125,268,149)，智能标签[85,197,262,221)；名称标签右缘99→100是此单独渲染变化产生的墨迹边缘，原版为100，文本/控件rect未变，没有改字距凑宽。

沿29固定ROI，原版Display ICC独立转sRGB；raw另报。WK原PNG明确带sRGB chunk0，直接按该声明比较，派生图附sRGB ICC。原版01/29全图不相同，但三个固定文字ROI逐RGB相同，不当作第二组字形变化样本。新增02末尾有金色插入点，自然名称误差与所有自然候选共同排除[268,115,280,158)；完整ROI阈值覆盖/bbox同时保留，该金caret本身不进入maxRGB<200深色掩码。未移动/配准/缩放任何字形。全选对照无插入点排除。

自然未选三ROI的sRGB整ROI每通道MAE：名称11.591→8.903，名称label5.363→1.369，smartLabel5.555→1.426；共同glyph union MAE分别40.412→30.081、25.799→5.622、24.661→5.702。全选诊断名称MAE15.178→12.136，glyph union54.013→41.034。完整掩码差/三个阈值的不利余差均保留。已目视single-variable-glyph-comparison-srgb.png与final-glyph-comparison-srgb.png；两标签接近明显，名称细节仍有残差，不靠单一覆盖分数授字体一致。

## 有限验证与边界

最终13项实际生产控件检查全部通过，errors/requests为空：autoFocus及全选、真实部分选择/替换、普通智能往返名称保持、Escape取消回调一次无保存；整个ordinary外部rect逐项相等，400×207CSS=800×414图像。checkbox固定ROI[38,192,76,230)逐RGB零差。智能创建/智能编辑、手机浅深、普通深色的全部节点完整computed样式与基线相等。深色仍antialiased，文字#eee和输入底#2c2c2e可分；无原版深色像素结论。候选自然与全选表单各自逐RGB等于相应auto单变量探针。

本新fixture使html.dark与真实App的documentElement主题切换一致，仅供范围外隔离；没有改产品主题逻辑。测试取消只计数而不卸载，与生产App真实Escape不同；本轮不冒充OS键盘、Tab、实际包或活动焦点验收。新原版31的Tab差异另属后续任务，此处完全未改。

不利/工具边界留存：comparison-layout-attempt01.png有诊断栏位重叠，不用于判定，后续两图为分列修正；measurements曾在说明文字误称01/29全图重复，检查实际为false，已按真实全图及文字ROI结果更正，无新渲染。measurement-stdout.json保留当时输出的false。选中名称和JPEG/AA宿主残差不隐藏。没有运行CSS-only typecheck、旧完整套件或正式平台包。

input-initial/input-close记录315项输入：唯一授权CSS改变，余314项大小/SHA/mtime保持；旧30的4项、29量图16项、26作者43项与封存索引匹配。全部WK返回退出，无HTTP/浏览器/GUI/ADB/下载/共享cache/DB/音频或Git操作；temporary目录排除封存。作者停止，交root固定提交与不同作者独审；准确Mac13来源核查及Computer Use实际复拍后才能关闭实际差异。全跨端目标继续开放。
