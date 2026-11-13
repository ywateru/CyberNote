# Android内置取消第二轮：表单识别超时

2026-11-13 UTC14:58:01.430—14:59:15.965，在已独核重开与315项整合通过后，main `4b6d65d8` 执行固定 current-login-smoke，case=embedded-back，fresh output `/private/tmp/account109-android-current-login-smoke-embedded-back02`。原报告 [result.json](result.json) SHA256 `bc8c1cf045d7ee40a48f51e0a6641435b2a015f7e0a8eebf9f070372d25481e3`，**FAIL / CONDITION_TIMEOUT**。登录前完整当前数据重复3次/3921ms保全，实际surface=embedded；表单门槛未完成，未发Back/取消/重启，后两case未运行。owned forward/lease清理完成。

随后 UTC14:59:53.330—14:59:56.412 只读诊断重新持exclusive lease，核固定包foreground/解锁、同PID28586及authorizing/embedded、disabled、无profile/error后，在RAM读取PTY XML。有限 [finite-structure.json](finite-structure.json) SHA256 `d6e4bb553cb7afec1888a32e0e4fcd55f93589e1fd107cb3a047471775b6bde2` 记录唯一同包顶层WebView和其内部另一层WebView、2个EditText、内层固定“登录”按钮，以及唯一原生“在浏览器中继续”和“取消登录”按钮。projection为dialog=true/webView=true/hostedForm=false。诊断后仍authorizing，无设备输入，exact forward已释放；原XML及字段值不保存。

源码目前取最近WebView作为webOwner，却要求它等于唯一顶层WebView，故嵌套控件不满足归属判断。该不匹配可解释本次后续结构投影，不能把截图、表单出现时刻或所有历史失败原因补写进原超时报告。修正计划见[任务](../../../../plan/tasks/app-account109-android-nested-webview.md)；该轮不会因修正或后续独立续验变成PASS。

未输入凭据、修改账户授权/正文/附件、安装或清数据；本轮完整私有升级快照与旧历史baseline均不变。失败后尚未执行完整数据复查，不能以登录前保全代替退出后保全。成功登录、三端与4G/WiFi匿名中转均未由此验收。
