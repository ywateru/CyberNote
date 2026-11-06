# APP-SYNC87 环境作者执行记录

结论：**BLOCKED / NOT-READY**。生命周期工具与安全拒绝路径可交独审，但全新guest尚未ready；不证明App、native provider、同步、网络路线或像素通过。当前新模拟器与本轮caffeinate均已停止，独立AVD/data目录保留。

2026-11-06，独立分支 `codex/sync87-environment`，基线 `dfe50dc2c0d2c64fd06e4259fcd67026931f5b0d`。首版源码冻结 `0b951bf980d5195ae98f6db2868fcbf1a2f8fc81`；诊断源码冻结 `24dc143642a05de2242ee106e6b75190b2fc534c`。均先commit再执行对应真实环境尝试。仅新增隔离工具/文档/证据，没有修改生产TS/Rust、已有测试或构建脚本；没有构建/安装APK，没有merge/push。

|执行|源码|自然exit|wall秒|实际结果|
|---|---|---:|---:|---|
|首版guard|0b951bf9|0|0.071|10项标准库guard检查通过，不访问设备|
|prepare|0b951bf9|0|1.155|全新AVD/config/data建立；仅缓存镜像|
|首次cold cycle|0b951bf9|2|181.699|180秒内持续offline；owned emulator自然exit0|
|诊断guard|24dc1436|0|0.065|11项通过，含精确token而非AVD前缀匹配|
|唯一诊断cycle|24dc1436|2|184.139|33轮同一early-mount fatal重启；owned emulator自然exit0|

每条准确argv、cwd、source commit/SHA256、自然exit/信号、wall与原始stdout/stderr索引见 [commands.jsonl](commands.jsonl)。生命周期内部每个子命令及启动/停止事件见 [owned-events.jsonl](owned-events.jsonl)。wrapper的wall包含preflight/停止开销；180秒是boot等待预算，不能把184.139秒记成内核成功启动时长。

## 已观察的阻塞原因

诊断kernel反复出现：

```text
init: realpath failed: /dev/block/by-name/super: No such file or directory
init: Failed to mount required partitions early ...
init: InitFatalReboot: signal 6
reboot: Restarting system with command 'bootloader'
```

[首轮fatal上下文](kernel-first-fatal.txt)与[完整诊断kernel原始日志gzip](emulator-20261106T075345.log.gz)保留。33次缺super与33次InitFatalReboot一一记录，故不能把guest单轮约5秒、host数十秒的观察解释为单纯启动慢或任意超时门槛过短。guest没有进入可用Android用户空间，未获得 `sys.boot_completed=1`。

kernel是缓存镜像的Linux 5.4.249 Android11。启动参数自动给出 `androidboot.boot_devices=a003800.virtio_mmio`，kernel枚举virtio-pci设备，系统与vendor镜像均GPT；最终hardware配置 `kernel.newDeviceNaming=yes`。boot-device命名与virtio布局不匹配是有据的待验证方向，尚未证明单个参数覆盖能修复。没有修改SDK、镜像或kernel参数，也没有第三次boot。

首次[owned PID样本](owned-owned-pid-sample.txt)中两vCPU在HVF/pselect等待；`-accel-check`为自然0，输出Hypervisor.Framework OS X Version 26.4，硬件加速存在。诊断中host wall约1:47时，新PID98641累计CPU时间0:19.44；这些不替代kernel的early mount失败事实。

## 生命周期和预算

资源固定 `/private/tmp/apple-notes-sync87-environment-01`，AVD `notes-sync87-isolated`，新serial `emulator-5584`，显式新data目录。创建前5584/5585未占用。所有设备命令先核owned PID/lstart/精确AVD/port/data命令，再核console端口归属，最后显式 `-s emulator-5584` 核AVD名。

首版请求RAM1536MiB/data2G；emulator37.1.11自动提升为RAM2048MiB/data逻辑6GiB，首次日志与prepared原始配置都保留，未重建目录。诊断明确2048MiB、2核、cache128MiB、software GPU、show-kernel，始终cold/no-snapshot/no-audio/no-window、无摄像头。初次新目录实际约126MiB；最终 `du -sk` 为131952KiB（约128.86MiB），6GiB是稀疏镜像逻辑大小。主机起始可用约14.49GiB、最终约13.52GiB，期间其他工作并行，不能把全机差值全归于本环境。8GiB剩余门槛始终未触发；没有删除共享SDK/target或任何用户数据。

首次owned emulator PID97439，诊断PID98641，分别在校验后通过 `adb -s emulator-5584 emu kill` 停止，两者自然exit0，未使用emulator SIGTERM/SIGKILL。诊断仅新建owned caffeinate PID98599（绑定supervisor98598）；主机观察确认UserIsActive及防显示/系统休眠assertion生效，结束只终止此owned Popen子进程，记录为SIGTERM15，不能称自然exit0。最终[owned PID检查](08-owned-pids-stopped.stdout.txt)与[端口检查](09-new-ports-free.stdout.txt)均无结果/exit1，表示本轮进程不在、5584/5585无监听；[最终状态](owned-state.json)为stopped，status入口自然exit2拒绝发ADB。

## 边界核查和保留失败

[audit.json](audit.json)从本轮原始事件重新核对：344条针对设备的ADB命令均显式新serial；另3条仅 `adb version`，不访问设备。仅2次有AVD参数的模拟器启动，0次ready，两次emulator自然exit0。没有设备枚举/默认target、kill-server、旧serial命令、旧AVD配置/userdata读取、安装或原设备导出/备份；没有App或AppleNotes操作、真实mic输入。

版本前置核验为emulator37.1.11、ADB36.0.0、cloudflared2026.7.2，缓存API30 google_apis arm64-v8a revision16。cloudflared仅 `--version`，未启动公网；PATH没有wg/easytier-core/easytier-cli，不据此推断用户现有VPN不存在，未设置/修改路由。共享主线node_modules/src-tauri/target仅查看目录元数据，本任务不需要前端依赖。

除两次真实boot失败外，证据还保留两项非运行故障：[collection-failures.txt](collection-failures.txt)。初次证据聚合断言把允许的ADB version误分类为设备流量，修正分类后从同一日志审计，未重跑boot；直接headless qemu `-h` 因缺启动器设置的动态库搜索路径而SIGABRT6，stderr原样保留，未带AVD参数。安装的emulator `-help-all` 可证明 `-qemu args` 透传支持，但并未证明 `-append` 的具体覆盖语义，因此没有给出未经证实的修复命令。官方源码路径研究由根另行进行，本报告不编造网页来源。

下一步是根根据缺super与boot-device布局证据安排最小兼容性修复；本次独立目录继续保留供后续准确新同步APK安装。原Android约13秒现场完全不动的约束继续有效。
