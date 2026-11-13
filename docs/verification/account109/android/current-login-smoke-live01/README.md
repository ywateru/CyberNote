# 手机当前数据取消 smoke live01：FAIL，序列已停止

2026-11-13 UTC14:04:02.746—14:04:19.898。准确88b2dabe已安装包，执行器源码d3ad490f，完整组314/314、零跳过后，仅执行embedded-back。登录前完整当前数据重复3次/3593ms保全通过，实际surface=embedded；随后CHECK_FAILED，native-form、取消和重启检查均未通过，后两case未运行。所有owned forward/lease已释放。原报告逐字节保留，不因后续观察变成PASS。

14:11父级在固定测试包resumed、Awake/ON、keyguard showing=false、inputRestricted=false的只读确认后，私有截图实际观察到空用户名/密码登录表单及两个原生工具栏按钮。截图不独立证明可信origin，未输入凭据。原始异常已被failureCode折叠，无法从原报告追溯确切第一原因。

父级试图单独完成待取消授权的native Back时，14:14:15当时已进入error/account_authentication，strict guard在Back前拒绝；没有发出Back/cancel/restart，有限manual-continuation仍为FAIL。不是取消通过。

随后有限只读捕获对照：旧pipe模式/dev/tty exit0但只有33bytes，无hierarchy；stdout-fd模式40bytes无hierarchy；显式shell -tt PTY为11936bytes且有有效hierarchy，可解析当前main WebView，无native dialog/form。三份JSON仅为布尔、字节数及有限阶段，不保存XML。后两probe持exclusive lease，第一probe仅检查当时无lease，范围分别记录。此对照复现当前界面读取的传输问题，不追认第一事件根因。PTY修正需独审后再执行新用例。

原数据及私有升级快照保留；本次失败目录和截图保留。后续如测试正常进程重开恢复，必须作为独立用例完整验证重开前后数据，不作为本次smoke的自动清错fallback。没有登录/账户同步/中转或附件来源验收。
