# Android三条双入口取消流程：当前数据保全通过

2026-11-13，在精确已安装 `88b2dabe` APK 上使用 main `eddab872` 执行器，三条 fresh-output 用例均 **PASS / pass-current-data-cancellation-only**。APK SHA256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`，固定 serial/package 见原报告。没有重建或重装。

| 场景 | UTC | 实际检查 | 取消后／重开后完整样本 |
| --- | --- | --- | --- |
| [embedded-back](embedded-back.json) | 15:13:24.232—15:13:57.208 | baseline、原生托管表单投影、native Back、背景回收、正常重开 | 3次/3564ms；3次/3618ms |
| [embedded-browser](embedded-browser.json) | 15:14:04.161—15:14:41.361 | baseline、原生表单、原生工具栏转浏览器、浏览器activity、返回产品取消、背景回收、正常重开 | 3次/3006ms；3次/3581ms |
| [browser](browser.json) | 15:14:51.784—15:15:21.847 | baseline、浏览器activity、返回产品取消、背景回收、正常重开 | 3次/3251ms；3次/3725ms |

每轮登录前也重复3次且至少3秒；每次读取完整四篇笔记（含document/plainText及全note字段）、唯一附件descriptor/引用，并经产品授权读取原字节比较长度/SHA，再同原准确私有升级快照逐字段比较。取消及重开后的每个样本检查healthy signedOut、disabled、无profile/error/authorizationSurface、无冲突或连接。重开只用Home、owned背景 `am kill` 和正常启动，不force-stop或clear。三个用例最终exact owned forwards及lease释放均通过。

执行命令均为 `node scripts/verification/account109-android-current-login-smoke.mjs --case CASE --output /private/tmp/account109-android-current-login-smoke-CASE03`。三个result逐字节归档；[receipt.json](receipt.json)记录原件路径/摘要、五个模块SHA和执行器来源。执行前完整Node组319/319、零失败/跳过，TAP摘要同receipt。

本次包含真实UI radio选择、产品登录按钮、原生Back/工具栏点击、浏览器activity与产品取消；不是fixture。原生XML只在RAM解析，托管表单投影不单独证明可信origin，来源约束仍是产品原生host policy；未查看远程Logto CDP或填写凭据。没有成功身份验证、enable、账户三端或4G/WiFi匿名中转验收。内置转浏览器的surface变化与浏览器activity已观察，同事务授权持有者仍另由源码/native contract验证，不读取code/state/PKCE证明。

此前 live01、live02、native-back-continuation02 失败均保持原结果；本轮没有解释未知附件来源或改写旧历史baseline。执行器的嵌套WebView与最少采样数修正均已独审，不据新PASS追认历史失败的精确原因。原始私有快照和失败现场保留；[独立结果复核](review.md)已通过，原始结果、模块摘要与旧FAIL摘要均保持一致。
