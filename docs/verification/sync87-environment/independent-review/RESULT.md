# APP-SYNC87 ENVIRONMENT 独立核验

2026-11-06，结论 **PASS — ENVIRONMENT-READY ONLY**。独立审阅冻结源码 `62ca1cf0bb8faf05eadd79a873d8df227085b168` 与作者纯证据 `ba6ef94a3c27a4567bee4018356e51623a9b1f78`；本轮仅一次17项guard、只读证据重算与owned host检查。没有新增boot、ADB设备命令、keylink修复或任何原设备操作。不能据此关闭87完整同步验收。

|核验|结果|
|---|---|
|17项guard|自然exit0，wall 0.063960秒；覆盖旧/缺serial、错AVD、任意ADB/install、PID/start-time、console、guest名和keylink边界|
|独立cleanup mock探针|4项通过，失配身份不能触发ADB/信号；fallback信号前必须重新核身份；自然0与SIGTERM15记账区分|
|当前manifest|父目录72项、repair目录31项全部SHA256重算通过（父目录包含repair条目，不能当103个不同文件）|
|历史保全|previous-files.sha256的39项对b16a4524重算；除README新增最新结果引导外，38个旧文件当前逐字一致；旧events是新events的精确前缀|
|设备事件重算|累计3个启动、3个emulator自然exit0，仅第三次ready；366条设备ADB全部显式`-s emulator-5584`且位于六种allowlist，另4条仅版本查询|
|运行结果重核|前两次wrapper自然exit2、181.699/184.139秒；第三次wrapper自然exit0、21.715秒，ready 18.751秒；第三次super缺失和init fatal实际行均0|
|key与userdata|当前精确绝对link与owned source samefile；key SHA256保持522bd0b6…6d8c3；base userdata的device/inode/6GiB逻辑size及前后allocated_bytes相同|
|当前停止状态|owned state逐字等于保存副本且为stopped；只查本轮历史PID与5584/5585，ps/lsof各自然exit1、无输出；未发设备命令|
|资源|du为377396KiB；df可用13058736KiB，仍大于8GiB门槛|
|源码前后|lifecycle.py与check_guards.py SHA256前后一致，且逐字等于冻结源码；详见audit.json|

源码审阅确认固定owned root、独立AVD/user/emulator HOME和data；cycle显式no-audio/no-snapshot，无camera，无APK入口。ADB发送前校验准确PID命令/启动时间与console listener，再查新serial的AVD名；cleanup只通过已识别state PID或仍持有的Popen child，拒绝身份失配，不存在全局kill、kill-server或默认ADB target。keylink校验raw target后才resolve，只容许已有owned普通key，拒绝外部/相对target、父目录/source symlink和普通AVD key；本次没有执行repair或创建任何资源。

官方来源只核本地只读快照SHA256和已存摘录，不将emu-main-dev公式视作本机37.1.11精确源码。源码推理仅支撑contentPath key识别会改变盘表索引；实际日志才支撑boot_devices从a003800变a003600并成功boot。原失败kernel记录保留33条实际init fatal（另外33条堆栈符号行不能重复计为fatal事件）。

有一条P3 non-blocking证据文案限制：作者repair RESULT第20行“稀疏分配增加”若指base userdata文件，和其两份metadata不符（两份allocated_bytes均105316352）。整目录du增加可核，但增量归因未知；独审不接收该文件分配增加的断言。作者证据未被改写。

独审初次只读聚合因过宽InitFatalReboot子串匹配包含stack symbol而断言失败；原失败、命令ledger和修正说明保留。修正后只重跑只读聚合，复用唯一guard结果，不重跑guard或guest。run_review.py是此次核验入口，所有输出先写`/private/tmp/sync87-environment-independent-review-01`后复制入本树。

未构建/安装APK，未验证App/provider/Sync/VPN/像素；未启动cloudflared、修改SDK/镜像/路由、读写旧AVD或接触emulator-5580约13秒未保存录音现场。本结论适用于已存在的同一owned合成资源；required key门槛不能用作新资源自动初始化或重建许可。
