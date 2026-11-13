# ACCOUNT109 授权自然超时后的正常重开与数据恢复

前置：current-login-smoke-live01已明确FAIL、停止后续序列并归档。一次pending授权自然超时，父级14:14:15观察error/account_authentication；guard在任何Back前拒绝。后续只读PTY已看到主界面（native dialog=false），没有新授权。当前数据预期仍为准确已独核upgrade私有快照，原历史baseline不变。

独立验证正常进程恢复：在fixed serial/package、88b2dabe APK hash、唯一owned PID与exclusive driver lease下，要求native状态为error/account_authentication、无profile/authorizationSurface、disabled、无connected device，记录有限状态。使用已审capture/compare逐字段确认当前全文、descriptor、引用及授权原字节与私有快照相同；任何不符停止。

此后仅调用已有backgroundAndroid（Home）与reclaimBackgroundAndroid（owned背景am kill），确认返回oldPid等于所持peer PID，关闭owned forward/lease；不force-stop、不clear、不账户命令、不SignIn/cancel/signOut/enable。再通过connectAndroid({launch:true})正常启动，核对相同APK及新owned PID，全当前数据相同；若达到healthy signedOut，至少3秒重复完整数据/状态核对。否则停止，不增加恢复手段。

这是单独的超时后进程重开/本地数据保全用例，不重分类旧失败，不把重启清除瞬态error作为旧smoke的自动fallback。当前原错误、失败报告、原库和私有快照均保留。只有此独立用例及PTY测试驱动修正均复核后，才能用全新输出运行新的取消smoke。

父级执行整合，Feynman独立复核上述已有helper调用顺序和边界，Socrates修正界面捕获及安全错误码，Cicero独审源码。实际恢复前须获得独立APPROVE，不需新增产品源码或构建。
