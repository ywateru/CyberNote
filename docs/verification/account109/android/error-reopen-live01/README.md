# Android error状态正常重开与当前数据保全

2026-11-13 UTC14:48:50.989—14:49:04.935，执行来源 `08a3421a`，准确 Android `88b2dabe` 候选。独立用例结果为 **PASS，仅限正常进程重开及当前数据保全**。此前 [current-login-smoke-live01](../current-login-smoke-live01/README.md) 仍为 FAIL，未重分类。

原报告 [result.json](result.json) 从 `/private/tmp/account109-android-error-reopen-live01/result.json` 原样归档，SHA256 `920a8717e0f40f4e562c9c15bede9048fd2c3c62a56a35f15810779957170d84`。本次接续发现报告已完成，没有重复执行恢复。

按[独立审阅的步骤](../timeout-reopen-plan-review01.md)，在固定测试包及 exclusive lease 内核对 APK、PID、foreground、error/account_authentication、disabled、无 profile、空 devices 和 pendingCount=0；重开前完整文档、纯文本、descriptor、引用及授权附件原字节摘要与原私有升级快照一致。只调用 Home、owned background `am kill`、释放旧 forward/lease，再正常 `am start`。旧 PID 17885，新 PID 28586；APK SHA256 `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870` 保持一致。重开后 clean signedOut，完整数据重复核对 3 次、3649ms；精确 owned forwards 和 lease 均已释放。

没有调用登录、取消、退出或启用同步，没有写笔记/附件、force-stop、清库、复制 grant 或改写历史基线。该结果不证明旧错误的确切原因，不解释未知附件来源，也不验收成功登录、三端同步或匿名中转。当前完整私有快照与原失败均保留在原位置；正文、原始附件字节、原始 XML 及凭据不收录此目录。独立结果复核见后续 review。
