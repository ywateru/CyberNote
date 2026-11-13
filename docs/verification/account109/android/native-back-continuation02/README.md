# 原pending授权的独立native Back续验

嵌套WebView修正经[独审](../nested-webview-review01.md)合入 `e7f398fb` 后，完整执行器316/316通过、零跳过，5438.800666ms，TAP `/private/tmp/account109-nested-webview-integration01.tap` SHA256 `30a410abb9623e314895b2a7c0fb273a43e233d21be182344ab7059b55e9395e`。随后仅对 live02 尚有效的原授权执行一次独立续验，没有新SignIn。

UTC15:05:31.973—15:05:47.390，[result.json](result.json)原样归档，SHA256 `2dfe0abd36b662b8e14818aaedc6e66d2d6c649436a65910b954f8633787709a`，**整体FAIL / CHECK_FAILED**。固定包/APK、PID28586、exclusive lease、解锁/foreground及严格authorizing/embedded/disabled/无profile/error/空devices/pendingCount=0核对通过；完整当前数据比较通过。嵌套表单安全投影三项全true；调用已审原生Back后观察clean signedOut。随后采样检查失败，未记录cancelled-preserved、未回收或重开。精确forward/lease清理通过。未输入凭据或写数据，不改变此前live02失败。

原有限异常未保存精确断言，不能据此认定数据丢失或确定采样次数是该次失败的原因。后续 UTC15:06:39.191—15:06:43.293 独立只读核对见 [post-back-data.json](post-back-data.json)，SHA256 `8d241ba1665798c579e170a62f2a57ed54a09f3e87c36fb96b7ce9173bb01a72`：同PID、每次clean signedOut/空devices/pendingCount=0，完整capture、sameSnapshot及deepEqual三次均通过，总3621ms，capture各803/724/723ms，forward已释放。这个后续PASS只验当前数据，不能补成原续验PASS或重启通过。

源码另有可用确定性时钟复现的最少采样数缺陷，单列[任务](../../../../plan/tasks/app-account109-android-sample-count.md)修复。所有原失败、私有完整快照和旧baseline保留；不解释未知附件来源，不验收认证、三端或匿名中转。报告不包含正文、附件原始字节、XML或授权材料。
