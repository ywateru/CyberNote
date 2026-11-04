---
id: app-mac-ordinary-selection-ink45
scope: Light ordinary Mac folder name selected text ink
status: pending
depends-on: [ref-mac-ordinary-visual-readiness44]
---

## Objective

基于44固定原图诊断，仅试浅色普通新建名称focus选中文字黑色。改善选中明暗，不能关闭自然字形192、选区底色或全像素目标。

## Context

docs/INDEX.md、docs/ui/smart-folders-macos.md、docs/research/mac-ordinary-visual-readiness44/README.md及输入索引。原版核心sRGB中值10/1/0、Mac13 40/32/22；当前auto组合未试过黑字。原31黑字对照是旧antialiased，不能排除此组合。主线37/42只改键盘，和本项CSS产品路径不重叠。

## Path and contract

root创建隔离树及START后，产品仅src/smart-folders.css。在现有普通名称focus::selection规则基础上，增加仅:root:not(.dark)的color:#000作用域；原有background、字体/auto、布局、其他状态与事件不改。不改SmartFolderForm/native/plugin/依赖/锁，不加入新字体或背景常量。证据只docs/verification/mac-ordinary-selection-ink45/。原版删除暂停、用户数据/旧输出/缓存保留。

```text
浅色普通新建名称，focus+真实选择 -> 选中文字黑色（底色保持）
自然名称/标签/边框、深色/智能/编辑/手机 -> 作为不变对照
```

## Verification

现有离线工具，同生产组件/完整CSS，只做一轮明确候选与旧色对照。尽可能用自有不可见WK的真实选择绘制；若捕获不含活动选择，只能标声明映射/受控证据，不能冒充实际包。全选和部分选择、自然态、底色条及非目标状态为必要范围。报告核心明暗和三阈值/完整ROI差异，不能将覆盖变多直接等同字形正确。禁止无方向字重/字号矩阵。有限检查后固定产品提交、封索引STOP，由不同作者独审，才合入准确Mac包Computer Use实拍。若候选不改善，保留结果停止并报告，不自动扩张。
