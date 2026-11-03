# 手机镜像 surface 第03次有界恢复

2026-11-04 Asia/Shanghai。执行者verify。**结果：未取得可绑定surface，BLOCKED；没有产品UI动作。** 该目录独立于之前已冻结的candidate02结果，不覆盖或改写旧证据。

本轮先刷新CUA文档，返回0.6105秒；只读getState返回0.9563秒，筛选镜像应用结果为空。这里没有工具无返回；root一度因没有收到后续消息误判超时并中断，之后已更正。本轮真实返回时间与旧wrapper1006.8秒无返回是两件独立事实。

只读otool检查本机已有scrcpy3.3.1，列出系统库/framework依赖。将该既有二进制原样复制到 `/private/tmp/Notes Mirror Surface03.app/Contents/MacOS/scrcpy`，Info.plist的真正CFBundleExecutable即该binary。6,914,992 B，SHA256 `3b421b76ad485fe1010ee968d22c30963e5b3c6e12f14ea3d4fb70d2717e596a`，与源字节完全相同。没有下载、安装依赖或修改系统设置；该方案不同于旧shell exec外部binary包装。

启动包内binary时显式设置现有SDK ADB、既有SCRCPY_SERVER_PATH、serial emulator-5580及参数：`--no-audio --no-clipboard-autosync --no-power-on --no-downsize-on-error --window-title='Notes Mirror Surface03' --window-height=800 --window-x=700 --window-y=50`。完整环境和参数保存在00-setup。window-height仅用于主机镜像窗口，没有设备size/density override。

启动命令session37573返回still-running，实际PID29773路径/参数与新包吻合。随后CUA getState返回1.2648秒，镜像应用筛选仍为空；只读WindowServer针对该PID的窗口列表为空，viewer.log始终为空，进程状态Ss。没有SDL/window/传输错误输出可供进一步归因，因此不把未知原因写成产品或权限故障。

未调用getApp启动默认无args实例，因为当前接口无法附带固定noaudio等参数。root同意在该边界停止，不继续尝试旧裸路径、旧wrapper、重启CUA或设备服务。自有session37573以Ctrl-C关闭，exit130；03-cleanup保存最终只读进程和设备状态。临时.app保留在/tmp供后续明确任务使用，当前没有自有viewer运行。

设备前后state、appPID、物理尺寸/density、forward和reverse清单均记录；不操作原备忘录、不改变正文、权限、麦克风、数据、设备大小，不重启模拟器。旧Android14项已冻结manifest重算仍全匹配，见old-frozen-check。下一新包设备实测仍需另一个可操作surface，本轮不计播放、录音或触控通过。
