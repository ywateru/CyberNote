# 量图47独立复核

PASS：269/269，125输入未变。全选局部颜色改善复算成立；sRGB160195→197与墨迹右缘+1保留；partial/natural指针光晕污染，三方UNKNOWN。非全像素验收。

正式报告：`docs/plan/reviews/mac-selection-runtime47-analysis.md`。`verify.py`为自有Pillow/标准库复算，`recomputed.json`保存几何及有限all数据，`result.json`保存逐项判定，`input-open.json`/`input-close.json`保护既有输入。`first-attempt/`保留未安装numpy导致的首轮启动失败；未下载依赖。没有生成新图片或运行GUI/产品。READY STOP。
