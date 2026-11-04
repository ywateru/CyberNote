# Candidate04 Android 指定新录音本地检查 01

用户本次已明确允许约26秒的新录音复制到本目录的精确路径并在本地检查。只读取附件 `6771077d-eee5-4c9a-875b-e9b7445cf516`；未复制数据库、WAL或其他音频，未上传、转写、播放或修改设备数据。旧 candidate04-android-runtime-01 冻结证据保持原样；旧自动审批拒绝记录在本目录逐字保留，不将此前未执行的检查追写为通过。

核对 `emulator-5580` 为 sdk_gphone_arm64 / emulator_arm64，已安装 `com.local.notesclone` APK为304110831 bytes，SHA256 `bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2`，与原candidate04一致。指定源文件复制前后均168397 bytes、SHA256 `6e145210f656836e9f1260f8e349af1ab8737e52885b27ed70fba80bf15fb32c`；主机 new-recording.webm 同样一致。只在原包/文件身份通过后才导出，目标不存在时独占新建，未覆盖既有文件。

| 本地检查 | 结果 |
| --- | --- |
| ffprobe | exit0；WebM/Opus、单声道、48000Hz、441个音频packet |
| ffmpeg完整解码 | exit0；启用xerror/err_detect explode，解码输出送null，不另存PCM |
| 解码采样数/时长 | 每声道1270080 samples / 48000Hz = 26.46秒 |
| 非零信号 | 是；min -0.000085、max 0.000090 |
| 峰值/RMS | -80.933462 dB / -102.547498 dB，信号极低 |
| 实际可听或有效声音 | UNKNOWN；未试听，非零采样不证明可听、有效收音、语音内容或麦克风保真 |

容器未给duration（ffprobe N/A），26.46秒由完整解码采样数计算；不将UI计时或播放器进度当作解码时长。ffmpeg末尾展示time=26.44为其输出时间戳进度，独立保留原日志，不据此替换采样时长。

初次普通环境中的 adb devices 因ADB daemon无法建立本机listener而exit1，没有读取设备或导出文件；摘要保存在 initial-adb-environment-failure.json。允许本地ADB连接后，preflight0、export0、probe-decode0全部成功。此环境失败与此前缺少导出授权而被自动审核拒绝是两个独立事件。本轮新的明确授权后，指定路径导出经审批执行；prior-auto-review-rejection.json保留旧拒绝原文。

preflight.json 保存设备属性、包路径/大小/hash、源文件stat/hash及每个只读ADB命令；export.json保存唯一cat导出、主机身份和设备源文件前后身份。media-result.json保存工具版本、精确命令、退出码与数值。ffprobe.json、ffprobe-stderr.txt、ffmpeg-decode.txt是原始媒体工具输出。validate-audio.py/probe-decode.py为本轮实际执行脚本，不是旧目录中未获执行的提案脚本。

每个写入/导出/解码阶段先检查至少2GiB可用空间。没有下载、编译、平台构建、GUI或设备音源/权限/配置操作；host Rust target保持释放。没有像素或设备全面通过声明。manifest按Path组件排序，对UTF8 `<sha256>  <relativePath>\n`聚合，排除自身；同时列全路径字符串排序聚合。
