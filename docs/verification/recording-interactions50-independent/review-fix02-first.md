# 第三固定源 1b47 独审：重复 Quit 阻塞

固定1b47c8025f3df5b43d85561566fd7ab381096820。原样 check-quit-new-edit 脚本保留新增宿主依赖缺失 ReferenceError quitPending，不计产品失败。仅添加新 App state/ref、真实 SearchEditorGate 与 Editor.setEditable 宿主后，保持全部原始断言不变，33 项通过，editableAfterAck=false、pendingDocs=0。实际新版 App+SaveQueue 38 项、typecheck、Rust4 项通过。20 个输入字节固定，含新 search-editor-gate。

额外 public-function probe 执行真实 Rust register/message/exit_requested/destroyed/recording_quit_ack 函数，仅替换 Tauri 平台边界：main+note-pending 共同参与 Quit，main 录音已 saved、child Destroyed、main 正文 ACK；note-pending 仍无正文 ACK。此时再次 ExitRequested 因 entries.is_empty() 直接 return，repeatPrevented=false，实际 runtime 可退出。firstPrevented=true/otherAckSent=false/exitCalls=0（没有调用 app.exit，但未 prevent 允许 runtime 默认退出）。native-repeat-quit-first 保留断言101、固定模块、编译选择及原始日志，阻塞已发送作者。

其余源审：第一 await 前 quitState+inert+实际 gate.suspend/park；原生/格式/新建与 await 后入口被封。SearchEditorGate.activate/restore叠加暂停，晚onReady park。成功 ACK 后持续冻结；匹配取消才恢复当前允许实例，停录以外仍可正常编辑。活动或尚未settled组字直接拒绝本次Quit，不更改正文/输入状态。Rust参与者原始集合与每次ACK/Destroyed当前集合比较，变更取消旧Quit而不复用ACK。真实设备/GUI/音频/像素仍由root验收。
