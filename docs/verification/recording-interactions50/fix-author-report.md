# 50 独审发现修复与复验

固定修复源：`8e061891cb56a404bb3ec68baafe0e587d0afa67`，在产品 `9141dff` 和原证据 `1609783` 之上，仅修改 5 个源/检查文件。原合同副本与 Session52 均未修改。哈希见 `fix-source-manifest.json`。

独立审查真实入口首先复现：第一次 submit 在 owner 收到前 IPC 拒绝，第二次 close 重试没有 transfer，出现 attempts=2 / transfers=0 / decoded=0 / saves=0 / destroyed=0，仍显示原窗口未收到音频。旧代码在发起 relay 前把 transferred 设为 true。修复改用原 owner 的 fileAccepted 确认，编码结果只生成和缓存一次；未确认接收时允许重送同缓存数据，确认后不再携带字节。owner 继续以同 session/operation 缓存一个重构 File 和唯一运行中的保存，无接收确认可替代正文持久化 ACK。

独审原生边界还复现：采集已开始、子窗口在原保存等待时异常销毁、原 owner 后续真实 saved，登记仍永久占用并阻止退出。修复记录 child_destroyed，只在原 owner 身份/operation 正确且发送 saved/discarded 后清除已销毁子窗口的登记；alive child 仍必须实际关闭；失败、未知状态、错误身份、错误 operation 或 owner 已失联都不能解除保护。对应真实生产 Rust 路由与 Destroyed helper 有回归。原生边界函数体复验也已通过。

生产 RecordingOwner 同时处理相同次序：异常 child-closed 到达时保留原 owner/ticket 并明确报错，随后原队列真实保存成功才更新 closedSafely 和通知 App 释放原 ticket；后续 close 可以安全完成。实际 App 函数、SaveQueue 和原始 A 文档的回归证明此顺序。

子入口测试增加严格麦克风预检边界，模拟 Mac 平台和原生窗口，要求 exact `plugin:notes-ui|recording_access`、参数唯一 windowLabel 且与实际子窗口 label 相等，只返回 authorized。基线工作树没有 Session52，因此本地断言 0 次；检查从实际 Session 源识别新增预检导入，主线 50+52 集成后必须断言每次 Start 恰好一次。没有改动或替换产品预检。

| 固定源复验 | 结果 |
| --- | --- |
| `fix-build01` | build 通过，现有 bundle 大小提示 |
| `fix-parent01` | 实际 App 函数/SaveQueue 32 项通过，新增 child 毁后真实 ACK 释放 ticket |
| `fix-child01` | 实际 RecordingWindow/Panel/Session/Owner 6 项通过，新增首 relay 拒绝后同数据恢复保存 |
| `fix-native02` | Rust 注册表、访问屏障及 late terminal 3 项通过 |
| `fix-reviewer-unchanged01` | 独审原样首 relay 脚本通过，attempts2/transfers1/decoded1/saves1，等待真实保存确认 |
| `fix-reviewer-native01` | 独审真实生产函数体 probe 通过：quitPrevented=false、nextRegistrationAccepted=true |

`check-relay-reviewer-unchanged.mjs` 是独审脚本原样复制，未改变故障注入或断言。原生 probe 是准确修复 SHA 的 git show 源，仅剥 tauri command 属性与转换内文档注释，替换窗口/事件/退出边界，生产函数体不变。探针允许 entries 已清空时 ExitRequested 直接放行或等待确认后 app.exit 两种安全路径。首失败的关键输入与日志保存在 `fix-independent-failure-inputs`；完整首失败证据由独立审查提交保留。探针可执行文件留在本地且忽略，没有提交。

所有结果仍为受控媒体/IPC/窗口边界和真实生产函数/临时 Store 检查，不证明实际设备双窗录音、音频可听、像素一致或移动端构建。原版用户数据和媒体未接触，没有下载或依赖改动。主线仍须完成 Session52 整合后的最小检查。
