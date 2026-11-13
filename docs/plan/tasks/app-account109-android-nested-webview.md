# Android托管表单嵌套WebView识别

真实 current-login-smoke embedded-back02 在 PTY 修正后仍因表单等待超时失败。随后同 PID、exclusive lease 内只读结构投影确认：唯一所属包顶层 WebView 内有另一层同包 WebView，两个 EditText 与固定“登录”按钮位于内层；原生两工具栏按钮均唯一可见、可用。原 parser 的最近 webOwner 与唯一顶层 WebView 比较，导致 hostedForm=false。原报告保持 FAIL，本次只修执行器。

Socrates 在既有隔离树修 nativeAuthTree：输入控件允许来自唯一可见所属包顶层 WebView 的同包嵌套后代；不能接受另一个独立根、外包边界或隐藏后代。保持 exact toolbar、按钮、唯一root、XML限制、guard-before/after、RAM-only、固定PID/package与授权终态检查。增加能区分嵌套合法表单和独立/外包/隐藏树的正反例。Cicero 独立审查；不修改产品、不构建、不改基线。

父级可在修正独审及必要整合通过后，对仍有效的原 pending 授权单独续验 native Back 与取消后完整数据/正常重启；续验另存报告，不能让旧case变PASS。若状态已error则停止输入，不能用恢复作自动fallback。新的三条完整smoke仅在状态健康且原现场已独立收拢后使用fresh输出执行。没有凭据输入、自动新授权重试、enable、signOut、force-stop或清数据。
