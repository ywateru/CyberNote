# Error-state normal reopen live01：独立有限结果复核

2026-11-13 UTC。**APPROVE，仅限 `pass-reopen-current-data-only` 的有限实际证据；不重分类旧取消 smoke，不构成登录或同步验收。** 复核未操作设备、App/UI、ADB、网络或恢复入口，未读取私有快照正文、DB/grant，未运行测试、重建或清理；仅在现有独立 worktree 写本文件。

原件 `/private/tmp/account109-android-error-reopen-live01/result.json` 为 1,887 bytes，SHA256 **`920a8717e0f40f4e562c9c15bede9048fd2c3c62a56a35f15810779957170d84`**。复核时父级 main 工作区的同目录 `result.json` 已存在，与原件逐字节一致。本文件未重复归档原报告或私有数据。

报告内 runnerRevision `08a3421a` 解析为 `08a3421a8352b464a35924aed5931e26ba4f6b7d`；五项记录哈希全部匹配该提交的 Git blob 和复核时 main 文件字节：

| 模块 | SHA256 |
| --- | --- |
| account109-android.mjs | `cfbc582c436e8aefa9547f79c513737a6447d4349b1d01b323408b242face618` |
| account109-android-current-login-smoke.mjs | `661db2f29d42aceeb14c1bcfc8a28edd0957f093a6e42f196e5ef76df75dfb38` |
| account109-android-preserving-upgrade.mjs | `3308b5c5ab54895ca06e4ed4ef487382fd36934326bd239c5e65a9cdfb813bdf` |
| account109-android-login-surfaces.mjs | `f9ef371406fa5769bfafa3d7341ee8d88a2435a88e1ed5fa12a808e0d88e523a` |
| account109-desktop-helpers.mjs | `8c9e21dcb13f72a6d5f5095754e577e068331557af032c565e7a6cf1438e31f4` |

复核对照已审批 `timeout-reopen-plan-review01.md` 和任务步骤：error/authentication、disabled、无 profile 的旧进程下先比较完整当前快照；Home/owned background reclaim；释放旧 forward；正常 launch、新 PID、同 APK；healthy signedOut 下重复完整数据比较。报告的有限字段与此顺序及停止边界一致。7c396b1b→08a3421a 的相关变更仅为 native XML 捕获使用 `shell -tt` 和有限错误码透传；background/reclaim、默认非 force-stop launch、完整 capture/sameSnapshot/stableLocal 及 owner cleanup 的步骤契约未改变。

实际报告时段 **14:48:50.989—14:49:04.935Z**：

- 产品 source `88b2dabe4bb898b0bf225e913883b43ed2cac865`，APK SHA256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`，与既有独核候选相同；记录 installedIdentityUnchanged。
- oldPid **17885**，初始 error/account_authentication、disabled、无 profile/devices、pending/conflict 均 0；currentDataPreservedBefore=true。
- backgroundReclaimed=true，preLaunchForwardReleased=true；newPid **28586** 与旧 PID 不同，forceStop=false。
- 重开后 clean signedOut、disabled、无 profile/error/devices、pending/conflict 均 0；完整当前数据重复采样 **3 次/3649ms**。匹配 helper 的完整 capture 覆盖 notes/document/plainText、descriptor、引用和授权附件 byte 长度/SHA，不能用默认旧历史 snapshot 替代。
- exactForwardsAbsent=true、leaseReleased=true；accountMutationSent、notesOrAttachmentsWritten、priorSmokeReclassified 均 false。无 failure/cleanupFailure 字段。

这是报告、已审步骤和匹配模块字节的一致性复核；有限报告不保存逐步调用转录或每次采样正文，本审未独立重观测设备执行，也未重算私有内容。不能从本次 error→signedOut 推定先前 auth error 的超时根因、认证恢复或新域产品网络请求成功；未知附件来源和历史 baseline 不因此获得接受。后续新取消测试必须使用新输出并继续保护准确当前快照，原 smoke FAIL 保留。
