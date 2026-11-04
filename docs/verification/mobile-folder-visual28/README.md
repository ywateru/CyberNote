# 手机文件夹首页局部视觉28

2026-11-05，SOURCE-READY STOP。固定基线 `a8bd1f9a0d9e8160eb2b10d1bc51b748d12a833b`；仅产品三处：`App.tsx`手机图标/quick局部class、`style.css`手机page-folders局部两条规则、新`MobileFolderIcons.tsx`。基线App/style在任务开始、产品变动前保存，收尾与固定HEAD逐字节匹配。26 smart-folders.css SHA仍为 `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c`，未修改SmartFolderForm/Rust/桥接/依赖/锁/业务数据。

## 最小接入

新SVG用本地currentColor路径：Quick矩形顶部带与内部短纹、ClosedFolder较宽闭合轮廓、AddFolder右上外侧圆加号。只是工程矢量候选，不拷贝SF Symbols或原图。SVG aria-hidden、focusable=false、pointerEvents=none，保留原button命中/可访问名称与全部事件。普通图标仅mobile选择；Mac/all/smart/trash保持旧分支。底栏用路径宽度/外侧加号一起修横向锚点，未再translate重复补偿。

CSS只给`.mobile.page-folders`标题31.5px（原34，仍原41px行框、margin、0.3px字距）与quick图标margin-right7px。没有改所有目录gap、行高、卡片、搜索、count、chevron、footer、其他页或全局字体。style.css最初按26独审要求保持冻结，root确认独审STOP后才写生产规则。

## 真实生产 App 有限检查

`check-app.mjs`实际挂App/Editor/bridge，使用浏览器预览传输的隔离localStorage和真实生产完整CSS；不替换目录回调/触摸事件、不读取用户DB或运行Rust。baseline只重放任务开始保存的App/style，其他导入CSS（包括已接受26）一致；candidate直接使用现行生产源和所有导入样式。不是提取DOM或造相似文件夹页。

模拟host：macOS现有Chrome，390×746 logical viewport，deviceScaleFactor1080/390，PNG1080×2066。它不是实际Android06，也不是恢复原视频DPR；浏览器预览水印/macOS字体与Android宿主有差异。准确06只使用27封存的保存截图/测量，未冒称本轮重新运行06。原图224×480低清、约1–2源像素边界不确定，不比较全卡高度/第二组绝对y或伪造iCloud行。

最终同一runner：baseline-attempt06/candidate-attempt03均exit0、7类有限生产行为检查通过：快速和普通按钮实际导航到对应notes页；底栏开真实新建并取消后组件卸载、目录数组不变；真实520ms timer经touchstart打开真实菜单且DOM无选字，scrim关闭；touchmove/touchend取消；280×500窄视口下真实1234条合成笔记计数、长名省略/右侧count和chevron不溢出。它们是浏览器事件，不替代原生触摸/选字把手/Android Back。`event-preservation.json`用TS AST逐字核startLong/stopLong和folderRow五类事件原文，全保持。`pnpm typecheck`一次exit0。

## 有限视觉结果

`measure.py`从实际App截图读取像素，dark maxRGB<160、gold沿用27严格阈值；统一1080/224宽度比，仅报告归一图像单位。不按控件拟合或拉伸纵向。诊断图保留原14秒、模拟修前、模拟修后三列，统一宽度缩放后nearest4x仅便于查看形状，不当零差分数。

| 对象 | 原14秒 | 本轮模拟修前 | 本轮模拟修后 |
| --- | --- | --- | --- |
| quick文字左缘 | 42 | 38.370 | 42.311 |
| quick金色宽×高 | 12×12 | 11.2×11.2 | 12.237×12.030 |
| ClosedFolder金色宽×高 | 15×11 | 12.444×10.578 | 14.933×10.993 |
| footer金色中心x / 宽 | 20.5 / 17 | 16.696 / 12.237 | 20.430 / 16.8 |
| 标题墨迹宽×高 | 54×17 | 57.244×18.252 | 52.889×17.007 |

quick图标slot左锚/垂直墨迹中心未变；closed和footer的SVG外部slot/按钮rect保持，路径扩形后墨迹中心分别约+0.722/−0.542 logical px，详细数值保留，不把轮廓变宽当所有像素相同。实际06保存标题宽58.074，与本模拟修前57.244不同；31.5px是有限工程候选，**不能据模拟52.889判实际07标题结果**，需新包同态量图。不继续以宿主差异反复调字形或色值。

title/search/footer/所有行外部rect、非quick文字rect、所有count/chevron与两个footer button矩形严格相同。desktop两PNG逐像素零差，仅是此模拟host有限隔离，非原生Mac全像素PASS。notes两PNG有8像素差，均位于搜索文字边缘 `[175,291,188,325)`，每通道最大1；可能是绘制边缘波动，记录原像素而未为零差重复全套。其位置不在本轮更改的手机目录图标或标题。仍不授所有其他页像素/功能通过。

Quick顶部带/短纹、ClosedFolder闭合扁宽外形、footer右上圆加号三张诊断图均已目视。原版加号和内部纹样在压缩源中仍有未知曲线/线宽，向量轮廓类别与有限锚点改善不代表原生路径精确复原。

## 失败保全、结束与下一门槛

早期基线attempt01是Vite源码重放顺序错、02标题定位到notes header而非large title、03命中隐藏Editor同名back；04/candidate01错误清除所有style导致smart导入CSS缺失，取消被错误布局遮挡；05/candidate02所有7类行为已通过，仅desktop不存在mobile-search包装层的快照空值失败。这些均已保留，无产品逻辑扩大。最终只修测试定位/样式保全/可选DOM采集；同时运行的05/02出现一次Vite默认WebSocket端口占用提示，最后两次串行无此提示。

每次finally均关闭Chrome、HTTP与Vite。自有run vite-cache保留、索引明确排除；旧cache不动。无GUI/ADB/用户DB/原版删除/媒体/归档导出/下载/平台正式构建/Git mutation。`source-manifest.json`记录15项源/参考及精确候选身份，`execution-record.json`记录实际命令结果，索引核大小与SHA。

STOP：交不同作者独审，root固定共同源后串行Mac12/Android07标准freeze/build/collect、独立核包；准确07保数据升级后实际点击/长按/Back、搜索与同态首页复拍量图仍是交付门槛。完整跨端像素与交互目标继续开放。
