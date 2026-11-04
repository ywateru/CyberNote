# Android29 实际证据独立静态复核

PASS / READY STOP，711项身份与有限ROI检查通过，无新增P1/P2；530个去重保护文件初末未变。报告 `docs/plan/reviews/android-folder-visual-runtime29.md`。

`review.py` / `review-command.json` 保存本轮静态复核；`result.json` 含完整断言、准确包和范围；`roi-recalculation.json` 是既有五张原生图同8项ROI/全部既有阈值及10个共享ROI差值的独立重算。`visual-review.json` 记录查看的已有原图和标注诊断，没有新应用画面。`input-initial.json` / `input-close.json` 固定初末身份；索引从仓库根解析，含报告，不含索引自身。

安装身份、可见圆加号触摸、导航/长按/正文选字和本次COLD重启可见计数标签的有限证据相符。03过渡图已排除，作者旧索引schema适配失败及修正记录保留。04/19十个同ROI零差不能推成全图或06→07所有区域零差；搜索/计数箭头/compose变化及compose中心余差仍开放。原版低清/DPR未知、内容与系统栏不同，不授整体像素或真实iOS宿主PASS。没有ADB/GUI/应用测试/构建/设备/数据库/缓存/产品/Git操作，Mac29未重跑。
