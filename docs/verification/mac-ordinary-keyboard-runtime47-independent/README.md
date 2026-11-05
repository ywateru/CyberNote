# runtime47 独立复核封存

PASS：269/269，131 受保护输入未变，零新增 GUI/运行操作。仅有限已保存端点，非全交互或像素验收。

正式报告：`docs/plan/reviews/mac-ordinary-keyboard-runtime47.md`。`verify.py` 只读取既有输入并生成此目录的复核材料；`result.json` 为逐项结论，`endpoints.json` 保留字面 Tab/选区/焦点，两个 sRGB 联系图已经人工查看。`first-run/` 完整保留检查器样例编号错误的首轮结果；修正解释见正式报告。

`evidence-index.json` 使用仓库根目录相对路径，包含本目录全部文件及正式报告，不包含索引自身。READY STOP。
