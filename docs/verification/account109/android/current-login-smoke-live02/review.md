# Current-login smoke live02：独立有限证据复核

2026-11-13 UTC。**APPROVE 失败归档与限定叙述；实际用例仍为 FAIL / CONDITION_TIMEOUT。** 只读核对原件、父级 main 工作区归档、README 和相关源码；未执行 UI/ADB、App、网络、安装、恢复、测试或清理，未读取私有快照正文、DB/grant、原始 XML。

两份归档均与对应私有原件逐字节一致，JSON 可解析，哈希匹配父级提供值：

| 归档 | 原件 | bytes | SHA256 |
| --- | --- | --- | --- |
| result.json | `/private/tmp/account109-android-current-login-smoke-embedded-back02/result.json` | 1388 | `bc8c1cf045d7ee40a48f51e0a6641435b2a015f7e0a8eebf9f070372d25481e3` |
| finite-structure.json | `/private/tmp/account109-android-native-structure02.json` | 1681 | `d6e4bb553cb7afec1888a32e0e4fcd55f93589e1fd107cb3a047471775b6bde2` |

原运行 14:58:01.430—14:59:15.965Z，只有 baseline-preserved **3 次/3921ms**；记录 actual surface=embedded，最后仍 authorizing、disabled、无 profile/error，随后 CONDITION_TIMEOUT。native-form、cancelled-preserved、background-reclaimed、restarted-preserved 均未通过；匹配 exercise 的顺序在 native form gate 之后才可发送 Back，因此本次没有取消/重启通过证据。报告记录 owned exact forwards absent、lease released。此报告只覆盖 embedded-back；后两 case 未运行依据父级执行说明，不从单份 result 擅自推导其他执行历史。

后续结构观察时段为 **14:59:53.330—14:59:56.412Z**，晚于原运行结束。有限材料记录 PID28586、前后 authorizing，唯一同包根 WebView（depth0）及其内同包 WebView（depth1）、2 个 EditText、depth2 固定“登录”按钮、depth0 唯一“在浏览器中继续”和“取消登录”原生按钮；projection 为 **dialog=true / webView=true / hostedForm=false**，exactForwardAbsent=true。具体 foreground、解锁、exclusive lease 和原结构归约过程属于父级诊断执行说明；本审不声称从有限 JSON 重新证明未保留的整棵 XML。

README 中父级记录执行源码 `4b6d65d8` 解析为 `4b6d65d853a9b07aeedb0b06d3a8cf44d4cf4d36`。current-login-smoke、android driver、login-surfaces、preserving-upgrade、desktop-helpers 五模块的该提交字节均与复核时 main 相同；原 result 本身没有执行 HEAD 或工具哈希，不将父级源码说明称为原报告自证。产品 source/APK pin 仍为已核 `88b2dabe4bb898b0bf225e913883b43ed2cac865` / `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`，不是执行器 revision。

该精确源码以最近 WebView 为 webOwner，却要求表单控件的 webOwner 等于唯一顶层 WebView；同包内层控件不满足该条件。源码判断与后续 hostedForm=false 的结构投影一致，足以支持有界的 parser 修正方向；**不能证明表单在整个原等待窗口均已出现，不能补记原 native-form PASS，也不能解释全部旧失败。** 有限结构不独立证明可信 origin、用户字段值、视觉呈现或成功认证。README 已明确失败后尚未完成完整数据复查，未用登录前保全冒充退出后保全；未知附件来源和历史 baseline 继续未接受。后续修正或单独续验不能改判本轮 FAIL。
