# 内置原生关窗续验：未通过

2026-11-13 UTC 13:05:31.249—13:06:36.439。精确 `72513d12` Mac debug/E2E 候选，SHA256 `187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459`；执行器与 [live03](../login-surfaces-live03/README.md)相同工具字节。本次使用全新 `/private/tmp/account109-cancel-local-window04-store` 与独立 `window04-out`，固定 `--surface embedded --cancel-via-window`。

[原始结果](result.json)：localSave、authorizing 两项 PASS，进入 embedded 后60秒只读等待实际关窗，最终 `CONDITION_TIMEOUT / awaitingNativeWindowClose`。未发送 account.cancel，未输入凭据或观察表单。PID34068自然退出0，无强制信号，runner记录PID已消失。失败库及原始输出完整保留，不执行成功后的临时清理。

Chrome原生AX此前已成功，故没有沿用锁屏判断。CUA无法绑定plain测试可执行文件：getApp(精确候选路径)及getApp(notes-clone)均返回Invalid app；库存中的相同产品bundle id属于用户原应用且未启动。此为实际测试窗口控制前提未满足，不归因于产品认证或取消实现。后续独立包装作者评估隔离.app，以便在不启动原用户应用的条件下完成真实表单/关窗测试；本轮不算该用例通过。
