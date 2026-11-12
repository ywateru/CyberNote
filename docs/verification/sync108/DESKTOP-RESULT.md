# sync108 双桌面结果归档

最终 suite `17ad7372`、helper `50a2ac9f` 的 fresh run07 已整体通过：
35 条实际原生断言、两端 DB/WAL 只读证据、四个进程自然退出0，
无强制信号或 lifecycle failureCode；包含 B→A 反向附件正文/引用/原字节。

正式报告及所有历史失败摘要/原路径/SHA 已归档：

- [完整报告](desktop/DESKTOP-RESULT.md)
- [精简机器结果](desktop/DESKTOP-RESULT.json)
- [最终 run07](desktop/run07.json)
- [原失败与独立 Ready 失败](desktop/historical-failures.json)
- [最终 helper 关闭反例](desktop/cleanup-regression.json)
- [binary/source/frontend 来源](desktop/provenance.json)
- [最终 source/tools freeze](desktop/source-tools-freeze.json)

DESK-04 智能文件夹、DESK-06 双向附件已实际覆盖；DESK-11 仅真实 quiet
prepare/commit 和编辑器恢复部分覆盖，未证明与本地未完成保存/IME 确定重叠。
run01–04 及 Mendel ready02 失败保留，run05/run06 保留各自原范围/版本边界。
无 Android 验收声明；本任务不再重复浏览器测试。
