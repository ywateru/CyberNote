# Native Back continuation02：独立有限证据复核

2026-11-13 UTC。**APPROVE 归档一致性与限定叙述；原续验整体仍为 FAIL / CHECK_FAILED。** 对照父级 main `a7ccc703728d962f9ca0a948611383498bf57387` 的 README/result/post-back-data、私有有限原报告及精确源码；未操作设备、UI/ADB、App、网络或恢复，未测试、构建、清理，也未读取私有正文、附件原字节、XML、DB/grant。仅在现有独立 worktree 写本文件。

两份 JSON 可解析，与以下原件逐字节一致，SHA256 均匹配 README：

| 归档 | 原件 | bytes | SHA256 |
| --- | --- | --- | --- |
| result.json | `/private/tmp/account109-android-native-back-continuation02/result.json` | 1210 | `2dfe0abd36b662b8e14818aaedc6e66d2d6c649436a65910b954f8633787709a` |
| post-back-data.json | `/private/tmp/account109-android-post-back-data02.json` | 542 | `8d241ba1665798c579e170a62f2a57ed54a09f3e87c36fb96b7ce9173bb01a72` |

原续验时段 **15:05:31.973—15:05:47.390Z**。报告记录同一 PID28586、`pending-current-data-preserved`、native form 的 dialog/webView/hostedForm 三项全 true、backAttempted=true 和 `native-back-signedOut`，最后有限状态为 signedOut、disabled、无 profile/error/devices、pending/conflict 均 0；随后 CHECK_FAILED，未记录 cancelled-preserved、回收或重启成功。无新 SignIn、凭据输入、数据写入或 force-stop；exact forwards absent、lease released。固定包/foreground/解锁、exclusive lease 和严格 pending 前置条件的实际核对属于父级执行说明；有限报告未保存完整调用转录。

后续独立只读报告时段 **15:06:39.191—15:06:43.293Z**，明确晚于原续验结束，同 PID28586；三个 currentDataIdentical=true，capture duration 分别 **803/724/723ms**，观察段总时长 **3621ms**，状态为 pass-read-only-current-data、exactForwardAbsent=true。每次 clean signedOut、pendingCount/devices 及 capture/sameSnapshot/deepEqual 的具体调用依据父级说明；该有限 JSON 未逐次保存状态或正文，不据此重新推导私有内容。后续 PASS 仅支持该独立数据观察，不能补成原续验 PASS，也不含重启。

runnerRevision `e7f398fb` 解析为 **`e7f398fb92c96d04a5e568811bec5e8c9af63652`**。以下精确提交字节与复核时 main 一致：

| 模块 | SHA256 |
| --- | --- |
| account109-android.mjs | `4cce4edeb49e6327f7cbba43465cc0519eeeaf7eb202377214451045bb6056b2` |
| account109-android-current-login-smoke.mjs | `661db2f29d42aceeb14c1bcfc8a28edd0957f093a6e42f196e5ef76df75dfb38` |
| account109-android-login-surfaces.mjs | `f9ef371406fa5769bfafa3d7341ee8d88a2435a88e1ed5fa12a808e0d88e523a` |
| account109-android-preserving-upgrade.mjs | `3308b5c5ab54895ca06e4ed4ef487382fd36934326bd239c5e65a9cdfb813bdf` |
| account109-desktop-helpers.mjs | `8c9e21dcb13f72a6d5f5095754e577e068331557af032c565e7a6cf1438e31f4` |

源码契约保持唯一可见所属 root、连续同包嵌套后代、精确原生 toolbar 和动作前后 guard；native Back 入口复核表单后才发送固定 KEYCODE_BACK。表单投影不是可信 origin 的独立证据。完整 current capture/sameSnapshot 比较 notes/document/plainText、descriptor、引用及授权附件 byte 长度/SHA；不能以默认旧历史 snapshot 替代。原 stableLocal 在 elapsed>=3000 时立即断言 samples>=3，存在可独立分析的慢读取时序缺陷，但原 CHECK_FAILED 没有精确断言信息，本审不认定该缺陷就是本次失败原因，也不认定数据丢失。

已只读核对既有 TAP `/private/tmp/account109-nested-webview-integration01.tap`：SHA256 `30a410abb9623e314895b2a7c0fb273a43e233d21be182344ab7059b55e9395e`，**316/316 PASS，fail/cancelled/skipped/todo 均 0**；没有重跑。产品仍是已核 88b2dabe APK；此前 live02 FAIL、私有当前快照、未知附件来源及旧历史 gate 均不由本次改判。没有认证、三端同步或匿名中转验收结论。
