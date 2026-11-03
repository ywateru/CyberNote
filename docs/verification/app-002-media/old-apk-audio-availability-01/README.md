# APP-002 旧包受控音轨可用性核查 01

2026-11-03，verify 明确释放 Android 后执行。仅核查既有模拟器是否已有可用受控音轨输入；结果 **unknown**，并已按有界要求停止。不是 getUserMedia 或录音 roundtrip 已通过，也不证明 injectAudio 接口不存在/不可用。

已通过真实 `pm path` 与设备端 `sha256sum` 复核当前安装包为冻结旧候选 `5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2`，无 APK 复制、重装或候选替换。当前 Android 11、WebView `91.0.4472.114`。模拟器 PID3197、原 AVD `nuva_mirror_isolated` 与 exec session73263 保留。

本机协议定义和 hash 与已有准备记录一致；emulator `-help-grpc` 说明需启用服务并给定端口，JWT 另有显式 flag。只读检查当前进程的指定参数，未见 `-grpc`、`-grpc-use-jwt`、`-grpc-use-token`。检查的常见发现目录未找到 `pid_3197.ini`；这一有限路径搜索不能证明所有位置都不存在发现文件。没有读取或打印认证材料。

进程实际监听 localhost 5580、5581、52701。保留 5580/5581 的原控制用途，只对其余既有 localhost52701 做 **一次** 3秒上限的 HTTP/2 unary `getMicrophoneState` 空 protobuf 请求，使用 Node 内置 http2，无额外客户端/依赖安装。3004ms 时未收到 HTTP/2 响应头，关闭请求并销毁客户端。52701 仅被证为模拟器所属监听端口，**未被证为 gRPC 服务**，故此 timeout 不能解释成服务权限拒绝、认证失败或 injectAudio 不支持。

因此没有可用控制端点/认证结果，未调用 setMicrophoneState/injectAudio、未更改宿主麦克风状态、未触发应用录音或收集环境声音。也没有创建 adb forward、操作 GUI/输入设置、重启/停止模拟器、清数据、改包、构建或扩建测试平台。详细只读结果见 `result.json`。

root 后续授权只读查询公开 console 帮助：`emu avd grpc` 返回 **`KO: No active gRPC service`**，补足当前未启用服务的直接证据。`help avd hostmicoff` 明确其向 guest microphone 送零、不受宿主声音影响；只读取 hostmicon 帮助，未执行开启。root 已另行授权 hostmicoff 成功后用旧包核真实静音流程，后续单列，不回写成可辨识音轨采集通过。本页 effects 只描述上述端点核查阶段。

实际 getUserMedia 许可、音轨、录制/暂停继续/结束/保存、受管文件解码、冷启动可听播放和实际资源释放仍 unknown。资源清理候选 `0b29cc0` 的26项失败注入是另一份源码证据，不能填补这次设备基线缺口；候选仍待独立静态审查和 root 的后续交接，不因本次核查而合入或装包。
