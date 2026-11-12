# sync108 双桌面结果归档

最终 helper `50a2ac9f` 的 fresh run06 已整体通过：33 条实际原生断言、
两端 DB/WAL 只读证据、四个进程自然退出 0，无强制信号或 lifecycle failureCode。

正式报告及所有历史失败摘要/原路径/SHA 已归档：

- [完整报告](desktop/DESKTOP-RESULT.md)
- [精简机器结果](desktop/DESKTOP-RESULT.json)
- [最终 run06](desktop/run06.json)
- [原失败与独立 Ready 失败](desktop/historical-failures.json)
- [最终 helper 关闭反例](desktop/cleanup-regression.json)
- [binary、source、frontend 及工具来源](desktop/provenance.json)

DESK-04 智能文件夹已实际覆盖；DESK-11 仅真实 quiet prepare/commit 和
编辑器恢复部分覆盖，未证明远端与本地未完成保存/IME 的确定重叠。
run01–04 及 Mendel ready02 失败保留，run05 保留早于最后 helper 修复的边界。
无 Android 验收声明；本任务不再重复浏览器测试。
