# candidate02 Android 独立核验：身份通过，原生动作受阻

日期：2026-11-04 Asia/Shanghai。冻结构建源 `fabafcf9723e400c67fd842f870dad9d4ae79d19`。证据：`docs/verification/unified-fabafcf-independent-02/android/`。**本轮确切安装包、媒体字节、开发清单和本地数据只读核验完成；计划中的展开/播放/拖动/±15/收回原生独立动作未执行，记 BLOCKED，不以开发结果代替。** 原版手势及像素继续 unknown/未通过。

已独立读取 `emulator-5580` 实际 `base.apk`，302,058,218 B，SHA256 `a50dded89fd89e58cc674564bfde5823fce00e6339ccbcfdcbc0c4e1f20b3501`，与候选一致。app PID10504，physical1080×2280/density440。219冻结输入身份见上一级独立文件；开发 Android 54项证据逐项 SHA/bytes 全匹配，manifest SHA256 `2fe9f1596c98d3af6d902c42e01221954e2e3683122c46a8ec2966f9a2c74146`。

真实合成 WebM 根相对路径 `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm`，429,547 B，SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`，前后完全相同。第一次错误加 `files/` 前缀读到92B路径错误消息，00身份文件保留该失败；03明确纠正，06再次正确复核，92B不计媒体证据。

只读实际生产 `load_workspace` 过滤的完整 MEDIA02/QA-PAPER notes及附件对象在02和05完全一致，含正文、revision、metadata；06比较 `fullFilteredStoreEqual:true`。前后界面为合成纸张笔记，Beta selection39..43、IMEclosed，无录音。没有开始播放、录制、提交、改正文或切换纸张，本轮因此不能判音频控制链通过。

受阻原因：既有 emulator PID3197 以 `-no-window` 运行；CUA没有可见模拟器 surface。当前 CUA 文档要求全部 UI 动作用 cua_repl，故没有使用旧 helper 的 adb input 路径，也未用CDP/DOM点击。只读 CDP仅保存当前状态和过滤数据，未修改页面/editor/ref。

按有界恢复路线复用本机已有 scrcpy3.3.1，参数 `--serial=emulator-5580 --no-audio --no-clipboard-autosync --no-power-on --no-downsize-on-error --window-title='Notes Independent C02' --window-height=800 --window-x=700 --window-y=50`。窗口尺寸参数只影响主机viewer，不改变device尺寸。指定当前SDK adb及同目录原有server，不下载或安装新工具。两次裸viewer能够识别Android11，关闭时缓冲日志显示Renderer metal/Texture1080×2280；CUA按裸路径/名称均Invalid app，inventory无可绑定对象。

最后尝试 `/private/tmp/Notes Independent C02.app` 最小Info.plist+固定shell exec包装本机已有scrcpy。一次 `cua.getApp` 没有返回，工具最终记录“aborted by user after1006.8s”；没有获得UI或执行触摸。包装未修改系统安全设置或注册永久偏好。未再扩展镜像探索，也未把工具无返回解释为产品故障。

两次自有裸viewer分别正常Ctrl-C结束；最后只读 `pgrep -fl scrcpy` exit1无残留进程。包装尝试没有残留自有viewer。07确认 `device` 在线、app PID10504、自有tcp9227已移除，剩余forward为空；没有observer、设备XML、产品方法写入。未重启/终止模拟器，未卸载/clear data/重置权限，host microphone未启用、clipboard autosync未启用。只读安全断点及原截图留存，设备正式交回root。

开发同包原生音频链的54项原始证据已核完整性，独立源码控件结果也继续保留，但它们不能转换为本轮已执行的独立设备通过。下一次设备动作需要先恢复可操作的可见surface；本轮不会因该渠道阻塞延误已授权的局部源码独审。
