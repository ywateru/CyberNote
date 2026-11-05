# 手机录音播放与计时59独立复核

准确产品源 `99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6`：**SOURCE-READY / PIXEL-OPEN**。没有发现阻断本次手机局部几何改善的回归。产品基线 `a4af6b8f7f05f59b997e5df3abda25f9521aeec8`；独立树基于含更新规格的 `dfab9ef`，产品导入为 `3cdb5ae60b4195710e6c050cd005950d504b2fd3`。作者证据 `9a823fd24b3e711d100ec476f6720adf6c4f6fa8` 由root导入为 `756deb8`，与独立执行明确分开。

本轮只在独立树进行源码阅读、已有原图测量及本机Chrome实际共享RecordingView渲染。受控props与action sink不创建媒体或伪造播放成功。没有原生GUI、设备、麦克风、用户音频、数据库、target、Gradle或native/package操作；用户暂缓的手机设备验收与原13秒录音现场保持不动。

## 独立实际检查

基线 `baseline-first/` 使用冻结脚本并用Git加载a4af6b8的原View/CSS；候选 `candidate-first/` 使用本证据目录内 `check-mobile-recording-visual59-independent.mjs`，在冻结脚本基础上补独立有限边界。两次首次执行都exit0/PASS，errors/external为空。原命令、时长、stdout/stderr完整保留；没有独立浏览器或分析失败，也没有重跑以选择好看的结果。

既有有限视图检查实际执行：初始、录制、暂停、受控playing、playPending、错误、saving七态；真实touch检查后退/播放/前进派发既有action，禁用不派发；窄宽280/320和dark图形保持在44px按钮框内且按钮互不相交；窄高错误retry/skip/finish可达，忙碌transport不派发。没有用这些视图结果追认媒体、文件保存或原生状态。

独立新增边界共4个：320×568亮色retry、280×600亮色retry、320×568深色retry、320×568无retry，错误内容重复12次以确保真实overflow。

- 对waveform、timer、playback、notice、retry所有成对矩形验证不相交。notice/retry均在波形末端与计时顶缘之间；重试44px高，未侵入波形seek区域。
- notice、waveform和retry的3×3内部点逐点 `elementFromPoint` 命中。retry真实点击仅派发原preview-retry动作。
- notice真实鼠标wheel滚动成功：3个retry场景scrollTop=262，无retry=217；不派发seek或其他动作。原截图保留滚动视口，不声称整段文字可同时显示。React复用notice时可能保留scrollTop，因此部分后续截图已显示文案中段；命中/滚动/边界均按当次真实DOM测量。
- 随后对未被遮挡的waveform真实touch：中心左20 CSS px应请求2400ms，实际派发正确；投影aria-valuenow仍为2.6，未预测确认。58的100px/s/quartertick代码逐字节未变。
- 请求中、录制、saving、finalizing、submitted五个不可用投影下，三个transport、主动作和完成均disabled，DOM点击不派发动作。关闭语义未修改，也不以程序点击替代真实媒体检查。
- paused点击播放后图形与label仍保持播放，直至后续受控playing=true才显示两条暂停竖条；点击暂停后也等新投影，不自行切图。action仍为原playback，没有引入乐观播放状态。

有限检查使用真实共享View，不复制CSS或图形实现自行画图。浏览器检查严格串行；不重复原12/8或App/Session完整矩阵，不运行设备或native构建。

## 同原比例三方及残差

原图n0960为已有224×480有损录屏帧。旧/新共享View用392×840 CSS px、DPR2得到784×1680，整幅等比例LANCZOS缩至224×480。三方每列224×480，只另加25px说明。50%叠图与逐通道绝对差无增强、无遮罩；日期、空受控波形、系统栏/Home、转写排除项及原生材料差异均保留。源DPR未知，不能据此验高清字形像素。

`measure-images.py` 使用现有Pillow/标准库，第一次执行通过。`comparison/metrics-independent.json`记录完整命名ROI、阈值96/160的墨迹和误差，坐标均为**半开区间**；可见墨迹不等同SVG外框。中心按闭合墨迹端点计算，与规格59最初闭区间表换算明确。

| maxRGB<96墨迹 | 原n0960 | 旧58 | 新59 |
| --- | --- | --- | --- |
| 大计时 | `[70,330,155,344]` | `[70,331,154,346]` | `[69,330,155,345]` |
| 后退15 | `[61,373,78,390]` | `[60,378,77,397]` | `[60,371,77,390]` |
| 中央播放三角 | `[104,370,123,392]` | `[108,382,117,394]` | `[104,370,123,391]` |
| 前进15 | `[147,373,163,390]` | `[147,378,164,397]` | `[147,371,164,390]` |

三角宽高由9×12变19×21，接近参考19×22；中心由(112,387.5)变(113,380)，参考(113,380.5)。计时宽84→86，参考85；黑像素370→509，参考473，顶缘对齐但左/底仍1px差。两侧skip未随中央图形放大，中心从偏低6px变偏高1px，上缘仍高2px。均在有损边缘约±1–2px不确定性下描述，不宣称形状逐像素相等。

独立命名ROI的MAE（0–255）/任一通道差值>16像素比例如下。ROI与作者选择不同，因此局部数字不能混用，区域坐标全部保存在JSON。

| ROI | 旧 | 新 |
| --- | --- | --- |
| timer | 26.4257 / 25.131% | 21.3927 / 23.410% |
| playback-row | 23.9384 / 16.320% | 10.0169 / 12.640% |
| central-play | 39.9230 / 21.587% | 11.2066 / 18.667% |
| full | 15.2154 / 13.011% | 14.3348 / 12.766% |

旧/新header+wave的固定ROI `[0,25,224,310]` 完全逐像素相同，MAE与非零比例均为0；未整体移动sheet或已校准时间轴。已有黄色游标底端与参考的纵向残差、转写/未知菜单和系统区未纳入59修改，完整像素验收继续PIXEL-OPEN。亮/暗窄错误为必要工程排布，原视频未提供这种错误态，不能称同原版错误布局。

## 桌面、源码范围与作者证据

独立同props普通280×467、dark playing320×600均与独立Git旧源基线PNG字节、DOM字节、全部元素全部computed、测量几何/按钮hit完全相同，两张pngBytesUnchanged均true。没有追逐非确定栅格差反复截图。作者首次dark9像素最多1通道差及严格PNG断言失败仍保留，独立这次相同不抹去其首次结果。

`first-inputs.json`冻结检查前输入；`source-scope.json`独立核准确3文件及8个保护文件；`final-source-check.json`核执行后仍一致。只有View、局部CSS和新增检查变化。waveform、Session、coordinator、Panel、Dock、transport、App和style.css相对基线/准确源/当前树逐字节相同；其中App字节一致涵盖57手机保存恢复布局等待和二次目标核验。新增hook只在mobile且canRetryPreview存在，未新增`:has`，未改desktop DOM、disabled条件、action或状态机。

已阅读作者README、manifest、最终视图result与build-final，manifest的3源/8保护文件及参考SHA与独立清单一致；作者准确源TypeScript+Vite构建exit0（12.835秒，已有chunk提示）。本轮复用这项充分构建证据，未冒称独立重新构建。作者baseline-preflight语法失败、新attempt01/03的dark PNG严格失败、attempt02真实notice重叠的原执行/错误及最终通过均已阅读；修正后的真实错误区域在本轮独立重新验证，不以普通态图好看放行。

## 原始结果归档

完整computed JSON原件分别约30.1MB/37.6MB，仍留在本独立目录，不覆盖、不删字段。为避免重复提交大量可压缩文本，提交精确原字节的 `baseline-first/result.json.gz`、`candidate-first/result.json.gz`（gzip mtime0），`raw-results-archive.json`记录原bytes/SHA、归档bytes/SHA并验证解压逐字节一致。`result-summary.json`只为便于阅读，不代替完整归档。原JSON本地路径被本证据目录精确忽略；缓存和*.bin排除。解压示例：`gzip -dc candidate-first/result.json.gz > /tmp/mobile59-candidate-result.json`，随后可按索引校验原SHA。全部截图、DOM文本、首次stdout/stderr、执行命令、独立运行器和分析脚本均单独保留。

结论限定为准确99dbb95手机局部可见改善、受影响受控View动作及桌面未变：SOURCE-READY。完整原版像素、原生材料、真实设备/录音/回放/保存验收仍开放，且原Android现场按用户要求保持不动。
