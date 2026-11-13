# Android current-login smoke live03：独立有限证据复核

2026-11-13 UTC。**APPROVE：三条实际用例的 `pass-current-data-cancellation-only` 有限结果、归档及限定叙述一致。** 只读核对父级工作区 README/receipt/三份结果、私有有限原报告、精确提交源码和既有 TAP；未执行设备/UI/ADB、App、网络、测试、构建或安装，未读取私有快照正文、DB/grant、原始附件或 XML，也未参与其他 agent 的清理审查。仅在现有独立 worktree 写本文件。

三个 JSON 均与固定 `/private/tmp/account109-android-current-login-smoke-{case}03/result.json` 原件逐字节一致；receipt 的路径、SHA、时间、checks 和 observations 全部匹配：

| case | bytes | SHA256 | baseline / cancelled / restarted（均3次，ms） |
| --- | --- | --- | --- |
| embedded-back | 1975 | `758b53ea85abbc50f0ec33166437c15b47f584762cbdcb1aff534b8921d4f569` | 3787 / 3564 / 3618 |
| embedded-browser | 2086 | `340e90af2babe0e2e2dcc00fc56508679714047587465c2a574dd8d6c9124f0a` | 3855 / 3006 / 3581 |
| browser | 1828 | `761cb36a41fa73b426aa7459961485cfbbe3291a7b5da65c53742f4ab725dad4` | 3775 / 3251 / 3725 |

时间分别为 **15:13:24.232—15:13:57.208Z、15:14:04.161—15:14:41.361Z、15:14:51.784—15:15:21.847Z**，按序无重叠。产品 source `88b2dabe4bb898b0bf225e913883b43ed2cac865`、APK SHA256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`、固定 serial/package、upgrade receipt 和当前 snapshot pin 全部相同，匹配既有已核候选与当前数据契约；不是接纳未知附件为旧历史 baseline。

receipt 的执行器 revision `eddab872` 解析为 **`eddab872d17c9b05dd9b039fcfb1bd54ba7f56f9`**。五项 moduleSha256 均独立核对该提交 Git blob 及复核时 main 文件字节：android driver、current-login-smoke、preserving-upgrade、login-surfaces、desktop-helpers。原始结果未直接保存执行 HEAD/工具哈希，执行源码归属依据父级 receipt，产品 source 与执行器 revision 不混称。既有 TAP `/private/tmp/account109-local-sampling-integration01.tap` 的 SHA256 `e481f8cb719ac7739a58112432e6f15583e6aea94b15b73047946dfdcf0d9afc` 匹配；汇总 **319 tests / 319 pass，fail/cancelled/skipped/todo 均0**，未重跑。

匹配源码的 exerciseCurrent 显式覆盖默认 snapshot，调用 currentCapture 与 sameSnapshot，并在 stableLocal 再深比较完整结果；每个样本检查 healthy signedOut、disabled、无 profile/error/authorizationSurface、无冲突/connected device。capture 检查四篇完整 note/document/plainText、唯一 descriptor 全字段与引用、产品授权的附件原字节长度/SHA，并与准确私有当前快照比较，不归一化掉 note/descriptor 数据。修正后的 stableLocal 要求 samples>=3 且 elapsed>=3000，两者同时满足才返回，并有30秒入口/读取后 deadline；九个记录窗口均满足。报告不保存逐次正文或原始字节，本审没有重算私有数据。

- embedded-back：实际 surface 仅 embedded；native-form 的 dialog/webView/hostedForm 均 true，匹配源码在复核表单/owned guards 后发固定 native Back，再达到取消后 signedOut/全文保全。
- embedded-browser：surface 顺序 embedded→browser，native-form 三项 true，并有 external-browser observed；匹配源码使用原生工具栏继续、核外部 browser activity、返回测试包并通过产品 UI 取消。
- browser：surface 仅 browser，有 external-browser observed；匹配源码以真实 radio/登录按钮发起，确认外部 browser activity、返回产品 UI 取消。activity 投影只接受固定浏览器包且非产品本身，不独立证明远程页面内容。

三条均记录 background-reclaimed（旧 PID 分别28586/3341/4505、`am kill background package`、forceStop=false）及 restarted-preserved。源码在 clean signedOut 下 Home/owned背景回收，释放旧 peer，再正常 launch；各次打开都核 installed APK hash。三份报告最终均 healthy signedOut、disabled、无 profile/error、空 devices，exact owned forwards absent 和 lease released；均无 failure/cleanupFailure。这里核的是报告及匹配执行器契约，未独立重观测设备、进程或动态 cleanup。

README 的验收边界准确：native XML 表单投影不独立证明可信 origin，仍依赖产品 native host policy；surface 转移和 browser activity 不独立证明同一 PKCE/state/deadline 所有权。没有凭据输入、成功认证、enable、账户三端同步、4G/WiFi匿名中转或未知附件来源验收。原 live01、live02 和 native-back-continuation02 的 FAIL 归档哈希再次核对均未改变；本次通过不追认其精确失败原因，不重写旧历史 gate。
