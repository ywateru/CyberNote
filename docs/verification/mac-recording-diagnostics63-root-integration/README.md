# Mac授权诊断63主线接收

2026-11-05。接收状态 **PASS / SOURCE-READY-DIAGNOSTICS-ONLY**，仅默认关闭的内部诊断与结构化错误保留；实际麦克风授权、新采集、有效收音、后台双模式及像素目标仍未通过。本次没有启动/替换Mac17、没有真实权限请求、系统设置或签名操作，也没有操作原Android现场。

准确产品源`78f9f9d896e8c5d75311f3202484ff119f57369c`：初源600efea、worker测试修订8d47e77、非阻塞修复78f9分别合为主线c6225903/11f3aed2/ce34f03e。作者证据acdaa395及追加日志068f341合为3e35775e/0641278b；独审813bf706合为7d9adf8b。首次同步I/O阻断和所有首失败仍在证据原件，不以最终通过覆盖。

root在7d9adf8b执行主线`pnpm typecheck`及`pnpm build`均exit0，完整日志在本目录；原有Vite大chunk提示保留。逐路径Git比较确认：全部plugins、native-recording-access及三个63脚本与准确78f9完全相同；手机60的CSS/View/waveform与b5d008a相同；作者/独审证据目录与各自准确提交相同；旧52两个封存证据目录相对0fbd04d完全不变。没有重复native编译或全媒体矩阵，因为独审已对相同原生字节完成有意义验证，合入只与手机CSS并存。

诊断由精确进程环境值`NOTES_RECORDING_DIAGNOSTICS=1`开启，默认关闭时不创建writer/输出。main、OS completion及FFI producer只提交固定标量到64槽非阻塞队列；每进程256次事件预算，writer有机会恢复时输出一次当时丢弃的截断快照。writer无音频/笔记/路径/指针/context，不join/flush等待；堵塞或失败时可能没有可见输出，不能把日志缺席解释为系统callback未发生。JS保留原code及受限stage/requestId，UI继续原message。授权30/35+35/45秒层次、pending单请求、迟到回调与资源所有权保持。

独审实际覆盖：50例JS；off/0/true零输出；持stderr锁10000次producer、64槽饱和与256预算；先排空255后耗尽；65536字节满pipe无reader；EPIPE后metadata仍在；生产Rust sink与生产ObjC假OS链各17例、69操作完整同序、134事件；pthread/释放池/join建立明确worker退出后再核最终context释放。首漏生产ARC异常flag失败保留，补回固定build.rs flags后仍O0通过，不修改产品或提高优化。详见[独立报告](../mac-recording-diagnostics63-independent/review-final.md)及[作者证据](../mac-recording-diagnostics63/README.md)。

当前Mac17仍固定fa21657，Android构建13固定a236b311（含手机60，不含63），本任务源码尚未进入新安装包。不能以源码诊断通过追认此前Start超时已修复，也不能要求用户恢复已暂停的手机设备验收。研究61的真实根因证据缺口与62的已保存附件交互缺口继续保留。
