---
id: app-mac-ordinary-typography31
scope: Ordinary Mac new-folder text rendering, preserving editable controls and measured geometry
status: source-ready
depends-on: [app-mac-ordinary-name-focus26]
---

## Objective

继续完整Mac/Android原版像素与交互目标。准确Mac12运行29证明名称、名称标签和智能checkbox标签仍比原版偏淡；本任务通过受控生产WK渲染区分前景色、抗锯齿请求及字重的效果，选择实际更接近原版字形的局部实现。不能以bbox相同、预期常量或离屏通过代替字形对照。保留800×414几何和真实输入交互，不从JPEG推断苹果内部字体身份。选区颜色和焦点环角部保持后续待校准，不在本任务混调。

## Context

- docs/INDEX.md、docs/ui/smart-folders-macos.md
- docs/research/mac-ordinary-typography-readiness30/analysis.md
- docs/research/mac-name-focus-runtime29-analysis/analysis.md、measurements.json，03/08清洁同态原图及派生sRGB图
- docs/verification/mac-ordinary-name-focus26/README.md、prepare.mjs、既有WK工具及完整生产CSS
- docs/verification/name-mobile29-root-acceptance.md

## Path and ownership

唯一产品作者develop_app，仅src/smart-folders.css中的.smart-mac .smart-ordinary名称行文字/真实input与.smart-make label文字局部排版声明。允许局部font-weight、smoothing/text-rendering或前景色；候选必须有实际受控比较依据，不能先指定字重目标。不得改变字号、line-height、gap、padding、transform、字距、DOM、控件/业务事件、主题变量全局、其它表单、正文、手机、Rust/原生/存储、依赖、工具。禁止文字描边/阴影/重叠字或图像替代。

新作者证据仅docs/verification/mac-ordinary-typography31/；root维护共享文档/Git及实际Computer Use。旧素材、视频、包、证据、缓存全部保留。无GUI/ADB、系统权限修改、数据库、原版删除/恢复、音频导出、下载、正式平台构建。测试临时目录/缓存只放本任务目录，排除封存。

## UI target

```text
同一普通Mac新建表单，布局保持
名称： [真实输入：对齐的文字位置，补齐已见偏淡差异      ]
[checkbox] 制作智能文件夹 ←文字渲染局部校准，不移动checkbox
           使用标签和其他过滤方式整理。
                     [取消] [好]
```

默认名称及“制作智能文件夹”raw160 bbox已有原版对齐，不为浓度而改尺寸。名称标签右缘的1px差须如实保留或用实际字形对照解释，不能仅为凑宽改字距。浅/深色保持可读，深色没有原版像素结论。

## Verification

先固定当前源与基线身份，使用生产SmartFolderForm和完整CSS、既有真实WK渲染，无截图工具/TCC请求。记录真实节点computed font、color、smoothing、text-rendering、缩放及真实rect；computed不等于glyph字体身份。先复现基线，最多有限单变量对照：默认400基线；color与selection前景分开；smoothing/渲染请求单变量；字重只在前项未解释时作有限相邻候选。优先选择同时改善不同文字ROI且不恶化外部geometry的最小声明。不得无止境调参。活跃selection若离屏不可得到需明确诊断class边界，名称未选字形与label可直接看生产原生PNG。

沿29固定ROI/100、160、200阈值和ICC→sRGB口径，报告字形覆盖、bbox、像素误差及目视，并保留不利结果；不同捕获宿主/有损JPEG局限明确，不用单覆盖分数授字体一致。不得仅用截图宽度选择字重。有限验证真实选择/替换/普通智能往返/取消回调仍保持，校准范围外智能创建/编辑、手机和dark样式隔离；不重跑无关旧全套或CSS-only另写常量镜像测试。

SOURCE-READY STOP后root固定提交，再由不同作者verify_app独审；通过后另安排准确新Mac包、来源核查、Computer Use实际复拍，才能关闭实际差异。源阶段不授全像素/真实App或父目标完成。

## 作者结果

2026-11-05：仅两个浅色ordinary局部文字选择器改为smoothing:auto，未改字重/颜色/尺寸。自然名称/名称label/智能label raw160覆盖985/419/1392→1167/504/1657，原版02为1162/497/1636；sRGB整ROI MAE11.591/5.363/5.555→8.903/1.369/1.426。选中名称诊断仍1181对原1229，不授零差。13项有限生产检查、外rect相同、checkbox裁片零差、范围外完整computed隔离通过；无效/不足的颜色与渲染候选保留。完整见[作者证据](../../verification/mac-ordinary-typography31/README.md)。CSS SHA7e7a7bfa274858cbb1449e55e96026427dfa398489613dc60592e2608dc48005。root接收后固定提交，等待不同作者窄独审与准确包实际复拍。
