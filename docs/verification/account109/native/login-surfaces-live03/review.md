# 独立复核：APPROVE（有限范围）

复核者 Erdos 在父级归档前独立读取三份实际原始 result、runner 字节及候选身份，并以 signal 0 和 ps 检查六个 PID 均不存在。未启动应用、联网、构建、访问 DB/grant 或操作设备。

三份报告各五项 PASS，failure/cleanupFailure 均无；六个进程均自然退出0、无强制信号。采样次数、窗口时长、完整正文比较契约及编辑前后同 noteId 均与 README 相符。复核者从源码 fixture 独立计算两个正文哈希，匹配所有报告。

| 原报告 | 独立 SHA256 |
| --- | --- |
| browser03 | `5421df85bc84c21da1004fd7d5679231bafd980bfb4826900db63ed458584a9c` |
| embedded03 | `3a4d71ea4a115be792cd948187514193f9027f7b7b82e21cedca853c009e6a62` |
| transfer03 | `6d10c1606bd09181022fee8387bec80e799ff8cb743503108602e93fbbfbf102` |

四个工具模块哈希与提交 `352d0b7f88bcb4b318cc94a40c2cce49ce75f40c` 一致：

| 模块 | SHA256 |
| --- | --- |
| account109-cancel-local.mjs | `b0d563e753b53b72b554f809fe29a13ca7ceb51be52fac6d344d0fdbefe0c012` |
| sync108-native-driver.mjs | `d521530738daf0586846445de14e6ecf57799c2c441e78cb0d25312b640a2c23` |
| account109-desktop-helpers.mjs | `e5278d612598946624209c3aae8be8bf7243b806ce9de3dd2e406ed87a505ab0` |
| account109-desktop-recovery.mjs | `c88f2b2f14a6fe04657f5a51dcce4e1076f8d12c4b2bb592c5cfcc799a508672` |

产品源码/实际二进制 SHA256、字节数及 arm64 均与既有 build-record 一致。原报告未记录执行 HEAD，复核不将上述工具提交称为执行 HEAD。通过严格限于真实 CLI 驱动的取消与本地完整正文保全；无表单渲染、物理点击或关窗证明，无认证成功或新 Android host 验收。

本文件由父级根据独立工具返回记录；归档文件及文字仍将由复核者再次核对。
