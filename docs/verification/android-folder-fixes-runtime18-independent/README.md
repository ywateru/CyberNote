# Android runtime18 independent static evidence

2026-11-05 **pass / STOP**。只读封存运行材料，99项静态一致性检查首次通过，83个原始文件与旧索引初末相同；不是独审设备操作/完整数据/像素验收。

`input-manifest.json`固定原索引与83文件；`verify.py`/`result.json`保存准确包身份、dump/UID/PID链、动作/PNG完整性、合成正文ROI与错误可见像素检查。`contact-1.jpg`至`contact-5.jpg`是全部37PNG的派生联系图，只辅助静态目视。详细结论及21/29等限制见`docs/plan/reviews/android-folder-fixes-runtime18.md`。

`evidence-index.json`包含本目录除自身外文件、独立报告及固定Android06包结果/索引。身份来自准确已审包，未依赖当前活动工作树。作者21重试和29过渡均原样保留；目录/正文选区、冷启false、计数1→0→1及旧卡片仅按保存端点认可。无GUI/ADB/DB/媒体导出/构建/产品测试/source修改/Git/共享target-cache操作。
