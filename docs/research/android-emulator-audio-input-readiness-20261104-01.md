# Android emulator-5580 主机音频输入就绪性只读诊断

日期：2026-11-04。本轮仅一次有限查询链；结论为 **当前主机麦克风实际输入状态 UNKNOWN**。存在明确的启动门控线索，尚不足以将26秒录音的极低信号归因为模拟器或产品。

## 观察

| 项目 | 本轮实际结果 | 能证明的边界 |
| --- | --- | --- |
| 运行进程 | PID3197，`/Users/water/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64-headless` | 实际运行进程与端口5580对应 |
| 实际参数 | `-avd nuva_mirror_isolated -port 5580 -read-only -no-window -no-snapshot -gpu swiftshader_indirect -memory 2048 -cores 2`，另有显式`-data/-encryption-key/-cache`镜像路径 | 未观察到`-allow-host-audio`，也未观察到`-no-audio`或`-audio none`；没有读取进程环境 |
| 本地SDK | emulator/source.properties:2 为`Pkg.Revision=37.1.11` | 当前本地安装资料版本；不是另做运行中版本RPC验证 |
| 主机音频参数帮助 | 同一SDK的`emulator -help-allow-host-audio` exit0，原文：`Allows sending of audio from audio input devices. Otherwise, zeroes out audio.` | 帮助与启动参数共同提示主机输入可能未获启用；不替代运行时状态或捕获信号证明 |
| AVD映射 | `.android/avd/nuva_mirror_isolated.ini:2` 指向同名`.avd` | 只读定位对应配置 |
| AVD静态配置 | config.ini:23–24 为`hw.audioInput=yes`、`hw.audioOutput=yes` | 虚拟音频硬件支持启用，不证明主机信号接入 |
| 生成硬件文件 | hardware-qemu.ini:21–22 为`hw.audioInput = true`、`hw.audioOutput = true`；:121 为同一AVD名 | 只记录文件当前值，不保证它代表该进程当前所有生效状态 |
| 硬件属性定义 | SDK lib/hardware-properties.ini:185–190 将hw.audioInput描述为设备能否录音 | 硬件能力与主机麦克风输入状态是不同问题 |

实际进程还使用显式恢复镜像：`/Users/water/work/2026/life-memo/.native-test/acceptance-plain/emulator-preserved/recovered-{data,encryption,cache}.img`，只从启动参数观察路径，未读取这些镜像。

## 当前状态查询能力与停止点

`adb -s emulator-5580 emu help` exit0列出已有控制台命令，未出现audio/microphone状态查询。随后仅执行`emu help grpc`（exit0），其原文为`This allows you to start the grpc endpoint at the given port`。该grpc命令的含义是启动服务，超出只读范围，因此没有执行grpc命令本身。

本地官方`lib/emulator_controller.proto:350–354`明确区分只读`getMicrophoneState(Empty)`和修改`setMicrophoneState(MicrophoneState)`；:1599–1602的返回字段为`bool realAudioEnabled = 1`，注释表示host microphone access是否启用。`streamAudio`（:325–332）与`injectAudio`（:334–348）涉及媒体流或输入注入，不属于本轮诊断，没有调用。

只读`lsof -nP -a -p 3197 -iTCP -sTCP:LISTEN` exit0发现本进程已有loopback监听端口5580、5581、52701（各IPv4/IPv6）。5580与启动console port一致，5581为相邻端口；52701的协议与服务身份未在本轮得到证明。本轮未将任意监听端口猜作gRPC，没有尝试未证实的endpoint、读取认证材料或启动新endpoint。故虽有明确只读RPC定义，**尚无已确认且可用的当前状态查询连接，getMicrophoneState未执行，realAudioEnabled仍UNKNOWN**。同样未知主机音频设备、系统麦克风权限、后端源选择及当前信号内容。

## 与已保存录音的关系

已有独立文件检查为[音频检查报告](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/candidate04-android-audio-validation-01/README.md)：26.46秒、可完整解码、非零但峰值-80.933462dB、RMS -102.547498dB。该文件事实不会因此变成“有效收音通过”。未带`-allow-host-audio`与本地帮助提供环境门控线索，但本轮没有输入信号或当前麦克风状态证据，不能将极低信号归咎于产品，也不能断言模拟器当时或当前绝对无输入。

## 执行范围与来源身份

初次普通环境的`ps`读取被环境权限拒绝（exit1）；允许只读进程查看后，同一命令成功（exit0）。所有其余列明的帮助/配置/进程监听查询均只读；配置搜索正常返回音频行。没有更改启动参数、配置、麦克风/音源/权限，没有新建录音、捕捉/播放/导出更多媒体、读取设备数据库、GUI、下载、编译或接触Rust target。只写本报告，停止继续诊断。

以下SHA256为本轮读取时的文件身份，不冒充运行时状态：

| 本地来源 | SHA256 |
| --- | --- |
| `/Users/water/Library/Android/sdk/emulator/source.properties` | `ee589ca350515c29dc3bad30dd5ebe8efb11d1a50c17c8815125d3c4bd12a3a8` |
| `/Users/water/.android/avd/nuva_mirror_isolated.ini` | `230d5ad15b585508b7fb0789234d198200913ee9e1ff3e0115a78a25e8d643a4` |
| `/Users/water/.android/avd/nuva_mirror_isolated.avd/config.ini` | `a64931ccb7436b9329b3a63bdf024818fec297c3cad45ead1e66da7a14380036` |
| `/Users/water/.android/avd/nuva_mirror_isolated.avd/hardware-qemu.ini` | `8426ff6c9dac5a1c44185524e5e871361a993959cd653bbb0263e849352ad599` |
| `/Users/water/Library/Android/sdk/emulator/lib/emulator_controller.proto` | `1d62c6bcad5f06621f90ec2bf26c661ba769ccd0f1416b5314d25a68e04eee5f` |
| `/Users/water/Library/Android/sdk/emulator/lib/hardware-properties.ini` | `13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d` |

记录时间（UTC）：2026-11-04T02:53:36.107165+00:00
