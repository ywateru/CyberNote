# 内置表单可见与原生窗口关闭：PASS

2026-11-13 UTC。真实 `72513d12` Mac binary 通过已[独核隔离.app](../../macos/72513d12-debug-wrapper-review01/README.md)运行，全新合成测试库。裸可执行文件的 [window04失败](../login-window-live04/README.md)保持不变。

执行 `account109-cancel-local.mjs`，使用嵌套精确binary路径、独立 `/private/tmp/account109-cancel-local-window05-store` 和 `/private/tmp/account109-cancel-local-window05-out`、`--surface embedded --cancel-via-window`。产品source与binary SHA均沿用187cf39d候选，工具字节同live03；父级执行HEAD为3f5c3981。runner不发送account.cancel，进入60秒只读等待。

父级CUA首先确认唯一隔离bundle id实际isRunning=true，随后绑定准确.app，未启动用户原应用。真实“登录 CyberNote”窗口呈现固定托管origin的登录表单、空用户名/密码、登录/注册选项及“在浏览器中继续”“取消登录”原生工具栏。没有输入凭据或读取授权URL。父级通过CUA点击原生窗口close button，窗口关闭并返回主账户页“未登录”，两个登录方式radio和登录/创建账户按钮可见。

[原始result](result.json)五项PASS：完整正文保存、embedded authorizing、真实关窗后至少3秒重复signedOut与完整document/plainText核对、继续编辑、自然退出同库重启后至少3秒完整正文与signedOut保持。两个进程均自然退出0，无强制信号；父级另行确认两PID已消失。具体时间/样本窗口见原始报告。

[观察回执](observation.json)区分父级原生UI观察与runner断言，保存原始result及两张主机私有截图校验和，不保存AX全文或授权地址。截图位于/private/tmp，不进入Git。[独立复核](review.md)通过后仅清理本次成功库/输出，门槛与保留范围见 [cleanup.json](cleanup.json)。

此结果补足AUTH-09的macOS真实表单显示和原生关窗分支。CUA产生了真实native关闭动作，但不是人手鼠标/物理键盘输入；没有成功登录/注册或迟到有效callback测试，也不证明Android、三端同步、中转或新Android域名candidate行为。toolbar转浏览器按钮本轮只见到，未点击。UI中的登录方式radio仅观察，CLI参数选择不能当作物理radio点击。
