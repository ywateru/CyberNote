# APP-SYNC87 独立Android环境工具

本层只准备隔离环境与生命周期。不会构建或安装APK；不证明App、原生provider、网络路线、同步或原版像素通过。执行证据在源码冻结后另行提交，独立审查由根协调。

固定资源是 `/private/tmp/apple-notes-sync87-environment-01`；`ANDROID_AVD_HOME` 为其中 `avd-home`，AVD 为 `notes-sync87-isolated`，新serial为 `emulator-5584`，端口5584/5585。所有工具调用必须同时显式提供serial和AVD；旧serial、缺serial、错误AVD、非本轮owned PID、已停止/复用PID均拒绝。工具没有通用ADB透传和APK安装入口，不能通过它安装任何旧包。

工具是 `scripts/debug/sync87-environment/lifecycle.py`，仅Python标准库。环境固定使用已缓存API30 `google_apis/arm64-v8a` 镜像、指定SDK/ADB/cloudflared。准备只用avdmanager创建全新配置与data目录，不读取或复制旧AVD/userdata/snapshot；不安装新SDK。cloudflared仅执行版本核验，不启动公网。工具要求已有5037监听作为ADB前置条件，不运行server管理命令，不枚举设备。所有设备命令都先核对owned PID启动时间/命令/console端口，再对显式新serial校验AVD名。

有效预算为2048MiB RAM、2核心、data逻辑6GiB稀疏镜像、cache128MiB、720×1280。首次请求1536MiB/2G被emulator37.1.11自动提升为此有效值，原始日志/配置偏差保留；初次新目录实际约126MiB，不把逻辑大小当实际占用。起始磁盘可用约14.49GiB，任何准备/启动与每轮等待均要求至少8GiB剩余。已有共享SDK/Cargo target保持；低于门槛直接失败，保留目录，不删用户数据。模拟器使用cold/no-snapshot/no-audio/no-window、无摄像头。API30只证明Android11 ARM64模拟器。

首次运行180秒内新guest持续offline，监督命令exit2、181.699秒，owned emulator通过新serial控制台停止并自然exit0。该失败不计ready。诊断版改用当前帮助列出的 `-gpu software`、`-show-kernel` 和明确2048MiB RAM，复用同一新data；每轮有单独owned `caffeinate -dimsu -w <supervisor PID>` 防止闲置显示休眠，超时预算为boot+hold+60秒，结束仅终止本轮caffeinate子进程。host样本显示vCPU处于HVF/pselect等待，电源观察显示UserIsActive=0且无防显示休眠assertion；这些只是选择一次有界诊断的依据，未证明失败根因。

在当前独立worktree使用下列精确入口：

```sh
python3 scripts/debug/sync87-environment/lifecycle.py prepare --serial emulator-5584 --avd notes-sync87-isolated
python3 scripts/debug/sync87-environment/lifecycle.py cycle --serial emulator-5584 --avd notes-sync87-isolated --boot-timeout 180 --hold-seconds 0
```

prepare拒绝覆盖已存在资源。cycle冷启后等待 `sys.boot_completed=1` 并核实API30/arm64-v8a，然后默认立即停止；供后续准确新APK验收时，可显式设置最多600秒hold，在另一命令调用 `status` / `stop`，所有入口仍必须提供同一serial/AVD。600秒是本工具单轮持有上限，不能当后台常驻服务；后续验收若需延长，应在独立审查后调整有界契约。

原两次尝试的缺super失败已发现AVD content目录不能看到独立datadir中的encryption key这一线索。最小修复入口仅在本轮stopped/owned资源中建立 `AVD/encryptionkey.img -> /private/tmp/apple-notes-sync87-environment-01/data/encryptionkey.img` 的精确绝对symlink，指向同一既有文件，不复制或重建key。外部target、symlink父目录/source、既存普通AVD key及不符target均拒绝，源key前后SHA256必须一致。cycle现在要求此受控link，防止重复已知缺盘计数条件；全新prepare尚无data key时不能据此自动初始化或重建，本轮修复只服务已经创建的隔离资源。

```sh
python3 scripts/debug/sync87-environment/lifecycle.py repair-key-link --serial emulator-5584 --avd notes-sync87-isolated
python3 scripts/debug/sync87-environment/lifecycle.py cycle --serial emulator-5584 --avd notes-sync87-isolated --boot-timeout 180 --hold-seconds 0
```

此前“kernel枚举PCI因此system盘可能PCI”的推断撤回：所见PCI是touch输入，磁盘在virtio_mmio模块阶段枚举。不会尝试PCI boot-device override或重复kernel参数覆盖；Android11 fs_mgr从头取首个匹配kernel值，追加重复参数不构成有效修复。第三次只检验精确keylink能否让实际安装版本生成正确boot_devices及消除缺super，结果待源码冻结后记录。

```sh
python3 scripts/debug/sync87-environment/lifecycle.py cycle --serial emulator-5584 --avd notes-sync87-isolated --boot-timeout 180 --hold-seconds 600
python3 scripts/debug/sync87-environment/lifecycle.py status --serial emulator-5584 --avd notes-sync87-isolated
python3 scripts/debug/sync87-environment/lifecycle.py stop --serial emulator-5584 --avd notes-sync87-isolated
```

停止优先在owned PID和新AVD身份核实后发送 `adb -s emulator-5584 emu kill`；不可用时只给本轮owned PID发送SIGTERM，20秒未退出再核对身份并SIGKILL。父监督命令wait取得真实退出码，区分自然退出与信号退出。每个子命令都有超时和命令/exit/wall原始记录；启动/ready/停止/信号与PID、源码SHA256记在资源目录 `events.jsonl`，模拟器日志单独保留。目录/data不自动清理或重建。

禁止对原Android约13秒未保存录音现场（含旧emulator-5580及其他既有设备）发送任何命令；不操作AppleNotes、真实mic、用户VPN/路由。本任务不启动cloudflared，不配置WireGuard/EasyTier。后续根只可在本轮新AVD安装经准确来源核对的新同步APK，安装与实际原生/sync验收另记。
